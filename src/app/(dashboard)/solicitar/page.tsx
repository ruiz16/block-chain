// =============================================================================
// Solicitar Crédito Page — Formulario de Solicitud de Crédito
// =============================================================================
//
// Server component wrapping SolicitarCredito client component.
//
// Route: /solicitar
// =============================================================================

import SolicitarCredito from '@/components/creditos/SolicitarCredito';
import { PageHeader, CardSection } from '@/components/ui';

export const metadata = {
  title: 'Solicitar Crédito — BlockChain',
  description: 'Solicita un nuevo crédito en la plataforma',
};

export default function SolicitarCreditoPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <PageHeader
        title="Solicitar Crédito"
        subtitle="Completa el formulario para solicitar un nuevo crédito"
      />

      <CardSection title="Nueva Solicitud">
        <div className="p-6">
          <SolicitarCredito />
        </div>
      </CardSection>
    </div>
  );
}
