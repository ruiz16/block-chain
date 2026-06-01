'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import NotificacionItem from '@/components/notificaciones/NotificacionItem';
import { PageHeader, LoadingSkeleton, ErrorAlert, EmptyState, Pagination, CardSection } from '@/components/ui';

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
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  const fetchNotificaciones = useCallback(async (newOffset: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/notificaciones?limit=${limit}&offset=${newOffset}`);
      if (!res.ok) throw new Error('Error al cargar');
      const data = await res.json();
      setNotificaciones(data.notificaciones ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar notificaciones');
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

  const handlePageChange = (newPage: number) => {
    const newOffset = (newPage - 1) * limit;
    setOffset(newOffset);
    fetchNotificaciones(newOffset);
  };

  if (authLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <LoadingSkeleton variant="text" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <PageHeader title="Notificaciones" subtitle={`${total} notificaciones`} />

      {error && (
        <div className="mb-4">
          <ErrorAlert message={error} onRetry={() => fetchNotificaciones(offset)} />
        </div>
      )}

      {loading ? (
        <LoadingSkeleton variant="text" />
      ) : notificaciones.length === 0 ? (
        <EmptyState title="Sin notificaciones" description="No tienes notificaciones" />
      ) : (
        <CardSection title="Notificaciones">
          {notificaciones.map(n => (
            <NotificacionItem
              key={n.id}
              {...n}
              onMarcarLeida={handleMarcarLeida}
            />
          ))}
        </CardSection>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        label="notificaciones"
        onPageChange={handlePageChange}
      />
    </div>
  );
}
