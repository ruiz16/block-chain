'use client';

interface NotificacionItemProps {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  leida: boolean;
  created_at: string;
  onMarcarLeida: (id: string) => void;
}

export default function NotificacionItem({
  id, tipo, titulo, cuerpo, leida, created_at, onMarcarLeida,
}: NotificacionItemProps) {
  const fecha = new Date(created_at).toLocaleDateString('es-CO', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className={`p-4 border-b border-gray-100 dark:border-gray-700 ${!leida ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className={`text-sm ${!leida ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
            {titulo}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{cuerpo}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{fecha}</p>
        </div>
        {!leida && (
          <button
            onClick={() => onMarcarLeida(id)}
            className="ml-3 text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0"
          >
            Marcar leída
          </button>
        )}
      </div>
    </div>
  );
}
