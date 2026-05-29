// =============================================================================
// GET /api/auth/nonce — Generate and Return a SIWE Nonce
// =============================================================================
//
// Generates a cryptographically random nonce, stores it in siwe_nonces with
// a 10-minute TTL, and returns it to the client for SIWE message creation.
//
// Rate-limited: 5 nonces per 10 minutes per wallet address.
//
// Query params:
//   wallet_address — The Celo wallet address (0x-prefixed)
//
// Responses:
//   200 — { nonce: string, expires_at: string }
//   400 — { error: "wallet_address is required" }
//   429 — { error: "LIMITE_NONCES", detail: string }
//   500 — { error: string }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateNonce } from '@/lib/siwe/nonce';

// ---------------------------------------------------------------------------
// Admin client for rate-limit queries (no auth session at this point)
// ---------------------------------------------------------------------------
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase environment variables not configured');
  }

  return createClient(supabaseUrl, serviceKey);
}

export async function GET(request: NextRequest) {
  try {
    const walletAddress = request.nextUrl.searchParams.get('wallet_address');

    // -----------------------------------------------------------------------
    // Validate: wallet_address is required
    // -----------------------------------------------------------------------
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'wallet_address is required' },
        { status: 400 },
      );
    }

    // Basic format validation: must be 0x-prefixed hex, 42 chars
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 },
      );
    }

    // -----------------------------------------------------------------------
    // Rate limit: max 5 nonces per 10 minutes per wallet
    // -----------------------------------------------------------------------
    const admin = getAdminClient();
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { count, error: countError } = await admin
      .from('siwe_nonces')
      .select('*', { count: 'exact', head: true })
      .eq('wallet_address', walletAddress.toLowerCase())
      .gte('created_at', tenMinutesAgo);

    if (!countError && count !== null && count >= 5) {
      return NextResponse.json(
        {
          error: 'LIMITE_NONCES',
          detail: 'Demasiadas solicitudes de nonce. Espera unos minutos e intenta de nuevo.',
        },
        { status: 429 },
      );
    }

    // -----------------------------------------------------------------------
    // Generate and store nonce
    // -----------------------------------------------------------------------
    const result = await generateNonce(walletAddress.toLowerCase());

    return NextResponse.json({
      nonce: result.nonce,
      expires_at: result.expires_at,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    console.error('GET /api/auth/nonce error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
