# onboarding Specification

## Purpose

Post-registration flow for collecting participant profile data (nombre, wallet_address, rol) and creating the initial `participantes` row.

## Requirements

### Requirement: Profile Creation

The system MUST allow authenticated users without a participantes row to create their profile via a form with nombre, wallet_address, and rol. The POST API MUST use `getSupabaseClient()` (service_role) to insert the row with `user_id` from the authenticated session.

- GIVEN an authenticated user with no participantes row
- WHEN they visit `/onboarding`
- THEN they see a form with nombre (text), wallet_address (text), rol (select: prestamista, prestatario, aval)

- GIVEN an authenticated user who submits valid onboarding data
- WHEN the form POSTs to the API
- THEN a participantes row is created with user_id from the session
- AND they are redirected to `/aprobacion`

- GIVEN an authenticated user who submits with a missing required field
- WHEN the form is submitted
- THEN an inline validation error is shown
- AND no row is created

### Requirement: Completion Check

The system MUST redirect users who already have a participantes row (checked via GET API comparing `user_id` from session) away from `/onboarding`.

- GIVEN an authenticated user with an existing participantes row (user_id matches)
- WHEN they visit `/onboarding`
- THEN they are immediately redirected to `/aprobacion`
- AND the form is never rendered

### Requirement: Wallet Connection

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
