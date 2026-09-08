'use client';

import React from 'react';
import { AuthProvider } from '@/context/AuthContext';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { initSentry } from '@/lib/observability/sentry';

// No escopo do módulo, e não num `useEffect`: assim a instrumentação existe antes do primeiro
// render e antes da primeira query ao Supabase. `initSentry` é idempotente e não faz nada no
// Node (o build estático executa este módulo) nem sem DSN.
initSentry();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // Fora do AuthProvider de propósito: erro na montagem da autenticação também precisa cair
    // na barreira, e não na tela branca.
    <AppErrorBoundary>
      <AuthProvider>
        {children}
      </AuthProvider>
    </AppErrorBoundary>
  );
}
