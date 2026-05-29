// =============================================================================
// Zod Validation Schema — POST /api/desembolso
// =============================================================================

import { z } from 'zod';

/**
 * Schema for the disbursement request.
 * Accepts only a valid UUID `credito_id`.
 */
export const DesembolsoSchema = z.object({
  credito_id: z
    .string()
    .min(1, 'credito_id es requerido')
    .uuid('credito_id debe ser un UUID válido'),
}).strict();

/** Inferred TypeScript type from the schema */
export type DesembolsoInput = z.infer<typeof DesembolsoSchema>;

/**
 * Convenience wrapper that validates input and returns a typed result.
 *
 * @param input - Raw request body (unknown)
 * @returns Parsed and validated DesembolsoInput or ZodError
 */
export function validateDesembolso(
  input: unknown,
): { success: true; data: DesembolsoInput } | { success: false; error: z.ZodError } {
  const result = DesembolsoSchema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, error: result.error };
}
