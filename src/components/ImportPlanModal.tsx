'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { FaFileAlt, FaExternalLinkAlt, FaSpinner } from 'react-icons/fa';
import {
  countTemplateTopics,
  importPlanTemplate,
  suggestPlanName,
} from '@/lib/data';
import type { PlanTemplateFile } from '@/lib/data';
import { useNotification } from '../context/NotificationContext';
import TopicTree from './TopicTree';

/**
 * A confirmação antes de gravar — RF-A5 (prévia), RF-C2 (árvore), RF-C4/RF-A3
 * (nome editável) e RF-C6 (procedência visível).
 *
 * A mesma tela serve o arquivo e o catálogo, porque os dois chegam aqui como
 * `PlanTemplateFile`. Um backup completo chega como vários planos: daí a lista
 * de seleção, que some quando só há um.
 */

interface ImportPlanModalProps {
  isOpen: boolean;
  templates: PlanTemplateFile[];
  /**
   * Nomes já usados na conta: é com eles que o sufixo `... (2)` é calculado.
   * Quem passa precisa memoizar o array — a identidade dele decide quando o
   * campo de nome é reescrito, e um array novo a cada render apagaria o que o
   * usuário digitou.
   */
  takenNames: string[];
  title: string;
  confirmLabel: string;
  onClose: () => void;
  onImported: (planId: string | undefined, name: string) => void;
}

/** `edital` e `backup` são os únicos valores que o app emite hoje. */
function descreverFonte(fonte: string): string {
  if (fonte === 'edital') return 'Conteúdo programático do edital oficial';
  if (fonte === 'backup') return 'Backup de conta do Bora Estudar';
  return fonte;
}

export default function ImportPlanModal({
  isOpen,
  templates,
  takenNames,
  title,
  confirmLabel,
  onClose,
  onImported,
}: ImportPlanModalProps) {
  const { showNotification } = useNotification();
  const [indice, setIndice] = useState(0);
  const [nome, setNome] = useState('');
  const [salvando, setSalvando] = useState(false);

  const template = templates[indice];

  // O nome sugerido é recalculado quando o template muda - a troca no seletor,
  // num backup com vários planos - e segue editável depois disso.
  useEffect(() => {
    if (!template) return;
    setNome(suggestPlanName(template.plano.name, takenNames));
  }, [template, takenNames]);

  useEffect(() => {
    if (isOpen) setIndice(0);
  }, [isOpen, templates]);

  const resumo = useMemo(() => {
    if (!template) return { materias: 0, topicos: 0 };
    return {
      materias: template.plano.subjects.length,
      topicos: countTemplateTopics(template.plano.subjects),
    };
  }, [template]);

  if (!isOpen || !template) return null;

  const nomeDuplicado = takenNames.some(
    (existente) => existente.trim().toLowerCase() === nome.trim().toLowerCase()
  );

  const confirmar = async () => {
    if (!nome.trim()) {
      showNotification('O nome do plano não pode estar vazio.', 'error');
      return;
    }

    setSalvando(true);
    try {
      const resultado = await importPlanTemplate(template, { name: nome.trim() });

      if (!resultado.success) {
        showNotification(resultado.error || 'Falha ao importar o plano.', 'error');
        return;
      }

      // Só uma notificação fica visível por vez (o `NotificationContext` guarda
      // uma), então o aviso de ícone descartado (RF-C5) viaja junto do sucesso
      // em vez de ser engolido por ele.
      const sucesso = `Plano "${nome.trim()}" criado com sucesso!`;
      if (resultado.warnings.length > 0) {
        showNotification(`${sucesso} ${resultado.warnings.join(' ')}`, 'warning');
      } else {
        showNotification(sucesso, 'success');
      }

      onImported(resultado.planId, nome.trim());
    } finally {
      setSalvando(false);
    }
  };

  const origem = template.origem;

  return (
    <div className="fixed inset-0 bg-[rgba(0,0,0,0.4)] flex justify-center items-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="p-6 pb-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{title}</h2>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {templates.length > 1 ? (
            <div>
              <label
                htmlFor="templateEscolhido"
                className="block text-sm font-bold text-amber-800 dark:text-amber-300 mb-2"
              >
                QUAL PLANO DO ARQUIVO
              </label>
              <select
                id="templateEscolhido"
                value={indice}
                onChange={(e) => setIndice(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
              >
                {templates.map((item, i) => (
                  <option key={`${item.plano.name}-${i}`} value={i}>
                    {item.plano.name} ({item.plano.subjects.length} matérias)
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                O arquivo tem {templates.length} planos. Um de cada vez, e nada do
                que já existe na sua conta é apagado.
              </p>
            </div>
          ) : null}

          <div className="flex items-start gap-4">
            {template.plano.iconUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={template.plano.iconUrl}
                alt=""
                className="w-16 h-16 rounded-lg object-cover border border-gray-200 dark:border-gray-700"
              />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400">
                <FaFileAlt size={26} />
              </div>
            )}
            <dl className="flex-1 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {template.plano.cargo ? (
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Cargo</dt>
                  <dd className="font-semibold text-gray-800 dark:text-gray-100">
                    {template.plano.cargo}
                  </dd>
                </div>
              ) : null}
              {template.plano.banca ? (
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Banca</dt>
                  <dd className="font-semibold text-gray-800 dark:text-gray-100">
                    {template.plano.banca}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Matérias</dt>
                <dd className="font-semibold text-gray-800 dark:text-gray-100">
                  {resumo.materias}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Tópicos</dt>
                <dd className="font-semibold text-gray-800 dark:text-gray-100">
                  {resumo.topicos}
                </dd>
              </div>
            </dl>
          </div>

          {origem ? (
            <div className="rounded-md bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-700 p-3 text-sm">
              <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">
                Procedência
              </p>
              <p className="text-gray-600 dark:text-gray-300">
                {descreverFonte(origem.fonte)}
                {origem.orgao ? ` - ${origem.orgao}` : ''}
                {origem.edital ? `, ${origem.edital}` : ''}
                {origem.ano ? ` (${origem.ano})` : ''}
              </p>
              {origem.url ? (
                <a
                  href={origem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 hover:underline"
                >
                  Conferir o documento oficial <FaExternalLinkAlt size={11} />
                </a>
              ) : null}
            </div>
          ) : null}

          <div>
            <label
              htmlFor="nomeDoPlano"
              className="block text-sm font-bold text-amber-800 dark:text-amber-300 mb-2"
            >
              NOME DO PLANO NA SUA CONTA
            </label>
            <input
              id="nomeDoPlano"
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
            />
            {nomeDuplicado ? (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                Você já tem um plano com esse nome. Escolha outro para os dois não
                se confundirem na lista.
              </p>
            ) : null}
          </div>

          <div>
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300 mb-2">
              O QUE VAI SER CRIADO
            </p>
            <TopicTree subjects={template.plano.subjects} />
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Isto cria um plano novo e não altera nenhum outro dado da sua conta. O
            plano passa a ser seu: editar, renomear ou apagar tópicos depois não
            afeta o original.
          </p>
        </div>

        <div className="flex justify-end gap-4 p-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            disabled={salvando}
            className="px-6 py-2 bg-gray-300 text-gray-800 font-semibold rounded-lg hover:bg-gray-400 transition-colors dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={salvando || nomeDuplicado || !nome.trim()}
            className="px-6 py-2 bg-amber-500 text-white font-semibold rounded-lg hover:bg-amber-600 transition-colors dark:bg-amber-600 dark:hover:bg-amber-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {salvando ? <FaSpinner className="animate-spin" /> : null}
            {salvando ? 'Criando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
