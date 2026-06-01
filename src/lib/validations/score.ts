// =============================================================================
// Score Validations — Zod Schemas
// =============================================================================

import { z } from 'zod/v4';

// ---------------------------------------------------------------------------
// GET /api/participantes/score/historial
// ---------------------------------------------------------------------------

export const HistorialScoreQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// ---------------------------------------------------------------------------
// POST /api/admin/recalcular-score
// ---------------------------------------------------------------------------

export const RecalcularScoreSchema = z.object({
  participante_id: z.string().uuid().optional(),
});
