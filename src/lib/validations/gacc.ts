// =============================================================================
// Zod Validation Schemas — GACC API
// =============================================================================
//
// Follows the same patterns as creditos.ts and avales.ts:
// - Rejects unknown keys via `.strict()`
// - Exports convenience validate* wrappers using safeParse
// - Each schema has a corresponding `z.infer` type alias
// =============================================================================

import { z } from 'zod';

// ---------------------------------------------------------------------------
// POST /api/gacc — Crear un GACC
// ---------------------------------------------------------------------------

/**
 * Schema for creating a new GACC.
 *
 * - nombre: required, 3-200 chars
 * - descripcion: optional, max 500 chars
 */
export const CrearGaccSchema = z.object({
  nombre: z
    .string()
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(200, 'El nombre no puede exceder 200 caracteres'),
  descripcion: z
    .string()
    .max(500, 'La descripción no puede exceder 500 caracteres')
    .optional()
    .or(z.literal('')),
}).strict();

export type CrearGaccInput = z.infer<typeof CrearGaccSchema>;

export function validateCrearGacc(
  input: unknown,
): { success: true; data: CrearGaccInput } | { success: false; error: z.ZodError } {
  return CrearGaccSchema.safeParse(input);
}

// ---------------------------------------------------------------------------
// POST /api/gacc/unirse — Unirse a un GACC mediante código
// ---------------------------------------------------------------------------

/**
 * Schema for joining a GACC via its shareable code.
 *
 * - codigo: required, non-empty string
 */
export const UnirseGaccSchema = z.object({
  codigo: z
    .string()
    .min(1, 'El código es requerido')
    .max(50, 'Código inválido'),
}).strict();

export type UnirseGaccInput = z.infer<typeof UnirseGaccSchema>;

export function validateUnirseGacc(
  input: unknown,
): { success: true; data: UnirseGaccInput } | { success: false; error: z.ZodError } {
  return UnirseGaccSchema.safeParse(input);
}

// ---------------------------------------------------------------------------
// POST /api/gacc/[id]/validar/[miembro_id] — Validar un miembro
// ---------------------------------------------------------------------------

/**
 * Schema for validating a member within the GACC.
 * No body required — the route params provide grupo_id and miembro_id.
 * But we accept an empty body for consistency.
 */
export const ValidarMiembroSchema = z.object({}).strict();

export type ValidarMiembroInput = z.infer<typeof ValidarMiembroSchema>;

export function validateValidarMiembro(
  input: unknown,
): { success: true; data: ValidarMiembroInput } | { success: false; error: z.ZodError } {
  return ValidarMiembroSchema.safeParse(input);
}
