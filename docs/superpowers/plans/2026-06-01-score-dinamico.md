# Score Dinámico de Reputación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar sistema de scoring dinámico que reacciona a pagos puntuales, pagos atrasados y defaults, con antigüedad on-read y historial transparente para el usuario.

**Architecture:** Servicio TypeScript (`calculator.ts`) orquesta el cálculo. Eventos de pago/default disparan `recalcularScore()`. El score base (eventos) se persiste en `participantes.score_reputacion`. La antigüedad se suma on-read via `scoreEfectivo()`. Historial de cambios en tabla `eventos_score`.

**Tech Stack:** Next.js 16, Supabase, Zod, TypeScript

---

## File Structure

### Crear:
- `supabase/migrations/011_score_dinamico.sql` — Migración: tabla eventos_score, enum
- `src/lib/score/calculator.ts` — Servicio de scoring: recalcularScore, scoreEfectivo, recalcularTodos
- `src/lib/validations/score.ts` — Schemas Zod para endpoints de score
- `src/app/api/participantes/score/historial/route.ts` — GET historial de eventos del usuario
- `src/app/api/admin/recalcular-score/route.ts` — POST recalcular score (admin)

### Modificar:
- `src/app/api/pago/route.ts` — Llamar recalcularScore() tras pago exitoso
- `src/app/api/desembolso/route.ts` — Usar scoreEfectivo() en vez de score_reputacion directo
- `src/app/api/gacc/mi-grupo/route.ts` — Devolver score_efectivo en respuesta
- `src/app/perfil/page.tsx` — Mostrar score_efectivo y agregar historial de eventos
- `src/app/api/participantes/route.ts` (GET check_existing) — Devolver score_efectivo

---

### Task 1: Migration SQL

**Files:**
- Create: `supabase/migrations/011_score_dinamico.sql`

- [ ] **Step 1: Write the migration**

```sql
-- =============================================================================
-- Migration 011: Score Dinámico de Reputación
-- =============================================================================
--
-- Agrega sistema de eventos de score para tracking de reputación.
-- El score base se almacena en participantes.score_reputacion (existente).
-- La antigüedad se calcula on-read (no se persiste como evento).
--
-- Rollback:
--   DROP TABLE IF EXISTS eventos_score;
--   DROP TYPE IF EXISTS tipo_evento_score;
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. New tipo_accion value for audit log
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'score_actualizado'
      AND enumtypid = 'tipo_accion'::regtype
  ) THEN
    ALTER TYPE tipo_accion ADD VALUE 'score_actualizado';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Table: eventos_score
-- ---------------------------------------------------------------------------
CREATE TABLE eventos_score (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participante_id   uuid NOT NULL REFERENCES participantes (id) ON DELETE CASCADE,
  tipo_evento       text NOT NULL CHECK (tipo_evento IN (
    'pago_puntual', 'pago_atrasado', 'default', 'recalculo_manual'
  )),
  delta             integer NOT NULL,
  score_anterior    integer NOT NULL,
  score_nuevo       integer NOT NULL,
  referencia_tipo   text CHECK (referencia_tipo IN ('credito', 'cuota')),
  referencia_id     uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Index for fast participant history queries
CREATE INDEX idx_eventos_score_participante
  ON eventos_score (participante_id, created_at DESC);

COMMENT ON TABLE  eventos_score              IS 'Historial de cambios en el score de reputación';
COMMENT ON COLUMN eventos_score.tipo_evento  IS 'Tipo de evento que disparó el cambio';
COMMENT ON COLUMN eventos_score.delta        IS 'Cambio neto aplicado al score (+2, -1, -15)';
COMMENT ON COLUMN eventos_score.referencia_id IS 'ID del crédito o cuota asociada al evento';
```

- [ ] **Step 2: Verify the migration file exists and is syntactically valid**

Run: `cat supabase/migrations/011_score_dinamico.sql | head -5`
Expected: 5 lines of SQL output (file exists)

---

### Task 2: Score Calculator Service

**Files:**
- Create: `src/lib/score/calculator.ts`

- [ ] **Step 1: Create the calculator with recalcularScore, scoreEfectivo, recalcularTodos**

```typescript
// =============================================================================
// Score Calculator — Dynamic Reputation Scoring Service
// =============================================================================
//
// Central service for all score-related operations.
//
// recalcularScore(participanteId, tipo, ref) — Called after a payment or
//   default event. Calculates delta, inserts evento_score row, updates
//   participantes.score_reputacion. Returns the new score.
//
// scoreEfectivo(participante) — Called on-read to get the effective score
//   including seniority bonus. Pure function, no side effects.
//
// recalcularTodosLosScores() — Called manually by admin. Recalculates
//   seniority for all active participants, inserting recalculo_manual
//   events only when the score actually changes.
// =============================================================================

import { getSupabaseClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TipoEventoScore = 'pago_puntual' | 'pago_atrasado' | 'default';

interface ParticipanteScore {
  id: string;
  score_reputacion: number;
  created_at: string;
}

interface RecalcularParams {
  participanteId: string;
  tipo: TipoEventoScore;
  referenciaTipo?: 'credito' | 'cuota';
  referenciaId?: string;
}

interface EventoScoreRow {
  id: string;
  participante_id: string;
  tipo_evento: string;
  delta: number;
  score_anterior: number;
  score_nuevo: number;
  referencia_tipo: string | null;
  referencia_id: string | null;
  created_at: string;
}

interface HistorialResponse {
  eventos: EventoScoreRow[];
  score_efectivo: number;
  score_eventos: number;
  antiguedad_meses: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DELTAS: Record<TipoEventoScore, number> = {
  pago_puntual: 2,
  pago_atrasado: -1,
  default: -15,
};

const MAX_ANTIGUEDAD = 10;
const DEFAULT_COOLDOWN_DIAS = 7;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function diffMeses(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12
    + (to.getMonth() - from.getMonth());
}

// ---------------------------------------------------------------------------
// Score Efectivo (on-read, pure function)
// ---------------------------------------------------------------------------

/**
 * Calcula el score efectivo incluyendo antigüedad.
 * Se llama desde cualquier lugar que muestre o use el score para decisiones.
 * Pure function — no tiene side effects.
 */
export function scoreEfectivo(scoreReputacion: number, createdAt: string): number {
  const meses = diffMeses(new Date(createdAt), new Date());
  return clamp(scoreReputacion + Math.min(meses, MAX_ANTIGUEDAD), 0, 100);
}

// ---------------------------------------------------------------------------
// Cooldown check
// ---------------------------------------------------------------------------

/**
 * Verifica si ya hubo un evento del mismo tipo en los últimos N días.
 * Previene múltiples aplicaciones del mismo evento (ej. default cooldown).
 */
async function tieneCooldown(
  supabase: ReturnType<typeof getSupabaseClient>,
  participanteId: string,
  tipo: TipoEventoScore,
  dias: number = DEFAULT_COOLDOWN_DIAS,
): Promise<boolean> {
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  const { data } = await supabase
    .from('eventos_score')
    .select('id')
    .eq('participante_id', participanteId)
    .eq('tipo_evento', tipo)
    .gte('created_at', desde.toISOString())
    .limit(1)
    .maybeSingle();

  return data !== null;
}

// ---------------------------------------------------------------------------
// Recalcular Score (post-evento)
// ---------------------------------------------------------------------------

/**
 * Recalcula el score después de un evento (pago, default).
 *
 * Flujo:
 * 1. Lee participante actual
 * 2. Verifica cooldown (solo para 'default')
 * 3. Calcula delta del evento
 * 4. Aplica clamp(0, 100)
 * 5. Inserta en eventos_score
 * 6. Actualiza participantes.score_reputacion
 * 7. Retorna el nuevo score
 */
export async function recalcularScore(params: RecalcularParams): Promise<number> {
  const supabase = getSupabaseClient();

  // 1. Get current participante
  const { data: rawParticipante } = await supabase
    .from('participantes')
    .select('id, score_reputacion, created_at')
    .eq('id', params.participanteId)
    .single();

  const participante = rawParticipante as unknown as ParticipanteScore | null;

  if (!participante) {
    throw new Error(`Participante no encontrado: ${params.participanteId}`);
  }

  // 2. Cooldown check for 'default'
  if (params.tipo === 'default') {
    const enCooldown = await tieneCooldown(supabase, params.participanteId, 'default');
    if (enCooldown) {
      // Return current score without changes
      return scoreEfectivo(participante.score_reputacion, participante.created_at);
    }
  }

  // 3. Calculate new score
  const delta = DELTAS[params.tipo];
  const scoreAnterior = participante.score_reputacion;
  const scoreNuevo = clamp(scoreAnterior + delta, 0, 100);

  // Skip if no change (shouldn't happen with nonzero deltas, but safety)
  if (scoreNuevo === scoreAnterior) {
    return scoreEfectivo(scoreNuevo, participante.created_at);
  }

  // 4. Insert evento_score
  const { error: insertError } = await supabase
    .from('eventos_score')
    .insert({
      participante_id: params.participanteId,
      tipo_evento: params.tipo,
      delta,
      score_anterior: scoreAnterior,
      score_nuevo: scoreNuevo,
      referencia_tipo: params.referenciaTipo ?? null,
      referencia_id: params.referenciaId ?? null,
    } as never);

  if (insertError) {
    console.error('[score] Error al insertar evento_score:', insertError.message);
  }

  // 5. Update participante score
  const { error: updateError } = await supabase
    .from('participantes')
    .update({ score_reputacion: scoreNuevo } as never)
    .eq('id', params.participanteId);

  if (updateError) {
    console.error('[score] Error al actualizar score_reputacion:', updateError.message);
  }

  return scoreEfectivo(scoreNuevo, participante.created_at);
}

// ---------------------------------------------------------------------------
// Obtener historial de eventos
// ---------------------------------------------------------------------------

/**
 * Retorna los últimos N eventos de score para un participante,
 * junto con el score efectivo actual.
 */
export async function obtenerHistorialScore(
  participanteId: string,
  limit: number = 20,
  offset: number = 0,
): Promise<HistorialResponse> {
  const supabase = getSupabaseClient();

  // Get participante data
  const { data: rawParticipante } = await supabase
    .from('participantes')
    .select('id, score_reputacion, created_at')
    .eq('id', participanteId)
    .single();

  const participante = rawParticipante as unknown as ParticipanteScore | null;

  if (!participante) {
    throw new Error(`Participante no encontrado: ${participanteId}`);
  }

  // Get events
  const { data: rawEventos } = await supabase
    .from('eventos_score')
    .select('*')
    .eq('participante_id', participanteId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const eventos = (rawEventos ?? []) as unknown as EventoScoreRow[];
  const scoreEventos = participante.score_reputacion;
  const meses = diffMeses(new Date(participante.created_at), new Date());

  return {
    eventos,
    score_efectivo: scoreEfectivo(scoreEventos, participante.created_at),
    score_eventos: scoreEventos,
    antiguedad_meses: Math.min(meses, MAX_ANTIGUEDAD),
  };
}

// ---------------------------------------------------------------------------
// Recalcular todos los scores (admin)
// ---------------------------------------------------------------------------

/**
 * Recalcula antigüedad para todos los participantes activos (o uno específico).
 * Solo inserta evento recalculo_manual si el score realmente cambió.
 *
 * Para cada participante:
 * 1. Calcula meses desde created_at hasta hoy
 * 2. Busca el último recalculo_manual en eventos_score
 * 3. Si hay meses nuevos no aplicados, suma la diferencia
 * 4. Si no hay cambio, skip
 */
export async function recalcularTodosLosScores(
  participanteId?: string,
): Promise<{ procesados: number }> {
  const supabase = getSupabaseClient();

  let query = supabase
    .from('participantes')
    .select('id, score_reputacion, created_at');

  if (participanteId) {
    query = query.eq('id', participanteId);
  } else {
    query = query.eq('activo', true);
  }

  const { data: rawParticipantes } = await query;

  const participantes = (rawParticipantes ?? []) as unknown as ParticipanteScore[];
  let procesados = 0;

  for (const p of participantes) {
    const meses = diffMeses(new Date(p.created_at), new Date());
    const antiguedadTotal = Math.min(meses, MAX_ANTIGUEDAD);

    // Check the last recalculo_manual event to see how many months were already applied
    const { data: ultimoEvento } = await supabase
      .from('eventos_score')
      .select('score_nuevo, created_at')
      .eq('participante_id', p.id)
      .eq('tipo_evento', 'recalculo_manual')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const ultimo = ultimoEvento as unknown as { score_nuevo: number; created_at: string } | null;

    // Calculate how many months of seniority have NOT been applied yet
    let mesesYaAplicados = 0;
    if (ultimo) {
      const mesesEnUltimoEvento = diffMeses(new Date(p.created_at), new Date(ultimo.created_at));
      mesesYaAplicados = Math.min(mesesEnUltimoEvento, MAX_ANTIGUEDAD);
    }

    const mesesNuevos = Math.min(
      Math.max(antiguedadTotal - mesesYaAplicados, 0),
      MAX_ANTIGUEDAD - mesesYaAplicados,
    );

    if (mesesNuevos <= 0) continue;

    const scoreAnterior = p.score_reputacion;
    const scoreNuevo = clamp(scoreAnterior + mesesNuevos, 0, 100);

    if (scoreNuevo === scoreAnterior) continue;

    // Insert recalculo_manual event
    await supabase
      .from('eventos_score')
      .insert({
        participante_id: p.id,
        tipo_evento: 'recalculo_manual',
        delta: mesesNuevos,
        score_anterior: scoreAnterior,
        score_nuevo: scoreNuevo,
        referencia_tipo: null,
        referencia_id: null,
      } as never);

    // Update participante
    await supabase
      .from('participantes')
      .update({ score_reputacion: scoreNuevo } as never)
      .eq('id', p.id);

    procesados++;
  }

  return { procesados };
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit src/lib/score/calculator.ts`
Expected: No output (compiles cleanly)

---

### Task 3: Zod Validations for Score Endpoints

**Files:**
- Create: `src/lib/validations/score.ts`

- [ ] **Step 1: Create validation schemas**

```typescript
// =============================================================================
// Score Validations — Zod Schemas
// =============================================================================

import { z } from 'zod/v4';

// ---------------------------------------------------------------------------
// GET /api/participantes/score/historial
// ---------------------------------------------------------------------------

export const HistorialScoreQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// ---------------------------------------------------------------------------
// POST /api/admin/recalcular-score
// ---------------------------------------------------------------------------

export const RecalcularScoreSchema = z.object({
  participante_id: z.string().uuid().optional(),
});
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit src/lib/validations/score.ts`
Expected: No output

---

### Task 4: Integrate recalcularScore en POST /api/pago

**Files:**
- Modify: `src/app/api/pago/route.ts` — after step 9 (update cuota), before step 10 (check all paid)

- [ ] **Step 1: Add the recalcularScore import and call in the pago route**

Add import at the top of `src/app/api/pago/route.ts`:

```typescript
import { recalcularScore } from '@/lib/score/calculator';
```

Add the recalcularScore call right after the cuota update (after `updateCuotaError` block, before "Check if ALL cuotas are now paid" section):

```typescript
    // ------------------------------------------------------------------
    // 9b. Recalcular score (pago puntual o atrasado)
    // ------------------------------------------------------------------
    const ahora = new Date();
    const fechaVencimiento = new Date(typedCuota.fecha_vencimiento);
    const esPuntual = ahora <= fechaVencimiento;

    recalcularScore({
      participanteId: typedParticipante.id,
      tipo: esPuntual ? 'pago_puntual' : 'pago_atrasado',
      referenciaTipo: 'cuota',
      referenciaId: typedCuota.id,
    }).catch((err) => {
      console.warn('[pago] Error al recalcular score (no bloqueante):', err);
    });
```

> **IMPORTANTE:** `recalcularScore()` corre en `catch()` para NO bloquear el flujo de pago. Si falla el score, el pago igual se registra. Esto es consistente con el patrón de `registrarAuditLog()` que también es no-bloqueante.

- [ ] **Step 2: Also add `fecha_vencimiento` to the cuota select query**

Find the `cuota` select query and add `fecha_vencimiento` to the fields:

```typescript
      .select(`
        id,
        numero_cuota,
        monto_cuota,
        estado,
        fecha_vencimiento,
        credito:credito_id (
          id,
          estado
        )
      `)
```

Also update the `CuotaConCredito` interface:

```typescript
interface CuotaConCredito {
  id: string;
  numero_cuota: number;
  monto_cuota: string;
  estado: string;
  fecha_vencimiento: string;
  credito: {
    id: string;
    estado: string;
  };
}
```

- [ ] **Step 3: Verify the file compiles**

Run: `npx tsc --noEmit src/app/api/pago/route.ts`
Expected: No output

---

### Task 5: Use scoreEfectivo en POST /api/desembolso

**Files:**
- Modify: `src/app/api/desembolso/route.ts` — use scoreEfectivo for the >80 check

- [ ] **Step 1: Add scoreEfectivo import**

```typescript
import { scoreEfectivo } from '@/lib/score/calculator';
```

- [ ] **Step 2: Replace direct score check with scoreEfectivo**

Find the line where `prestatario.score_reputacion` is read (around line 164-165). It currently reads the value and compares it directly. Change to use `scoreEfectivo()`:

```typescript
    const scoreReputacion = scoreEfectivo(
      prestatario.score_reputacion,
      prestatario.created_at,
    );
```

Make sure `created_at` is being selected in the participante query. Find the `.select()` for prestatario and add `created_at`:

Find the select that fetches the prestatario (should include `score_reputacion, wallet_address, nombre`) and add `created_at`:

```typescript
      .select('id, wallet_address, nombre, score_reputacion, created_at')
```

- [ ] **Step 3: Verify the file compiles**

Run: `npx tsc --noEmit src/app/api/desembolso/route.ts`
Expected: No output

---

### Task 6: Use scoreEfectivo en GET /api/gacc/mi-grupo

**Files:**
- Modify: `src/app/api/gacc/mi-grupo/route.ts` — return score_efectivo alongside score_reputacion

- [ ] **Step 1: Add scoreEfectivo import**

```typescript
import { scoreEfectivo } from '@/lib/score/calculator';
```

- [ ] **Step 2: Update the response to include score_efectivo**

Find where `score_reputacion` is returned in the response (likely in the `miembros` map). Replace the raw `score_reputacion` with:

```typescript
score_efectivo: scoreEfectivo(
  miembro.score_reputacion,
  miembro.created_at,
),
```

Keep `score_reputacion` in the response as well for transparency.

Also ensure `created_at` is selected from the participantes table in the join query.

- [ ] **Step 3: Verify the file compiles**

Run: `npx tsc --noEmit src/app/api/gacc/mi-grupo/route.ts`
Expected: No output

---

### Task 7: API Route — GET /api/participantes/score/historial

**Files:**
- Create: `src/app/api/participantes/score/historial/route.ts`

- [ ] **Step 1: Create the historial route**

```typescript
// =============================================================================
// GET /api/participantes/score/historial — Historial de eventos de score
// =============================================================================
//
// Returns the last N score events for the authenticated user, along with
// the current effective score breakdown.
//
// Query params:
//   limit  — items per page (default: 20, max: 100)
//   offset — pagination offset (default: 0)
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { HistorialScoreQuerySchema } from '@/lib/validations/score';
import { obtenerHistorialScore } from '@/lib/score/calculator';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 1. Parse query params
    // ------------------------------------------------------------------
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());

    const validation = HistorialScoreQuerySchema.safeParse(queryParams);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'PARAMETROS_INVALIDOS',
          detail: validation.error.issues[0]?.message ?? 'Parámetros inválidos',
        },
        { status: 400 },
      );
    }

    const { limit, offset } = validation.data;

    // ------------------------------------------------------------------
    // 2. Verify session
    // ------------------------------------------------------------------
    const cookieStore = await cookies();
    const user = await getServerUser(cookieStore);

    if (!user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión' },
        { status: 401 },
      );
    }

    // ------------------------------------------------------------------
    // 3. Get participante by auth user_id
    // ------------------------------------------------------------------
    const supabase = getSupabaseClient();

    const { data: rawParticipante } = await supabase
      .from('participantes')
      .select('id')
      .eq('user_id', user.id)
      .single();

    const participante = rawParticipante as unknown as { id: string } | null;

    if (!participante) {
      return NextResponse.json(
        { error: 'PARTICIPANTE_NO_ENCONTRADO', detail: 'No tienes un perfil de participante' },
        { status: 404 },
      );
    }

    // ------------------------------------------------------------------
    // 4. Fetch historial
    // ------------------------------------------------------------------
    const historial = await obtenerHistorialScore(participante.id, limit, offset);

    // ------------------------------------------------------------------
    // 5. Return response
    // ------------------------------------------------------------------
    return NextResponse.json(historial, { status: 200 });
  } catch (err) {
    console.error('[score/historial] Error:', err);

    return NextResponse.json(
      {
        error: 'ERROR_INTERNO',
        detail: err instanceof Error ? err.message : 'Error interno del servidor',
      },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit src/app/api/participantes/score/historial/route.ts`
Expected: No output

---

### Task 8: API Route — POST /api/admin/recalcular-score

**Files:**
- Create: `src/app/api/admin/recalcular-score/route.ts`

- [ ] **Step 1: Create the admin recalcular route**

```typescript
// =============================================================================
// POST /api/admin/recalcular-score — Recalcular scores (admin)
// =============================================================================
//
// Admin-only endpoint to recalculate seniority for all active participants
// or a specific one. Only inserts recalculo_manual events when the score
// actually changes.
//
// Body:
//   participante_id? — UUID of a specific participant (optional)
// =============================================================================

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { RecalcularScoreSchema } from '@/lib/validations/score';
import { recalcularTodosLosScores } from '@/lib/score/calculator';

export async function POST(request: Request): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 1. Verify admin session
    // ------------------------------------------------------------------
    const cookieStore = await cookies();
    const user = await getServerUser(cookieStore);

    if (!user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión' },
        { status: 401 },
      );
    }

    const supabase = getSupabaseClient();

    const { data: rawParticipante } = await supabase
      .from('participantes')
      .select('rol')
      .eq('user_id', user.id)
      .single();

    const participante = rawParticipante as unknown as { rol: string } | null;

    if (!participante || participante.rol !== 'admin') {
      return NextResponse.json(
        { error: 'NO_AUTORIZADO', detail: 'Solo administradores pueden recalcular scores' },
        { status: 403 },
      );
    }

    // ------------------------------------------------------------------
    // 2. Parse body (optional)
    // ------------------------------------------------------------------
    let participanteId: string | undefined;

    try {
      const body = await request.json();
      const validation = RecalcularScoreSchema.safeParse(body);

      if (validation.success && validation.data.participante_id) {
        participanteId = validation.data.participante_id;
      }
    } catch {
      // Empty body is fine — recalcula todos
    }

    // ------------------------------------------------------------------
    // 3. Recalcular
    // ------------------------------------------------------------------
    const result = await recalcularTodosLosScores(participanteId);

    // ------------------------------------------------------------------
    // 4. Return
    // ------------------------------------------------------------------
    return NextResponse.json(
      {
        status: 'ok',
        procesados: result.procesados,
        detalle: participanteId
          ? `Score recalculado para ${result.procesados} participante(s)`
          : `Scores recalculados para ${result.procesados} participante(s)`,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[admin/recalcular-score] Error:', err);

    return NextResponse.json(
      {
        error: 'ERROR_INTERNO',
        detail: err instanceof Error ? err.message : 'Error interno del servidor',
      },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit src/app/api/admin/recalcular-score/route.ts`
Expected: No output

---

### Task 9: Update Perfil Page — Score Efectivo + Historial

**Files:**
- Modify: `src/app/perfil/page.tsx` — show score_efectivo, add historial section/tab
- Add `src/app/perfil/score/page.tsx` if separate page preferred, or keep as tab in perfil

Based on earlier design discussion, the historial goes in perfil como tab o página separada. Two options — decide during implementation. For now, we'll add a simple "Score" section to the existing perfil page.

- [ ] **Step 1: Update score display in perfil to use score_efectivo**

In the perfil page, find where `profile.score_reputacion` is displayed. Wrap it:

```typescript
import { scoreEfectivo } from '@/lib/score/calculator';

// In the render section, replace direct score_reputacion with:
const score = profile ? scoreEfectivo(profile.score_reputacion, profile.created_at) : 0;
```

Also add a fetch call to `/api/participantes/score/historial?limit=10` to show recent events in a collapsible list, below the score display.

> **Nota:** El detalle de la UI (tabs, collapsible, página separada) se definirá en implementación. Por ahora, agregar un listado simple debajo del score actual.

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit src/app/perfil/page.tsx`
Expected: No output

---

### Task 10: Verificación Final

- [ ] **Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: No errors (pre-existing supabase `as never` errors are acceptable)

- [ ] **Step 2: Run lint on new/modified files**

Run: `npx eslint src/lib/score/ src/app/api/participantes/score/ src/app/api/admin/recalcular-score/ src/app/api/pago/route.ts src/app/api/desembolso/route.ts src/app/perfil/page.tsx 2>&1`
Expected: Only pre-existing lint warnings, no new errors
