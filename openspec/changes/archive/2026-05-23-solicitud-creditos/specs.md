# Delta Spec: Solicitud de Créditos

## Purpose

Borrower credit request submission, loan term columns (`interes_porcentaje`, `plazo_dias`, `fecha_vencimiento`), and admin approval flow. Adds POST/PATCH/GET endpoints and updates the approval UI to a two-step flow.

---

## ADDED Requirements

### 1. Migration 006 — Loan Terms Columns

The `creditos` table SHALL include the following columns:

| Column | Type | Default | Constraint | Notes |
|--------|------|---------|------------|-------|
| `interes_porcentaje` | NUMERIC(5,2) | 0 | NOT NULL | Annual interest rate |
| `plazo_dias` | INTEGER | 30 | NOT NULL | Loan term in days |
| `fecha_vencimiento` | TIMESTAMPTZ | NULL | — | Maturity date, set at approval |

- Existing rows default to `interes_porcentaje = 0` and `plazo_dias = 30`
- `fecha_vencimiento` remains NULL until a credit is approved

### 2. POST /api/creditos — Submit Credit Request

The system MUST accept a borrower credit request and create a credit in `pendiente` state.

**Input**: `{ monto: number, descripcion?: string, plazo_dias: number }`
**Auth**: Session required; participante row MUST exist
**Validation**: `monto > 0`, `30 ≤ plazo_dias ≤ 365`
**Result**: `estado='pendiente'`, `prestatario_id` from session participante
**Returns**: `201` with created credito data

| Scenario | Condition | Expected |
|----------|-----------|----------|
| Successful request | Valid body, authenticated prestatario | 201, estado="pendiente" |
| Invalid monto | monto ≤ 0 | 400 |
| Invalid plazo | plazo_dias < 30 or > 365 | 400 |
| No session | Missing/invalid cookie | 401 |
| No participante | Auth user has no participante row | 404 |

### 3. PATCH /api/creditos/[id]/aprobar — Admin Approval

The system MUST allow an admin to approve a credit, transitioning `pendiente` or `avalado` → `aprobado` and setting `fecha_vencimiento`.

**Auth**: Admin only (`requireAdmin`)
**Valid transitions**: `pendiente` → `aprobado`, `avalado` → `aprobado`
**Side effect**: `fecha_vencimiento = NOW() + plazo_dias` (Postgres interval)
**Returns**: `200` on success

| Scenario | Condition | Expected |
|----------|-----------|----------|
| Success from avalado | estado="avalado" | 200, estado="aprobado" |
| Success from pendiente | estado="pendiente" | 200, estado="aprobado" |
| Not found | Invalid id | 404 |
| Wrong state | estado="desembolsado" | 409 Conflict |
| No session | Missing cookie | 401 |
| Not admin | Non-admin user | 403 |

### 4. GET /api/creditos — List My Credits

The system MUST return all credits for the authenticated user, ordered by `fecha_solicitud` DESC.

**Auth**: Session required
**Returns**: `200` with array (empty if no participante row or no credits)

| Scenario | Condition | Expected |
|----------|-----------|----------|
| Has credits | Authenticated prestatario with credits | 200, ordered DESC |
| No credits | Authenticated user without credits | 200, empty array |
| No participante | Auth user without participante row | 200, empty array |

### 5. SolicitarCredito.tsx — Credit Request UI

The component SHALL render 4 states: `idle` (empty form, plazo presets 30/60/90/180/365), `submitting` (disabled controls + spinner), `success` (confirmation + link to `/mis-creditos`), `error` (message + retry button).

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Idle render | Borrower navigates to /solicitar | — | Empty form with plazo dropdown visible |
| Happy path | Form filled | Submit | 201, success confirmation shown |
| Error | Form submitted | API returns 4xx/5xx | Error message with retry |
| Submitting | Form submitted | Request in flight | All inputs disabled, spinner shown |

---

## MODIFIED Requirements

### 6. approval-ui : Two-Step Approval Flow

The component MUST show a state-based action per credit row. For `pendiente`/`avalado` credits: "Aprobar" button that calls `PATCH /api/creditos/{id}/aprobar`. For `aprobado` credits: "Desembolsar" button that calls `POST /api/desembolso`. Per-row action state isolation — one row's loading/error state MUST NOT affect other rows.

(Previously: Single "Aprobar" button unconditionally calling POST /api/desembolso)

| Scenario | Given | Action | Result |
|----------|-------|--------|--------|
| Approve | Credit in pendiente/avalado | Click "Aprobar" | estado→aprobado, button changes to "Desembolsar" |
| Disburse | Credit in aprobado | Click "Desembolsar" | POST /api/desembolso, removed from list on success |
| Approve failure | Credit row being approved | API error | Row shows error inline, other rows still interactive |
| Disburse failure | Credit row being disbursed | API error | Row shows error inline, other rows still interactive |

### 7. credit-lifecycle : Approval Prerequisites

A credit SHALL be approvable from either `pendiente` or `avalado` state. The `pendiente→avalado` transition remains triggered by aval assignment via `POST /api/avales`, but is NOT a hard prerequisite for approval.

(Previously: Credit MUST be in `avalado` state before transitioning to `aprobado`; approval from `pendiente` rejected with `SIN_AVALES`)

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Approve from pendiente | Credit in "pendiente", zero avales | Admin approves | estado→aprobado, fecha_vencimiento set |
| Approve from avalado | Credit in "avalado" | Admin approves | estado→aprobado, fecha_vencimiento set |

---

## Scenarios

```
Scenario: Solicitar crédito exitoso
  Given un prestatario autenticado
  When solicita un crédito de 100 cUSD a 90 días
  Then se crea el crédito en estado "pendiente"
  And se retorna 201 con los datos

Scenario: Aprobación admin exitosa
  Given un crédito en estado "avalado"
  When un admin aprueba el crédito
  Then el estado cambia a "aprobado"
  And fecha_vencimiento se calcula

Scenario: Aprobación desde estado incorrecto
  Given un crédito en estado "desembolsado"
  When se intenta aprobar
  Then retorna 409 Conflict
```
