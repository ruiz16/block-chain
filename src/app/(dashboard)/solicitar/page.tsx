// =============================================================================
// Solicitar Crédito Page — Formulario de Solicitud de Crédito
// =============================================================================
//
// Server component wrapping SolicitarCredito client component.
//
// Route: /solicitar
// =============================================================================

import SolicitarCredito from '@/components/creditos/SolicitarCredito';

export const metadata = {
  title: 'Solicitar Crédito — BlockChain',
  description: 'Solicita un nuevo crédito en la plataforma',
};

export default function SolicitarCreditoPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Solicitar Crédito</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Completa el formulario para solicitar un nuevo crédito
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <SolicitarCredito />
      </div>
    </div>
  );
}
