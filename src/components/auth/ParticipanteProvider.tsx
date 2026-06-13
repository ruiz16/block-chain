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
  const { user } = useAuth();
  const [participante, setParticipante] = useState<Participante | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setParticipante(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetch('/api/participantes?check_existing=true')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setParticipante(data.exists && data.participante ? data.participante : null);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setParticipante(null);
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [user]);

  return (
    <ParticipanteContext.Provider value={{ participante, isLoading }}>
      {children}
    </ParticipanteContext.Provider>
  );
}
