# credit-request Specification

## Purpose

Borrower credit request submission and listing. Allows authenticated prestatarios to submit new credit requests and view their existing credits.

## Requirements

### Requirement: Submit Credit Request

The system MUST accept a borrower credit request and create a credit in `pendiente` state via `POST /api/creditos`.

**Input**: `{ monto: number, descripcion?: string, plazo_dias: number }`
**Auth**: Session required; participante row MUST exist
**Validation**: `monto > 0`, `30 ≤ plazo_dias ≤ 365`
**Result**: `estado='pendiente'`, `prestatario_id` from session participante
**Returns**: `201` with created credito data

- GIVEN a valid body from an authenticated prestatario
- WHEN the POST request is submitted
- THEN a 201 response is returned with `estado="pendiente"`
- GIVEN a request with `monto ≤ 0`
- WHEN the POST request is submitted
- THEN a 400 response is returned
- GIVEN a request with `plazo_dias < 30` or `plazo_dias > 365`
- WHEN the POST request is submitted
- THEN a 400 response is returned
- GIVEN a request with a missing or invalid session cookie
- WHEN the POST request is submitted
- THEN a 401 response is returned
- GIVEN an authenticated user with no participante row
- WHEN the POST request is submitted
- THEN a 404 response is returned

### Requirement: List My Credits

The system MUST return all credits for the authenticated user via `GET /api/creditos`, ordered by `fecha_solicitud` DESC.

**Auth**: Session required
**Returns**: `200` with array (empty if no participante row or no credits)

- GIVEN an authenticated prestatario with credits
- WHEN the GET request is submitted
- THEN a 200 response with an array ordered DESC by `fecha_solicitud` is returned
- GIVEN an authenticated user without credits
- WHEN the GET request is submitted
- THEN a 200 response with an empty array is returned
- GIVEN an authenticated user without a participante row
- WHEN the GET request is submitted
- THEN a 200 response with an empty array is returned

### Requirement: Credit Request UI

The `SolicitarCredito` component SHALL render 4 states: `idle` (empty form, plazo presets 30/60/90/180/365), `submitting` (disabled controls + spinner), `success` (confirmation + link to `/mis-creditos`), `error` (message + retry button).

- GIVEN a borrower navigates to `/solicitar`
- WHEN the form is in idle state
- THEN an empty form with plazo dropdown presets is visible
- GIVEN a form filled with valid data
- WHEN the submit action succeeds with a 201 response
- THEN a success confirmation is shown with a link to `/mis-creditos`
- GIVEN a form submitted with invalid data
- WHEN the API returns a 4xx or 5xx error
- THEN an error message with a retry button is displayed
- GIVEN a form submission in progress
- WHEN the request is in flight
- THEN all inputs are disabled and a spinner is shown
