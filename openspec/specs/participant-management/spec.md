# participant-management Specification

## Purpose

Registration and management of platform participants with roles and reputation scores.

## Requirements

### Requirement: Participant Registration

The system MUST allow creation of participants with `wallet_address`, `nombre`, `rol`, and a non-nullable `user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE`. **For SIWE logins, the `participantes` row MAY be created server-side before the user completes onboarding, with a default rol of `'prestatario'`.**
(Previously: only created during onboarding form submission)

- GIVEN an authenticated user without a participantes row
- WHEN they submit valid data (nombre, wallet_address, rol)
- THEN a row is inserted with their user_id, score_reputacion = 50, activo = true
- AND user_id has a UNIQUE constraint preventing duplicate rows

- GIVEN a wallet address that connects via SIWE for the first time
- WHEN `POST /api/auth/siwe` succeeds
- THEN a participantes row is auto-created with `rol = 'prestatario'`, `score_reputacion = 50`, `activo = true`
- AND a placeholder `nombre` is set (formatted from wallet address)
- AND the user is redirected to `/onboarding` to complete their profile

### Requirement: Reputation Score

The system SHALL maintain a reputation score (0–100) per participant. Only `service_role` MAY update scores.

- GIVEN a participant with `score_reputacion = 50`
- WHEN score is updated via service_role
- THEN the new score is persisted and cascade rules for avales are evaluated

### Requirement: RLS Isolation

The system MUST enforce RLS on `participantes` via `auth.uid()` instead of JWT wallet_address claims. The INSERT policy MUST use `auth.uid()` for `user_id`, and SELECT/UPDATE policies MUST compare `user_id` against `auth.uid()`. Admin users (rol = 'admin') MAY bypass row-level filtering on SELECT to see all rows.

- GIVEN an authenticated user
- WHEN they SELECT from participantes
- THEN they only see rows WHERE user_id = auth.uid() (or their rol = 'admin')
- AND INSERT grants WITH CHECK (user_id = auth.uid())
- AND UPDATE uses USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())
