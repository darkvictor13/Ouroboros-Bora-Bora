import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente do Supabase para o browser.
 *
 * Usa `createBrowserClient` (e não `createClient`) porque ele guarda a sessão em
 * cookies em vez de localStorage. Enquanto a Fase 3 não terminar, as server
 * actions ainda precisam ler quem é o usuário — e cookie é a única coisa que
 * chega até lá. Ver `./server.ts`.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY não estão definidas. ' +
        'Copie .env.local.example para .env.local e preencha as duas.'
    );
  }

  // Um cliente por aba: cada instância abre seu próprio listener de
  // `onAuthStateChange` e seu próprio timer de refresh do token.
  if (!client) {
    client = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }

  return client;
}
