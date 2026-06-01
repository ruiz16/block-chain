// =============================================================================
// Zod Validation Schemas — Avales API
// =============================================================================
//
// Mirrors the patterns in desembolso.ts:
// - Each schema has a `strict()` call to reject unknown keys
// - Each schema has a corresponding `z.infer` type alias
// - Each schema has a convenience `validate*` wrapper using safeParse
// =============================================================================

import { z } from 'zod';

// ---------------------------------------------------------------------------
// POST /api/avales — Asignar Aval (desde el GACC)
// ---------------------------------------------------------------------------

/**
 * Schema for avaling a credit from within a GACC.
 *
 * Only `credito_id` is required — the `avalador_id` is derived from the
 * authenticated user's session (you can only aval for yourself).
 */
export const AsignarAvalSchema = z.object({
  credito_id: z
    .string()
    .min(1, 'credito_id es requerido')
    .uuid('credito_id debe ser un UUID válido'),
}).strict();

/** Inferred TypeScript type from the schema */
export type AsignarAvalInput = z.infer<typeof AsignarAvalSchema>;

/**
 * Convenience wrapper that validates input and returns a typed result.
 *
 * @param input - Raw request body (unknown)
 * @returns Parsed and validated AsignarAvalInput or ZodError
 */
export function validateAsignarAval(
  input: unknown,
): { success: true; data: AsignarAvalInput } | { success: false; error: z.ZodError } {
  const result = AsignarAvalSchema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, error: result.error };
}

// ---------------------------------------------------------------------------
// PATCH /api/avales/{id}/revocar — Revocar Aval
// ---------------------------------------------------------------------------

/**
 * Schema for the revoke route parameters.
 * Only accepts a valid UUID `id`.
 */
export const RevocarAvalParamsSchema = z.object({
  id: z
    .string()
    .min(1, 'id es requerido')
    .uuid('id debe ser un UUID válido'),
}).strict();

/** Inferred TypeScript type from the schema */
export type RevocarAvalParams = z.infer<typeof RevocarAvalParamsSchema>;

/**
 * Convenience wrapper that validates revoke params and returns a typed result.
 *
 * @param input - Raw params (unknown)
 * @returns Parsed and validated RevocarAvalParams or ZodError
 */
export function validateRevocarAval(
  input: unknown,
): { success: true; data: RevocarAvalParams } | { success: false; error: z.ZodError } {
  const result = RevocarAvalParamsSchema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, error: result.error };
}

// ---------------------------------------------------------------------------
// GET /api/avales — Query Parameters
// ---------------------------------------------------------------------------

/**
 * Schema for the GET query parameters.
 * Both fields are optional — at least one SHOULD be provided.
 */
export const AvalQuerySchema = z.object({
  credito_id: z.string().uuid('credito_id debe ser un UUID válido').optional(),
  participante_id: z.string().uuid('participante_id debe ser un UUID válido').optional(),
}).strict();

/** Inferred TypeScript type from the schema */
export type AvalQueryInput = z.infer<typeof AvalQuerySchema>;

/**
 * Convenience wrapper that validates query params and returns a typed result.
 *
 * @param input - Raw query params (unknown)
 * @returns Parsed and validated AvalQueryInput or ZodError
 */
export function validateAvalQuery(
  input: unknown,
): { success: true; data: AvalQueryInput } | { success: false; error: z.ZodError } {
  const result = AvalQuerySchema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, error: result.error };
}
