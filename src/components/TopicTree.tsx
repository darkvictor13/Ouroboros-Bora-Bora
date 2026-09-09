'use client';

import React, { useState } from 'react';
import { FaCaretDown, FaCaretRight } from 'react-icons/fa';
import { countTopics } from '@/lib/data';
import type { EditalSubject, EditalTopic } from '@/lib/data';

/**
 * A árvore de matérias e tópicos, **somente leitura**.
 *
 * É o RF-C2 (prévia antes de clonar) e a metade visual do RF-A5. Não reusa o
 * `PlanDetail`/`SubjectDetail` porque os dois são telas de plano já gravado:
 * carregam registros de estudo, gráficos e modais de registro a partir de um
 * `planId` que, na prévia, ainda não existe. O que se aproveita deles é a
 * forma — indentação por nível, seta de expandir, contagem no cabeçalho.
 */

function TopicNode({ topic, level }: { topic: EditalTopic; level: number }) {
  const filhos = topic.sub_topics ?? [];
  // Os dois primeiros níveis abertos: é o suficiente para reconhecer o edital
  // sem despejar 300 linhas de uma vez.
  const [aberto, setAberto] = useState(level < 1);
  const temFilhos = filhos.length > 0;

  return (
    <li>
      <div
        className="flex items-start gap-1 py-0.5 text-sm text-gray-700 dark:text-gray-300"
        style={{ paddingLeft: `${level * 14}px` }}
      >
        {temFilhos ? (
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            className="mt-0.5 text-gray-400 hover:text-amber-500"
            aria-label={aberto ? 'Recolher' : 'Expandir'}
          >
            {aberto ? <FaCaretDown /> : <FaCaretRight />}
          </button>
        ) : (
          <span className="w-[14px] shrink-0" aria-hidden="true" />
        )}
        <span className={topic.is_grouping_topic ? 'font-semibold' : ''}>
          {topic.topic_number ? (
            <span className="text-gray-400 mr-1">{topic.topic_number}</span>
          ) : null}
          {topic.topic_text}
        </span>
      </div>
      {temFilhos && aberto ? (
        <ul>
          {filhos.map((filho, i) => (
            <TopicNode key={`${filho.topic_text}-${i}`} topic={filho} level={level + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default function TopicTree({ subjects }: { subjects: EditalSubject[] }) {
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});

  if (subjects.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Este plano não tem matérias.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {subjects.map((materia) => {
        const aberta = abertas[materia.id] ?? false;
        const total = countTopics(materia.topics);
        return (
          <div
            key={materia.id}
            className="rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setAbertas((atual) => ({ ...atual, [materia.id]: !aberta }))}
              className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            >
              <span className="text-gray-400">
                {aberta ? <FaCaretDown /> : <FaCaretRight />}
              </span>
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: materia.color }}
                aria-hidden="true"
              />
              <span className="font-semibold text-gray-800 dark:text-gray-100 flex-1">
                {materia.subject}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {total} {total === 1 ? 'tópico' : 'tópicos'}
              </span>
            </button>
            {aberta ? (
              <ul className="px-3 py-2">
                {(materia.topics ?? []).map((topico, i) => (
                  <TopicNode key={`${topico.topic_text}-${i}`} topic={topico} level={0} />
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
