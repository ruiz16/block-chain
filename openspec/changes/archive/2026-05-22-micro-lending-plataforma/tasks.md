# Tasks: micro-lending-plataforma

> Greenfield project — empty directory, no existing code.
> All tasks are new file creation unless noted.

---

## Phase 1: Infrastructure — Project Scaffold

### 1.1 Initialize Next.js 15 + TypeScript + Tailwind

**Description**: Scaffold a Next.js 15 project with App Router, TypeScript strict mode, and Tailwind CSS. This provides the base project structure, build configuration, and CSS framework.

**Files to create/modify**:
- `package.json` — Create via `npx create-next-app@latest` or manual scaffolding
- `tsconfig.json` — Enable `strict: true`, `noUncheckedIndexedAccess: true`
- `next.config.ts` — Basic config (empty for now, ready for env vars)
- `tailwind.config.ts` — Default config (can be extended later)
- `postcss.config.mjs` — Default PostCSS with Tailwind
- `src/app/layout.tsx` — Root layout with html/lang, basic metadata
- `src/app/globals.css` — Tailwind directives (@tailwind base/components/utilities)

**Dependencies**: None (foundational)

**Acceptance criteria**:
- [x] `npm run dev` starts the dev server without errors
- [x] `npm run build` completes successfully
- [x] TypeScript strict mode is enabled in `tsconfig.json`
- [x] Tailwind classes render correctly in the browser
- [x] `src/app/layout.tsx` includes `<html lang="es">` (platform is Spanish-speaking)

---

### 1.2 Install Core Dependencies

**Description**: Install all runtime and dev dependencies required by the platform.

**Files to modify**:
- `package.json` — Add dependencies

**Dependencies**: 1.1 (needs package.json)

**Acceptance criteria**:
- [x] `viem` added (blockchain interaction — cUSD transfer via Celo Alfajores)
- [x] `@supabase/supabase-js` added (PostgreSQL client with service role)
- [x] `zod` added (input validation for API routes)
- [x] `@radix-ui/react-dialog` added (for PanelAprobacion modals if needed)
- [x] `@radix-ui/react-toast` added (for success/error toast notifications)
- [x] `clsx` added (utility for conditional class names)
- [x] `@types/node` in devDependencies
- [x] `eslint-config-next` in devDependencies
- [x] `npm install` completes without peer dependency warnings

---

### 1.3 Create Environment Template

**Description**: Create `.env.local.example` with all required environment variables and their descriptions.

**Files to create**:
- `.env.local.example` — Template with placeholder values

**Dependencies**: None (can run in parallel with 1.1)

**Acceptance criteria**:
- [x] File contains `CELO_RPC_URL` with default Alfajores Forno URL
- [x] File contains `CELO_PRIVATE_KEY` with placeholder (never committed with real value)
- [x] File contains `NEXT_PUBLIC_SUPABASE_URL` with placeholder
- [x] File contains `SUPABASE_SERVICE_KEY` with placeholder (server-only)
- [x] File contains `NEXT_PUBLIC_CELOSCAN_BASE_URL` defaulting to `https://alfajores.celoscan.io`
- [x] File contains `CELO_CUSD_CONTRACT` with Alfajores cUSD address `0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1`
- [x] All variables have descriptive comments in Spanish
- [x] `.env.local.example` is the only env file committed — `.env.local` is in `.gitignore`

---

### 1.4 Configure Code Quality Tooling

**Description**: Set up ESLint, Prettier, and `.gitignore` for the project.

**Files to create/modify**:
- `.eslintrc.json` — Extend `next/core-web-vitals`, add rules for TypeScript strict
- `.prettierrc` — Standard config (single quotes, trailing commas, printWidth 100)
- `.gitignore` — Ensure `.env.local`, `node_modules`, `.next` are ignored

**Dependencies**: 1.1 (needs project structure)

**Acceptance criteria**:
- [x] ESLint runs without errors on scaffolded files
- [x] Prettier formats `.ts` and `.tsx` files correctly
- [x] `.gitignore` excludes all sensitive and build artifacts
- [x] `lint` script in `package.json` works

---

## Phase 2: Database — Schema & Supabase Client

### 2.1 Create Supabase Migration SQL

**Description**: Write the full database migration including custom enums, all four tables, foreign keys, check constraints, indexes, and Row-Level Security policies.

**Files to create**:
- `supabase/migrations/001_schema.sql` — Complete migration

**SQL content**:
- **Enums**: `rol_participante` (`prestamista`, `prestatario`, `aval`), `estado_credito` (`pendiente`, `avalado`, `aprobado`, `desembolsado`, `pagado`, `default`)
- **Table `participantes`**: id (uuid PK), created_at, wallet_address (text UNIQUE NOT NULL), nombre (text NOT NULL), rol (enum NOT NULL), score_reputacion (integer DEFAULT 50, CHECK 0-100), activo (boolean DEFAULT true)
- **Table `creditos`**: id (uuid PK), prestatario_id (uuid FK→participantes), monto (numeric, CHECK > 0), descripcion (text), estado (enum NOT NULL), tx_hash (text UNIQUE nullable), fecha_solicitud, fecha_actualizacion
- **Table `avales`**: id (uuid PK), aval_id (FK→participantes), prestatario_id (FK→participantes), credito_id (FK→creditos), monto_maximo (numeric CHECK > 0), fecha_creacion, activo; UNIQUE (prestatario_id, credito_id)
- **Table `audit_log`**: id (bigint PK identity), accion (text NOT NULL), entidad_tipo (text NOT NULL), entidad_id (uuid NOT NULL), participante_id (uuid FK→participantes nullable), detalles (jsonb DEFAULT '{}'), fecha
- **Indexes**: UNIQUE on participantes.wallet_address, index on participantes.rol, index on creditos.estado, index on creditos.prestatario_id
- **RLS**: Enable RLS on all tables. `participantes`: SELECT for authenticated, INSERT/UPDATE own row. `creditos`: SELECT for own or assigned, UPDATE for status transitions. `avales`: SELECT for own or related. `audit_log`: INSERT only via service_role, SELECT for authenticated.
- **Audit trigger**: Optionally, a trigger function that auto-inserts into `audit_log` on `creditos.estado` changes

**Dependencies**: None (SQL is standalone; can be authored before Next.js setup)

**Acceptance criteria**:
- [x] All four tables are created with correct columns and constraints
- [x] Both custom enums are created (`rol_participante`, `estado_credito`)
- [x] Foreign keys are defined with proper REFERENCES
- [x] CHECK constraint on `score_reputacion` (0-100) is present
- [x] CHECK constraint on `creditos.monto` (> 0) is present
- [x] CHECK constraint on `avales.monto_maximo` (> 0) is present
- [x] UNIQUE constraint on `participantes.wallet_address`
- [x] UNIQUE constraint on `creditos.tx_hash` (nullable)
- [x] UNIQUE constraint on `avales(prestatario_id, credito_id)`
- [x] Index on `participantes.rol`
- [x] Index on `creditos.estado`
- [x] Index on `creditos.prestatario_id`
- [x] RLS is enabled on all four tables
- [x] RLS policies match spec: SELECT for authenticated, UPDATE own row for participantes
- [x] `audit_log` has no UPDATE/DELETE policies (append-only)
- [x] Migration can be applied via `supabase migration up`

---

### 2.2 Create TypeScript Types (Branded + DB Row Types)

**Description**: Define branded types for blockchain primitives (`Wei`, `Address`, `TxHash`) and Supabase row-level TypeScript types matching the database schema.

**Files to create**:
- `src/types/database.ts` — Branded types + DB row interfaces

**Type content**:
- `Brand<K, T>` generic utility type
- `Wei = Brand<bigint, "Wei">` — cUSD amount in smallest unit
- `Address = Brand<\`0x${string}\`, "Address">` — Celo wallet address
- `TxHash = Brand<\`0x${string}\`, "TxHash">` — Transaction hash
- `RolParticipante` union type: `'prestamista' | 'prestatario' | 'aval'`
- `EstadoCredito` union type: `'pendiente' | 'avalado' | 'aprobado' | 'desembolsado' | 'pagado' | 'default'`
- `ParticipanteRow` interface
- `CreditoRow` interface
- `AvalRow` interface
- `AuditLogRow` interface
- `CreditoPendiente` interface (for UI — `id`, `monto`, `solicitante`, `score`, `fecha`)
- `ApiResponse<T>` generic for API responses

**Dependencies**: 2.1 (types must match DB schema)

**Acceptance criteria**:
- [x] Branded types prevent mixing Address/TxHash/Wei at compile time
- [x] All DB columns from migration are represented
- [x] Foreign key relationships are typed (e.g., `credito.prestatario_id` references `ParticipanteRow['id']`)
- [x] `CreditoPendiente` matches `PanelAprobacion` props interface from design
- [x] TypeScript compiles without errors on this file

---

### 2.3 Create Supabase Server Client (Service Role)

**Description**: Create a singleton Supabase client using the service role key for backend-to-backend operations. This client bypasses RLS and is used exclusively in the API route handler.

**Files to create**:
- `src/lib/supabase/client.ts` — Singleton Supabase client

**Implementation details**:
- Read `SUPABASE_SERVICE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` from `process.env`
- Create a singleton pattern (module-level cache)
- Use `createClient()` with `service_role` key
- Include type assertion using the row types from 2.2
- Add `db` type helper for convenience: `supabase.from('creditos').select('*')` returns typed rows

**Dependencies**: 2.2 (needs row types), 1.3 (needs env var names)

**Acceptance criteria**:
- [x] Client is exported as a singleton (same instance on repeated imports)
- [x] Uses service role key (server-only, never exposed to client)
- [x] Throws descriptive error if env vars are missing at runtime
- [x] Type-safe queries using generated types
- [x] No RLS bypass concerns — this is intentional for server-side ops (documented in comment)

---

## Phase 3: Blockchain Layer — Celo Integration

### 3.1 Create Celo Network Configuration

**Description**: Define the Celo Alfajores network configuration constants: chain ID, RPC URL, cUSD contract address, and CeloScan URL builder.

**Files to create**:
- `src/config/celo.ts` — Network constants and URL helpers

**Implementation details**:
- `CELO_CHAIN_ID = 44787` (Alfajores testnet)
- `CELO_RPC_URL` from env (default `https://alfajores-forno.celo-testnet.org`)
- `CUSD_CONTRACT_ADDRESS` from env (default `0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1`)
- `getCeloScanUrl(txHash: TxHash): string` — Returns full CeloScan URL
- Helper `parseCusd(amount: number): Wei` — Converts decimal cUSD to Wei (cUSD uses 18 decimals)
- Helper `formatCusd(wei: Wei): number` — Converts Wei to decimal cUSD

**Dependencies**: 2.2 (needs branded types)

**Acceptance criteria**:
- [x] `CELO_CHAIN_ID` is 44787
- [x] `getCeloScanUrl` returns `https://alfajores.celoscan.io/tx/{tx_hash}`
- [x] `parseCusd` correctly converts decimal to Wei (e.g., 10 cUSD → 10_000_000_000_000_000_000n)
- [x] `formatCusd` correctly converts Wei to decimal
- [x] All exported functions use branded types (Wei, Address, TxHash)

---

### 3.2 Create Viem Singleton Clients

**Description**: Implement a static factory for viem `publicClient` and `walletClient` using the Celo Alfajores configuration. The private key is loaded from `CELO_PRIVATE_KEY` and NEVER exposed outside this module.

**Files to create**:
- `src/lib/blockchain/client.ts` — Viem singleton clients

**Implementation details**:
- `createPublicClient()` using `http(CELO_RPC_URL)` transport and `celoAlfajores` chain
- `createWalletClient()` using the same transport + private key via `privateKeyToAccount`
- Singleton pattern — clients created once and cached
- Account extracted from private key using `privateKeyToAccount`
- NEVER log, stringify, or expose the private key or account address in error messages
- Export both clients and the `account` for use in `desembolsarCredito`

**Dependencies**: 3.1 (needs chain config), 1.3 (needs env vars)

**Acceptance criteria**:
- [x] `getPublicClient()` returns a singleton `PublicClient<typeof celoAlfajores>`
- [x] `getWalletClient()` returns a singleton `WalletClient` with the funded account
- [x] `getAccount()` returns the `PrivateKeyAccount` derived from `CELO_PRIVATE_KEY`
- [x] Throws descriptive error if `CELO_PRIVATE_KEY` is missing
- [x] Private key is never included in any log or error message
- [x] No circular dependencies

---

### 3.3 Implement `desembolsarCredito()` Function

**Description**: Core blockchain operation: simulate the cUSD ERC-20 transfer, then write the transaction, then wait for receipt. This function orchestrates the full on-chain disbursement.

**Files to create**:
- `src/lib/blockchain/desembolsar.ts` — Disbursement logic

**Implementation details**:
- `desembolsarCredito(to: Address, monto: Wei): Promise<TxHash>`
  1. Read cUSD ERC-20 ABI (minimal — just `transfer` and `decimals`)
  2. Simulate via `publicClient.simulateContract()` — catches revert reasons early
  3. Execute via `walletClient.writeContract()` with the simulation result
  4. Wait for receipt via `publicClient.waitForTransactionReceipt()`
  5. Check receipt status — if `reverted`, throw with details
  6. Return `txHash` as `TxHash` branded type
- Include `ERC20_TRANSFER_ABI` constant inline (just `transfer` function + `decimals`)
- Error handling: wrap viem errors in custom `BlockchainError` with descriptive messages
- DO NOT catch simulateContract revert — let it propagate to the route handler as a simulation failure

**Dependencies**: 3.2 (needs viem clients), 2.2 (needs TxHash, Address, Wei types)

**Acceptance criteria**:
- [x] Function accepts `Address` and `Wei` branded types (not plain strings)
- [x] Returns `TxHash` branded type
- [x] Throws `BlockchainError` on simulation failure with `code: 'SIMULATION_FAILED'`
- [x] Throws `BlockchainError` on transaction revert with `code: 'TX_REVERTED'`
- [x] Throws `BlockchainError` on timeout with `code: 'TX_TIMEOUT'`
- [x] Uses `publicClient.simulateContract` BEFORE `writeContract` (defensive)
- [x] Calls `publicClient.waitForTransactionReceipt` after write
- [x] Does NOT catch errors from `simulateContract` — route handler needs them for audit

---

## Phase 4: API Route — Disbursement Endpoint

### 4.1 Create Zod Validation Schema

**Description**: Define the Zod schema for the `POST /api/desembolso` request body, ensuring type-level validation before business logic runs.

**Files to create**:
- `src/lib/validations/desembolso.ts` — Zod schemas and inferred types

**Implementation details**:
- `DesembolsoSchema = z.object({ credito_id: z.string().uuid() })`
- `DesembolsoInput = z.infer<typeof DesembolsoSchema>` — inferred TypeScript type
- Export both schema and type
- Custom error messages in Spanish: `"credito_id debe ser un UUID válido"`
- `validateDesembolso(input: unknown): Result<DesembolsoInput, ZodError>` — convenience wrapper

**Dependencies**: 1.2 (needs zod installed)

**Acceptance criteria**:
- [x] Schema validates a valid UUID string
- [x] Schema rejects non-UUID strings with descriptive error
- [x] Schema rejects missing `credito_id` field
- [x] Schema rejects extra fields (strict mode or strip unknown)
- [x] `z.infer<>` produces correct TypeScript type `{ credito_id: string }`

---

### 4.2 Implement POST /api/desembolso Route Handler

**Description**: Full route handler implementing the entire disbursement flow: validation → reputation check → state check → blockchain transfer → state update → response.

**Files to create**:
- `src/app/api/desembolso/route.ts` — Route handler (Next.js 15 App Router)

**Flow** (matches design sequence diagram):
1. Parse and validate body via Zod schema (4.1) → 400 on failure
2. Fetch credit from Supabase (with prestatario joined for wallet_address + score) → 404 if missing
3. Check `credito.estado === 'aprobado'` → 409 if not
4. Check `credito.tx_hash !== null` → 409 if already disbursed
5. Fetch prestatario reputation → 403 if score ≤ 80
6. Execute `desembolsarCredito()` → 500 with audit_log on failure
7. Update credit in DB: `estado = 'desembolsado'`, `tx_hash = result.txHash`
8. Insert `audit_log` with action `desembolso`, details including monto, tx_hash, score
9. Return `201` with `{ status: "desembolsado", tx_hash }`

**Error mapping** (from spec):
| Condition | HTTP | Body error |
|-----------|------|------------|
| Zod validation fail | 400 | `CREDIDO_ID_INVALIDO` |
| Score ≤ 80 | 403 | `SCORE_INSUFICIENTE` |
| Credit not found | 404 | `CREDITO_NO_ENCONTRADO` |
| Estado != aprobado | 409 | `ESTADO_INCORRECTO` |
| Already has tx_hash | 409 | `YA_DESEMBOLSADO` |
| Blockchain fail | 500 | `ERROR_INTERNO` |
| Unexpected error | 500 | `ERROR_INTERNO` |

**Dependencies**: 4.1 (Zod schema), 2.3 (Supabase client), 3.3 (desembolsarCredito), 2.2 (types)

**Acceptance criteria**:
- [x] Returns 201 with `{ status: "desembolsado", tx_hash }` on success (Scenario 1)
- [x] Returns 403 with `SCORE_INSUFICIENTE` when score ≤ 80 (Scenario 2)
- [x] Returns 409 with `ESTADO_INCORRECTO` when estado ≠ aprobado (Scenario 3)
- [x] Returns 404 with `CREDITO_NO_ENCONTRADO` for non-existent UUID (Scenario 4)
- [x] Returns 409 with `YA_DESEMBOLSADO` when tx_hash already set
- [x] Returns 500 with `ERROR_INTERNO` on blockchain RPC failure (Scenario 5)
- [x] Returns 400 with `CREDIDO_ID_INVALIDO` for malformed UUID
- [x] On success: credit row is updated with new estado and tx_hash
- [x] On RPC failure: audit_log is created with `desembolso_fallo` and credit state is unchanged
- [x] All response bodies use the exact error codes from spec (Spanish uppercase)
- [x] Handler is async and awaits all DB operations
- [x] Uses `try/catch` with granular error handling per failure type

---

### 4.3 Implement Audit Log Registration

**Description**: Since audit log insertion is embedded in the route handler, this task ensures the audit logic is correctly separated and reusable. Create a dedicated audit utility that the route handler calls.

**Files to create**:
- `src/lib/audit/logger.ts` — Audit log utility

**Implementation details**:
- `registrarAuditLog(params: { accion: string; entidadTipo: string; entidadId: string; participanteId?: string; detalles: Record<string, unknown> }): Promise<void>`
- Uses the Supabase service role client (2.3) to INSERT into `audit_log`
- Maps Spanish action names: `desembolso`, `desembolso_fallo`, etc.
- For `desembolso`, `detalles` MUST include `{ monto, tx_hash, score_reputacion }` (per audit-trail spec)
- For `desembolso_fallo`, `detalles` MUST include `{ error, credito_id, score_reputacion }`
- Does NOT throw on audit failure — logs a warning but does not block the response (audit is side-effect, not critical path)
- However, the spec says "Every state transition on creditos MUST produce an audit_log row" — so we should attempt and only swallow on unexpected error

**Dependencies**: 2.3 (Supabase client), 2.2 (types)

**Acceptance criteria**:
- [x] `registrarAuditLog` inserts a row into `audit_log` with correct column mapping
- [x] `accion` maps to one of the allowed values from spec
- [x] `detalles` contains `monto`, `tx_hash`, `score_reputacion` for disbursement
- [x] `detalles` contains `error`, `credito_id`, `score_reputacion` for failure
- [x] Function does not throw errors — audit failures are logged with `console.warn`
- [x] Function is called from the route handler in both success and failure paths

---

## Phase 5: UI Components — Approval Interface

### 5.1 Create CeloScanLink Component

**Description**: A simple, accessible component that renders a link to view a transaction on CeloScan.

**Files to create**:
- `src/components/shared/CeloScanLink.tsx` — Pure presentational component
- (optional) `src/components/shared/CeloScanLink.test.tsx` — Unit test skeleton

**Implementation details**:
- Props: `{ txHash: string; label?: string }`
- Renders `<a href="https://alfajores.celoscan.io/tx/{txHash}" target="_blank" rel="noopener noreferrer">`
- Default label: "Ver en CeloScan"
- `aria-label="Ver transacción en CeloScan"` (per spec)
- Keyboard accessible by default (native `<a>` element)
- Styled as a subtle link: `text-blue-600 hover:underline text-sm`

**Dependencies**: None (pure component, no hooks)

**Acceptance criteria**:
- [x] Renders correct CeloScan URL for given tx hash
- [x] Has `target="_blank"` and `rel="noopener noreferrer"`
- [x] Has `aria-label="Ver transacción en CeloScan"`
- [x] Opens in new tab when clicked
- [x] Uses `getCeloScanUrl` from 3.1 for URL construction (or inline URL)

---

### 5.2 Create PanelAprobacion Component

**Description**: The main approval panel — a client component with 6 explicit states (loading, empty, list, approving, success, error) for reviewing and approving pending credits.

**Files to create**:
- `src/components/creditos/PanelAprobacion.tsx` — Main component
- `src/components/creditos/PanelAprobacion.css` — Optional, or use Tailwind

**States** (from spec):

| State | Render |
|-------|--------|
| `loading` | Skeleton spinner with `aria-busy="true"`, text "Cargando créditos pendientes…" |
| `empty` | Empty state illustration + "No hay créditos pendientes de aprobación" |
| `list` | Table with columns: Monto, Prestatario, Score, Fecha solicitud, Acciones [Aprobar] |
| `approving` | Button shows spinner + "Aprobando…", ALL buttons disabled |
| `success` | Green banner with checkmark + CeloScanLink + "Desembolso exitoso", auto-dismiss after 5s |
| `error` | Red banner with `role="alert"` + error detail + [Reintentar] button |

**Implementation details**:
- Props: `{ creditosIniciales: CreditoPendiente[] }` — initial data from server component
- Internal state machine using `useState` (not a library) tracking current state + error + txHash
- `handleApprove(creditoId: string)`:
  1. Set state to `approving`
  2. `fetch('/api/desembolso', { method: 'POST', body: JSON.stringify({ credito_id }) })`
  3. On success → set state to `success` with tx_hash, setTimeout to dismiss after 5s
  4. On error → set state to `error` with error detail message
- Auto-dismiss success banner after 5 seconds (reset to `list`)
- Table MUST have `aria-label` or `<caption>` for accessibility
- Error/success banners MUST have `role="alert"`
- All buttons MUST have `aria-label` if icon-only
- Keyboard navigation: Tab through credit rows, Enter/Space to approve

**Dependencies**: 5.1 (CeloScanLink), 4.2 (API route exists), 1.2 (React is installed)

**Acceptance criteria**:
- [x] Shows skeleton with `aria-busy="true"` during initial load
- [x] Shows empty state when no creditosIniciales
- [x] Shows table with all columns when creditos exist
- [x] Clicking [Aprobar] changes button to spinner + "Aprobando…"
- [x] All buttons are disabled during approving state
- [x] On success: green banner with CeloScanLink appears
- [x] Success banner auto-dismisses after 5 seconds
- [x] On error: red banner appears with [Reintentar] button
- [x] Clicking [Reintentar] retries the approval
- [x] Table has `aria-label` for accessibility
- [x] Banners have `role="alert"`
- [x] All interactive elements are keyboard-navigable
- [x] TypeScript compiles with zero errors
- [x] No direct DOM manipulation — all state is React state

---

### 5.3 Create Dashboard / Creditos Page

**Description**: A page (server component) that fetches pending credits on the server and renders `PanelAprobacion` on the client.

**Files to create**:
- `src/app/creditos/page.tsx` — Dashboard page (or root page if creditos is main feature)
- `src/app/creditos/layout.tsx` — Optional layout for creditos section

**Implementation details**:
- Server component fetching `creditos` with estado `pendiente` or `avalado` (pending approval)
- Passes data as `creditosIniciales` prop to `PanelAprobacion`
- Basic page layout with heading "Panel de Aprobación" and description
- Handles case where Supabase query fails — show error message to user
- The page itself should NOT be `'use client'` — only PanelAprobacion is client

**Dependencies**: 5.2 (PanelAprobacion), 2.3 (Supabase client for server fetch)

**Acceptance criteria**:
- [x] Page is a server component (no `'use client'`)
- [x] Fetches pending credits from Supabase on the server
- [x] Renders `<PanelAprobacion>` with fetched data
- [x] Shows error state if Supabase fetch fails
- [x] Page has descriptive title and metadata
- [x] Route is accessible at `/creditos`
- [x] TypeScript compiles with zero errors

---

## Phase 6: Verification — Spec Compliance

### 6.1 Verify Database Schema Against Spec

**Description**: Walk through every spec requirement for the database and verify the migration SQL covers it.

**Verification checklist**:
- [x] `participantes` table has all 6 columns with correct types per spec §1.1
- [x] `participantes.rol` uses enum `rol_participante` with 3 values
- [x] `participantes.score_reputacion` has CHECK 0–100
- [x] `avales` table has FK references to `participantes` and `creditos`
- [x] `avales` has UNIQUE constraint on `(prestatario_id, credito_id)`
- [x] `avales.monto_maximo` has CHECK > 0
- [x] `creditos` has FK to `participantes`
- [x] `creditos.estado` uses enum `estado_credito` with all 6 values
- [x] `creditos.monto` has CHECK > 0
- [x] `creditos.tx_hash` is nullable with UNIQUE
- [x] `audit_log` has all 6 columns per spec §1.4
- [x] `audit_log` is INSERT-only (no UPDATE/DELETE policies)
- [x] RLS is enabled on all 4 tables
- [x] RLS policies match spec requirements
- [x] Indexes on `wallet_address`, `rol`, `estado`, `prestatario_id` exist

**Dependencies**: 2.1 (migration SQL)

**Acceptance criteria**:
- [x] All findings documented — either PASS or list of discrepancies
- [x] If discrepancies found, they are reported as actionable fixes

---

### 6.2 Verify API Route + UI Against Spec

**Description**: Walk through every spec scenario and requirement for the API and UI, verifying the implementation matches.

**API verification** (against specs.md §2 and disbursement-api spec):
- [x] Scenario 1 (success): 201 with tx_hash, estado changes, audit_log created
- [x] Scenario 2 (low score): 403 SCORE_INSUFICIENTE, no state change
- [x] Scenario 3 (wrong state): 409 ESTADO_INCORRECTO, no state change
- [x] Scenario 4 (not found): 404 CREDITO_NO_ENCONTRADO
- [x] Scenario 5 (RPC fail): 500 ERROR_INTERNO, audit_log desembolso_fallo
- [x] Error 400 CREDIDO_ID_INVALIDO for bad UUID
- [x] Error 409 YA_DESEMBOLSADO for credit with existing tx_hash
- [x] Zod validation rejects missing/extra fields
- [x] Service role used for all DB operations (no RLS in API)

**UI verification** (against specs.md §3 and approval-ui spec):
- [x] `CeloScanLink` renders correct URL, opens new tab, has aria-label
- [x] `PanelAprobacion` shows 6 distinct states (loading/empty/list/approving/success/error)
- [x] Loading state has `aria-busy="true"`
- [x] Empty state shows "No hay créditos pendientes de aprobación"
- [x] List state shows table with all columns
- [x] Approving state disables all buttons, shows spinner
- [x] Success state shows green banner + CeloScanLink, auto-dismisses 5s
- [x] Error state shows red banner + [Reintentar]
- [x] All error/success banners have `role="alert"`
- [x] All interactive elements are keyboard-navigable

**Dependencies**: 4.2 (API route), 5.2 (PanelAprobacion), 5.1 (CeloScanLink)

**Acceptance criteria**:
- [x] All scenarios from spec pass (or documented as not applicable in this iteration)
- [x] All UI requirements from spec are verified
- [x] Discrepancies are documented as actionable fixes
- [x] TypeScript strict mode compiles with zero errors across all files

---

## Task Dependency Graph

```
Phase 1 (Infrastructure)
├── 1.1 Next.js scaffold (no deps)
├── 1.2 Install deps (needs 1.1)
├── 1.3 Env template (no deps)
└── 1.4 Code quality (needs 1.1)

Phase 2 (Database)
├── 2.1 Migration SQL (no deps)
├── 2.2 TypeScript types (needs 2.1)
└── 2.3 Supabase client (needs 2.2, 1.3)

Phase 3 (Blockchain)
├── 3.1 Celo config (needs 2.2)
├── 3.2 Viem clients (needs 3.1, 1.3)
└── 3.3 desembolsarCredito (needs 3.2, 2.2)

Phase 4 (API)
├── 4.1 Zod schema (needs 1.2)
├── 4.2 Route handler (needs 4.1, 2.3, 3.3, 2.2)
└── 4.3 Audit logger (needs 2.3, 2.2)

Phase 5 (UI)
├── 5.1 CeloScanLink (no deps)
├── 5.2 PanelAprobacion (needs 5.1, 4.2)
└── 5.3 Creditos page (needs 5.2, 2.3)

Phase 6 (Verification)
├── 6.1 DB verification (needs 2.1)
└── 6.2 API+UI verification (needs 4.2, 5.2, 5.1)
```

**Recommended execution order**: 1.1 → 1.2 → 1.3 → 1.4 → 2.1 → 2.2 → 2.3 → 3.1 → 3.2 → 3.3 → 4.1 → 4.3 → 4.2 → 5.1 → 5.2 → 5.3 → 6.1 → 6.2

> Note: 4.3 (audit logger) is listed before 4.2 because the route handler imports it, but both can be written in the same session.
> Similarly, 5.1 can be done in parallel with Phase 4.
