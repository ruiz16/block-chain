// =============================================================================
// POST /api/auth/siwe — Verify SIWE Message + Create Session
// =============================================================================
//
// Full EIP-4361 verification flow:
//   1. Parse SIWE message (siwe package)
//   2. Validate domain matches request origin
//   3. Validate chain_id === 44787 (Celo Alfajores)
//   4. Verify nonce is valid and not expired
//   5. Verify EIP-191 signature via viem
//   6. Look up or create Supabase Auth user
//   7. Create/update participantes row
//   8. Set session cookies via @supabase/ssr
//   9. Return { ok, isNewUser }
//
// Body:
//   { message: string, signature: `0x${string}` }
//
// Responses:
//   200 — { ok: true, isNewUser: boolean }
//   400 — { error: "SIWE_INVALIDO", detail: string }
//   401 — { error: "FIRMA_INVALIDA" | "NONCE_EXPIRADO", detail: string }
//   403 — { error: "SIWE_INVALIDO", detail: "Unsupported chain..." }
//   500 — { error: "ERROR_INTERNO", detail: string }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { SiweMessage } from 'siwe';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { getPublicClient } from '@/lib/blockchain/client';
import { verifyAndConsumeNonce, getCleanupExpired } from '@/lib/siwe/nonce';

// ---------------------------------------------------------------------------
// Admin client (service_role) for user management
// ---------------------------------------------------------------------------
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl) {
    throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!serviceKey) {
    throw new Error('Falta SUPABASE_SERVICE_KEY');
  }

  return createClient(supabaseUrl, serviceKey);
}

export async function POST(request: NextRequest) {
  try {
    // -----------------------------------------------------------------------
    // 1. Parse body
    // -----------------------------------------------------------------------
    const body = await request.json().catch(() => ({}));
    const { message, signature } = body as {
      message?: string;
      signature?: string;
    };

    if (!message || !signature) {
      return NextResponse.json(
        { error: 'SIWE_INVALIDO', detail: 'message y signature son requeridos' },
        { status: 400 },
      );
    }

    // -----------------------------------------------------------------------
    // 2. Parse SIWE message
    // -----------------------------------------------------------------------
    let siweMessage: SiweMessage;
    try {
      siweMessage = new SiweMessage(message);
    } catch {
      return NextResponse.json(
        { error: 'SIWE_INVALIDO', detail: 'Formato de mensaje SIWE inválido' },
        { status: 400 },
      );
    }

    // -----------------------------------------------------------------------
    // 3. Validate domain matches request origin
    // -----------------------------------------------------------------------
    const origin = request.headers.get('origin') ?? '';
    const referer = request.headers.get('referer') ?? '';
    const requestHost = origin || referer || '';

    // Allow if domain is present in the Origin or Referer header
    if (
      requestHost &&
      !requestHost.includes(siweMessage.domain) &&
      !requestHost.includes('localhost')
    ) {
      return NextResponse.json(
        { error: 'SIWE_INVALIDO', detail: 'El dominio no coincide con el origen de la solicitud' },
        { status: 400 },
      );
    }

    // -----------------------------------------------------------------------
    // 4. Validate chain_id === 44787 (Celo Alfajores)
    // -----------------------------------------------------------------------
    if (siweMessage.chainId !== 44787) {
      return NextResponse.json(
        {
          error: 'SIWE_INVALIDO',
          detail: 'Red no soportada — usa Celo Alfajores (chain ID 44787)',
        },
        { status: 403 },
      );
    }

    // -----------------------------------------------------------------------
    // 5. Validate and consume nonce
    // -----------------------------------------------------------------------
    const nonceValid = await verifyAndConsumeNonce(
      siweMessage.nonce,
      siweMessage.address,
    );

    if (!nonceValid) {
      return NextResponse.json(
        { error: 'NONCE_EXPIRADO', detail: 'Nonce expirado o ya utilizado' },
        { status: 401 },
      );
    }

    // -----------------------------------------------------------------------
    // 6. Verify EIP-191 signature via viem
    // -----------------------------------------------------------------------
    const publicClient = getPublicClient();
    const isValidSignature = await publicClient.verifyMessage({
      address: siweMessage.address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!isValidSignature) {
      return NextResponse.json(
        { error: 'FIRMA_INVALIDA', detail: 'La firma no coincide con la dirección de la wallet' },
        { status: 401 },
      );
    }

    // -----------------------------------------------------------------------
    // 7. Clean up expired nonces (fire-and-forget)
    // -----------------------------------------------------------------------
    await getCleanupExpired();

    // -----------------------------------------------------------------------
    // 8. Deterministic email + password setup
    // -----------------------------------------------------------------------
    const cleanAddress = siweMessage.address.toLowerCase().replace('0x', '');
    const email = `wallet_${cleanAddress}@celo.blockchain.local`;

    const admin = getAdminClient();

    // -----------------------------------------------------------------------
    // 9. Look up existing wallet → user mapping
    // -----------------------------------------------------------------------
    const { data: existingParticipante } = await admin
      .from('participantes')
      .select('id, user_id, auth_password')
      .eq('wallet_address', siweMessage.address.toLowerCase())
      .maybeSingle();

    let userId: string;
    let password: string;
    let isNewUser = false;

    if (existingParticipante?.user_id && existingParticipante?.auth_password) {
      // --- EXISTING USER ---
      userId = existingParticipante.user_id;
      password = existingParticipante.auth_password;
    } else     if (existingParticipante?.user_id && !existingParticipante?.auth_password) {
      // --- EXISTING USER, NO PASSWORD (edge case from failed migration) ---
      // Create a new password and update both DB and Supabase Auth
      password = crypto.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36)}`;

      await admin
        .from('participantes')
        .update({ auth_password: password })
        .eq('id', existingParticipante.id);

      await admin.auth.admin.updateUserById(existingParticipante.user_id, {
        password,
      });

      userId = existingParticipante.user_id;
    } else {
      // --- NEW USER ---
      isNewUser = true;
      password = crypto.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36)}`;

      // 9a. Create Supabase Auth user
      const { data: userData, error: createUserError } =
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            wallet_address: siweMessage.address.toLowerCase(),
            auth_method: 'siwe',
          },
        });

      if (createUserError || !userData?.user) {
        console.error('Error creating Auth user:', createUserError?.message);
        return NextResponse.json(
          { error: 'ERROR_INTERNO', detail: 'No se pudo crear el usuario de autenticación' },
          { status: 500 },
        );
      }

      userId = userData.user.id;

      // 9b. Create participantes row
      const truncatedAddress = `${siweMessage.address.slice(0, 6)}...${siweMessage.address.slice(-4)}`;

      const { error: insertError } = await admin.from('participantes').insert({
        user_id: userId,
        wallet_address: siweMessage.address.toLowerCase(),
        nombre: `Wallet ${truncatedAddress}`,
        rol: 'prestatario',
        score_reputacion: 50,
        activo: true,
        auth_password: password,
      });

      if (insertError) {
        // Rollback: delete the Auth user we just created
        await admin.auth.admin.deleteUser(userId);
        console.error('Error creating participante:', insertError.message);
        return NextResponse.json(
          { error: 'ERROR_INTERNO', detail: 'No se pudo crear el perfil de participante' },
          { status: 500 },
        );
      }
    }

    // -----------------------------------------------------------------------
    // 10. Create session via @supabase/ssr
    //     We need to set session cookies on the response, so we create a
    //     server client that writes cookies to the NextResponse.
    // -----------------------------------------------------------------------
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const response = NextResponse.json({ ok: true, isNewUser });

    const serverClient = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    const { error: signInError } =
      await serverClient.auth.signInWithPassword({
        email,
        password,
      });

    if (signInError) {
      console.error('Error creating session:', signInError.message);
      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'No se pudo crear la sesión' },
        { status: 500 },
      );
    }

    // -----------------------------------------------------------------------
    // 11. Return success
    // -----------------------------------------------------------------------
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    console.error('POST /api/auth/siwe error:', message);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
