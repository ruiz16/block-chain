# micro-lending-plataforma — Full Specification

## 1. Database Schema

### 1.1 `participantes`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `created_at` | `timestamptz` | NOT NULL, default `now()` |
| `wallet_address` | `text` | NOT NULL, UNIQUE |
| `nombre` | `text` | NOT NULL |
| `rol` | `rol_participante` | NOT NULL — enum: `prestamista`, `prestatario`, `aval` |
| `score_reputacion` | `integer` | NOT NULL, default 50, CHECK(0–100) |
| `activo` | `boolean` | NOT NULL, default `true` |

**Indexes**: UNIQUE on `wallet_address`, index on `rol`.

**RLS**: `SELECT` for authenticated users; `INSERT`/`UPDATE` own row only (using `wallet_address` from JWT).

### 1.2 `avales`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `aval_id` | `uuid` | FK → `participantes.id`, NOT NULL |
| `prestatario_id` | `uuid` | FK → `participantes.id`, NOT NULL |
| `credito_id` | `uuid` | FK → `creditos.id`, NOT NULL |
| `monto_maximo` | `numeric` | NOT NULL, CHECK(> 0) |
| `fecha_creacion` | `timestamptz` | NOT NULL, default `now()` |
| `activo` | `boolean` | NOT NULL, default `true` |

**Unique**: `(prestatario_id, credito_id)` — one guarantor per credit per person.

**RLS**: Aval sees own rows; prestamista sees rows for credits they fund.

### 1.3 `creditos`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `prestatario_id` | `uuid` | FK → `participantes.id`, NOT NULL |
| `monto` | `numeric` | NOT NULL, CHECK(> 0) |
| `descripcion` | `text` | |
| `estado` | `estado_credito` | NOT NULL — enum |
| `tx_hash` | `text` | nullable, UNIQUE |
| `fecha_solicitud` | `timestamptz` | NOT NULL, default `now()` |
| `fecha_actualizacion` | `timestamptz` | NOT NULL, default `now()` |

**Status workflow**: `pendiente` → `avalado` → `aprobado` → `desembolsado` → `pagado` | `default`

**Indexes**: index on `estado`, index on `prestatario_id`.

**RLS**: Prestatario owns credit; prestamista sees assigned; aval sees linked.

### 1.4 `audit_log`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `bigint` | PK, identity |
| `accion` | `text` | NOT NULL |
| `entidad_tipo` | `text` | NOT NULL |
| `entidad_id` | `uuid` | NOT NULL |
| `participante_id` | `uuid` | FK → `participantes.id`, nullable |
| `detalles` | `jsonb` | NOT NULL, default `'{}'` |
| `fecha` | `timestamptz` | NOT NULL, default `now()` |

**Acciones**: `credito_creado`, `aval_agregado`, `credito_aprobado`, `desembolso`, `desembolso_fallo`, `pago_recibido`, `default_registrado`.

**RLS**: INSERT only via `service_role`; SELECT for authenticated users.

---

## 2. API Routes

### 2.1 `POST /api/desembolso`

**Request**:
```json
{
  "credito_id": "uuid"
}
```

**Validation**:
- `credito_id` MUST be a valid UUID
- The credit MUST exist and be in state `aprobado`
- The requesting participant MUST have `score_reputacion > 80`
- The credit MUST NOT already have a `tx_hash`

**Success Response (201)**:
```json
{
  "status": "desembolsado",
  "tx_hash": "0x..."
}
```

**Error Codes**:
| Status | Body `error` | When |
|--------|-------------|------|
| 400 | `CREDIDO_ID_INVALIDO` | Malformed UUID or missing field |
| 403 | `SCORE_INSUFICIENTE` | Reputation score ≤ 80 |
| 404 | `CREDITO_NO_ENCONTRADO` | Credit does not exist |
| 409 | `ESTADO_INCORRECTO` | Credit not in `aprobado` state |
| 409 | `YA_DESEMBOLSADO` | Credit already has a `tx_hash` |
| 500 | `ERROR_INTERNO` | RPC failure, DB error, or unexpected exception |

---

## 3. UI Components

### 3.1 `PanelAprobacion`

**States**:

| State | Render Behavior |
|-------|----------------|
| `loading` | Skeleton spinner, "Cargando créditos pendientes…" |
| `empty` | Empty state illustration + "No hay créditos pendientes de aprobación" |
| `list` | Table of pending credits: monto, prestatario, score_reputacion, fecha_solicitud, [Approve] + [Reject] buttons |
| `approving` | Button shows spinner + "Aprobando…", all buttons disabled |
| `success` | Toast/banner with green check + CeloScan link, auto-dismiss 5s |
| `error` | Toast/banner with red alert + error detail, [Reintentar] button |

### 3.2 `CeloScanLink`

- **URL pattern**: `https://alfajores.celoscan.io/tx/{tx_hash}`
- Renders as `<a href="..." target="_blank" rel="noopener noreferrer">`
- MUST include `aria-label="Ver transacción en CeloScan"`

### 3.3 Accessibility

- All interactive elements MUST be keyboard-navigable
- Buttons MUST have `aria-label` where icon-only
- Table MUST have `<caption>` or `aria-label`
- Error/success banners MUST have `role="alert"`
- Loading state MUST use `aria-busy="true"`

---

## 4. Security

| Rule | Specification |
|------|---------------|
| Key isolation | `CELO_PRIVATE_KEY` MUST be server-only — NEVER in client bundle, logs, or API responses |
| Input validation | All UUIDs MUST validate with a regex before DB queries |
| RLS | Every table query MUST go through Supabase client with `service_role` key (server) or authenticated user JWT (client) |
| Score check | `score_reputacion > 80` MUST be checked WITHIN the same database transaction as the disbursement |
| Audit completeness | Every state transition on `creditos` MUST produce an `audit_log` row |

---

## 5. Scenarios

### Scenario 1: Desembolso exitoso
- GIVEN un crédito en estado `aprobado`
- AND el participante tiene `score_reputacion = 85`
- WHEN se ejecuta `POST /api/desembolso` con `credito_id` válido
- THEN la transacción cUSD se envía a Celo Alfajores vía viem
- AND el crédito pasa a estado `desembolsado`
- AND se registra `audit_log` con acción `desembolso`
- AND la respuesta `201` contiene `tx_hash`

### Scenario 2: Score reputacional insuficiente
- GIVEN un crédito en estado `aprobado`
- AND el participante tiene `score_reputacion = 70`
- WHEN se ejecuta `POST /api/desembolso`
- THEN la API retorna `403` con `error: SCORE_INSUFICIENTE`
- AND el crédito permanece en estado `aprobado`
- AND NO se envía transacción a la blockchain

### Scenario 3: Crédito en estado incorrecto
- GIVEN un crédito en estado `pendiente`
- WHEN se ejecuta `POST /api/desembolso`
- THEN la API retorna `409` con `error: ESTADO_INCORRECTO`
- AND el estado del crédito NO cambia

### Scenario 4: Crédito inexistente
- GIVEN un `credito_id` UUID que NO existe en la tabla `creditos`
- WHEN se ejecuta `POST /api/desembolso`
- THEN la API retorna `404` con `error: CREDITO_NO_ENCONTRADO`

### Scenario 5: Falla de RPC de Celo
- GIVEN un crédito en estado `aprobado` con score válido
- WHEN el RPC de Alfajores no responde (timeout)
- THEN la API retorna `500` con `error: ERROR_INTERNO`
- AND se registra `audit_log` con acción `desembolso_fallo`
- AND el crédito permanece en estado `aprobado`
