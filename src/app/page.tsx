'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { useParticipante } from '@/components/auth/ParticipanteProvider';

export default function Home() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { participante, isLoading: participanteLoading } = useParticipante();

  useEffect(() => {
    if (authLoading || participanteLoading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    if (!participante) {
      router.replace('/onboarding');
      return;
    }

    if (participante.rol === 'usuario') {
      if (!participante.gacc_id) {
        router.replace('/gacc');
      } else {
        router.replace('/mis-creditos');
      }
    } else {
      router.replace('/aprobacion');
    }
  }, [authLoading, participanteLoading, user, participante, router]);

  return (
    <div className="flex items-center justify-center min-h-screen" role="status">
      <div className="flex flex-col items-center gap-3">
        <svg
          className="animate-spin h-8 w-8 text-blue-600"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <p className="text-sm text-gray-500">Verificando sesión…</p>
      </div>
    </div>
  );
}
