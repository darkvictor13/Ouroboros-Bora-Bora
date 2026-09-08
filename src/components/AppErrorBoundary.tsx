'use client';

import React from 'react';
import * as Sentry from '@sentry/react';

/**
 * Barreira de erro de render.
 *
 * O app não tinha nenhuma: como `output: 'export'` dispensou o App Router de servidor, não há
 * `error.tsx` nem `global-error.tsx`, e uma exceção no render virava **tela branca** — sem
 * mensagem para o usuário e sem nada reportado.
 *
 * Funciona mesmo sem o Sentry inicializado (sem DSN, o `captureException` é no-op). O que se
 * ganha com DSN é o `eventId` exibido abaixo, que liga o relato do usuário à issue.
 */
export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <Sentry.ErrorBoundary fallback={({ error, resetError, eventId }) => (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 text-center">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Algo deu errado
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            A tela não conseguiu carregar. Seus dados de estudo estão salvos — nada foi perdido.
          </p>
          <div className="mt-6 flex gap-2 justify-center">
            {/* `resetError` remonta a árvore: resolve o erro transitório sem recarregar o
                bundle inteiro. Recarregar fica como segunda opção, para o erro que persiste. */}
            <button
              onClick={resetError}
              className="py-2 px-4 bg-brand-500 text-white rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-brand-600 dark:focus:ring-brand-300"
            >
              Tentar de novo
            </button>
            <button
              onClick={() => window.location.reload()}
              className="py-2 px-4 bg-gray-200 text-gray-800 rounded-lg dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              Recarregar
            </button>
          </div>
          {eventId && (
            <p className="mt-4 text-xs font-mono text-gray-400 dark:text-gray-500 break-all">
              {eventId}
            </p>
          )}
          {/* A mensagem crua só em desenvolvimento: em produção ela não ajuda o usuário e pode
              carregar detalhe interno. */}
          {process.env.NODE_ENV !== 'production' && (
            <pre className="mt-4 text-left text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap break-all">
              {error instanceof Error ? error.message : String(error)}
            </pre>
          )}
        </div>
      </div>
    )}>
      {children}
    </Sentry.ErrorBoundary>
  );
}
