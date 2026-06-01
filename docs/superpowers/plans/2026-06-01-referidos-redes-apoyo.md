# SDD 03 — Referidos y Redes de Apoyo: Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar sistema de referidos, redes de apoyo, score colectivo, semáforo comunitario y notificaciones in-app.

**Architecture:** Servicios en `src/lib/referidos/`, `src/lib/notificaciones/`, `src/lib/email/` con side-effects no-bloqueantes. APIs REST en App Router. Modelo de datos en migration 012.

**Tech Stack:** Next.js 16, Supabase, Zod v4, TypeScript strict.

---

## File Structure

```
NUEVOS:
supabase/migrations/012_referidos.sql

src/lib/
  referidos/
    registry.ts           # registrarReferido() + asignar a red
    semaforo.ts           # verificarAtrasosRed()
    score-red.ts          # recalcularScoreRed()
  notificaciones/
    service.ts            # crearNotificacion()
    queries.ts            # listarNotificaciones(), marcarLeida()
  email/
    cola.ts               # encolarEmail()
    sender.ts             # procesarCola() (stub)
  validations/
    referidos.ts          # CodigoReferidoSchema (Zod)
    notificaciones.ts     # NotificacionQuerySchema (Zod)

src/app/api/
  referidos/
    mi-red/
      route.ts            # GET
  notificaciones/
    route.ts              # GET
    [id]/
      leer/
        route.ts          # PATCH
  admin/
    procesar-emails/
      route.ts            # POST
  participantes/
    route.ts              # MODIFICAR: agregar codigo_referido
  pago/
    route.ts              # MODIFICAR: agregar recalcularScoreRed + verificarAtrasosRed

src/app/
  notificaciones/
    page.tsx              # Bandeja de notificaciones
  perfil/
    page.tsx              # MODIFICAR: agregar RedCard

src/components/
  notificaciones/
    NotificacionItem.tsx  # Componente de item de notificación
  redes/
    RedCard.tsx           # Widget de red para perfil
```

---

### Task 1: Migration 012 — Tablas de referidos, redes y notificaciones

**Files:**
- Create: `supabase/migrations/012_referidos.sql`

- [ ] **Step 1: Write migration SQL**

Write `supabase/migrations/012_referidos.sql`:

```sql
-- =============================================================================
-- 012_referidos.sql — Tablas para SDD 03: Referidos y Redes de Apoyo
-- =============================================================================

-- 1. Código de referido para cada participante
ALTER TABLE participantes ADD COLUMN codigo_referido TEXT UNIQUE;

-- 2. Referidos
CREATE TABLE referidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referidor_id UUID NOT NULL REFERENCES participantes(id),
  referido_id UUID NOT NULL REFERENCES participantes(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activo BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(referido_id)
);

-- 3. Redes de Apoyo
CREATE TABLE redes_apoyo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  score_red INTEGER NOT NULL DEFAULT 50,
  estado TEXT NOT NULL DEFAULT 'verde' CHECK (estado IN ('verde', 'amarillo', 'rojo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Miembros de Red
CREATE TABLE red_miembros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  red_id UUID NOT NULL REFERENCES redes_apoyo(id),
  participante_id UUID NOT NULL REFERENCES participantes(id),
  es_referidora BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(participante_id)
);

-- 5. Notificaciones In-App
CREATE TABLE notificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participante_id UUID NOT NULL REFERENCES participantes(id),
  tipo TEXT NOT NULL CHECK (tipo IN (
    'bienvenida_red',
    'score_red_mejoro',
    'score_red_empeoro',
    'alerta_48h',
    'alerta_7d',
    'referido_nuevo'
  )),
  titulo TEXT NOT NULL,
  cuerpo TEXT NOT NULL,
  leida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index para listar notificaciones por usuario (más recientes primero)
CREATE INDEX idx_notificaciones_participante ON notificaciones(participante_id, created_at DESC);

-- 6. Cola de Email
CREATE TABLE cola_email (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  para TEXT NOT NULL,
  asunto TEXT NOT NULL,
  cuerpo_html TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviado', 'fallido')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  enviado_at TIMESTAMPTZ
);
```

- [ ] **Step 2: Review SQL**

Verify table names, column types, FK references, and UNIQUE constraints match the spec design.

---

### Task 2: Código de referido en POST /api/participantes

**Files:**
- Modify: `src/app/api/participantes/route.ts`

- [ ] **Step 1: Add codigo_referido generation logic**

When a participante is created, generate a unique code with format `MANGLE-{nombre}-{4 caracteres aleatorios}`. Add after the INSERT block (before audit log and response):

```typescript
// Generate unique código de referido
const codigoSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
const codigoReferido = `MANGLE-${participanteData.nombre.replace(/\s+/g, '').substring(0, 8).toUpperCase()}-${codigoSuffix}`;

const { error: codigoError } = await supabase
  .from('participantes')
  .update({ codigo_referido: codigoReferido } as never)
  .eq('id', typedParticipante.id);

if (codigoError) {
  console.warn('[participantes] Error al asignar código de referido:', codigoError.message);
}
```

- [ ] **Step 2: Verify**

Typecheck with `npm run typecheck` (expect only pre-existing errors).

---

### Task 3: Servicio de registro de referido — registry.ts

**Files:**
- Create: `src/lib/referidos/registry.ts`

- [ ] **Step 1: Write the registry service**

```typescript
// =============================================================================
// registry.ts — Registro de referidos y asignación a red
// =============================================================================

import { getSupabaseClient } from '@/lib/supabase/client';

interface RegistroResult {
  redId: string;
  esNuevaRed: boolean;
}

export async function registrarReferido(params: {
  referidoId: string;
  codigoReferido: string;
}): Promise<RegistroResult> {
  const supabase = getSupabaseClient();

  // 1. Buscar quien es dueño del código
  const { data: rawReferidor } = await supabase
    .from('participantes')
    .select('id, nombre')
    .eq('codigo_referido', params.codigoReferido)
    .single();

  const referidor = rawReferidor as unknown as { id: string; nombre: string } | null;

  if (!referidor) {
    throw new Error('CODIGO_REFERIDO_INVALIDO');
  }

  // 2. Validar que no sea autorreferencia
  if (referidor.id === params.referidoId) {
    throw new Error('AUTORREFERENCIA_INVALIDA');
  }

  // 3. Insertar referido
  const { error: refError } = await supabase
    .from('referidos')
    .insert({
      referidor_id: referidor.id,
      referido_id: params.referidoId,
    } as never);

  if (refError) {
    throw new Error(`ERROR_AL_REGISTRAR_REFERIDO: ${refError.message}`);
  }

  // 4. Buscar red del referidor
  const { data: rawMiembro } = await supabase
    .from('red_miembros')
    .select('red_id')
    .eq('participante_id', referidor.id)
    .single();

  const miembroExistente = rawMiembro as unknown as { red_id: string } | null;

  let redId: string;
  let esNuevaRed = false;

  if (!miembroExistente) {
    // 5. Crear nueva red con el referidor como primer miembro
    const { data: rawRed, error: redError } = await supabase
      .from('redes_apoyo')
      .insert({
        nombre: `Red de ${referidor.nombre}`,
      } as never)
      .select('id')
      .single();

    const nuevaRed = rawRed as unknown as { id: string } | null;
    if (redError || !nuevaRed) throw new Error('ERROR_CREANDO_RED');

    redId = nuevaRed.id;
    esNuevaRed = true;

    // Insertar referidor como es_referidora
    await supabase.from('red_miembros').insert({
      red_id: redId,
      participante_id: referidor.id,
      es_referidora: true,
    } as never);
  } else {
    redId = miembroExistente.red_id;
  }

  // 6. Insertar nuevo miembro en la red
  const { error: miembroError } = await supabase
    .from('red_miembros')
    .insert({
      red_id: redId,
      participante_id: params.referidoId,
    } as never);

  if (miembroError) throw new Error('ERROR_ASIGNANDO_RED');

  return { redId, esNuevaRed };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit src/lib/referidos/registry.ts`
Expect: Only pre-existing path alias errors.

---

### Task 4: Integrar registrarReferido en POST /api/participantes

**Files:**
- Modify: `src/app/api/participantes/route.ts`

- [ ] **Step 1: Add import and codigo_referido to the body schema**

Add to imports:
```typescript
import { registrarReferido } from '@/lib/referidos/registry';
```

In the Zod schema or body type, add optional field `codigo_referido?: string`.

- [ ] **Step 2: Call registrarReferido after participant creation**

After the INSERT succeeds and the `asParticipante` is created, add:

```typescript
// Si viene con código de referido, registrar
if (body.codigo_referido) {
  registrarReferido({
    referidoId: typedParticipante.id,
    codigoReferido: body.codigo_referido,
  }).catch((err) => {
    console.warn('[participantes] Error al registrar referido:', err);
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck` — verify no new errors.

---

### Task 5: Servicio de notificaciones — service.ts + queries.ts

**Files:**
- Create: `src/lib/notificaciones/service.ts`
- Create: `src/lib/notificaciones/queries.ts`

- [ ] **Step 1: Write service.ts**

```typescript
// =============================================================================
// service.ts — Creación de notificaciones in-app
// =============================================================================

import { getSupabaseClient } from '@/lib/supabase/client';

type TipoNotificacion = 'bienvenida_red' | 'score_red_mejoro' | 'score_red_empeoro' | 'alerta_48h' | 'alerta_7d' | 'referido_nuevo';

export async function crearNotificacion(params: {
  participanteId: string;
  tipo: TipoNotificacion;
  titulo: string;
  cuerpo: string;
}): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('notificaciones')
    .insert({
      participante_id: params.participanteId,
      tipo: params.tipo,
      titulo: params.titulo,
      cuerpo: params.cuerpo,
    } as never);

  if (error) {
    console.warn('[notificaciones] Error al crear notificación:', error.message);
  }
}

export async function notificarARed(params: {
  redId: string;
  tipo: TipoNotificacion;
  titulo: string;
  cuerpo: string;
}): Promise<void> {
  const supabase = getSupabaseClient();

  const { data: miembros } = await supabase
    .from('red_miembros')
    .select('participante_id')
    .eq('red_id', params.redId);

  const rows = miembros as unknown as { participante_id: string }[] | null;

  if (!rows || rows.length === 0) return;

  for (const miembro of rows) {
    await crearNotificacion({
      participanteId: miembro.participante_id,
      tipo: params.tipo,
      titulo: params.titulo,
      cuerpo: params.cuerpo,
    });
  }
}
```

- [ ] **Step 2: Write queries.ts**

```typescript
// =============================================================================
// queries.ts — Consultas de notificaciones
// =============================================================================

import { getSupabaseClient } from '@/lib/supabase/client';

interface Notificacion {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  leida: boolean;
  created_at: string;
}

export async function listarNotificaciones(
  participanteId: string,
  limit: number = 20,
  offset: number = 0,
): Promise<{ notificaciones: Notificacion[]; total: number }> {
  const supabase = getSupabaseClient();

  const { data: rawNotifs, error } = await supabase
    .from('notificaciones')
    .select('id, tipo, titulo, cuerpo, leida, created_at', { count: 'exact' })
    .eq('participante_id', participanteId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.warn('[notificaciones] Error al listar:', error.message);
    return { notificaciones: [], total: 0 };
  }

  const notificaciones = (rawNotifs ?? []) as unknown as Notificacion[];

  // Second query for total count (Supabase count with range is unreliable)
  const { count } = await supabase
    .from('notificaciones')
    .select('*', { count: 'exact', head: true })
    .eq('participante_id', participanteId);

  return {
    notificaciones,
    total: count ?? notificaciones.length,
  };
}

export async function marcarLeida(
  notificacionId: string,
  participanteId: string,
): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('notificaciones')
    .update({ leida: true } as never)
    .eq('id', notificacionId)
    .eq('participante_id', participanteId); // ownership check

  if (error) {
    throw new Error('NOTIFICACION_NO_ENCONTRADA');
  }
}

export async function contarNoLeidas(participanteId: string): Promise<number> {
  const supabase = getSupabaseClient();

  const { count, error } = await supabase
    .from('notificaciones')
    .select('*', { count: 'exact', head: true })
    .eq('participante_id', participanteId)
    .eq('leida', false);

  if (error) return 0;
  return count ?? 0;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit src/lib/notificaciones/service.ts src/lib/notificaciones/queries.ts`

---

### Task 6: Servicio de email — cola.ts + sender.ts

**Files:**
- Create: `src/lib/email/cola.ts`
- Create: `src/lib/email/sender.ts`

- [ ] **Step 1: Write cola.ts**

```typescript
// =============================================================================
// cola.ts — Cola de emails diferidos
// =============================================================================

import { getSupabaseClient } from '@/lib/supabase/client';

export async function encolarEmail(params: {
  para: string;
  asunto: string;
  cuerpoHtml: string;
}): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('cola_email')
    .insert({
      para: params.para,
      asunto: params.asunto,
      cuerpo_html: params.cuerpoHtml,
    } as never);

  if (error) {
    console.warn('[email] Error al encolar:', error.message);
  }
}
```

- [ ] **Step 2: Write sender.ts**

```typescript
// =============================================================================
// sender.ts — Procesador de cola de emails (STUB)
// =============================================================================
//
// Por ahora solo loguea a consola y marca como enviado.
// Cuando se integre con un provider (SendGrid, Resend, etc.),
// solo se cambia la función enviarEmail().
// =============================================================================

import { getSupabaseClient } from '@/lib/supabase/client';

async function enviarEmail(para: string, asunto: string, cuerpoHtml: string): Promise<void> {
  // STUB: loguear a consola
  console.log('[email] Enviando email a', para);
  console.log('[email] Asunto:', asunto);
  console.log('[email] Cuerpo:', cuerpoHtml.substring(0, 200) + '...');

  // TODO: Integrar con SendGrid/Resend aquí
  // Ej: await sendgrid.send({ to: para, subject: asunto, html: cuerpoHtml });
}

export async function procesarCola(): Promise<{ procesados: number; fallidos: number }> {
  const supabase = getSupabaseClient();

  const { data: rawPendientes } = await supabase
    .from('cola_email')
    .select('id, para, asunto, cuerpo_html')
    .eq('estado', 'pendiente')
    .limit(50);

  const pendientes = rawPendientes as unknown as { id: string; para: string; asunto: string; cuerpo_html: string }[] | null;

  if (!pendientes || pendientes.length === 0) {
    return { procesados: 0, fallidos: 0 };
  }

  let procesados = 0;
  let fallidos = 0;

  for (const email of pendientes) {
    try {
      await enviarEmail(email.para, email.asunto, email.cuerpo_html);

      await supabase
        .from('cola_email')
        .update({ estado: 'enviado', enviado_at: new Date().toISOString() } as never)
        .eq('id', email.id);

      procesados++;
    } catch (err) {
      await supabase
        .from('cola_email')
        .update({ estado: 'fallido', error: String(err) } as never)
        .eq('id', email.id);

      fallidos++;
    }
  }

  return { procesados, fallidos };
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit src/lib/email/cola.ts src/lib/email/sender.ts`

---

### Task 7: Semáforo comunitario — semaforo.ts

**Files:**
- Create: `src/lib/referidos/semaforo.ts`

- [ ] **Step 1: Write semaforo.ts**

```typescript
// =============================================================================
// semaforo.ts — Verificador de atrasos y semáforo comunitario
// =============================================================================
//
// Se ejecuta como side-effect no-bloqueante después de cada pago.
// Evalúa si hay miembros de la red con cuotas vencidas y actualiza
// el estado de la red (verde/amarillo/rojo).
// =============================================================================

import { getSupabaseClient } from '@/lib/supabase/client';
import { notificarARed } from '@/lib/notificaciones/service';
import { encolarEmail } from '@/lib/email/cola';

export async function verificarAtrasosRed(participanteId: string): Promise<void> {
  const supabase = getSupabaseClient();

  // 1. Obtener red del participante
  const { data: rawMiembro } = await supabase
    .from('red_miembros')
    .select('red_id')
    .eq('participante_id', participanteId)
    .single();

  const miembro = rawMiembro as unknown as { red_id: string } | null;
  if (!miembro) return; // No tiene red

  const redId = miembro.red_id;

  // 2. Obtener todos los miembros de la red
  const { data: rawMiembros } = await supabase
    .from('red_miembros')
    .select('participante_id')
    .eq('red_id', redId);

  const miembros = rawMiembros as unknown as { participante_id: string }[] | null;
  if (!miembros || miembros.length === 0) return;

  const miembroIds = miembros.map(m => m.participante_id);

  // 3. Buscar cuotas vencidas no pagadas de estos miembros
  const ahora = new Date();
  const hace48h = new Date(ahora.getTime() - 48 * 60 * 60 * 1000);
  const hace7d = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);

  const { data: rawCuotasVencidas } = await supabase
    .from('cuotas')
    .select('id, credito_id, fecha_vencimiento, estado')
    .in('participante_id', miembroIds)  // Nota: puede necesitarse JOIN con creditos
    .in('estado', ['pendiente', 'vencida']);

  // Nota: si cuotas no tiene participante_id directo, se necesita JOIN
  // Alternativa: buscar creditos de estos miembros y luego cuotas de esos creditos
  const { data: rawCreditos } = await supabase
    .from('creditos')
    .select('id')
    .in('prestatario_id', miembroIds);

  const creditos = rawCreditos as unknown as { id: string }[] | null;
  const creditoIds = creditos?.map(c => c.id) ?? [];

  if (creditoIds.length === 0) {
    // Sin créditos → sin atrasos → verde
    await actualizarEstadoRed(redId, 'verde');
    return;
  }

  const { data: rawCuotas } = await supabase
    .from('cuotas')
    .select('id, fecha_vencimiento, estado')
    .in('credito_id', creditoIds)
    .in('estado', ['pendiente', 'vencida']);

  const cuotasVencidas = rawCuotas as unknown as { id: string; fecha_vencimiento: string; estado: string }[] | null;

  if (!cuotasVencidas || cuotasVencidas.length === 0) {
    // Sin cuotas vencidas → verde
    await actualizarEstadoRed(redId, 'verde');
    return;
  }

  // 4. Evaluar el peor caso
  const tieneAtrasoMayorA7d = cuotasVencidas.some(
    c => new Date(c.fecha_vencimiento) < hace7d,
  );

  const tieneAtrasoMayorA48h = cuotasVencidas.some(
    c => new Date(c.fecha_vencimiento) < hace48h,
  );

  if (tieneAtrasoMayorA7d) {
    await actualizarEstadoRed(redId, 'rojo');
    await notificarARed({
      redId,
      tipo: 'alerta_7d',
      titulo: '🔴 Alerta: Atraso prolongado en tu red',
      cuerpo: 'Una compañera de tu red tiene más de 7 días de atraso. El acceso a nuevos créditos está temporalmente restringido hasta que se regularice la situación.',
    });

    // Encolar email a la referidora
    const { data: rawRef } = await supabase
      .from('red_miembros')
      .select('participante_id')
      .eq('red_id', redId)
      .eq('es_referidora', true)
      .single();

    const referidora = rawRef as unknown as { participante_id: string } | null;
    if (referidora) {
      const { data: rawP } = await supabase
        .from('participantes')
        .select('email')
        .eq('id', referidora.participante_id)
        .single();
      const email = (rawP as unknown as { email: string } | null)?.email;
      if (email) {
        await encolarEmail({
          para: email,
          asunto: '🔴 Alerta: Tu red de apoyo necesita atención',
          cuerpoHtml: `<p>Una compañera de tu red tiene más de 7 días de atraso.</p><p>Por favor contacta a tu Embajadora Digital para activar el protocolo de contingencia.</p>`,
        });
      }
    }
  } else if (tieneAtrasoMayorA48h) {
    await actualizarEstadoRed(redId, 'amarillo');
    await notificarARed({
      redId,
      tipo: 'alerta_48h',
      titulo: '🟡 Alerta de Apoyo',
      cuerpo: 'Una compañera de tu red presenta un retraso en su cuota. Como su red de apoyo, te invitamos a activar los lazos comunitarios. Si la ayudas a ponerse al día o a contactar a su Embajadora Digital, el puntaje de tu red se mantendrá intacto.',
    });
  }
}

async function actualizarEstadoRed(redId: string, nuevoEstado: 'verde' | 'amarillo' | 'rojo'): Promise<void> {
  const supabase = getSupabaseClient();

  // Solo actualizar si cambió
  const { data: rawActual } = await supabase
    .from('redes_apoyo')
    .select('estado')
    .eq('id', redId)
    .single();

  const actual = rawActual as unknown as { estado: string } | null;

  if (actual && actual.estado === nuevoEstado) return; // No cambió

  await supabase
    .from('redes_apoyo')
    .update({ estado: nuevoEstado } as never)
    .eq('id', redId);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit src/lib/referidos/semaforo.ts`

---

### Task 8: Score de red — score-red.ts

**Files:**
- Create: `src/lib/referidos/score-red.ts`

- [ ] **Step 1: Write score-red.ts**

```typescript
// =============================================================================
// score-red.ts — Cálculo de score colectivo de red
// =============================================================================

import { getSupabaseClient } from '@/lib/supabase/client';
import { scoreEfectivo } from '@/lib/score/calculator';
import { notificarARed } from '@/lib/notificaciones/service';

export async function recalcularScoreRed(redId: string): Promise<number> {
  const supabase = getSupabaseClient();

  // 1. Obtener miembros con sus scores
  const { data: rawMiembros } = await supabase
    .from('red_miembros')
    .select(`
      participante_id,
      participante:participantes!red_miembros_participante_id_fkey(
        score_reputacion,
        created_at
      )
    `)
    .eq('red_id', redId);

  const miembros = rawMiembros as unknown as {
    participante_id: string;
    participante: { score_reputacion: number; created_at: string } | { score_reputacion: number; created_at: string }[];
  }[] | null;

  if (!miembros || miembros.length === 0) return 0;

  // 2. Calcular promedio de scores efectivos
  let suma = 0;
  for (const m of miembros) {
    const rawP = m.participante;
    const p = Array.isArray(rawP) ? rawP[0] : rawP;
    if (p) {
      suma += scoreEfectivo(p.score_reputacion, p.created_at);
    }
  }

  const nuevoScore = Math.round(suma / miembros.length);

  // 3. Obtener score anterior
  const { data: rawRed } = await supabase
    .from('redes_apoyo')
    .select('score_red, estado')
    .eq('id', redId)
    .single();

  const red = rawRed as unknown as { score_red: number; estado: string } | null;

  // 4. Actualizar en DB
  await supabase
    .from('redes_apoyo')
    .update({ score_red: nuevoScore } as never)
    .eq('id', redId);

  // 5. Notificar si hubo cambio significativo
  if (red && red.score_red !== nuevoScore) {
    const diferencia = nuevoScore - red.score_red;
    if (diferencia > 0) {
      await notificarARed({
        redId,
        tipo: 'score_red_mejoro',
        titulo: '📈 Score de red mejoró',
        cuerpo: `El score de tu red de apoyo subió de ${red.score_red} a ${nuevoScore}. ¡Sigan así!`,
      });
    } else {
      await notificarARed({
        redId,
        tipo: 'score_red_empeoro',
        titulo: '📉 Score de red disminuyó',
        cuerpo: `El score de tu red de apoyo bajó de ${red.score_red} a ${nuevoScore}. Recuerden que juntas se apoyan para mantener un buen historial.`,
      });
    }
  }

  return nuevoScore;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit src/lib/referidos/score-red.ts`

---

### Task 9: Integrar recalcularScoreRed + verificarAtrasosRed en POST /api/pago

**Files:**
- Modify: `src/app/api/pago/route.ts`

- [ ] **Step 1: Add imports and hook after recalcularScore**

Add imports:
```typescript
import { recalcularScoreRed } from '@/lib/referidos/score-red';
import { verificarAtrasosRed } from '@/lib/referidos/semaforo';
```

After the existing `recalcularScore({...}).catch(...)` call, add:

```typescript
    // ------------------------------------------------------------------
    // 9c. Recalcular score de red + verificar semáforo
    // ------------------------------------------------------------------
    recalcularScoreRed(typedParticipante.id).catch((err) => {
      console.warn('[pago] Error al recalcular score de red:', err);
    });

    verificarAtrasosRed(typedParticipante.id).catch((err) => {
      console.warn('[pago] Error al verificar atrasos de red:', err);
    });
```

> Nota: `recalcularScoreRed` necesita el `redId`, no el `participanteId`. Si la función acepta participanteId y busca la red internamente, mejor. Ajustar firma si es necesario o pasar directamente el redId si está disponible.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` — verify no new errors.

---

### Task 10: Validaciones Zod

**Files:**
- Create: `src/lib/validations/referidos.ts`
- Create: `src/lib/validations/notificaciones.ts`

- [ ] **Step 1: Write referidos.ts**

```typescript
import { z } from 'zod/v4';

export const CodigoReferidoSchema = z.object({
  codigo_referido: z.string().min(8).max(40).optional(),
});

export const NotificacionQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CodigoReferidoInput = z.infer<typeof CodigoReferidoSchema>;
export type NotificacionQueryInput = z.infer<typeof NotificacionQuerySchema>;
```

- [ ] **Step 2: Write notificaciones.ts**

```typescript
import { z } from 'zod/v4';

export const MarcarLeidaSchema = z.object({
  notificacion_id: z.string().uuid(),
});
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit src/lib/validations/referidos.ts src/lib/validations/notificaciones.ts`

---

### Task 11: API GET /api/referidos/mi-red

**Files:**
- Create: `src/app/api/referidos/mi-red/route.ts`
- Ensure directory structure: `src/app/api/referidos/mi-red/`

- [ ] **Step 1: Write the route handler**

```typescript
// =============================================================================
// GET /api/referidos/mi-red — Mi red de apoyo
// =============================================================================

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { scoreEfectivo } from '@/lib/score/calculator';

export async function GET(): Promise<Response> {
  try {
    const cookieStore = await cookies();
    const user = await getServerUser(cookieStore);

    if (!user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión' },
        { status: 401 },
      );
    }

    const supabase = getSupabaseClient();

    // 1. Obtener participante
    const { data: rawP } = await supabase
      .from('participantes')
      .select('id')
      .eq('user_id', user.id)
      .single();

    const participante = rawP as unknown as { id: string } | null;
    if (!participante) {
      return NextResponse.json(
        { error: 'PARTICIPANTE_NO_ENCONTRADO', detail: 'No tienes un perfil de participante' },
        { status: 404 },
      );
    }

    // 2. Obtener membresía
    const { data: rawMiembro } = await supabase
      .from('red_miembros')
      .select('red_id, es_referidora')
      .eq('participante_id', participante.id)
      .single();

    const miembro = rawMiembro as unknown as { red_id: string; es_referidora: boolean } | null;

    if (!miembro) {
      return NextResponse.json({ red: null, miembros: [] }, { status: 200 });
    }

    // 3. Obtener info de la red
    const { data: rawRed } = await supabase
      .from('redes_apoyo')
      .select('id, nombre, score_red, estado')
      .eq('id', miembro.red_id)
      .single();

    const red = rawRed as unknown as { id: string; nombre: string; score_red: number; estado: string } | null;
    if (!red) {
      return NextResponse.json({ error: 'RED_NO_ENCONTRADA', detail: 'La red ya no existe' }, { status: 404 });
    }

    // 4. Obtener miembros con scores
    const { data: rawMiembros } = await supabase
      .from('red_miembros')
      .select(`
        participante_id,
        es_referidora,
        participante:participantes!red_miembros_participante_id_fkey(
          nombre,
          score_reputacion,
          created_at
        )
      `)
      .eq('red_id', miembro.red_id);

    const miembros = rawMiembros as unknown as {
      participante_id: string;
      es_referidora: boolean;
      participante: { nombre: string; score_reputacion: number; created_at: string } | { nombre: string; score_reputacion: number; created_at: string }[];
    }[] | null;

    const miembrosConScore = (miembros ?? []).map((m) => {
      const rawPdata = m.participante;
      const pdata = Array.isArray(rawPdata) ? rawPdata[0] : rawPdata;
      return {
        id: m.participante_id,
        nombre: pdata?.nombre ?? '—',
        score_efectivo: pdata ? scoreEfectivo(pdata.score_reputacion, pdata.created_at) : 0,
        es_referidora: m.es_referidora,
      };
    });

    return NextResponse.json({
      red: {
        id: red.id,
        nombre: red.nombre,
        score_red: red.score_red,
        estado: red.estado,
      },
      miembros: miembrosConScore,
      total_miembros: miembrosConScore.length,
    }, { status: 200 });
  } catch (err) {
    console.error('[referidos/mi-red] Error:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit src/app/api/referidos/mi-red/route.ts`

---

### Task 12: APIs de notificaciones — GET + PATCH leer

**Files:**
- Create: `src/app/api/notificaciones/route.ts`
- Create: `src/app/api/notificaciones/[id]/leer/route.ts`

- [ ] **Step 1: Write GET /api/notificaciones**

```typescript
// =============================================================================
// GET /api/notificaciones — Listar notificaciones del usuario
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { NotificacionQuerySchema } from '@/lib/validations/notificaciones';
import { listarNotificaciones } from '@/lib/notificaciones/queries';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const validation = NotificacionQuerySchema.safeParse(queryParams);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'PARAMETROS_INVALIDOS', detail: validation.error.issues[0]?.message },
        { status: 400 },
      );
    }

    const { limit, offset } = validation.data;

    const cookieStore = await cookies();
    const user = await getServerUser(cookieStore);

    if (!user) {
      return NextResponse.json({ error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión' }, { status: 401 });
    }

    const supabase = getSupabaseClient();

    const { data: rawP } = await supabase
      .from('participantes')
      .select('id')
      .eq('user_id', user.id)
      .single();

    const participante = rawP as unknown as { id: string } | null;
    if (!participante) {
      return NextResponse.json({ error: 'PARTICIPANTE_NO_ENCONTRADO', detail: 'No tienes perfil' }, { status: 404 });
    }

    const result = await listarNotificaciones(participante.id, limit, offset);

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error('[notificaciones] Error:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Write PATCH /api/notificaciones/[id]/leer**

```typescript
// =============================================================================
// PATCH /api/notificaciones/[id]/leer — Marcar notificación como leída
// =============================================================================

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { marcarLeida } from '@/lib/notificaciones/queries';

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;

    const cookieStore = await cookies();
    const user = await getServerUser(cookieStore);

    if (!user) {
      return NextResponse.json({ error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión' }, { status: 401 });
    }

    const supabase = getSupabaseClient();

    const { data: rawP } = await supabase
      .from('participantes')
      .select('id')
      .eq('user_id', user.id)
      .single();

    const participante = rawP as unknown as { id: string } | null;
    if (!participante) {
      return NextResponse.json({ error: 'PARTICIPANTE_NO_ENCONTRADO' }, { status: 404 });
    }

    await marcarLeida(id, participante.id);

    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (err) {
    if (err instanceof Error && err.message === 'NOTIFICACION_NO_ENCONTRADA') {
      return NextResponse.json({ error: 'NOTIFICACION_NO_ENCONTRADA', detail: 'La notificación no existe o no te pertenece' }, { status: 404 });
    }
    console.error('[notificaciones/leer] Error:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit src/app/api/notificaciones/route.ts src/app/api/notificaciones/\[id\]/leer/route.ts`

---

### Task 13: API admin procesar-emails

**Files:**
- Create: `src/app/api/admin/procesar-emails/route.ts`

- [ ] **Step 1: Write the route handler**

```typescript
// =============================================================================
// POST /api/admin/procesar-emails — Procesar cola de emails (admin)
// =============================================================================

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { procesarCola } from '@/lib/email/sender';

export async function POST(): Promise<Response> {
  try {
    const cookieStore = await cookies();
    const user = await getServerUser(cookieStore);

    if (!user) {
      return NextResponse.json({ error: 'NO_AUTENTICADO' }, { status: 401 });
    }

    const supabase = getSupabaseClient();

    const { data: rawP } = await supabase
      .from('participantes')
      .select('rol')
      .eq('user_id', user.id)
      .single();

    const participante = rawP as unknown as { rol: string } | null;

    if (!participante || participante.rol !== 'admin') {
      return NextResponse.json({ error: 'NO_AUTORIZADO' }, { status: 403 });
    }

    const result = await procesarCola();

    return NextResponse.json({ status: 'ok', ...result }, { status: 200 });
  } catch (err) {
    console.error('[admin/procesar-emails] Error:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit src/app/api/admin/procesar-emails/route.ts`

---

### Task 14: Sidebar badge de notificaciones

**Files:**
- Find and modify the sidebar/layout component

- [ ] **Step 1: Find the sidebar/layout**

Look for the main layout or sidebar component (likely `src/app/layout.tsx`, `src/components/sidebar.tsx`, etc.)

- [ ] **Step 2: Add notification badge**

Add a useEffect that fetches unread notification count and a link to `/notificaciones`:

```typescript
// Inside the sidebar component:
const [notifCount, setNotifCount] = useState(0);

useEffect(() => {
  fetch('/api/notificaciones?limit=1')
    .then(res => res.json())
    .then(data => {
      // Use total from response to show badge count
      if (data.total > 0) setNotifCount(data.total);
    })
    .catch(() => {});
}, []);
```

Render a bell icon with badge next to a "Notificaciones" link.

- [ ] **Step 3: Verify it renders**

Manual check — build or dev server.

---

### Task 15: Página de notificaciones / componentes

**Files:**
- Create: `src/app/notificaciones/page.tsx`
- Create: `src/components/notificaciones/NotificacionItem.tsx`

- [ ] **Step 1: Write NotificacionItem.tsx**

```tsx
'use client';

interface NotificacionItemProps {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  leida: boolean;
  created_at: string;
  onMarcarLeida: (id: string) => void;
}

export default function NotificacionItem({
  id, tipo, titulo, cuerpo, leida, created_at, onMarcarLeida,
}: NotificacionItemProps) {
  const fecha = new Date(created_at).toLocaleDateString('es-CO', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className={`p-4 border-b border-gray-100 dark:border-gray-700 ${!leida ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className={`text-sm ${!leida ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
            {titulo}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{cuerpo}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{fecha}</p>
        </div>
        {!leida && (
          <button
            onClick={() => onMarcarLeida(id)}
            className="ml-3 text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0"
          >
            Marcar leída
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write notificaciones/page.tsx**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import NotificacionItem from '@/components/notificaciones/NotificacionItem';

interface Notificacion {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  leida: boolean;
  created_at: string;
}

export default function NotificacionesPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const fetchNotificaciones = useCallback(async (newOffset: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/notificaciones?limit=${limit}&offset=${newOffset}`);
      if (!res.ok) throw new Error('Error al cargar');
      const data = await res.json();
      setNotificaciones(data.notificaciones ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
      return;
    }
    if (!authLoading) {
      fetchNotificaciones(0);
    }
  }, [authLoading, isAuthenticated, router, fetchNotificaciones]);

  const handleMarcarLeida = async (id: string) => {
    try {
      const res = await fetch(`/api/notificaciones/${id}/leer`, { method: 'PATCH' });
      if (res.ok) {
        setNotificaciones(prev => prev.map(n => n.id === id ? { ...n, leida: true } : n));
      }
    } catch (err) {
      console.error('Error al marcar leída:', err);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" aria-busy="true">
        <span className="text-gray-500">Cargando…</span>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Notificaciones</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{total} notificaciones</p>

      {loading ? (
        <p className="text-gray-400">Cargando notificaciones…</p>
      ) : notificaciones.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 dark:text-gray-500">No tienes notificaciones</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {notificaciones.map(n => (
            <NotificacionItem
              key={n.id}
              {...n}
              onMarcarLeida={handleMarcarLeida}
            />
          ))}
        </div>
      )}

      {/* Paginación simple */}
      {total > limit && (
        <div className="flex justify-center gap-4 mt-6">
          <button
            onClick={() => { setOffset(o => Math.max(0, o - limit)); fetchNotificaciones(Math.max(0, offset - limit)); }}
            disabled={offset === 0}
            className="text-sm text-blue-600 disabled:text-gray-400"
          >
            ← Anterior
          </button>
          <button
            onClick={() => { setOffset(o => o + limit); fetchNotificaciones(offset + limit); }}
            disabled={offset + limit >= total}
            className="text-sm text-blue-600 disabled:text-gray-400"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck` — verify no new errors.

---

### Task 16: Widget de red en perfil — RedCard.tsx

**Files:**
- Create: `src/components/redes/RedCard.tsx`
- Modify: `src/app/perfil/page.tsx`

- [ ] **Step 1: Write RedCard.tsx**

```tsx
'use client';

import { useState, useEffect } from 'react';

interface MiembroRed {
  id: string;
  nombre: string;
  score_efectivo: number;
  es_referidora: boolean;
}

interface RedInfo {
  id: string;
  nombre: string;
  score_red: number;
  estado: string;
}

export default function RedCard() {
  const [red, setRed] = useState<RedInfo | null>(null);
  const [miembros, setMiembros] = useState<MiembroRed[]>([]);
  const [loading, setLoading] = useState(true);
  const [codigo, setCodigo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch('/api/referidos/mi-red').then(r => r.json()),
      fetch('/api/participantes/me').then(r => r.json()),
    ]).then(([redData, perfilData]) => {
      if (cancelled) return;
      setRed(redData.red ?? null);
      setMiembros(redData.miembros ?? []);
      setCodigo(perfilData.participante?.codigo_referido ?? null);
    }).catch(() => {
      // No hacer nada — simplemente no mostrar la red
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  if (loading) return null;
  if (!red) return null;

  const estadoColor = red.estado === 'verde' ? 'text-green-600 bg-green-100'
    : red.estado === 'amarillo' ? 'text-yellow-600 bg-yellow-100'
    : 'text-red-600 bg-red-100';

  const estadoLabel = red.estado === 'verde' ? '🟢 Al día'
    : red.estado === 'amarillo' ? '🟡 Alerta de apoyo'
    : '🔴 Restringido';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Mi Red de Apoyo</h2>
      </div>
      <div className="px-6 py-4 space-y-4">
        {/* Info de la red */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{red.nombre}</p>
            <p className="text-xs text-gray-400">Score de red: <span className="font-semibold">{red.score_red}/100</span></p>
          </div>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${estadoColor}`}>
            {estadoLabel}
          </span>
        </div>

        {/* Código de referido */}
        {codigo && (
          <div className="bg-gray-50 dark:bg-gray-900 rounded-md p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Tu código de referido</p>
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-600">
                {codigo}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(codigo)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Copiar
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Compartí este código con otras emprendedoras para que se unan a tu red.
            </p>
          </div>
        )}

        {/* Miembros */}
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Miembros ({miembros.length})
          </p>
          <ul className="space-y-2">
            {miembros.map(m => (
              <li key={m.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700 dark:text-gray-300">
                  {m.nombre}
                  {m.es_referidora && (
                    <span className="ml-1 text-xs text-blue-500">(Referidora)</span>
                  )}
                </span>
                <span className="text-gray-500">{m.score_efectivo}/100</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Integrar RedCard en perfil page**

In `src/app/perfil/page.tsx`, import and add the component inside the main container (`.space-y-6`), after the profile info card, before the wallet card:

```typescript
import RedCard from '@/components/redes/RedCard';
```

And in the JSX, add after the profile info card `</dl>` closing:
```tsx
        {/* ── Red de Apoyo ── */}
        <RedCard />
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck` — verify no new errors.

---

### Task 17: Verificación final

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: Only pre-existing errors in `fix-desembolso/route.ts`.

- [ ] **Step 2: Lint on new/modified files**

Run: `npx eslint src/lib/referidos/ src/lib/notificaciones/ src/lib/email/ src/app/api/referidos/ src/app/api/notificaciones/ src/app/api/admin/procesar-emails/ src/app/notificaciones/ src/components/notificaciones/ src/components/redes/ src/app/api/participantes/route.ts src/app/api/pago/route.ts src/app/perfil/page.tsx`
Expected: No new errors (pre-existing warning for `Wei` in desembolso is OK).

- [ ] **Step 3: Summary**

Report total files created/modified and confirm all tasks complete.
