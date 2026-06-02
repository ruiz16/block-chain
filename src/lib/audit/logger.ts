// =============================================================================
// Audit Log Registration Utility
// =============================================================================
//
// Reusable utility for inserting audit_log rows. Called by the route handler
// on both success and failure paths.
//
// Audit failures are NON-BLOCKING — if the audit insert fails, we log a warning
// but do NOT prevent the response from being sent.
// =============================================================================

import { getSupabaseClient } from '@/lib/supabase/client';
import type { TipoAccion } from '@/types/database';

export interface AuditLogParams {
  accion: TipoAccion;
  entidadTipo: string;
  entidadId: string;
  participanteId?: string;
  detalles: Record<string, unknown>;
}

/**
 * Inserts a row into the audit_log table.
 *
 * Maps camelCase params to snake_case DB columns.
 * Does NOT throw — audit failures are logged with console.warn.
 *
 * @param params - Audit log parameters
 */
export async function registrarAuditLog(params: AuditLogParams): Promise<void> {
  try {
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('audit_log')
      .insert({
        accion: params.accion,
        entidad_tipo: params.entidadTipo,
        entidad_id: params.entidadId,
        participante_id: params.participanteId ?? null,
        detalles: params.detalles,
      });

    if (error) {
      console.warn(
        '[audit] Error al insertar audit_log:',
        error.message,
        { accion: params.accion, entidadId: params.entidadId },
      );
    }
  } catch (err) {
    console.warn(
      '[audit] Excepción al insertar audit_log:',
      err instanceof Error ? err.message : String(err),
      { accion: params.accion, entidadId: params.entidadId },
    );
  }
}
