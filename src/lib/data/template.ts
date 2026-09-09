/**
 * O contrato do arquivo de plano — a fronteira entre o app e quem produz um
 * plano fora dele (o catálogo de `public/catalogo`, um backup antigo, ou a
 * ferramenta de edital de `scripts/edital-para-plano.mjs`).
 *
 * Nada aqui fala com o Supabase de propósito: são funções puras, e é isso que
 * permite testar a validação sem browser e sem rede. A gravação vive em
 * `./index.ts` (`importPlanTemplate`).
 *
 * Ver `REQUISITOS-CATALOGO-PLANOS.md` §6 (contrato) e §4 (RF-A1..A5, RF-C1..C7).
 */

import type { EditalSubject, EditalTopic, PlanData, PlanInput } from './types';

export const PLAN_TEMPLATE_FORMAT = 'bora-estudar/plano';

/** A versão que este app sabe ler. Ver `descreverIncompatibilidade`. */
export const PLAN_TEMPLATE_VERSION = 1;

/** Espelha os limites do bucket `plan-icons` (`0002_phase3_data_layer.sql:78`). */
export const ICON_MAX_BYTES = 2 * 1024 * 1024;
export const ICON_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
];

/**
 * Teto de segurança para árvore vinda de fora. Um edital real não passa de
 * quatro níveis; doze é folga suficiente para nunca esbarrar de verdade, e
 * baixo o bastante para um JSON malformado não estourar a pilha.
 */
const MAX_DEPTH = 12;

/** De onde o plano veio. É o que o RF-C6 mostra ao usuário. */
export interface PlanTemplateOrigin {
  /** `edital` no catálogo; `backup` quando o plano saiu de um backup da conta. */
  fonte: string;
  orgao?: string;
  edital?: string;
  ano?: number;
  /** PDF oficial. É o que permite conferir a árvore contra o documento. */
  url?: string;
}

/** O `plano` do arquivo: `PlanInput` sem `id`, com o ícone como data: URI. */
export interface PlanTemplateContent {
  name: string;
  cargo?: string;
  edital?: string;
  banca?: string;
  observations?: string;
  iconUrl?: string;
  subjects: EditalSubject[];
  bancaTopicWeights?: PlanData['bancaTopicWeights'];
}

export interface PlanTemplateFile {
  formato: string;
  versao: number;
  geradoEm?: string;
  origem?: PlanTemplateOrigin;
  plano: PlanTemplateContent;
}

/** O que o arquivo escolhido pelo usuário acabou sendo. */
export type PlanFileKind = 'template' | 'backup';

export type PlanFileParse =
  | { ok: true; tipo: PlanFileKind; templates: PlanTemplateFile[]; avisos: string[] }
  | { ok: false; erro: string };

// -----------------------------------------------------------------------------
// Saneamento da árvore
// -----------------------------------------------------------------------------

const texto = (valor: unknown): string =>
  typeof valor === 'string' ? valor.trim() : '';

const numero = (valor: unknown): number | undefined =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : undefined;

export interface SanitizeOptions {
  /** RF-C7: o catálogo não carrega contagem de questões de banca nenhuma. */
  dropQuestionCount?: boolean;
}

/**
 * Copia só os campos que o app grava, e descarta o resto.
 *
 * Os campos derivados (`completed`, `percentage`, `is_completed`…) são
 * calculados por `calculateStats` a partir dos registros de estudo: se
 * viessem do arquivo, o plano nasceria mostrando progresso que não existe.
 * Campo desconhecido é ignorado, não rejeitado — é regra do contrato (§6).
 */
export function sanitizeTopics(
  raw: unknown,
  options: SanitizeOptions = {},
  depth = 0
): EditalTopic[] {
  if (!Array.isArray(raw) || depth >= MAX_DEPTH) return [];

  const topicos: EditalTopic[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const bruto = item as Record<string, unknown>;
    const topicText = texto(bruto.topic_text);
    if (!topicText) continue;

    const topico: EditalTopic = { topic_text: topicText };

    const topicNumber = texto(bruto.topic_number);
    if (topicNumber) topico.topic_number = topicNumber;

    const userWeight = numero(bruto.userWeight);
    if (userWeight !== undefined) topico.userWeight = userWeight;

    if (typeof bruto.is_grouping_topic === 'boolean') {
      topico.is_grouping_topic = bruto.is_grouping_topic;
    }

    if (!options.dropQuestionCount) {
      const questionCount = numero(bruto.question_count);
      if (questionCount !== undefined) topico.question_count = questionCount;
    }

    const filhos = sanitizeTopics(bruto.sub_topics, options, depth + 1);
    if (filhos.length > 0) topico.sub_topics = filhos;

    topicos.push(topico);
  }

  return topicos;
}

/** Cor padrão de matéria sem cor. A mesma do `mappers.rowToPlan`. */
const DEFAULT_SUBJECT_COLOR = '#3B82F6';

export function sanitizeSubjects(
  raw: unknown,
  options: SanitizeOptions = {}
): EditalSubject[] {
  if (!Array.isArray(raw)) return [];

  const materias: EditalSubject[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const bruto = item as Record<string, unknown>;
    const nome = texto(bruto.subject);
    if (!nome) continue;

    materias.push({
      // O `id` do arquivo é preservado aqui porque ele é a chave de
      // `bancaTopicWeights`. Quem troca por um uuid novo é `templateToPlanInput`,
      // que remapeia os dois de uma vez.
      id: texto(bruto.id) || crypto.randomUUID(),
      subject: nome,
      color: texto(bruto.color) || DEFAULT_SUBJECT_COLOR,
      topics: sanitizeTopics(bruto.topics, options),
    });
  }

  return materias;
}

// -----------------------------------------------------------------------------
// Contagens e nomes
// -----------------------------------------------------------------------------

export function countTopics(topics: EditalTopic[] | undefined): number {
  if (!Array.isArray(topics)) return 0;
  return topics.reduce(
    (total, topico) => total + 1 + countTopics(topico.sub_topics),
    0
  );
}

export function countTemplateTopics(subjects: EditalSubject[]): number {
  return subjects.reduce((total, materia) => total + countTopics(materia.topics), 0);
}

/**
 * Um nome livre para o plano novo.
 *
 * `plans_user_name_unique (user_id, name)` faz o segundo clone do mesmo
 * template falhar no insert (RF-C4). Sugerir o sufixo antes é mais barato que
 * traduzir o 23505 depois — e o usuário ainda pode editar o campo.
 */
export function suggestPlanName(base: string, taken: string[]): string {
  const alvo = base.trim() || 'Plano importado';
  const ocupados = new Set(taken.map((nome) => nome.trim().toLowerCase()));
  if (!ocupados.has(alvo.toLowerCase())) return alvo;

  for (let i = 2; i < 1000; i++) {
    const candidato = `${alvo} (${i})`;
    if (!ocupados.has(candidato.toLowerCase())) return candidato;
  }
  return `${alvo} (${Date.now()})`;
}

// -----------------------------------------------------------------------------
// Leitura do arquivo
// -----------------------------------------------------------------------------

/** Diz *qual das duas pontas está velha* — é o que o RF-A2 pede. */
function descreverIncompatibilidade(versao: number): string {
  if (versao > PLAN_TEMPLATE_VERSION) {
    return `Este arquivo está no formato versão ${versao}, e este app lê até a ${PLAN_TEMPLATE_VERSION}. Quem está velho é o app: atualize-o.`;
  }
  return `Este arquivo está no formato versão ${versao}, e este app lê a ${PLAN_TEMPLATE_VERSION}. Quem está velho é o arquivo: gere-o de novo.`;
}

function lerConteudo(
  raw: unknown,
  options: SanitizeOptions
): PlanTemplateContent | null {
  if (!raw || typeof raw !== 'object') return null;
  const bruto = raw as Record<string, unknown>;
  const name = texto(bruto.name);
  if (!name) return null;

  const subjects = sanitizeSubjects(bruto.subjects, options);

  // Os pesos só valem se apontarem para uma matéria que existe: um peso órfão
  // vira lixo que nenhuma tela sabe mostrar.
  const idsValidos = new Set(subjects.map((materia) => materia.id));
  const pesos: PlanData['bancaTopicWeights'] = {};
  if (!options.dropQuestionCount && bruto.bancaTopicWeights && typeof bruto.bancaTopicWeights === 'object') {
    for (const [subjectId, mapa] of Object.entries(
      bruto.bancaTopicWeights as Record<string, unknown>
    )) {
      if (!idsValidos.has(subjectId) || !mapa || typeof mapa !== 'object') continue;
      const porTopico: Record<string, number> = {};
      for (const [topico, peso] of Object.entries(mapa as Record<string, unknown>)) {
        const valor = numero(peso);
        if (valor !== undefined) porTopico[topico] = valor;
      }
      if (Object.keys(porTopico).length > 0) pesos[subjectId] = porTopico;
    }
  }

  return {
    name,
    cargo: texto(bruto.cargo),
    edital: texto(bruto.edital),
    banca: texto(bruto.banca),
    observations: typeof bruto.observations === 'string' ? bruto.observations : '',
    iconUrl: typeof bruto.iconUrl === 'string' && bruto.iconUrl.startsWith('data:')
      ? bruto.iconUrl
      : undefined,
    subjects,
    bancaTopicWeights: pesos,
  };
}

function lerOrigem(raw: unknown): PlanTemplateOrigin | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const bruto = raw as Record<string, unknown>;
  const fonte = texto(bruto.fonte);
  if (!fonte) return undefined;
  const origem: PlanTemplateOrigin = { fonte };
  const orgao = texto(bruto.orgao);
  if (orgao) origem.orgao = orgao;
  const edital = texto(bruto.edital);
  if (edital) origem.edital = edital;
  const ano = numero(bruto.ano);
  if (ano !== undefined) origem.ano = ano;
  // Só http(s): um `javascript:` aqui viraria um link clicável na prévia.
  const url = texto(bruto.url);
  if (/^https?:\/\//i.test(url)) origem.url = url;
  return origem;
}

/**
 * Valida um arquivo no contrato `bora-estudar/plano` (§6).
 *
 * Devolve erro em vez de lançar: quem chama é uma tela, e a mensagem é o
 * produto.
 */
export function parsePlanTemplate(
  raw: unknown,
  options: SanitizeOptions = {}
): { ok: true; template: PlanTemplateFile } | { ok: false; erro: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, erro: 'O arquivo não contém um objeto JSON.' };
  }

  const bruto = raw as Record<string, unknown>;

  if (texto(bruto.formato) !== PLAN_TEMPLATE_FORMAT) {
    return {
      ok: false,
      erro: `Este não é um arquivo de plano do Bora Estudar (esperava "formato": "${PLAN_TEMPLATE_FORMAT}").`,
    };
  }

  const versao = numero(bruto.versao);
  if (versao === undefined) {
    return { ok: false, erro: 'O arquivo não diz em que versão do formato foi gerado.' };
  }
  if (versao !== PLAN_TEMPLATE_VERSION) {
    return { ok: false, erro: descreverIncompatibilidade(versao) };
  }

  const plano = lerConteudo(bruto.plano, options);
  if (!plano) {
    return { ok: false, erro: 'O arquivo não traz um plano com nome.' };
  }
  if (plano.subjects.length === 0) {
    return { ok: false, erro: `O plano "${plano.name}" não tem nenhuma matéria.` };
  }

  return {
    ok: true,
    template: {
      formato: PLAN_TEMPLATE_FORMAT,
      versao: PLAN_TEMPLATE_VERSION,
      geradoEm: texto(bruto.geradoEm) || undefined,
      origem: lerOrigem(bruto.origem),
      plano,
    },
  };
}

/**
 * Extrai os planos de um backup completo da conta (`BackupData`).
 *
 * É o caso que motiva o RF-A1: hoje o único caminho para um backup é `/backup`,
 * que apaga a conta antes de restaurar. Aqui cada plano do arquivo vira um
 * template, e o usuário escolhe um — sem tocar em nada do que já existe. Os
 * registros de estudo, revisões e simulados do backup são ignorados: o que se
 * importa é o plano, não o histórico.
 */
function templatesDoBackup(raw: Record<string, unknown>): PlanFileParse {
  const planos = raw.plans;
  if (!Array.isArray(planos)) {
    return {
      ok: false,
      erro: 'O arquivo não é um plano nem um backup do Bora Estudar.',
    };
  }

  const templates: PlanTemplateFile[] = [];
  const avisos: string[] = [];

  planos.forEach((entrada, indice) => {
    const item = (entrada && typeof entrada === 'object' ? entrada : {}) as Record<string, unknown>;
    // A v1 gravava `content` ora como o objeto do plano, ora como o array puro
    // de matérias — daí o nome ter de vir do `fileName` nesse segundo caso.
    const content = Array.isArray(item.content)
      ? { subjects: item.content }
      : ((item.content ?? {}) as Record<string, unknown>);

    const nomeDoArquivo = texto(item.fileName).replace(/\.json$/i, '');
    const conteudo = lerConteudo(
      { ...content, name: texto((content as Record<string, unknown>).name) || nomeDoArquivo },
      {}
    );

    if (!conteudo) {
      avisos.push(`O plano ${indice + 1} do backup foi ignorado: está sem nome.`);
      return;
    }
    if (conteudo.subjects.length === 0) {
      avisos.push(`"${conteudo.name}" foi ignorado: não tem nenhuma matéria.`);
      return;
    }

    templates.push({
      formato: PLAN_TEMPLATE_FORMAT,
      versao: PLAN_TEMPLATE_VERSION,
      origem: { fonte: 'backup' },
      plano: conteudo,
    });
  });

  if (templates.length === 0) {
    return {
      ok: false,
      erro:
        avisos[0] ??
        'O backup não tem nenhum plano com matérias para importar.',
    };
  }

  return { ok: true, tipo: 'backup', templates, avisos };
}

/**
 * Ponto de entrada da importação de arquivo (RF-A1/A2): aceita tanto o
 * contrato `bora-estudar/plano` quanto um backup completo da conta.
 */
export function parsePlanFile(raw: unknown): PlanFileParse {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, erro: 'O arquivo não contém um objeto JSON.' };
  }

  const bruto = raw as Record<string, unknown>;

  // `formato` presente é intenção declarada de ser um template: aí a
  // incompatibilidade de versão precisa aparecer como tal, e não virar
  // "não é um plano nem um backup".
  if ('formato' in bruto) {
    const resultado = parsePlanTemplate(bruto);
    return resultado.ok
      ? { ok: true, tipo: 'template', templates: [resultado.template], avisos: [] }
      : { ok: false, erro: resultado.erro };
  }

  return templatesDoBackup(bruto);
}

// -----------------------------------------------------------------------------
// Do template para o que o `createPlan` recebe
// -----------------------------------------------------------------------------

/**
 * Converte o template no `PlanInput` do clone.
 *
 * **Cada matéria ganha um uuid novo.** O `id` da matéria é a chave dos
 * registros de estudo e das sessões do ciclo; repeti-lo entre dois clones (ou
 * entre duas contas) faria dois planos diferentes disputarem o mesmo histórico.
 * `bancaTopicWeights` é remapeado na mesma passada, ou os pesos apontariam para
 * um id que não existe mais.
 */
export function templateToPlanInput(
  template: PlanTemplateFile,
  overrides: { name?: string } = {}
): PlanInput {
  const deParaIds = new Map<string, string>();
  const subjects = template.plano.subjects.map((materia) => {
    const novoId = crypto.randomUUID();
    deParaIds.set(materia.id, novoId);
    return { ...materia, id: novoId };
  });

  const pesosOriginais = template.plano.bancaTopicWeights ?? {};
  const bancaTopicWeights: PlanData['bancaTopicWeights'] = {};
  for (const [idAntigo, mapa] of Object.entries(pesosOriginais)) {
    const idNovo = deParaIds.get(idAntigo);
    if (idNovo) bancaTopicWeights[idNovo] = mapa;
  }

  return {
    name: (overrides.name ?? template.plano.name).trim(),
    cargo: template.plano.cargo ?? '',
    edital: template.plano.edital ?? '',
    banca: template.plano.banca ?? '',
    observations: template.plano.observations ?? '',
    subjects,
    bancaTopicWeights,
  };
}

// -----------------------------------------------------------------------------
// Ícone
// -----------------------------------------------------------------------------

/**
 * Converte o data: URI do template num `File` para o `createPlan({ iconFile })`.
 *
 * Ícone fora dos limites do bucket é **descartado com aviso, sem abortar**
 * (RF-C5): um plano sem ícone é um plano; um erro aqui custaria a importação
 * inteira. O caminho inverso é o `FileReader` do `CreatePlanModal`.
 */
export function dataUrlToIconFile(
  dataUrl: string | undefined,
  baseName: string
): { file?: File; aviso?: string } {
  if (!dataUrl) return {};

  const cabecalho = /^data:([^;,]+)(;base64)?,/i.exec(dataUrl);
  if (!cabecalho) {
    return { aviso: 'O ícone do plano não é um data: URI válido e foi descartado.' };
  }

  const mime = cabecalho[1].toLowerCase();
  if (!ICON_MIME_TYPES.includes(mime)) {
    return { aviso: `O ícone é do tipo ${mime}, que o app não aceita, e foi descartado.` };
  }

  const corpo = dataUrl.slice(cabecalho[0].length);
  let bytes: ArrayBuffer;
  try {
    if (cabecalho[2]) {
      const binario = atob(corpo);
      bytes = new ArrayBuffer(binario.length);
      const view = new Uint8Array(bytes);
      for (let i = 0; i < binario.length; i++) view[i] = binario.charCodeAt(i);
    } else {
      const utf8 = new TextEncoder().encode(decodeURIComponent(corpo));
      bytes = new ArrayBuffer(utf8.byteLength);
      new Uint8Array(bytes).set(utf8);
    }
  } catch {
    return { aviso: 'O ícone do plano está corrompido e foi descartado.' };
  }

  if (bytes.byteLength === 0) {
    return { aviso: 'O ícone do plano está vazio e foi descartado.' };
  }
  if (bytes.byteLength > ICON_MAX_BYTES) {
    const mb = (bytes.byteLength / 1024 / 1024).toFixed(1);
    return {
      aviso: `O ícone tem ${mb} MB e o limite é 2 MB; o plano foi importado sem ele.`,
    };
  }

  const extensao = mime === 'image/svg+xml' ? 'svg' : mime.split('/')[1];
  const nome = `${baseName.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 40) || 'icone'}.${extensao}`;
  return { file: new File([bytes], nome, { type: mime }) };
}
