import { z } from 'zod/v4';

export const CodigoReferidoSchema = z.object({
  codigo_referido: z.string().min(8).max(40).optional(),
});

export type CodigoReferidoInput = z.infer<typeof CodigoReferidoSchema>;
