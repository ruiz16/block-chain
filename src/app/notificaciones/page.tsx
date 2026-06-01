'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import NotificacionItem from '@/components/notificaciones/NotificacionItem';

interface Notificacion {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  leida: boolean;
  created_at: string;
}

export default function NotificacionesPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const fetchNotificaciones = useCallback(async (newOffset: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/notificaciones?limit=${limit}&offset=${newOffset}`);
      if (!res.ok) throw new Error('Error al cargar');
      const data = await res.json();
      setNotificaciones(data.notificaciones ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
      return;
    }
    if (!authLoading) {
      fetchNotificaciones(0);
    }
  }, [authLoading, isAuthenticated, router, fetchNotificaciones]);

  const handleMarcarLeida = async (id: string) => {
    try {
      const res = await fetch(`/api/notificaciones/${id}/leer`, { method: 'PATCH' });
      if (res.ok) {
        setNotificaciones(prev => prev.map(n => n.id === id ? { ...n, leida: true } : n));
      }
    } catch (err) {
      console.error('Error al marcar leída:', err);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" aria-busy="true">
        <span className="text-gray-500">Cargando...</span>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Notificaciones</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{total} notificaciones</p>

      {loading ? (
        <p className="text-gray-400">Cargando notificaciones...</p>
      ) : notificaciones.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 dark:text-gray-500">No tienes notificaciones</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {notificaciones.map(n => (
            <NotificacionItem
              key={n.id}
              {...n}
              onMarcarLeida={handleMarcarLeida}
            />
          ))}
        </div>
      )}

      {/* Paginación simple */}
      {total > limit && (
        <div className="flex justify-center gap-4 mt-6">
          <button
            onClick={() => { const newOffset = Math.max(0, offset - limit); setOffset(newOffset); fetchNotificaciones(newOffset); }}
            disabled={offset === 0}
            className="text-sm text-blue-600 disabled:text-gray-400"
          >
            ← Anterior
          </button>
          <button
            onClick={() => { const newOffset = offset + limit; setOffset(newOffset); fetchNotificaciones(newOffset); }}
            disabled={offset + limit >= total}
            className="text-sm text-blue-600 disabled:text-gray-400"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
