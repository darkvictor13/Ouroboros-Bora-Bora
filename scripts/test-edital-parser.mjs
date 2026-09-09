#!/usr/bin/env node
/**
 * Teste do parser de edital (RF-T1) contra a fixture de
 * `scripts/fixtures/edital-exemplo.txt`.
 *
 * O parser é função pura - texto entra, `EditalSubject[]` sai -, e é por isso
 * que este teste não precisa de browser, de rede nem de Supabase. Roda com
 * `npm run test:edital`.
 *
 * A fixture é sintética de propósito ("CONCURSO PÚBLICO DE EXEMPLO"): ela
 * existe para exercitar as pragas do PDF (cabeçalho repetido, número de página,
 * palavra hifenizada na quebra, linha que continua na seguinte, numeração com
 * buraco), não para representar nenhum edital real.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FORMATO,
  VERSAO,
  contarTopicosDoPlano,
  montarTemplate,
  normalizarTitulo,
  parseEdital,
  slugify,
} from './edital-para-plano.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(AQUI, 'fixtures', 'edital-exemplo.txt');

const resultados = [];

function check(nome, ok, detalhe = '') {
  resultados.push({ nome, ok, detalhe });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${nome}${detalhe && !ok ? ` :: ${detalhe}` : ''}`);
}

/** Acha um tópico pela numeração, em qualquer profundidade. */
function acharPorNumero(topicos, numero) {
  for (const topico of topicos ?? []) {
    if (topico.topic_number === numero) return topico;
    const achado = acharPorNumero(topico.sub_topics, numero);
    if (achado) return achado;
  }
  return null;
}

function percorrer(topicos, visitar) {
  for (const topico of topicos ?? []) {
    visitar(topico);
    percorrer(topico.sub_topics, visitar);
  }
}

const materias = parseEdital(readFileSync(FIXTURE, 'utf8'));

// ------------------------------------------------------ matérias reconhecidas
check(
  'reconhece as duas matérias, pela caixa alta e pelo rótulo DISCIPLINA:',
  materias.length === 2 &&
    materias[0].subject === 'Direito Constitucional' &&
    materias[1].subject === 'Noções de Informática',
  materias.map((m) => m.subject).join(' | ')
);

check(
  'o "ANEXO II" em caixa alta não vira matéria: ficou sem tópicos',
  !materias.some((m) => /anexo/i.test(m.subject)),
  materias.map((m) => m.subject).join(' | ')
);

check(
  'cada matéria tem id, cor da paleta e lista de tópicos',
  materias.every(
    (m) =>
      /^[0-9a-f-]{36}$/.test(m.id) && /^#[0-9A-F]{6}$/.test(m.color) && Array.isArray(m.topics)
  ),
  JSON.stringify(materias.map((m) => ({ id: m.id, color: m.color })))
);

check(
  'as cores não se repetem entre matérias vizinhas',
  materias[0].color !== materias[1].color,
  `${materias[0].color} ${materias[1].color}`
);

// ------------------------------------------------------------- limpeza do PDF
check(
  'cabeçalho repetido a cada página sumiu',
  !materias.some((m) => /CONCURSO PÚBLICO DE EXEMPLO/i.test(JSON.stringify(m)))
);

check(
  'número de página solto não virou tópico',
  !materias.some((m) => /"topic_text":"Página/i.test(JSON.stringify(m)))
);

const iniciativa = acharPorNumero(materias[0].topics, '1.1.2');
check(
  'palavra hifenizada na quebra de linha foi remontada',
  iniciativa?.topic_text === 'Valores sociais do trabalho e da livre iniciativa',
  iniciativa?.topic_text
);

const garantias = acharPorNumero(materias[0].topics, '1.2');
check(
  'tópico que continua na linha seguinte foi colado inteiro',
  garantias?.topic_text ===
    'Direitos e garantias fundamentais: direitos individuais e coletivos, direitos sociais, nacionalidade e direitos políticos',
  garantias?.topic_text
);

check(
  'o ponto final do edital não fica no texto do tópico',
  materias.every((m) => {
    let limpo = true;
    percorrer(m.topics, (t) => {
      if (/[.;\s]$/.test(t.topic_text)) limpo = false;
    });
    return limpo;
  })
);

// --------------------------------------------------------------- aninhamento
const principios = materias[0].topics[0];
check(
  'a numeração 1 / 1.1 / 1.1.1 vira três níveis',
  principios?.topic_number === '1' &&
    principios?.sub_topics?.[0]?.topic_number === '1.1' &&
    principios?.sub_topics?.[0]?.sub_topics?.[0]?.topic_number === '1.1.1',
  JSON.stringify(principios?.topic_number)
);

check(
  'quem tem filho é marcado como tópico de agrupamento',
  principios?.is_grouping_topic === true &&
    principios.sub_topics[0].is_grouping_topic === true &&
    principios.sub_topics[0].sub_topics[0].is_grouping_topic === undefined
);

// `1.2.1` aparece sem que exista `1.2` na segunda matéria: o parser sobe até o
// ancestral mais próximo em vez de largar o tópico na raiz.
const orfao = acharPorNumero(materias[1].topics, '1.2.1');
check(
  'numeração com buraco (1.2.1 sem 1.2) cai no ancestral mais próximo',
  orfao !== null && materias[1].topics[0].sub_topics.includes(orfao),
  orfao ? 'achou' : 'não achou'
);

// ------------------------------------------------------------- RF-C7 e §6
const template = montarTemplate({
  subjects: materias,
  nome: 'Concurso de Exemplo - Cargo de Exemplo',
  cargo: 'Cargo de Exemplo',
  edital: 'Edital nº 0/0000',
  banca: 'Banca de Exemplo',
  orgao: 'Órgão de Exemplo',
  ano: 2026,
  url: 'https://exemplo.gov.br/edital-0-0000.pdf',
});

check(
  'o template sai no contrato da §6 (formato, versão, origem, plano)',
  template.formato === FORMATO &&
    template.versao === VERSAO &&
    template.origem.fonte === 'edital' &&
    template.origem.url === 'https://exemplo.gov.br/edital-0-0000.pdf' &&
    template.plano.name.length > 0 &&
    Array.isArray(template.plano.subjects),
  JSON.stringify({ formato: template.formato, versao: template.versao })
);

check(
  'RF-C7: nenhum question_count em lugar nenhum',
  !JSON.stringify(template).includes('question_count')
);

check(
  'RF-C7: bancaTopicWeights sai vazio',
  template.plano.bancaTopicWeights &&
    Object.keys(template.plano.bancaTopicWeights).length === 0
);

check(
  'o plano não carrega registro de estudo, revisão, simulado nem ciclo',
  !['records', 'reviewRecords', 'simuladoRecords', 'studyCycle'].some(
    (chave) => chave in template.plano
  )
);

check(
  'a contagem de tópicos bate com a árvore',
  contarTopicosDoPlano(materias) === 12,
  String(contarTopicosDoPlano(materias))
);

// ------------------------------------------------------------------- slug
check(
  'o slug vira nome de arquivo servível pelo CDN',
  slugify('PC-BA 2026 — Delegado de Polícia') === 'pc-ba-2026-delegado-de-policia',
  slugify('PC-BA 2026 — Delegado de Polícia')
);

check(
  'título em caixa alta vira capitalizado, com as preposições em minúscula',
  normalizarTitulo('NOÇÕES DE DIREITO PENAL:') === 'Noções de Direito Penal',
  normalizarTitulo('NOÇÕES DE DIREITO PENAL:')
);

check(
  'título que já tem minúscula é preservado como está',
  normalizarTitulo('Direitos e garantias fundamentais.') ===
    'Direitos e garantias fundamentais',
  normalizarTitulo('Direitos e garantias fundamentais.')
);

console.log('\n================ RESUMO ================');
const ok = resultados.filter((r) => r.ok).length;
console.log(`${ok}/${resultados.length} checks passaram`);
for (const r of resultados.filter((r) => !r.ok)) {
  console.log(`  FAIL: ${r.nome} :: ${String(r.detalhe).slice(0, 200)}`);
}

process.exit(ok === resultados.length ? 0 : 1);
