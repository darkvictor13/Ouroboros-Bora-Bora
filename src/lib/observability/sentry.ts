import * as Sentry from '@sentry/react';

import { createClient } from '@/lib/supabase/client';

/**
 * Inicialização do Sentry.
 *
 * Três decisões estão codificadas aqui, e todas vêm do `PLANO-SENTRY.md`:
 *
 * 1. **`@sentry/react`, não `@sentry/nextjs`.** O app é `output: 'export'`: não existe runtime
 *    Node nem Edge para instrumentar. O SDK do Next subiria artifact bundles de server/edge num
 *    build estático e implementa o `tunnelRoute` com `rewrites`, que o próprio `output: 'export'`
 *    proíbe. Perda assumida: sem túnel, bloqueador de anúncio corta parte dos eventos.
 * 2. **Sem DSN, não inicializa.** `npm run dev` e build local não gastam a quota de ninguém.
 * 3. **O teto do plano Free é 5.000 erros/mês para a organização inteira** — staging e produção
 *    somados. Quando acaba, o Sentry descarta em silêncio. Por isso `ignoreErrors`/`denyUrls`
 *    abaixo não são higiene: são o que mantém produção observável no dia 28 do mês.
 */

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

let iniciado = false;

export function initSentry(): void {
  // Client component também roda no Node durante o `next build` (é assim que o HTML estático
  // nasce). O SDK do browser não tem o que fazer ali.
  if (typeof window === 'undefined') return;
  if (iniciado || !dsn) return;
  iniciado = true;

  Sentry.init({
    dsn,
    // Vem do environment do GitHub em cada deploy (`staging` / `production`). O default só
    // aparece se alguém puser um DSN no `.env.local`.
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'development',
    // O SHA do commit, o mesmo que o `@sentry/webpack-plugin` usa ao subir os sourcemaps.
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,

    // Desde a Fase 5 a RLS é a única camada de segurança dos dados, e isto é a primeira coisa
    // que copia dado de usuário para fora do Supabase. Nada de IP, cookie ou header.
    sendDefaultPii: false,

    integrations: [
      // Transforma "erro em src/lib/data/index.ts" em "qual operação, em qual tabela, com qual
      // código do Postgres". `createClient` é singleton, então este é o mesmo cliente que o
      // AuthContext usa.
      ...construirIntegracaoSupabase(),
    ],

    // Nem tracing nem replay entram por ora, e é por isso que as integrações dos dois estão
    // ausentes em vez de sampleadas em 0: integração não adicionada não vai para o bundle.
    // Replay são 50/mês no Free — esgota numa tarde ruim, sem avisar. Tracing tem 5M spans,
    // que é folgado, mas span que ninguém lê é ruído; entra quando houver pergunta de
    // performance para responder.

    ignoreErrors: [
      // Ruído estrutural de browser, sem stack acionável.
      /ResizeObserver loop/,
      'Non-Error promise rejection captured',
      // Erro de rede do usuário, não do app. Trade-off consciente: isto também esconde
      // Supabase fora do ar. O sinal de indisponibilidade vem do uptime monitor, que é o lugar
      // certo para ele — e não de 4.000 eventos de celular em elevador.
      /Failed to fetch/,
      'Load failed',
      'NetworkError when attempting to fetch resource.',
      // Requisição que o próprio app cancelou (troca de rota no meio de um fetch).
      'AbortError',
    ],

    // Extensão de browser quebrando a página do usuário não é bug nosso — e é uma das duas
    // maiores fontes de evento inútil em SPA pública.
    denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari-(web-)?extension:\/\//],

    beforeSend(event) {
      // Rede de segurança para a regra do §6 do PLANO-SENTRY.md: só o `id` do usuário sai
      // daqui. Se algum dia alguém chamar `setUser` com e-mail — que é a credencial de login —,
      // este filtro joga fora antes de sair da aba.
      if (event.user) {
        event.user = event.user.id ? { id: event.user.id } : undefined;
      }
      return event;
    },
  });
}

function construirIntegracaoSupabase() {
  try {
    return [
      Sentry.supabaseIntegration({
        supabaseClient: createClient(),
        // O corpo de um `study_records` é o conteúdo de estudo do usuário, e o filtro de uma
        // query carrega ids dele. O default já redige os dois; explícito para que ligar isso
        // seja uma decisão, nunca um descuido.
        sendOperationData: false,
      }),
    ];
  } catch {
    // `createClient` lança se as variáveis do Supabase faltam. Nesse caso o app está quebrado
    // de qualquer forma; o que não pode é o Sentry morrer junto e levar o relatório do erro.
    return [];
  }
}
