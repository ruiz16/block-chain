// =============================================================================
// Currency Configuration — COP ↔ cUSD conversion
// =============================================================================
//
// All credit amounts are stored in cUSD (18-decimal Wei) for blockchain
// compatibility, but the UI shows COP because the app targets Colombian users.
//
// The exchange rate is read from NEXT_PUBLIC_COP_USD_RATE (env var, REQUIRED)
// and is hardcoded per deployment (not live) to avoid external API dependencies.
// In a production app this could be a daily cron that fetches from a TRM or
// exchange rate API.
//
// Required env var:
//   NEXT_PUBLIC_COP_USD_RATE  — e.g., "3633.45" (COP per 1 cUSD)
// =============================================================================

/**
 * Returns the COP/USD exchange rate from environment variables.
 * Throws if NEXT_PUBLIC_COP_USD_RATE is not set or is not a valid number.
 */
function getCopUsdRate(): number {
  const raw = process.env.NEXT_PUBLIC_COP_USD_RATE;
  if (!raw) {
    throw new Error(
      'Falta NEXT_PUBLIC_COP_USD_RATE en las variables de entorno. ' +
        'Ejemplo: NEXT_PUBLIC_COP_USD_RATE=3633.45',
    );
  }

  const rate = Number(raw);

  if (Number.isNaN(rate) || rate <= 0) {
    throw new Error(
      `NEXT_PUBLIC_COP_USD_RATE debe ser un número positivo, se recibió: "${raw}"`,
    );
  }

  return rate;
}

/**
 * Converts COP (Colombian Pesos) to cUSD (Celo Dollars).
 *
 * @param cop - Amount in COP (e.g., 1_000_000 for $1.000.000 COP)
 * @returns Amount in cUSD (as a plain number, not Wei)
 *
 * @example
 *   copToCusd(1_000_000)  // => 275.23 (con 1 cUSD = 3633.45 COP)
 */
export function copToCusd(cop: number): number {
  return Math.round((cop / getCopUsdRate()) * 100) / 100; // 2 decimales
}

/**
 * Converts cUSD to COP for display.
 *
 * @param cusd - Amount in cUSD
 * @returns Amount in COP (as a plain number)
 *
 * @example
 *   cusdToCop(275.23)  // => 1_000_000 (con 1 cUSD = 3633.45 COP)
 */
export function cusdToCop(cusd: number): number {
  return Math.round(cusd * getCopUsdRate());
}
