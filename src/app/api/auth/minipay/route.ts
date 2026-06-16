// mangle-app/src/app/api/auth/minipay/route.ts
// =============================================================================
// POST /api/auth/minipay — Address-only auth for MiniPay users
// DEBUG VERSION — logs detallados para diagnosticar
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { isAddress, getAddress } from 'viem';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  console.log('[minipay] env check:', {
    hasUrl: !!supabaseUrl,
    hasServiceKey: !!serviceKey,
    serviceKeyPrefix: serviceKey?.slice(0, 20),
  });
  if (!supabaseUrl) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL');
  if (!serviceKey) throw new Error('Falta SUPABASE_SERVICE_KEY');
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  try {
    // ── 1. Parse + validate address ───────────────────────────────────────
    const body = await request.json().catch(() => ({}));
    const { address: rawAddress } = body as { address?: string };
    console.log('[minipay] body recibido:', { rawAddress });

    if (!rawAddress || !isAddress(rawAddress)) {
      return NextResponse.json(
        { error: 'DIRECCION_INVALIDA', detail: 'Se requiere una dirección EVM válida' },
        { status: 400 },
      );
    }

    const address = getAddress(rawAddress);
    console.log('[minipay] address checksummed:', address);
    const admin = getAdminClient();

    // ── 2. Lookup existing wallet ─────────────────────────────────────────
    const { data: existingParticipante, error: lookupError } = await admin
      .from('participantes')
      .select('id, user_id, auth_password')
      .eq('wallet_address', address.toLowerCase())
      .maybeSingle();

    console.log('[minipay] lookup participante:', { existingParticipante, lookupError });

    let userId: string;
    let password: string;
    let isNewUser = false;

    if (existingParticipante?.user_id && existingParticipante?.auth_password) {
      // CASE A
      console.log('[minipay] CASE A: usuario existente con password');
      userId = existingParticipante.user_id;
      password = existingParticipante.auth_password as string;

    } else if (existingParticipante?.user_id && !existingParticipante?.auth_password) {
      // CASE B
      console.log('[minipay] CASE B: participante sin password');
      password = crypto.randomUUID();
      await admin.from('participantes').update({ auth_password: password }).eq('id', existingParticipante.id);
      await admin.auth.admin.updateUserById(existingParticipante.user_id, { password });
      userId = existingParticipante.user_id;

    } else {
      // CASE C: usuario nuevo
      console.log('[minipay] CASE C: usuario nuevo');
      const cleanAddress = address.toLowerCase().replace('0x', '');
      const email = `wallet_${cleanAddress}@mangle.app`;
      password = crypto.randomUUID();
      console.log('[minipay] email a crear:', email);

      // Crear directo sin buscar en listUsers (evita paginación)
      const { data: newUser, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      console.log('[minipay] createUser result:', {
        userId: newUser?.user?.id,
        email: newUser?.user?.email,
        errorMessage: createError?.message,
        errorStatus: createError?.status,
      });

      if (createError) {
        // Si el usuario ya existe en auth (carrera de condiciones), intentar recuperarlo
        if (createError.message?.includes('already registered') || createError.status === 422) {
          console.log('[minipay] usuario ya existe en auth, recuperando...');
          const { data: { users }, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
          console.log('[minipay] listUsers error:', listErr);
          const existing = users?.find((u) => u.email === email);
          console.log('[minipay] usuario encontrado en auth:', existing?.id);

          if (!existing) {
            return NextResponse.json(
              { error: 'ERROR_INTERNO', detail: `No se pudo recuperar el usuario: ${createError.message}` },
              { status: 500 },
            );
          }
          userId = existing.id;
          // Actualizar password para poder hacer signIn
          await admin.auth.admin.updateUserById(userId, { password });
        } else {
          return NextResponse.json(
            { error: 'ERROR_INTERNO', detail: `No se pudo crear la cuenta: ${createError.message}` },
            { status: 500 },
          );
        }
      } else {
        if (!newUser?.user) {
          return NextResponse.json(
            { error: 'ERROR_INTERNO', detail: 'Supabase no devolvió el usuario creado' },
            { status: 500 },
          );
        }
        userId = newUser.user.id;
        isNewUser = true;
      }

      // Insertar participante
      const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;
      const { error: insertError } = await admin.from('participantes').insert({
        user_id: userId,
        wallet_address: address.toLowerCase(),
        nombre: `Wallet ${truncated}`,
        rol: 'usuario',
        score_reputacion: 50,
        activo: true,
        auth_password: password,
      });
      console.log('[minipay] insert participante error:', insertError);
    }

    // ── 3. Resolve sign-in email ─────────────────────────────────────────────
    const cleanAddress2 = address.toLowerCase().replace('0x', '');
    const fallbackEmail = `wallet_${cleanAddress2}@mangle.app`;
    let signInEmail = fallbackEmail;

    if (!isNewUser) {
      const { data: userRecord, error: getUserError } = await admin.auth.admin.getUserById(userId!);
      console.log('[minipay] getUserById:', { email: userRecord?.user?.email, getUserError });
      if (userRecord?.user?.email) signInEmail = userRecord.user.email;
    }

    console.log('[minipay] signInEmail:', signInEmail);

    // ── 4. Create session ────────────────────────────────────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const anonClient = createClient(supabaseUrl, anonKey);

    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
      email: signInEmail,
      password: password!,
    });

    console.log('[minipay] signInWithPassword:', {
      hasSession: !!signInData?.session,
      signInError: signInError?.message,
    });

    if (signInError || !signInData.session) {
      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: `No se pudo crear la sesión: ${signInError?.message}` },
        { status: 500 },
      );
    }

    // ── 5. Check profile completion ─────────────────────────────────────────
    let profileCompleted = false;
    const { data: profileCheck } = await admin
      .from('participantes')
      .select('onboarding_completado')
      .eq('user_id', userId!)
      .maybeSingle();
    profileCompleted = profileCheck?.onboarding_completado ?? false;
    console.log('[minipay] profileCompleted:', profileCompleted);

    // ── 6. Response ───────────────────────────────────────────────────────────
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

    console.log('[minipay] ✅ respuesta exitosa, isNewUser:', isNewUser);
    return response;

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno';
    console.error('[minipay] ❌ catch final:', message);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: message },
      { status: 500 },
    );
  }
}
