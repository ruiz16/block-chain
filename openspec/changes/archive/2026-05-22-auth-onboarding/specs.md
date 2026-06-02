# Auth + Onboarding — Specifications

## participant-management (Modified Delta)

### MODIFIED Requirements

#### Requirement: Participant Registration

The system MUST allow creation of participants with a unique wallet_address, nombre, rol, and a non-nullable `user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE`.
(Previously: no user_id column)

- GIVEN an authenticated user without a participantes row
- WHEN they submit valid data (nombre, wallet_address, rol)
- THEN a row is inserted with their user_id, score_reputacion = 50, activo = true
- AND user_id has a UNIQUE constraint preventing duplicate rows

#### Requirement: RLS Isolation

The system MUST enforce RLS on `participantes` via `auth.uid()` instead of JWT wallet_address claims. The INSERT policy MUST use `auth.uid()` for `user_id`, and SELECT/UPDATE policies MUST compare `user_id` against `auth.uid()`.
(Previously: compared wallet_address against `request.jwt.claims`)

- GIVEN an authenticated user
- WHEN they SELECT from participantes
- THEN they only see rows WHERE user_id = auth.uid()
- AND INSERT grants WITH CHECK (user_id = auth.uid())
- AND UPDATE uses USING (user_id = auth.uid())

#### Requirement: Reputation Score

(Unchanged — copied for completeness)

The system SHALL maintain a reputation score (0–100) per participant. Only `service_role` MAY update scores.

- GIVEN a participant with score_reputacion = 50
- WHEN score is updated via service_role
- THEN the new score is persisted

---

## user-auth (New Full Spec)

### Requirements

#### Requirement: Login

The system MUST authenticate users via email + password using Supabase Auth.

- GIVEN an unauthenticated user
- WHEN they submit valid email + password on `/login`
- THEN a session cookie is set
- AND they are redirected to the original requested route or `/aprobacion`

- GIVEN a user submitting invalid credentials
- WHEN the form is submitted
- THEN an inline error message is displayed
- AND no session is created

#### Requirement: Registration

The system MUST allow account creation with email + password (min 8 chars) and confirmation match.

- GIVEN an unauthenticated user
- WHEN they submit email, password (≥8), and matching confirmation
- THEN a Supabase Auth user is created
- AND they are redirected to `/onboarding`

- GIVEN passwords that do not match or are under 8 chars
- WHEN the form is submitted
- THEN inline validation errors are shown
- AND no account is created

#### Requirement: Session Management

The system MUST maintain the user session via `@supabase/ssr` cookie-based helpers (`createServerClient` for middleware/server components, `createBrowserClient` for browser).

- GIVEN any page request
- WHEN the middleware or server component runs
- THEN it SHALL read the session cookie via `@supabase/ssr` server helpers

- GIVEN the root layout
- WHEN it renders
- THEN an AuthProvider client component wraps {children}
- AND it exposes `session`, `user`, `signOut`, and `isLoading` via context

#### Requirement: Route Protection

The middleware MUST redirect unauthenticated requests targeting `/(dashboard)/*` to `/login`, preserving the original URL as a redirect parameter.

- GIVEN an unauthenticated user
- WHEN they request `/(dashboard)/aprobacion`
- THEN they are redirected to `/login?redirect=/aprobacion`
- AND after successful login, they are returned to `/aprobacion`

- GIVEN an authenticated user
- WHEN they request any route
- THEN the middleware passes through without redirect

#### Requirement: Auth Callback

The system MUST provide an auth callback route to handle email confirmation and OAuth redirects.

- GIVEN a user who clicks a confirmation link
- WHEN the auth callback page processes the code
- THEN the session is set via `@supabase/ssr` exchangeCodeForSession
- AND they are redirected to the appropriate page

---

## onboarding (New Full Spec)

### Requirements

#### Requirement: Profile Creation

The system MUST allow authenticated users without a participantes row to create their profile via a form with nombre, wallet_address, and rol. The POST API MUST use `getSupabaseClient()` (service_role) to insert the row with `user_id` from the authenticated session.

- GIVEN an authenticated user with no participantes row
- WHEN they visit `/onboarding`
- THEN they see a form with nombre (text), wallet_address (text), rol (select: prestatario)

- GIVEN an authenticated user who submits valid onboarding data
- WHEN the form POSTs to the API
- THEN a participantes row is created with user_id from the session
- AND they are redirected to `/aprobacion`

- GIVEN an authenticated user who submits with a missing required field
- WHEN the form is submitted
- THEN an inline validation error is shown
- AND no row is created

#### Requirement: Completion Check

The system MUST redirect users who already have a participantes row (checked via GET API comparing `user_id` from session) away from `/onboarding`.

- GIVEN an authenticated user with an existing participantes row (user_id matches)
- WHEN they visit `/onboarding`
- THEN they are immediately redirected to `/aprobacion`
- AND the form is never rendered

#### Requirement: Wallet Connection

The system SHOULD provide a `ConnectWallet` component that detects `window.ethereum`, requests accounts, and stores the address to pre-fill the onboarding wallet_address field.

- GIVEN a user on `/onboarding` with `window.ethereum` available
- WHEN they click "Connect Wallet"
- THEN the wallet requests accounts via `eth_requestAccounts`
- AND the address is stored in component state
- AND the onboarding form's wallet_address field is pre-filled

- GIVEN a user on `/onboarding` without `window.ethereum`
- WHEN the page loads
- THEN the button is disabled showing "No wallet detected"
- AND the user MAY type a wallet address manually

---

## Scenarios

### Scenario: Registro exitoso
- GIVEN un usuario sin cuenta
- WHEN completa el formulario de registro con email válido + password
- THEN se crea la cuenta en Supabase Auth
- AND es redirigido a /onboarding

### Scenario: Onboarding completo
- GIVEN un usuario autenticado sin fila en participantes
- WHEN completa nombre, wallet_address y rol en /onboarding
- THEN se crea una fila en participantes con su user_id
- AND es redirigido a /aprobacion

### Scenario: Acceso a ruta protegida sin auth
- GIVEN un usuario no autenticado
- WHEN intenta acceder a /aprobacion
- THEN es redirigido a /login
- AND después de login exitoso vuelve a /aprobacion

### Scenario: Onboarding ya completado
- GIVEN un usuario autenticado con fila existente en participantes
- WHEN visita /onboarding
- THEN es redirigido inmediatamente a /aprobacion
- AND no ve el formulario

### Scenario: Registro con password inválido
- GIVEN un usuario sin cuenta
- WHEN completa registro con password de 4 caracteres
- THEN ve un error de validación inline
- AND no se crea la cuenta

### Scenario: Wallet no detectada
- GIVEN un usuario sin wallet instalada
- WHEN visita /onboarding
- THEN el botón "Connect Wallet" aparece deshabilitado
- AND puede escribir wallet_address manualmente
