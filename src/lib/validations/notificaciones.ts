import { z } from 'zod/v4';

export const NotificacionQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const MarcarLeidaSchema = z.object({
  notificacion_id: z.string().uuid(),
});

export type NotificacionQueryInput = z.infer<typeof NotificacionQuerySchema>;
