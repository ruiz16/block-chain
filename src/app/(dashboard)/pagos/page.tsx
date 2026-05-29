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
        <h1 className="text-2xl font-bold text-gray-900">Mis Pagos</h1>
        <p className="mt-1 text-sm text-gray-500">
          Registra el pago de tus créditos activos usando el hash de la transacción en Celo
        </p>
      </div>

      <PanelPagos />
    </div>
  );
}
