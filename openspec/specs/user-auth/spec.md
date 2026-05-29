# user-auth Specification

## Purpose

Authentication and session management for the micro-lending platform using Supabase Auth with email/password **or SIWE wallet signature (EIP-4361)**.

## Requirements

### Requirement: Login

The system MUST authenticate users via email + password using Supabase Auth **OR** via SIWE wallet signature.
(Previously: email + password only)

- GIVEN an unauthenticated user
- WHEN they submit valid email + password on `/login`
- THEN a session cookie is set
- AND they are redirected to the original requested route or `/aprobacion`

- GIVEN a user submitting invalid credentials
- WHEN the form is submitted
- THEN an inline error message is displayed
- AND no session is created

- GIVEN a user with a connected wallet
- WHEN they complete the SIWE signing flow
- THEN a session is created via wallet authentication
- AND they are redirected according to `isNewUser` flag

### Requirement: Registration

The system MUST allow account creation with email + password (min 8 chars) and confirmation match.

- GIVEN an unauthenticated user
- WHEN they submit email, password (≥8), and matching confirmation
- THEN a Supabase Auth user is created
- AND they are redirected to `/onboarding`

- GIVEN passwords that do not match or are under 8 chars
- WHEN the form is submitted
- THEN inline validation errors are shown
- AND no account is created

### Requirement: Session Management

The system MUST maintain the user session via `@supabase/ssr` cookie-based helpers (`createServerClient` for middleware/server components, `createBrowserClient` for browser).

- GIVEN any page request
- WHEN the middleware or server component runs
- THEN it SHALL read the session cookie via `@supabase/ssr` server helpers

- GIVEN the root layout
- WHEN it renders
- THEN an AuthProvider client component wraps {children}
- AND it exposes `session`, `user`, `signOut`, and `isLoading` via context

### Requirement: Route Protection

The middleware MUST redirect unauthenticated requests targeting `/(dashboard)/*` to `/login`, preserving the original URL as a redirect parameter.

- GIVEN an unauthenticated user
- WHEN they request any `/(dashboard)/*` route
- THEN they are redirected to `/login?redirect=<original_path>`
- AND after successful login, they are returned to the original path

- GIVEN an authenticated user with `rol = 'admin'`
- WHEN they request `/admin/dashboard` or any `/api/admin/*` route
- THEN the request passes through and is processed normally

- GIVEN an authenticated user with `rol ≠ 'admin'`
- WHEN they request `/admin/dashboard` or any `/api/admin/*` route
- THEN the `requireAdmin()` guard returns 403 `{ error: "FORBIDDEN" }`
- AND the request is rejected before any data is fetched

- GIVEN an authenticated user with any rol
- WHEN they request a non-admin dashboard route (e.g. `/aprobacion`)
- THEN the middleware passes through without additional checks

### Requirement: Auth Callback

The system MUST provide an auth callback route to handle email confirmation and OAuth redirects.

- GIVEN a user who clicks a confirmation link
- WHEN the auth callback page processes the code
- THEN the session is set via `@supabase/ssr` exchangeCodeForSession
- AND they are redirected to the appropriate page

### Requirement: SIWE State Machine

The login page client component MUST manage compound auth state: the email form's `idle | loading | error` plus the SIWE flow's wallet states.

- GIVEN the login page rendering
- WHEN the user interacts with either auth method
- THEN each method operates independently
- AND the SIWE states SHALL be `idle | connecting_wallet | awaiting_signature | verifying | success | error`
