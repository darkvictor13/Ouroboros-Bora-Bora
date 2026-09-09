'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FaArrowLeft, FaFileAlt, FaSearch, FaSpinner } from 'react-icons/fa';
import { fetchCatalogIndex, fetchCatalogTemplate } from '@/lib/data';
import type { CatalogEntry, PlanTemplateFile } from '@/lib/data';
import { useData } from '../../../context/DataContext';
import { useNotification } from '../../../context/NotificationContext';
import ImportPlanModal from '../../../components/ImportPlanModal';

/**
 * O catálogo de planos prontos - RF-C1 (listar), RF-C2 (prévia) e RF-C3
 * (clonar).
 *
 * O dado vem de `public/catalogo/*.json`, servido como arquivo estático pelo
 * mesmo CDN do app: nenhuma chamada ao Supabase acontece para *ver* a lista.
 * Só o clone toca no banco, e ele é um insert em `plans` do próprio usuário.
 *
 * Publicar um plano aqui é commit, não tela: ver `public/catalogo/README.md` e
 * `scripts/edital-para-plano.mjs`.
 */
export default function CatalogoPage() {
  const router = useRouter();
  const { studyPlans, refreshPlans } = useData();
  const { showNotification } = useNotification();

  const [entradas, setEntradas] = useState<CatalogEntry[] | null>(null);
  const [busca, setBusca] = useState('');
  const [carregandoSlug, setCarregandoSlug] = useState<string | null>(null);
  const [template, setTemplate] = useState<PlanTemplateFile | null>(null);

  useEffect(() => {
    let ativo = true;
    fetchCatalogIndex().then((lista) => {
      if (ativo) setEntradas(lista);
    });
    return () => {
      ativo = false;
    };
  }, []);

  // Memoizado porque o `ImportPlanModal` decide pela identidade deste array
  // quando reescrever o campo de nome.
  const nomesUsados = useMemo(
    () => studyPlans.map((plano) => plano.name),
    [studyPlans]
  );

  const templatesDoModal = useMemo(
    () => (template ? [template] : []),
    [template]
  );

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!entradas) return [];
    if (!termo) return entradas;
    return entradas.filter((entrada) =>
      [entrada.nome, entrada.cargo, entrada.banca, entrada.orgao, String(entrada.ano ?? '')]
        .filter(Boolean)
        .some((campo) => String(campo).toLowerCase().includes(termo))
    );
  }, [entradas, busca]);

  const abrirPrevia = async (slug: string) => {
    setCarregandoSlug(slug);
    try {
      const resultado = await fetchCatalogTemplate(slug);
      if (!resultado.ok) {
        showNotification(resultado.erro, 'error');
        return;
      }
      setTemplate(resultado.template);
    } finally {
      setCarregandoSlug(null);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4 pt-12">
        <div className="w-full">
          <div className="mb-6">
            <Link
              href="/planos"
              className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 hover:text-amber-600 dark:hover:text-amber-400"
            >
              <FaArrowLeft /> Voltar para os meus planos
            </Link>
            <header className="pt-4">
              <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-100">
                Planos prontos
              </h1>
              <p className="mt-2 text-gray-600 dark:text-gray-300 max-w-3xl">
                Árvores de matérias e tópicos montadas a partir do conteúdo
                programático de editais oficiais. Escolher um cria uma cópia na sua
                conta - dali em diante o plano é seu, e editá-lo não afeta ninguém.
              </p>
            </header>
            <hr className="mt-4 mb-6 border-gray-300 dark:border-gray-700" />
          </div>

          {entradas === null ? (
            <p className="text-gray-600 dark:text-gray-300">Carregando o catálogo...</p>
          ) : entradas.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 max-w-3xl">
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">
                O catálogo ainda está vazio
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Nenhum plano pronto foi publicado até agora. Um catálogo com planos
                velhos é pior que catálogo nenhum, então ele só ganha entradas
                quando alguém monta e revisa uma árvore de edital.
              </p>
              <p className="text-gray-600 dark:text-gray-300">
                Enquanto isso, dá para{' '}
                <Link href="/planos" className="text-amber-600 dark:text-amber-400 hover:underline">
                  criar um plano do zero ou importar um arquivo
                </Link>{' '}
                que você já tenha.
              </p>
            </div>
          ) : (
            <>
              <div className="relative mb-6 max-w-md">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por concurso, cargo, órgão ou banca"
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
                />
              </div>

              {filtradas.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-300">
                  Nenhum plano do catálogo bate com &quot;{busca}&quot;.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filtradas.map((entrada) => (
                    <div
                      key={entrada.slug}
                      className="bg-white dark:bg-gray-800 rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col p-6"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 shrink-0">
                          <FaFileAlt size={22} />
                        </div>
                        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                          {entrada.nome}
                        </h2>
                      </div>
                      <dl className="text-sm text-gray-600 dark:text-gray-300 space-y-1 flex-1">
                        {entrada.cargo ? (
                          <div>
                            Cargo: <span className="font-semibold">{entrada.cargo}</span>
                          </div>
                        ) : null}
                        {entrada.orgao ? (
                          <div>
                            Órgão: <span className="font-semibold">{entrada.orgao}</span>
                          </div>
                        ) : null}
                        {entrada.banca ? (
                          <div>
                            Banca: <span className="font-semibold">{entrada.banca}</span>
                          </div>
                        ) : null}
                        {entrada.ano ? (
                          <div>
                            Ano: <span className="font-semibold">{entrada.ano}</span>
                          </div>
                        ) : null}
                        <div>
                          Matérias: <span className="font-semibold">{entrada.materias ?? '-'}</span>
                          {'  '}
                          Tópicos: <span className="font-semibold">{entrada.topicos ?? '-'}</span>
                        </div>
                      </dl>
                      <button
                        type="button"
                        onClick={() => abrirPrevia(entrada.slug)}
                        disabled={carregandoSlug !== null}
                        className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg font-semibold hover:bg-amber-600 transition-colors disabled:bg-gray-400"
                      >
                        {carregandoSlug === entrada.slug ? (
                          <FaSpinner className="animate-spin" />
                        ) : null}
                        Ver e usar
                      </button>
                      {entrada.atualizadoEm ? (
                        <p className="mt-2 text-xs text-gray-400 text-center">
                          Atualizado em {entrada.atualizadoEm}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ImportPlanModal
        isOpen={template !== null}
        templates={templatesDoModal}
        takenNames={nomesUsados}
        title="Usar este plano"
        confirmLabel="Usar este plano"
        onClose={() => setTemplate(null)}
        onImported={async (planId) => {
          setTemplate(null);
          await refreshPlans();
          router.push(planId ? `/planos?id=${planId}` : '/planos');
        }}
      />
    </>
  );
}
