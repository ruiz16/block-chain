// =============================================================================
// Zod Validation Schema — POST /api/pago
// =============================================================================
//
// Each payment is tied to a single cuota (not the entire credit). The API
// accepts cuota_id and tx_hash, then verifies the on-chain transfer matches
// the expected cuota amount.
// =============================================================================

import { z } from 'zod';

/**
 * Schema for the payment registration request.
 * Validates cuota_id as UUID and tx_hash as 0x-prefixed 64-char hex string.
 */
export const PagoSchema = z.object({
  cuota_id: z.string().uuid('cuota_id debe ser un UUID válido'),
  tx_hash: z
    .string()
    .regex(
      /^0x[a-f0-9]{64}$/i,
      'tx_hash debe ser un hash válido de 64 hex chars con prefijo 0x',
    ),
}).strict();

/** Inferred TypeScript type from the schema */
export type PagoInput = z.infer<typeof PagoSchema>;

/**
 * Convenience wrapper that validates input and returns a typed result.
 *
 * @param input - Raw request body (unknown)
 * @returns Parsed and validated PagoInput or ZodError
 */
export function validatePago(
  input: unknown,
): { success: true; data: PagoInput } | { success: false; error: z.ZodError } {
  const result = PagoSchema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, error: result.error };
}
