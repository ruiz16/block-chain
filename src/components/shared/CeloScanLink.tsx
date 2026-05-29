// =============================================================================
// CeloScanLink — Open transaction in CeloScan explorer
// =============================================================================
//
// Pure presentational component. Renders an anchor that opens the
// Celo Alfajores block explorer to view a specific transaction.
// =============================================================================

import { getCeloScanUrl } from '@/config/celo';
import type { TxHash } from '@/types/database';

interface CeloScanLinkProps {
  /** Transaction hash to link to */
  txHash: string;
  /** Optional custom label (default: "Ver en CeloScan") */
  label?: string;
}

/**
 * Renders a link to view a transaction on CeloScan.
 *
 * Features:
 * - Opens in new tab with security attributes
 * - Accessible aria-label
 * - Styled as a subtle blue link
 */
export default function CeloScanLink({ txHash, label }: CeloScanLinkProps) {
  const url = getCeloScanUrl(txHash as TxHash);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Ver transacción en CeloScan"
      className="text-blue-600 hover:underline text-sm"
    >
      {label ?? 'Ver en CeloScan'}
    </a>
  );
}
