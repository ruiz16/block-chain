// =============================================================================
// Currency Configuration — COPm
// =============================================================================
//
// With COPm (Mento Colombian Peso), the token IS the local currency.
// No conversion needed — 1 COPm = 1 COP.
//
// All credit amounts are stored as COPm wei (18 decimals) directly.
// The old COP ↔ cUSD conversion layer has been removed.
// =============================================================================

/**
 * Default interest rate for all credits (10%).
 * In production this could come from env vars or a config table.
 */
export const INTERES_PORCENTAJE = 10;
