// mangle-app/src/app/api/auth/minipay/route.ts
// =============================================================================
// POST /api/auth/minipay — Address-only auth for MiniPay users
// =============================================================================
//
// MiniPay does not support personal_sign or eth_signTypedData.
// Security model: MiniPay authenticates the user via phone number (Opera KYC).
// The WebView is a controlled environment — eth_requestAccounts cannot be spoofed.
//
// Flow:
//   1. Validate address (EIP-55 checksum)
//   2. Look up or create Supabase user (same 3-case logic as /api/auth/siwe)
//   3. Sign in with password
//   4. Return { ok, isNewUser, profile_completed, access_token, refresh_token }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { isAddress, getAddress } from 'viem';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL');
  if (!serviceKey) throw new Error('Falta SUPABASE_SERVICE_KEY');
  return createClient(supabaseUrl, serviceKey);
}

export async function POST(request: NextRequest) {
  try {
    // ── 1. Parse + validate address ─────────────────────────────────────────
    const body = await request.json().catch(() => ({}));
    const { address: rawAddress } = body as { address?: string };

    if (!rawAddress || !isAddress(rawAddress)) {
      return NextResponse.json(
        { error: 'DIRECCION_INVALIDA', detail: 'Se requiere una dirección EVM válida' },
        { status: 400 },
      );
    }

    const address = getAddress(rawAddress); // EIP-55 checksum
    const admin = getAdminClient();

    // ── 2. Lookup existing wallet → user (3 cases, identical to SIWE) ───────
    const { data: existingParticipante } = await admin
      .from('participantes')
      .select('id, user_id, auth_password')
      .eq('wallet_address', address.toLowerCase())
      .maybeSingle();

    let userId: string;
    let password: string;
    let isNewUser = false;

    if (existingParticipante?.user_id && existingParticipante?.auth_password) {
      // CASE A: wallet already linked with password → login directly
      userId = existingParticipante.user_id;
      password = existingParticipante.auth_password as string;

    } else if (existingParticipante?.user_id && !existingParticipante?.auth_password) {
      // CASE B: participante exists but no password (migration edge case)
      password = crypto.randomUUID();
      await admin
        .from('participantes')
        .update({ auth_password: password })
        .eq('id', existingParticipante.id);
      await admin.auth.admin.updateUserById(existingParticipante.user_id, { password });
      userId = existingParticipante.user_id;

    } else {
      // CASE C: no existing participante for this wallet
      const cleanAddress = address.toLowerCase().replace('0x', '');
      const email = `wallet_${cleanAddress}@example.com`;
      password = crypto.randomUUID();

      const { data: allUsers } = await admin.auth.admin.listUsers();
      const existingAuthUser = allUsers?.users?.find((u) => u.email === email);

      if (existingAuthUser) {
        // Auth user exists (previous partial signup) — reuse
        userId = existingAuthUser.id;
        await admin.auth.admin.updateUserById(userId, { password });

        const { data: orphan } = await admin
          .from('participantes')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (orphan) {
          await admin
            .from('participantes')
            .update({ wallet_address: address.toLowerCase(), auth_password: password })
            .eq('id', orphan.id);
        } else {
          const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;
          await admin.from('participantes').insert({
            user_id: userId,
            wallet_address: address.toLowerCase(),
            nombre: `Wallet ${truncated}`,
            rol: 'usuario',
            score_reputacion: 50,
            activo: true,
            auth_password: password,
          });
        }
      } else {
        // Brand new user
        const { data: newUser, error: createError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });

        if (createError || !newUser?.user) {
          return NextResponse.json(
            { error: 'ERROR_INTERNO', detail: `No se pudo crear la cuenta: ${createError?.message}` },
            { status: 500 },
          );
        }

        userId = newUser.user.id;
        isNewUser = true;
        const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;
        await admin.from('participantes').insert({
          user_id: userId,
          wallet_address: address.toLowerCase(),
          nombre: `Wallet ${truncated}`,
          rol: 'usuario',
          score_reputacion: 50,
          activo: true,
          auth_password: password,
        });
      }
    }

    // ── 3. Resolve actual sign-in email ──────────────────────────────────────
    const cleanAddress2 = address.toLowerCase().replace('0x', '');
    const fallbackEmail = `wallet_${cleanAddress2}@example.com`;
    let signInEmail = fallbackEmail;
    if (!isNewUser) {
      const { data: userRecord } = await admin.auth.admin.getUserById(userId!);
      if (userRecord?.user?.email) signInEmail = userRecord.user.email;
    }

    // ── 4. Create session ────────────────────────────────────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const anonClient = createClient(supabaseUrl, anonKey);

    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
      email: signInEmail,
      password: password!,
    });

    if (signInError || !signInData.session) {
      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: `No se pudo crear la sesión: ${signInError?.message}` },
        { status: 500 },
      );
    }

    // ── 5. Check profile completion ──────────────────────────────────────────
    // Fuente de verdad real: la columna onboarding_completado (no inferir por el nombre).
    let profileCompleted = false;
    const { data: profileCheck } = await admin
      .from('participantes')
      .select('onboarding_completado')
      .eq('user_id', userId!)
      .maybeSingle();
    profileCompleted = profileCheck?.onboarding_completado ?? false;

    // ── 6. Build response + set SSR cookies ─────────────────────────────────
    const response = NextResponse.json({
      ok: true,
      isNewUser,
      profile_completed: profileCompleted,
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
    });

    const serverClient = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });
    await serverClient.auth.setSession(signInData.session);

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno';
    console.error('POST /api/auth/minipay error:', message);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
