'use client';

import { useState, useEffect } from 'react';

interface MiembroRed {
  id: string;
  nombre: string;
  score_efectivo: number;
  es_referidora: boolean;
}

interface RedInfo {
  id: string;
  nombre: string;
  score_red: number;
  estado: string;
}

export default function RedCard() {
  const [red, setRed] = useState<RedInfo | null>(null);
  const [miembros, setMiembros] = useState<MiembroRed[]>([]);
  const [loading, setLoading] = useState(true);
  const [codigo, setCodigo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch('/api/referidos/mi-red').then(r => r.json()),
      fetch('/api/participantes/me').then(r => r.json()),
    ]).then(([redData, perfilData]) => {
      if (cancelled) return;
      setRed(redData.red ?? null);
      setMiembros(redData.miembros ?? []);
      setCodigo(perfilData.participante?.codigo_referido ?? null);
    }).catch(() => {
      // No hacer nada — simplemente no mostrar la red
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  if (loading) return null;
  if (!red) return null;

  const estadoColor = red.estado === 'verde' ? 'text-green-600 bg-green-100'
    : red.estado === 'amarillo' ? 'text-yellow-600 bg-yellow-100'
    : 'text-red-600 bg-red-100';

  const estadoLabel = red.estado === 'verde' ? 'Al día'
    : red.estado === 'amarillo' ? 'Alerta de apoyo'
    : 'Restringido';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Mi Red de Apoyo</h2>
      </div>
      <div className="px-6 py-4 space-y-4">
        {/* Info de la red */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{red.nombre}</p>
            <p className="text-xs text-gray-400">Score de red: <span className="font-semibold">{red.score_red}/100</span></p>
          </div>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${estadoColor}`}>
            {estadoLabel}
          </span>
        </div>

        {/* Código de referido */}
        {codigo && (
          <div className="bg-gray-50 dark:bg-gray-900 rounded-md p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Tu código de referido</p>
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-600">
                {codigo}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(codigo)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Copiar
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Compartí este código con otras emprendedoras para que se unan a tu red.
            </p>
          </div>
        )}

        {/* Miembros */}
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Miembros ({miembros.length})
          </p>
          <ul className="space-y-2">
            {miembros.map(m => (
              <li key={m.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700 dark:text-gray-300">
                  {m.nombre}
                  {m.es_referidora && (
                    <span className="ml-1 text-xs text-blue-500">(Referidora)</span>
                  )}
                </span>
                <span className="text-gray-500">{m.score_efectivo}/100</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
