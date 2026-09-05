import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * PONTE TEMPORÁRIA — remover na Fase 3.
 *
 * As server actions de `src/app/actions.tsx` ainda gravam em disco e precisam
 * saber de quem é o diretório. Até a Fase 3 trocá-las por chamadas ao Postgres
 * (feitas do browser, com a RLS decidindo o que cada um enxerga), elas leem a
 * sessão do Supabase pelo cookie que o cliente do browser escreveu.
 *
 * Quando a Fase 5 ligar `output: 'export'` não existirá mais servidor, e este
 * arquivo — junto com o único uso de `cookies()` no projeto — some.
 */

function createClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY não estão definidas.'
    );
  }

  const cookieStore = cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Component só lê cookies. O refresh do token acontece no
          // browser de qualquer forma, então perder a escrita aqui é inofensivo.
        }
      },
    },
  });
}

/**
 * Devolve o usuário autenticado, ou `null`. Usa `getUser()`, que valida o JWT
 * contra o servidor de auth — `getSession()` confiaria no cookie, que é
 * entrada do cliente.
 */
export async function getAuthenticatedUser(): Promise<User | null> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return data.user;
}
