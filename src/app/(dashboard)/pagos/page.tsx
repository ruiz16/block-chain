// =============================================================================
// Pagos Page — Panel de Pagos
// =============================================================================
//
// Server component wrapping the PanelPagos client component.
// PanelPagos handles its own data fetching from GET /api/mis-creditos.
//
// Route: /pagos
// =============================================================================

import PanelPagos from '@/components/pagos/PanelPagos';
import { PageHeader } from '@/components/ui';

export const metadata = {
  title: 'Mis Pagos — BlockChain',
  description: 'Registra el pago de tus créditos activos',
};

export default function PagosPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <PageHeader
        title="Mis Pagos"
        subtitle="Paga tus cuotas directamente con MetaMask. Necesitas cUSD en tu wallet de Celo Sepolia."
      />

      <PanelPagos />
    </div>
  );
}
