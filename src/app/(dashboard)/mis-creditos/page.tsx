// =============================================================================
// Mis Créditos Page — Todos mis créditos
// =============================================================================
//
// Server component wrapping MisCreditosClient.
// MisCreditosClient handles its own data fetching from GET /api/mis-creditos.
//
// Route: /mis-creditos
// =============================================================================

import MisCreditosClient from '@/components/pagos/MisCreditosClient';

export const metadata = {
  title: 'Mis Créditos — BlockChain',
  description: 'Consulta todos tus créditos registrados en la plataforma',
};

export default function MisCreditosPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Mis Créditos</h1>
        <p className="mt-1 text-sm text-gray-500">
          Todos tus créditos registrados en la plataforma
        </p>
      </div>

      <MisCreditosClient />
    </div>
  );
}
