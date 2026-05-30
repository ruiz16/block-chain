// =============================================================================
// Zod Validation Schemas — Creditos API
// =============================================================================
//
// Mirrors the patterns in avales.ts and desembolso.ts:
// - Rejects unknown keys via `.strict()`
// - Exports convenience validate* wrappers using safeParse
// - Each schema has a corresponding `z.infer` type alias
// =============================================================================

import { z } from 'zod';

// ---------------------------------------------------------------------------
// POST /api/creditos — Solicitar Crédito
// ---------------------------------------------------------------------------

/**
 * Schema for requesting a new credit.
 *
 * - monto: required, must be positive — amount in COP (Colombian Pesos).
 *   The API will convert this to cUSD internally using the hardcoded rate.
 * - descripcion: optional, max 500 chars
 * - plazo_dias: required, integer between 30 and 365
 * - numero_cuotas: optional, integer between 1 and 60 (default: 1).
 *   Credits with >1 cuota divide the payment into equal installments.
 *
 * @example
 *   { monto: 1_000_000, plazo_dias: 90 }
 *   // → $1.000.000 COP ≈ 275.23 cUSD, single payment
 *
 *   { monto: 3_000_000, plazo_dias: 180, numero_cuotas: 6 }
 *   // → $3.000.000 COP in 6 monthly cuotas of 1/6 each
 */
export const SolicitarCreditoSchema = z.object({
  monto: z.number().positive('El monto debe ser mayor a 0 (en COP)'),
  descripcion: z.string().max(500, 'La descripción no puede exceder 500 caracteres').optional(),
  plazo_dias: z
    .number()
    .int('El plazo debe ser un número entero')
    .min(30, 'Mínimo 30 días')
    .max(365, 'Máximo 365 días'),
  numero_cuotas: z
    .number()
    .int('El número de cuotas debe ser un número entero')
    .min(1, 'Mínimo 1 cuota')
    .max(60, 'Máximo 60 cuotas')
    .optional()
    .default(1),
}).strict();

/** Inferred TypeScript type from the schema */
export type SolicitarCreditoInput = z.infer<typeof SolicitarCreditoSchema>;

/**
 * Convenience wrapper that validates credit request input and returns a typed result.
 *
 * @param input - Raw request body (unknown)
 * @returns Parsed and validated SolicitarCreditoInput or ZodError
 */
export function validateSolicitarCredito(
  input: unknown,
): { success: true; data: SolicitarCreditoInput } | { success: false; error: z.ZodError } {
  return SolicitarCreditoSchema.safeParse(input);
}
