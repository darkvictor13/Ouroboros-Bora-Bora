/**
 * Leitura do catálogo de planos prontos.
 *
 * O catálogo é **dado estático somente leitura**, versionado no repositório e
 * servido pelo CDN junto com o resto do `out/` (`REQUISITOS-CATALOGO-PLANOS.md`
 * §5.1). Não passa pelo Supabase de propósito: não gasta requisição
 * autenticada, não pede migration, não pede papel de admin — publicar é commit.
 *
 * Trocar isto por uma tabela `plan_templates` (§5.2) é reescrever as duas
 * funções deste arquivo, e nada mais: quem consome recebe `PlanTemplateFile`.
 */

import {
  PlanTemplateFile,
  parsePlanTemplate,
} from './template';

/** Uma linha de `public/catalogo/index.json`. */
export interface CatalogEntry {
  /** Identidade estável do template entre versões. É o nome do arquivo. */
  slug: string;
  nome: string;
  cargo?: string;
  banca?: string;
  orgao?: string;
  ano?: number;
  materias?: number;
  topicos?: number;
  /** Para o dia em que alguém perguntar se a árvore está velha (§6). */
  atualizadoEm?: string;
}

export interface CatalogIndex {
  templates: CatalogEntry[];
}

/** Slug é nome de arquivo servido pelo CDN: nada de `..` nem de barra. */
const SLUG_VALIDO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_VALIDO.test(slug) && slug.length <= 80;
}

/** A raiz do catálogo. `basePath` vazio hoje; a concatenação sobrevive a ele. */
const CATALOG_ROOT = '/catalogo';

async function buscarJson(caminho: string): Promise<unknown> {
  const resposta = await fetch(caminho, { headers: { accept: 'application/json' } });
  if (!resposta.ok) {
    throw new Error(`O catálogo respondeu ${resposta.status}.`);
  }
  return resposta.json();
}

/**
 * A lista de templates. Catálogo ausente ou vazio não é erro: é o estado
 * inicial do repositório, e a tela tem um vazio para mostrar.
 */
export async function fetchCatalogIndex(): Promise<CatalogEntry[]> {
  let bruto: unknown;
  try {
    bruto = await buscarJson(`${CATALOG_ROOT}/index.json`);
  } catch (erro) {
    console.error('Falha ao carregar o índice do catálogo:', erro);
    return [];
  }

  const lista = (bruto as { templates?: unknown } | null)?.templates;
  if (!Array.isArray(lista)) return [];

  return lista
    .filter((item): item is CatalogEntry =>
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as CatalogEntry).slug === 'string' &&
      isValidSlug((item as CatalogEntry).slug) &&
      typeof (item as CatalogEntry).nome === 'string'
    )
    .map((item) => ({ ...item, nome: item.nome.trim() }));
}

/**
 * Um template pelo slug, já validado contra o contrato.
 *
 * `dropQuestionCount` é o RF-C7 aplicado na leitura, e não só na geração: um
 * `question_count` num plano do catálogo só poderia ter vindo de onde não pode,
 * e o app não é obrigado a confiar no arquivo para descobrir isso.
 */
export async function fetchCatalogTemplate(
  slug: string
): Promise<{ ok: true; template: PlanTemplateFile } | { ok: false; erro: string }> {
  if (!isValidSlug(slug)) {
    return { ok: false, erro: 'Plano do catálogo desconhecido.' };
  }

  let bruto: unknown;
  try {
    bruto = await buscarJson(`${CATALOG_ROOT}/${slug}.json`);
  } catch (erro) {
    console.error(`Falha ao carregar o template ${slug}:`, erro);
    return { ok: false, erro: 'Não foi possível carregar este plano do catálogo.' };
  }

  return parsePlanTemplate(bruto, { dropQuestionCount: true });
}
