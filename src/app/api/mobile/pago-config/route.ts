// =============================================================================
// GET /api/mobile/pago-config — Chain Config for Mobile Payment Flow
// =============================================================================
//
// Returns the on-chain addresses the mobile needs to execute a COPm payment:
//   - copmAddress: The COPm ERC-20 contract (where to send the tx)
//   - platformWallet: The platform's wallet (beneficiary of Transfer event)
//
// The mobile uses these to call writeContract (transfer) and then POST /api/pago
// with the resulting tx_hash.
// =============================================================================

import { NextResponse } from 'next/server';
import { getCopmContractAddress, getPlatformWalletAddressPublic } from '@/config/celo';

export async function GET(): Promise<Response> {
  try {
    return NextResponse.json(
      {
        copmAddress: getCopmContractAddress(),
        platformWallet: getPlatformWalletAddressPublic(),
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[mobile/pago-config] Error:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: 'Error al obtener configuración de pago' },
      { status: 500 },
    );
  }
}
