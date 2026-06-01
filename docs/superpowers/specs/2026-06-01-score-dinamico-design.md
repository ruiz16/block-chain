# Score Dinámico de Reputación — Design Doc

**Change:** `02-score-dinamico-vc` (iteración 1: scoring interno)
**Basado en:** Pilar B del documento MANGLE

---

## Algoritmo de Scoring

**Fórmula:**

```
score_efectivo = CLAMP(eventos.reputacion + antiguedad, 0, 100)
```

Donde:
- `eventos.reputacion` = `participantes.score_reputacion` (solo eventos de pago/default)
- `antiguedad` = MIN(months_since(created_at), 10) (calculado on-read)

### Deltas por evento

| Evento | Delta | Condición |
|--------|-------|-----------|
| Pago puntual | +2 | Cuota pagada antes de la fecha de vencimiento |
| Default (morosidad >7d) | -15 | Crédito marcado como default |
| Pago atrasado regularizado | -1 | Cuota pagada después del vencimiento (dentro de 7 días) |

### Reglas

- Score nunca menor a 0 ni mayor a 100
- Default tiene cooldown de 7 días (no se aplica múltiples veces por el mismo período de morosidad)
- Antigüedad máxima acumulable: +10 (10 meses activo = +10, después no suma más)
- La antigüedad se calcula on-read, no se persiste como evento

---

## Arquitectura

### Datos

**Tabla nueva:** `eventos_score`
- `id` uuid PK
- `participante_id` uuid FK → participantes
- `tipo_evento` text CHECK (pago_puntual, pago_atrasado, default, recalculo_manual)
- `delta` integer (puede ser positivo o negativo)
- `score_anterior` integer
- `score_nuevo` integer
- `referencia_tipo` text nullable (cuota, credito)
- `referencia_id` uuid nullable
- `created_at` timestamptz

**Columna existente:** `participantes.score_reputacion` — almacena el componente de eventos. No se toca su estructura, solo se actualiza su valor.

**Migración:** `supabase/migrations/011_score_dinamico.sql`

### Servicio

**Archivo nuevo:** `src/lib/score/calculator.ts`

```typescript
// API pública
type TipoEventoScore = 'pago_puntual' | 'pago_atrasado' | 'default';

interface RecalcularParams {
  participanteId: string;
  tipo: TipoEventoScore;
  referenciaTipo?: 'credito' | 'cuota';
  referenciaId?: string;
}

async function recalcularScore(params: RecalcularParams): Promise<number>
async function recalcularTodosLosScores(): Promise<{ procesados: number }>
```

### Score Efectivo (on-read)

Cualquier lugar que lea el score para tomar decisiones debe usar esta función:

```typescript
function scoreEfectivo(participante: { score_reputacion: number; created_at: string }): number {
  const meses = diffMeses(new Date(participante.created_at), new Date());
  return clamp(participante.score_reputacion + Math.min(meses, 10), 0, 100);
}
```

---

## API Routes

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/api/participantes/score/historial` | Sesión | Últimos 20 eventos de score del usuario |
| POST | `/api/admin/recalcular-score` | Admin | Recalcula score de un participante o todos |

### GET /api/participantes/score/historial

Query params: `?limit=20&offset=0`

Response:
```json
{
  "eventos": [
    {
      "tipo": "pago_puntual",
      "delta": 2,
      "score_anterior": 65,
      "score_nuevo": 67,
      "referencia": { "tipo": "cuota", "id": "uuid" },
      "fecha": "2026-06-01T..."
    }
  ],
  "score_efectivo": 67,
  "score_eventos": 65,
  "antiguedad_meses": 2
}
```

### POST /api/admin/recalcular-score

Body: `{ "participante_id"?: string }` — si no se pasa, recalcula todos.

Proceso:
1. Obtiene participantes activos (o uno específico)
2. Calcula meses desde `created_at`
3. Si hay meses adicionales no aplicados (vs. último recalculo_manual), suma diferencia
4. Inserta evento `recalculo_manual` si hubo cambio
5. Actualiza `score_reputacion`

---

## Integración con rutas existentes

| Ruta | Cambio |
|------|--------|
| `POST /api/pagos` → pago exitoso | Llamar `recalcularScore()` con tipo `pago_puntual` o `pago_atrasado` |
| `POST /api/admin/marcar-default` | Llamar `recalcularScore()` con tipo `default` |
| `GET /api/desembolso` (check score >80) | Usar `scoreEfectivo()` en vez de `score_reputacion` directo |
| `GET /api/mi-grupo`, perfil, admin | Usar `scoreEfectivo()` donde se muestre el score |

---

## UI

- Página nueva o tab en perfil: `/perfil/score` o tab "Score" en `/perfil`
- Muestra score efectivo, desglose (eventos + antigüedad), y lista cronológica de eventos
- Se definirá en detalle en la etapa de implementación de UI

---

## Testing

- `src/lib/score/calculator.test.ts`
  - Test por cada tipo de evento
  - Test clamping (score 0 + pago, score 98 + pago)
  - Test cooldown de default
  - Test antigüedad on-read
  - Test recalcularTodos

---

## Edge Cases

- **Score en 0 + pago puntual**: 0 + 2 = 2 ✅
- **Score en 98 + pago puntual**: 98 + 2 = 100 (clamp) ✅
- **Default múltiple en misma semana**: cooldown 7d, solo aplica 1 vez ✅
- **Participante sin eventos**: score_efectivo = 50 (default) + antigüedad ✅
- **Antigüedad > 10 meses**: capped a +10 ✅
