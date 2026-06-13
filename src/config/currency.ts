// =============================================================================
// Currency Configuration — COPm
// =============================================================================
//
// With COPm (Mento Colombian Peso), the token IS the local currency.
// No conversion needed — 1 COPm = 1 COP.
//
// All credit amounts are stored as COPm values (human-readable).
// Wei conversion only happens at the blockchain boundary.
// =============================================================================

/**
 * Default interest rate for all credits (10%).
 * In production this could come from env vars or a config table.
 */
export const INTERES_PORCENTAJE = 10;
