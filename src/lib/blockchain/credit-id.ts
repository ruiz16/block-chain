// =============================================================================
// creditIdHash — UUID del crédito → bytes32 determinista para el LendingPool
// =============================================================================
//
// El contrato indexa créditos por `bytes32 creditId`. La DB usa UUIDs (string).
// Usamos keccak256 del UUID en UTF-8 para obtener un bytes32 estable que se
// calcula igual en el desembolso (server) y en la verificación del repago.
// =============================================================================

import { keccak256, stringToHex } from 'viem';

/**
 * Convierte un UUID de crédito en el bytes32 usado on-chain.
 *
 * @param creditoId - UUID del crédito (string)
 * @returns hash 0x-prefijado de 32 bytes
 */
export function creditIdHash(creditoId: string): `0x${string}` {
  return keccak256(stringToHex(creditoId));
}
