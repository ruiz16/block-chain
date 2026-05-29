// =============================================================================
// Zod Validation Schema — POST /api/pago
// =============================================================================

import { z } from 'zod';

/**
 * Schema for the payment registration request.
 * Validates credito_id as UUID and tx_hash as 0x-prefixed 64-char hex string.
 */
export const PagoSchema = z.object({
  credito_id: z.string().uuid('credito_id debe ser un UUID válido'),
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
