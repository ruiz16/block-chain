'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';

interface Participante {
  id: string;
  nombre: string;
  rol: string;
  wallet_address: string;
  gacc_id: string | null;
  validado_gacc: boolean;
}

interface ParticipanteContextValue {
  participante: Participante | null;
  isLoading: boolean;
}

const ParticipanteContext = createContext<ParticipanteContextValue | null>(null);

export function useParticipante(): ParticipanteContextValue {
  const ctx = useContext(ParticipanteContext);
  if (!ctx) {
    throw new Error(
      'useParticipante debe usarse dentro de <ParticipanteProvider>.',
    );
  }
  return ctx;
}

interface ParticipanteProviderProps {
  children: ReactNode;
}

export default function ParticipanteProvider({ children }: ParticipanteProviderProps) {
  const { user, isLoading: authLoading } = useAuth();
  const [participante, setParticipante] = useState<Participante | null>(null);
  
  // Flag para saber si la API de participantes ya fue consultada con éxito
  const [hasFetched, setHasFetched] = useState(false);

  useEffect(() => {
    // Si la autenticación sigue cargando, no hacemos nada todavía
    if (authLoading) return;

    // Si terminó la autenticación y no hay usuario, limpiamos el estado silenciosamente
    if (!user) {
      return;
    }

    let cancelled = false;

    fetch('/api/participantes?check_existing=true')
      .then((res) => {
        if (!res.ok) throw new Error('Error al obtener datos');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setParticipante(data.exists && data.participante ? data.participante : null);
          setHasFetched(true); // Cambiamos el estado de manera asíncrona tras la respuesta
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[ParticipanteProvider] fetch failed:', err);
          setParticipante(null);
          setHasFetched(true); // Marcamos como finalizado incluso si falla
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  // LA MAGIA: El estado de carga se calcula en base a la lógica del flujo, 
  // previniendo cualquier setState síncrono que rompa a React.
  const isLoading = authLoading || (user !== null && !hasFetched);

  return (
    <ParticipanteContext.Provider value={{ participante, isLoading }}>
      {children}
    </ParticipanteContext.Provider>
  );
}