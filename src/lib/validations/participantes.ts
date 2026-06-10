// =============================================================================
// Zod Validation Schemas — Participantes API
// =============================================================================
//
// Mirrors the patterns in avales.ts:
// - Rejects unknown keys via `.strict()`
// - Exports convenience validate* wrappers using safeParse
// - Each schema has a corresponding `z.infer` type alias
// =============================================================================

import { z } from 'zod';

// ---------------------------------------------------------------------------
// POST /api/participantes — Crear Participante (Onboarding)
// ---------------------------------------------------------------------------

/**
 * Schema for creating a new participant during onboarding.
 *
 * - nombre: required, 1-255 chars
 * - email: required, valid email
 * - wallet_address: optional, must be valid Ethereum address (0x-prefixed, 40 hex chars)
 * - rol: must be one of the valid roles
 * - codigo_referido: optional, 8-40 chars, código de otro participante para unirse a su red
 */
export const CrearParticipanteSchema = z.object({
  nombre: z
    .string()
    .min(1, 'El nombre es requerido')
    .max(255, 'El nombre no puede exceder 255 caracteres'),
  email: z
    .string()
    .email('Debe ser un correo electrónico válido'),
  wallet_address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'La dirección de wallet no es válida. Debe ser una dirección Ethereum (0x...)')
    .optional()
    .or(z.literal('')),
  rol: z.enum(['usuario'], {
    message: 'El rol debe ser usuario',
  }),
  oficio: z
    .string()
    .min(1, 'El oficio / rol ancestral es requerido')
    .max(255, 'El oficio no puede exceder 255 caracteres'),
  telefono: z
    .string()
    .min(1, 'El número de celular es requerido')
    .optional(),
  codigo_referido: z
    .string()
    .min(8, 'El código de referido debe tener al menos 8 caracteres')
    .max(40, 'El código de referido no puede exceder 40 caracteres')
    .optional(),
}).strict();

/** Inferred TypeScript type from the schema */
export type CrearParticipanteInput = z.infer<typeof CrearParticipanteSchema>;

/**
 * Convenience wrapper that validates create input and returns a typed result.
 */
export function validateCrearParticipante(
  input: unknown,
): { success: true; data: CrearParticipanteInput } | { success: false; error: z.ZodError } {
  return CrearParticipanteSchema.safeParse(input);
}

// ---------------------------------------------------------------------------
// GET /api/participantes — Query Parameters
// ---------------------------------------------------------------------------

/**
 * Schema for the GET query parameters.
 */
export const CheckParticipanteQuerySchema = z.object({
  check_existing: z.literal('true').optional(),
}).strict();

/** Inferred TypeScript type from the schema */
export type CheckParticipanteQueryInput = z.infer<typeof CheckParticipanteQuerySchema>;

/**
 * Convenience wrapper that validates check query params and returns a typed result.
 */
export function validateCheckParticipanteQuery(
  input: unknown,
): { success: true; data: CheckParticipanteQueryInput } | { success: false; error: z.ZodError } {
  return CheckParticipanteQuerySchema.safeParse(input);
}

// ---------------------------------------------------------------------------
// PATCH /api/participantes/me — Actualizar Perfil
// ---------------------------------------------------------------------------

/**
 * Schema for updating the current user's profile (wallet, name, etc.).
 * All fields are optional — only send what changed.
 */
export const ActualizarParticipanteSchema = z.object({
  nombre: z
    .string()
    .min(1, 'El nombre es requerido')
    .max(255, 'El nombre no puede exceder 255 caracteres')
    .optional(),
  wallet_address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'La dirección de wallet no es válida')
    .optional()
    .or(z.literal('')),
  telefono: z
    .string()
    .min(1, 'El número de celular es requerido')
    .optional(),
}).strict();

/** Inferred TypeScript type from the schema */
export type ActualizarParticipanteInput = z.infer<typeof ActualizarParticipanteSchema>;

/**
 * Convenience wrapper that validates update input.
 */
export function validateActualizarParticipante(
  input: unknown,
): { success: true; data: ActualizarParticipanteInput } | { success: false; error: z.ZodError } {
  return ActualizarParticipanteSchema.safeParse(input);
}
