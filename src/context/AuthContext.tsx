'use client';

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import * as Sentry from '@sentry/react';
import { createClient } from '@/lib/supabase/client';

/**
 * Substitui o `SessionProvider` do NextAuth.
 *
 * Mantém de propósito o vocabulário de `status` que o NextAuth usava
 * (`loading` | `authenticated` | `unauthenticated`), porque metade da árvore de
 * componentes já decide o que renderizar com base nessas três strings.
 */
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  status: AuthStatus;
  /** Nome de exibição: o `username` de `profiles`, com o e-mail como reserva. */
  username: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const supabase = useMemo(() => createClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    // `onAuthStateChange` dispara com o evento INITIAL_SESSION assim que o
    // cliente termina de ler o cookie, então ele já cobre a carga inicial.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      if (!ativo) return;
      setSession(novaSessao);
      setStatus(novaSessao ? 'authenticated' : 'unauthenticated');
    });

    return () => {
      ativo = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const user = session?.user ?? null;
  const userId = user?.id ?? null;

  // Identidade no Sentry: só o `id`, nunca o e-mail — ele é a credencial de login e não tem por
  // que existir fora do Supabase. No-op quando o Sentry não foi inicializado (sem DSN).
  useEffect(() => {
    Sentry.setUser(userId ? { id: userId } : null);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setUsername(null);
      return;
    }

    let ativo = true;

    // `profiles` é a fonte de verdade do username (o trigger
    // `on_auth_user_created` o preenche a partir do cadastro). O
    // `user_metadata` é só o que o cliente mandou e não acompanha renomeações.
    supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!ativo) return;
        setUsername(
          data?.username ??
            (user?.user_metadata?.username as string | undefined) ??
            user?.email?.split('@')[0] ??
            null
        );
      });

    return () => {
      ativo = false;
    };
  }, [supabase, userId, user?.email, user?.user_metadata?.username]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, [supabase]);

  const value = useMemo(
    () => ({ user, session, status, username, signOut }),
    [user, session, status, username, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth precisa ser usado dentro de um AuthProvider');
  }
  return context;
};
