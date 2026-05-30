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

export const metadata = {
  title: 'Mis Pagos — BlockChain',
  description: 'Registra el pago de tus créditos activos',
};

export default function PagosPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mis Pagos</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Paga tus cuotas directamente con MetaMask. Necesitas cUSD en tu wallet de Celo Sepolia.
        </p>
      </div>

      <PanelPagos />
    </div>
  );
}
