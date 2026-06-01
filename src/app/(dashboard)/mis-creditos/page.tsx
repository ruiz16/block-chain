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
import { PageHeader } from '@/components/ui';

export const metadata = {
  title: 'Mis Créditos — BlockChain',
  description: 'Consulta todos tus créditos registrados en la plataforma',
};

export default function MisCreditosPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <PageHeader
        title="Mis Créditos"
        subtitle="Todos tus créditos registrados en la plataforma"
      />

      <MisCreditosClient />
    </div>
  );
}
