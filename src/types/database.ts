// =============================================================================
// Branded Types — catch parameter confusion at compile time
// =============================================================================

/**
 * Generic brand type. Use to create nominal (branded) subtypes:
 *
 *   type Wei = Brand<bigint, 'Wei'>;
 *   type Address = Brand<\`0x${string}\`, 'Address'>;
 *
 * Branded types prevent passing e.g. an Address where a TxHash is expected.
 */
export type Brand<K, T> = K & { __brand: T };

/** Token amount in wei (smallest unit, 18 decimals — used for COPm) */
export type Wei = Brand<bigint, 'Wei'>;

/** Celo wallet address (0x-prefixed hex string) */
export type Address = Brand<`0x${string}`, 'Address'>;

/** Transaction hash on Celo (0x-prefixed hex string) */
export type TxHash = Brand<`0x${string}`, 'TxHash'>;

// =============================================================================
// Database Enums (union types matching SQL enums)
// =============================================================================

export type RolParticipante = 'usuario' | 'admin';

export type EstadoCredito =
  | 'pendiente'
  | 'avalado'
  | 'aprobado'
  | 'desembolsado'
  | 'pagado'
  | 'default'
  | 'expirado';

/**
 * Possible audit log action values.
 * Matches the `tipo_accion` Postgres enum.
 */
// =============================================================================
// Education Types — matches supabase/migrations/021_educacion.sql
// =============================================================================

export interface EduModuloRow {
  id: string;
  orden: number;
  sender: 'system' | 'whatsapp_fld';
  mensaje: string;
  created_at: string;
}

export interface EduProgresoRow {
  id: string;
  participante_id: string;
  modulo_actual: number;
  completado: boolean;
  actualizado_en: string;
}

export interface EduProgresoResponse {
  modulo_actual: number;
  completado: boolean;
  modulos_totales: number;
}

export type TipoAccion =
  | 'credito_creado'
  | 'credito_aprobado'
  | 'desembolso'
  | 'desembolso_fallo'
  | 'pago_recibido'
  | 'interes_barrido'
  | 'default_registrado'
  | 'score_actualizado'
  | 'aval_agregado'
  | 'aval_revocado'
  | 'gacc_creado'
  | 'gacc_miembro_validado'
  | 'gacc_miembro_unido';

// =============================================================================
// Database Row Types (matches supabase/migrations/001_schema.sql)
// =============================================================================

export interface ParticipanteRow {
  id: string;
  created_at: string;
  wallet_address: string;
  nombre: string;
  rol: RolParticipante;
  oficio: string | null;         // Oficio/ocupación — added in migration 027
  user_id: string;               // FK to auth.users(id) — added in migration 003
  score_reputacion: number;
  activo: boolean;
  auth_password?: string | null; // Auto-generated SIWE password — added in migration 007
  gacc_id?: string | null;       // GACC al que pertenece — added in migration 010
  validado_gacc?: boolean;       // Validado por el GACC — added in migration 010
  telefono: string;              // Número de celular — added in migration 018
  email: string;                 // Correo real del usuario — added in migration 019
}

/** SIWE nonce row — matches supabase/migrations/007_siwe.sql */
export interface SiweNonceRow {
  id: string;
  nonce: string;
  wallet_address: string;
  expires_at: string;    // timestamptz ISO string
  created_at: string;    // timestamptz ISO string
}

export type MonedaCredito = 'COPm';

export interface CreditoRow {
  id: string;
  prestatario_id: string;
  referadora_id: string | null; // Referadora elegida por crédito (aval 1/2) — migration 029
  monto: string; // NUMERIC(40,0) from Postgres — COPm value (human-readable)
  descripcion: string | null;
  estado: EstadoCredito;
  uso: string;                   // Propósito del crédito — added in migration 022
  moneda: string;                // Moneda (siempre 'COPm') — added in migration 017
  interes_porcentaje: number | string; // NUMERIC(5,2) from Postgres
  plazo_dias: number;
  numero_cuotas: number;
  fecha_vencimiento: string | null;
  expiracion_en: string | null;  // Fecha de expiración — added in migration 023
  repayment_mode: string;        // 'legacy' | 'pool' — added in migration 024
  tx_hash: string | null;
  tx_hash_pago: string | null;
  fecha_solicitud: string;
  fecha_actualizacion: string;
  fecha_pago: string | null;
}

export interface AvalRow {
  id: string;
  aval_id: string;
  prestatario_id: string;
  credito_id: string;
  monto_maximo: string; // NUMERIC from Postgres
  fecha_creacion: string;
  activo: boolean;
  rol_aval: 'referadora' | 'lider' | null; // Rol en el circuito GACC — migration 029
}

export interface CuotaRow {
  id: string;
  credito_id: string;
  numero_cuota: number;
  monto_capital: string; // NUMERIC(40,0) from Postgres — COPm value (human-readable)
  monto_interes: string; // NUMERIC(40,0) — COPm value (human-readable)
  monto_cuota: string; // NUMERIC(40,0) — capital + interest, COPm value (human-readable)
  saldo_restante: string; // NUMERIC(40,0) — COPm value (human-readable)
  fecha_vencimiento: string;
  estado: 'pendiente' | 'pagada' | 'vencida';
  tx_hash_pago: string | null;
  fecha_pago: string | null;
  fecha_creacion: string;
}

export interface GrupoGaccRow {
  id: string;
  nombre: string;
  descripcion: string | null;
  codigo: string;
  creador_id: string | null;     // Nullable — admin can create GACCs without belonging
  activo: boolean;
  created_at: string;
  municipio: string | null;      // Municipio donde opera — added in migration 026
  email_lider: string | null;    // Correo del Líder Social pre-asignado por el FLD — migration 029
  lider_id: string | null;       // Participante resuelto como Líder Social — migration 029
  score_gacc: number | string;   // NUMERIC(5,2) — media de scores del grupo — migration 029
  estado: 'activo' | 'restringido' | 'inactivo'; // Estado operativo — migration 029
}

export interface GaccMiembroRow {
  id: string;
  grupo_id: string;
  participante_id: string;
  validado_por: string | null;
  validado_en: string | null;
  activo: boolean;
  created_at: string;
}

export interface AuditLogRow {
  id: number;
  accion: TipoAccion;
  entidad_tipo: string;
  entidad_id: string;
  participante_id: string | null;
  detalles: Record<string, unknown>;
  fecha: string;
}

// =============================================================================
// UI-specific Types
// =============================================================================

/** Credit record for the PanelAprobacion component */
export interface CreditoPendiente {
  id: string;
  monto: number; // COPm decimal
  solicitante: string; // nombre del prestatario
  score: number; // reputation 0-100
  fecha: string; // ISO date string
  estado?: EstadoCredito; // current credit state (for aval badge)
  prestatarioId?: string; // prestatario UUID (for GestorAvales)
  avalCount?: number; // count of active avales
}

/** Input for POST /api/creditos */
export interface SolicitarCreditoInput {
  monto: number;
  uso: string;
  descripcion?: string;
  plazo_dias: number;
}

/** Input for POST /api/avales */
export interface AsignarAvalInput {
  credito_id: string;
  avalador_id: string;
}

/** Aval row joined with avalador participant data */
export interface AvalConParticipante extends AvalRow {
  avalador_nombre: string;
  avalador_wallet: string;
}

/** GACC miembro row joined with participant data */
export interface GaccMiembroConParticipante extends GaccMiembroRow {
  participante_nombre: string;
  participante_wallet: string;
  score_reputacion: number;
}

/** GACC row with member count */
export interface GrupoGaccConMiembros extends GrupoGaccRow {
  miembro_count: number;
  validado_count: number;
}

// =============================================================================
// API Response Types
// =============================================================================

/**
 * Discriminated union for all API responses.
 *
 * Use `ApiResult<T>` instead of ad-hoc `{ data?: T; error?: string }`
 * so that callers MUST check `.success` before accessing `.data`:
 *
 *   const result: ApiResult<CreditoRow> = await getCreditos();
 *   if (result.success) {
 *     console.log(result.data);   // ✅ typed as CreditoRow
 *   } else {
 *     console.error(result.error); // ✅ typed as string
 *   }
 */
export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; detail?: string };

/** Successful credit approval response */
export interface AprobarCreditoResponse {
  status: 'aprobado';
  credito_id: string;
}

/** Successful disbursement response */
export interface DesembolsoResponse {
  status: 'desembolsado';
  tx_hash: string;
}

/** Error response body */
export interface ErrorResponse {
  error: string;
  detail?: string;
}

/** Successful payment registration response (per-cuota payment) */
export interface PagoResponse {
  status: 'pagado';
  cuota_id: string;
  credito_id: string;
}

/** Result of on-chain payment verification */
export type VerificationResult =
  | { valid: true }
  | { valid: false; reason: string };
