// =============================================================================
// POST /api/auth/siwe — Verify SIWE Message + Create Session
// =============================================================================
//
// This route manually parses the EIP-4361 message format rather than using
// the siwe library's SiweMessage constructor, because @spruceid/siwe-parser
// v3.0.0 has a brittle PEG grammar that:
//   - REJECTS non-EIP-55-checksummed addresses (MetaMask returns lowercase)
//   - REJECTS non-ASCII characters in the statement (violates EIP-4361 spec)
//   - REQUIRES both statement and resources sections (violates EIP-4361 spec)
//
// Full verification flow:
//   1. Parse body { message, signature }
//   2. Parse EIP-4361 message manually (line-by-line)
//   3. Validate domain matches request origin
//   4. Validate chain_id === 44787 (Celo Alfajores)
//   5. Verify nonce is valid and not expired
//   6. Verify EIP-191 signature via viem
//   7. Look up or create Supabase Auth user
//   8. Create/update participantes row
//   9. Create session via signInWithPassword and set cookies on response
//  10. Return { ok, isNewUser }
//
// Body:  { message: string, signature: `0x${string}` }
//
// Responses:
//   200 — { ok: true, isNewUser: boolean }
//   400 — { error: "SIWE_INVALIDO", detail: string }
//   401 — { error: "FIRMA_INVALIDA" | "NONCE_EXPIRADO", detail: string }
//   403 — { error: "SIWE_INVALIDO", detail: "Unsupported chain..." }
//   500 — { error: "ERROR_INTERNO", detail: string }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { getPublicClient } from '@/lib/blockchain/client';
import { verifyAndConsumeNonce, getCleanupExpired } from '@/lib/siwe/nonce';
import { getAddress } from 'viem';

// =============================================================================
// Types
// =============================================================================

interface ParsedEIP4361 {
  scheme?: string;
  domain: string;
  address: string;
  statement?: string;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  issuedAt?: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
}

// =============================================================================
// parseEIP4361Message — Manual EIP-4361 Parser
// =============================================================================
//
// Parses an EIP-4361 (Sign-In with Ethereum) message string WITHOUT using
// the PEG grammar from @spruceid/siwe-parser. This gives us full control
// over validation and works with any valid UTF-8 statement text.
//
// EIP-4361 format (fields in order):
//
//   ${domain} wants you to sign in with your Ethereum account:
//   ${address}
//
//   ${statement}
//
//   URI: ${uri}
//   Version: ${version}
//   Chain ID: ${chain-id}
//   Nonce: ${nonce}
//   Issued At: ${issued-at}
//   Expiration Time: ${expiration-time}   ← optional
//   Not Before: ${not-before}             ← optional
//   Request ID: ${request-id}             ← optional
//   Resources:                            ← optional
//   - ${resource}
//   - ${resource}
// =============================================================================

function parseEIP4361Message(message: string): ParsedEIP4361 {
  const lines = message.split('\n');

  if (lines.length < 8) {
    throw new Error('Mensaje demasiado corto para ser EIP-4361');
  }

  // -------------------------------------------------------------------------
  // Line 1: Domain header
  //   "${domain} wants you to sign in with your Ethereum account:"
  // -------------------------------------------------------------------------
  const headerMatch = lines[0]?.match(
    /^(?:([a-zA-Z][a-zA-Z0-9+.-]*):\/\/)?(.+?) wants you to sign in with your Ethereum account:$/,
  );

  if (!headerMatch) {
    throw new Error('Formato de cabecera EIP-4361 inválido');
  }

  const scheme = headerMatch[1]!;
  const domain = headerMatch[2]!;

  // -------------------------------------------------------------------------
  // Line 2: Ethereum address (0x + 40 hex chars)
  // -------------------------------------------------------------------------
  const rawAddress = lines[1]?.trim() ?? '';

  if (!/^0x[a-fA-F0-9]{40}$/.test(rawAddress)) {
    throw new Error(`Dirección Ethereum inválida: ${rawAddress}`);
  }

  // Normalize to EIP-55 checksummed format
  const address = getAddress(rawAddress);

  // -------------------------------------------------------------------------
  // Lines 3+: Statement (between two blank lines) then field lines
  //
  // The statement is optional. Structure:
  //   [line 3: empty]           ← always present as separator
  //   [lines 4-N: statement]    ← optional text
  //   [next empty line]         ← end of statement (or line 3 if no statement)
  //   URI: ...                  ← start of fields
  // -------------------------------------------------------------------------

  let lineIdx = 2; // Start after address

  // Line after address should be empty (separator)
  // If it's not empty, the message is malformed
  // Per EIP-4361, there should be a blank line after the address
  // But we're lenient — treat non-empty as the statement directly

  // Move past the empty line
  lineIdx++;

  // Collect statement lines until we hit an empty line or URI/field line
  const statementLines: string[] = [];
  const fieldPrefixes = ['URI:', 'Version:', 'Chain ID:', 'Nonce:', 'Issued At:',
    'Expiration Time:', 'Not Before:', 'Request ID:', 'Resources:'];

  while (lineIdx < lines.length) {
    const line = lines[lineIdx];
    if (line === undefined) break;

    // Empty line ends the statement
    if (line === '') {
      lineIdx++;
      break;
    }

    // A field line ends the statement
    if (fieldPrefixes.some((p) => line.startsWith(p))) {
      break;
    }

    statementLines.push(line);
    lineIdx++;
  }

  const statement = statementLines.length > 0 ? statementLines.join('\n') : undefined;

  // Skip any remaining empty lines before fields
  while (lineIdx < lines.length && lines[lineIdx] === '') {
    lineIdx++;
  }

  // -------------------------------------------------------------------------
  // Parse field: lines (key: value)
  // -------------------------------------------------------------------------
  const fieldMap = new Map<string, string>();
  const resources: string[] = [];
  let inResources = false;

  while (lineIdx < lines.length) {
    const line = lines[lineIdx] ?? '';

    if (inResources) {
      // Resource lines start with "- "
      if (line.startsWith('- ')) {
        resources.push(line.slice(2));
      } else if (line === '') {
        // Empty line inside resources — skip (some parsers add them)
      } else {
        // Non-resource line ends the resources section
        break;
      }
    } else if (line.startsWith('Resources:')) {
      inResources = true;
    } else if (line.includes(':')) {
      const colonIdx = line.indexOf(':');
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      fieldMap.set(key, value);
    } else if (line === '') {
      // Skip empty lines between fields
    } else {
      // Unexpected non-empty, non-field line
      break;
    }

    lineIdx++;
  }

  // -------------------------------------------------------------------------
  // Extract and validate required fields
  // -------------------------------------------------------------------------
  const uri = fieldMap.get('URI');
  if (!uri) {
    throw new Error('Campo URI requerido');
  }

  const version = fieldMap.get('Version');
  if (!version) {
    throw new Error('Campo Version requerido');
  }

  const chainIdStr = fieldMap.get('Chain ID');
  if (!chainIdStr) {
    throw new Error('Campo Chain ID requerido');
  }
  const chainId = parseInt(chainIdStr, 10);
  if (isNaN(chainId)) {
    throw new Error('Chain ID debe ser un número');
  }

  const nonce = fieldMap.get('Nonce');
  if (!nonce) {
    throw new Error('Campo Nonce requerido');
  }

  // -------------------------------------------------------------------------
  // Return parsed result
  // -------------------------------------------------------------------------
  return {
    scheme,
    domain,
    address,
    statement,
    uri,
    version,
    chainId,
    nonce,
    issuedAt: fieldMap.get('Issued At'),
    expirationTime: fieldMap.get('Expiration Time'),
    notBefore: fieldMap.get('Not Before'),
    requestId: fieldMap.get('Request ID'),
    resources: resources.length > 0 ? resources : undefined,
  };
}

// =============================================================================
// Admin client (service_role) for user management
// =============================================================================

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

// =============================================================================
// POST handler
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // -------------------------------------------------------------------------
    // 1. Parse body
    // -------------------------------------------------------------------------
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

    // -------------------------------------------------------------------------
    // 2. Parse EIP-4361 message manually (no PEG parser)
    // -------------------------------------------------------------------------
    let parsed: ParsedEIP4361;
    try {
      parsed = parseEIP4361Message(message);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Formato de mensaje SIWE inválido';
      return NextResponse.json(
        { error: 'SIWE_INVALIDO', detail },
        { status: 400 },
      );
    }

    // -------------------------------------------------------------------------
    // 3. Validate domain matches request origin
    // -------------------------------------------------------------------------
    const origin = request.headers.get('origin') ?? '';
    const referer = request.headers.get('referer') ?? '';
    const requestHost = origin || referer || '';

    if (
      requestHost &&
      !requestHost.includes(parsed.domain) &&
      !requestHost.includes('localhost')
    ) {
      return NextResponse.json(
        { error: 'SIWE_INVALIDO', detail: 'El dominio no coincide con el origen de la solicitud' },
        { status: 400 },
      );
    }

    // -------------------------------------------------------------------------
    // 4. Validate chain_id === 11142220 (Celo Sepolia)
    // -------------------------------------------------------------------------
    if (parsed.chainId !== 11142220) {
      return NextResponse.json(
        {
          error: 'SIWE_INVALIDO',
          detail: 'Red no soportada — usa Celo Sepolia (chain ID 11142220)',
        },
        { status: 403 },
      );
    }

    // -------------------------------------------------------------------------
    // 5. Validate and consume nonce
    //
    // NOTE: Pass address in lowercase to match how it was stored in the DB
    // by the GET /api/auth/nonce route (which calls .toLowerCase()).
    // -------------------------------------------------------------------------
    const nonceValid = await verifyAndConsumeNonce(
      parsed.nonce,
      parsed.address.toLowerCase(),
    );

    if (!nonceValid) {
      return NextResponse.json(
        { error: 'NONCE_EXPIRADO', detail: 'Nonce expirado o ya utilizado' },
        { status: 401 },
      );
    }

    // -------------------------------------------------------------------------
    // 6. Verify EIP-191 signature via viem
    //
    // Use the ORIGINAL message (the wallet signed this exact string).
    // viem's verifyMessage recovers the signer address from sig+message
    // and compares it to the provided address.
    // -------------------------------------------------------------------------
    const publicClient = getPublicClient();
    const isValidSignature = await publicClient.verifyMessage({
      address: parsed.address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!isValidSignature) {
      return NextResponse.json(
        { error: 'FIRMA_INVALIDA', detail: 'La firma no coincide con la dirección de la wallet' },
        { status: 401 },
      );
    }

    // -------------------------------------------------------------------------
    // 7. Clean up expired nonces (fire-and-forget)
    // -------------------------------------------------------------------------
    await getCleanupExpired();

    // -------------------------------------------------------------------------
    // 8. Deterministic email + password setup
    // -------------------------------------------------------------------------
    const cleanAddress = parsed.address.toLowerCase().replace('0x', '');
    const email = `wallet_${cleanAddress}@example.com`;

    const admin = getAdminClient();

    // -------------------------------------------------------------------------
    // 9. Look up existing wallet → user mapping
    // -------------------------------------------------------------------------
    const { data: existingParticipante } = await admin
      .from('participantes')
      .select('id, user_id, auth_password')
      .eq('wallet_address', parsed.address.toLowerCase())
      .maybeSingle();

    let userId: string;
    let password: string;
    let isNewUser = false;

    if (existingParticipante?.user_id && existingParticipante?.auth_password) {
      // ====================================================================
      // CASE A: Wallet ya asociada a un participante → login directo
      // ====================================================================
      userId = existingParticipante.user_id;
      password = existingParticipante.auth_password;
    } else if (existingParticipante?.user_id && !existingParticipante?.auth_password) {
      // ====================================================================
      // CASE B: Participante existe pero sin password (edge case migración)
      // ====================================================================
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
      // ====================================================================
      // CASE C: Wallet NO asociada a ningún participante
      //
      // Primero: revisar si el usuario ya tiene sesión activa (logueado con
      // email en este browser). Si está logueado, asociamos la wallet a su
      // participante existente.
      //
      // Si no está logueado, no podemos asociar la wallet automáticamente
      // porque no sabemos a qué usuario pertenece. Devolvemos un error
      // amigable pidiendo que inicie sesión con email primero.
      // ====================================================================

      // Intentar obtener sesión activa desde las cookies de la request
      const supabaseUrlTmp = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const anonKeyTmp = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

      const sessionCheckClient = createServerClient(supabaseUrlTmp, anonKeyTmp, {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: () => {
            /* readonly check — no escribimos cookies */
          },
        },
      });

      const { data: sessionData } = await sessionCheckClient.auth.getSession();
      const currentUser = sessionData.session?.user;

      if (currentUser) {
        // --- Usuario logueado con email → asociar wallet a su participante ---
        const walletAddress = parsed.address.toLowerCase();

        // Buscar si el usuario ya tiene un participante
        const { data: userParticipante } = await admin
          .from('participantes')
          .select('id')
          .eq('user_id', currentUser.id)
          .maybeSingle();

        if (userParticipante) {
          // Actualizar participante existente con la wallet
          await admin
            .from('participantes')
            .update({ wallet_address: walletAddress })
            .eq('id', userParticipante.id);
        }

        // Generar/actualizar password para SIWE
        password = crypto.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36)}`;

        await admin.auth.admin.updateUserById(currentUser.id, {
          password,
        });

        // Si no tenía participante, crear uno (no debería pasar si ya hizo onboarding)
        if (!userParticipante) {
          const truncatedAddress = `${parsed.address.slice(0, 6)}...${parsed.address.slice(-4)}`;

          const { error: insertError } = await admin.from('participantes').insert({
            user_id: currentUser.id,
            wallet_address: walletAddress,
            nombre: `Wallet ${truncatedAddress}`,
            rol: 'usuario',
            score_reputacion: 50,
            activo: true,
            auth_password: password,
          });

          if (insertError) {
            console.error('Error creating participante for wallet link:', insertError.message);
            // Non-fatal — podemos continuar igual
          }
        }

        userId = currentUser.id;
      } else {
        // --- No hay sesión activa → buscar o crear auth user + participante ---
        password = crypto.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36)}`;

        // First, check if an auth user already exists for this wallet email
        // (e.g., previous SIWE created the user but participante row was
        // removed or lost the wallet_address link)
        const { data: allUsers } = await admin.auth.admin.listUsers();
        const existingAuthUser = allUsers?.users?.find((u) => u.email === email);

        if (existingAuthUser) {
          // Auth user already exists — reuse it
          userId = existingAuthUser.id;

          // Update password so we can sign in
          await admin.auth.admin.updateUserById(userId, { password });

          // Look for an existing participante linked to this user
          const { data: orphanParticipante } = await admin
            .from('participantes')
            .select('id, auth_password')
            .eq('user_id', userId)
            .maybeSingle();

          if (orphanParticipante) {
            // Re-link wallet_address and update password
            await admin
              .from('participantes')
              .update({
                wallet_address: parsed.address.toLowerCase(),
                auth_password: password,
              })
              .eq('id', orphanParticipante.id);
          } else {
            // No participante exists — create a placeholder
            const truncatedAddress = `${parsed.address.slice(0, 6)}...${parsed.address.slice(-4)}`;
            await admin.from('participantes').insert({
              user_id: userId,
              wallet_address: parsed.address.toLowerCase(),
              nombre: `Wallet ${truncatedAddress}`,
              rol: 'usuario',
              score_reputacion: 50,
              activo: true,
              auth_password: password,
            }).maybeSingle();
          }

          // Mark as existing user so mobile skips Register
          isNewUser = false;
        } else {
          // No existing auth user — create new one
          const { data: newUser, error: createError } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
          });

          if (createError || !newUser?.user) {
            const errorMsg = createError?.message ?? 'No se pudo crear el usuario';
            console.error('[siwe] Error creating auth user:', errorMsg);

            return NextResponse.json(
              {
                error: 'ERROR_INTERNO',
                detail: `No se pudo crear la cuenta: ${errorMsg}`,
              },
              { status: 500 },
            );
          }

          userId = newUser.user.id;
          isNewUser = true;

          // Create placeholder participante so CASE A finds it on reconnect
          const truncatedAddress = `${parsed.address.slice(0, 6)}...${parsed.address.slice(-4)}`;
          await admin.from('participantes').insert({
            user_id: userId,
            wallet_address: parsed.address.toLowerCase(),
            nombre: `Wallet ${truncatedAddress}`,
            rol: 'usuario',
            score_reputacion: 50,
            activo: true,
            auth_password: password,
          }).maybeSingle();
        }
      }
    }

    // -------------------------------------------------------------------------
    // 10. Resolve actual email for sign-in
    //
    // CASES A/B: the auth user may have had their email updated during /register
    // (from the deterministic wallet_...@example.com to the user's real email).
    // Using the wallet-derived email here would cause signInWithPassword to fail.
    //
    // CASE C (existing auth user found by email): same situation — the user may
    // have already gone through /register in a previous session.
    //
    // Only CASE C (new auth user just created) should use the wallet-derived email.
    // -------------------------------------------------------------------------
    let signInEmail = email;
    if (!isNewUser && userId) {
      const { data: userRecord } = await admin.auth.admin.getUserById(userId);
      if (userRecord?.user?.email) {
        signInEmail = userRecord.user.email;
      }
    }

    // -------------------------------------------------------------------------
    // 11. Create session
    //
    // Two-step approach:
    //   a) Sign in with a plain createClient to get a session
    //   b) Set the session on the SSR client so cookies are written to response
    //
    // Also returns access_token + refresh_token for mobile/Bearer auth clients.
    // -------------------------------------------------------------------------
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    // Step a: Sign in with plain client to get session FIRST
    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: signInData, error: signInError } =
      await anonClient.auth.signInWithPassword({
        email: signInEmail,
        password,
      });

    if (signInError || !signInData.session) {
      const errorMsg = signInError?.message ?? 'Session is null';
      const status = (signInError as { status?: number })?.status ?? 500;
      console.error('Error creating session:', JSON.stringify({
        message: errorMsg,
        status,
        email: signInEmail,
      }));
      return NextResponse.json(
        {
          error: 'ERROR_INTERNO',
          detail: `No se pudo crear la sesión: ${errorMsg}`,
        },
        { status },
      );
    }

    // Create response WITH tokens for mobile clients
    const response = NextResponse.json({
      ok: true,
      isNewUser,
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
    });

    // Step b: Set the session on the SSR client to persist cookies
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

    const { error: setSessionError } =
      await serverClient.auth.setSession(signInData.session);

    if (setSessionError) {
      console.error('Error setting session on SSR client:', setSessionError.message);
      // Non-fatal — the session is valid even if SSR cookie setting fails
    }

    // -------------------------------------------------------------------------
    // 12. Return success
    // -------------------------------------------------------------------------
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
