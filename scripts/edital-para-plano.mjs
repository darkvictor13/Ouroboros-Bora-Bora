#!/usr/bin/env node
/**
 * Monta um plano do catálogo a partir do conteúdo programático de um edital.
 *
 * É a ferramenta do admin (RF-T1..T4 de `REQUISITOS-CATALOGO-PLANOS.md`), e
 * roda fora do app de propósito: não existe papel de admin no schema, e a v1 do
 * catálogo não precisa criar um. Publicar é commit.
 *
 * A fonte é o **edital**, nunca um guia de plataforma de terceiro: edital é ato
 * oficial e, pela Lei 9.610/1998, art. 8º, IV, não é objeto de direito autoral.
 * Daí também o RF-C7 - nada de `question_count` nem de `bancaTopicWeights`
 * aqui, porque contagem de questões por tópico é base de dados de quem
 * classificou as questões.
 *
 * Uso:
 *
 *   # 1. propor a árvore e CONFERIR na tela (RF-T2 - o passo obrigatório)
 *   node scripts/edital-para-plano.mjs --texto edital.txt \
 *     --nome "PC-BA 2026 - Delegado" --cargo "Delegado de Polícia" \
 *     --orgao "Polícia Civil da Bahia" --edital "Edital nº 1/2026" \
 *     --banca VUNESP --ano 2026 --url https://exemplo.gov.br/edital-01-2026.pdf
 *
 *   # 2. corrigir o que o parser errou, no .txt ou no JSON gerado
 *   # 3. publicar (escreve public/catalogo/) e commitar
 *   node scripts/edital-para-plano.mjs ... --publicar
 *
 * `--texto -` lê da entrada padrão. `--icone logo.png` embute o ícone como
 * data: URI, dentro dos limites do bucket `plan-icons` (2 MB).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR_CATALOGO = join(RAIZ, 'public', 'catalogo');

export const FORMATO = 'bora-estudar/plano';
export const VERSAO = 1;

/** A mesma ideia do `SUBJECT_COLORS` do app: paleta fixa, rotacionada. */
const CORES = ['#EF4444', '#F97316', '#F59E0B', '#22C55E', '#3B82F6', '#8B5CF6'];

const MIME_POR_EXTENSAO = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

const ICONE_MAX_BYTES = 2 * 1024 * 1024;

// -----------------------------------------------------------------------------
// Limpeza do texto colado do PDF
// -----------------------------------------------------------------------------

/**
 * Tira do texto o que o PDF acrescenta e o edital não tem.
 *
 * São três pragas, nesta ordem: cabeçalho e rodapé repetidos a cada página,
 * número de página solto, e palavra quebrada com hífen no fim da linha.
 */
export function limparTexto(bruto) {
  const linhas = bruto
    .replace(/\r\n?/g, '\n')
    // O PDF costuma trazer espaço fino e não separável no lugar do espaço.
    .replace(/[\u00a0\u2007\u2009\u202f]/g, ' ')
    .split('\n')
    .map((linha) => linha.replace(/\s+/g, ' ').trim());

  // Cabeçalho/rodapé é a linha curta que se repete em várias páginas. Três
  // ocorrências é o piso: um título de seção legítimo raramente chega lá.
  const frequencia = new Map();
  for (const linha of linhas) {
    if (!linha || linha.length > 80) continue;
    frequencia.set(linha, (frequencia.get(linha) ?? 0) + 1);
  }
  const repetidas = new Set(
    [...frequencia.entries()].filter(([, n]) => n >= 3).map(([linha]) => linha)
  );

  const limpas = [];
  for (const linha of linhas) {
    if (!linha) continue;
    if (repetidas.has(linha)) continue;
    // "12", "Página 12", "12 de 40", "- 12 -"
    if (/^[-–—\s]*(p[áa]gina\s*)?\d{1,4}(\s*(de|\/)\s*\d{1,4})?[-–—\s]*$/i.test(linha)) continue;

    // Hifenização da quebra de linha: "inicia-" + "tiva." = "iniciativa.". Tem de
    // acontecer aqui, antes de qualquer normalização de título, porque a
    // primeira coisa que `normalizarTitulo` faz é comer o hífen do fim.
    const anterior = limpas[limpas.length - 1];
    if (anterior && /[\p{Ll}]-$/u.test(anterior) && /^[\p{Ll}]/u.test(linha)) {
      limpas[limpas.length - 1] = anterior.slice(0, -1) + linha;
      continue;
    }

    limpas.push(linha);
  }

  return limpas;
}

/** `1.` `1.1` `1.1.1.` no começo da linha - é a numeração que dá o aninhamento. */
const NUMERADA = /^(\d+(?:\.\d+)*)\.?[)\s]\s*(.+)$/;

/** `DISCIPLINA: Direito Penal`, `MATÉRIA - Direito Penal`. */
const ROTULO_DE_MATERIA = /^(?:disciplina|mat[ée]ria|componente curricular)\s*[:\-]\s*(.+)$/i;

/** Título de seção em caixa alta, que é como a maioria dos editais separa matéria. */
function pareceMateria(linha) {
  const semNumero = linha.replace(/^[IVXLC]+\s*[-.)]\s*/, '');
  if (semNumero.length < 3 || semNumero.length > 90) return false;
  const letras = semNumero.replace(/[^\p{L}]/gu, '');
  if (letras.length < 3) return false;
  // Caixa alta de verdade: nada de "Art. 5º" nem de linha com uma sigla só.
  return letras === letras.toUpperCase() && /\p{L}{3,}/u.test(semNumero);
}

function tituloDeMateria(linha) {
  const rotulo = ROTULO_DE_MATERIA.exec(linha);
  const cru = rotulo ? rotulo[1] : linha.replace(/^[IVXLC]+\s*[-.)]\s*/, '');
  return normalizarTitulo(cru);
}

/** `DIREITO PENAL:` vira `Direito Penal`; o que já tem minúscula fica como está. */
export function normalizarTitulo(texto) {
  const limpo = texto.replace(/[\s:;.\-–—]+$/, '').trim();
  const letras = limpo.replace(/[^\p{L}]/gu, '');
  if (!letras || letras !== letras.toUpperCase()) return limpo;

  const minusculas = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'em', 'no', 'na', 'para', 'com', 'por']);
  return limpo
    .toLocaleLowerCase('pt-BR')
    .split(' ')
    .map((palavra, i) => {
      if (i > 0 && minusculas.has(palavra)) return palavra;
      return palavra.charAt(0).toLocaleUpperCase('pt-BR') + palavra.slice(1);
    })
    .join(' ');
}

// -----------------------------------------------------------------------------
// O parser
// -----------------------------------------------------------------------------

/**
 * Texto do conteúdo programático -> `EditalSubject[]`.
 *
 * Função pura: sem browser, sem rede, sem estado. É o que permite testá-la com
 * uma fixture (`scripts/test-edital-parser.mjs`).
 *
 * O parser **pode errar**, e é isso que muda a economia do projeto em relação a
 * uma extensão por usuário: aqui o admin revisa a árvore uma vez, antes de
 * publicar, e o erro é corrigido para todo mundo (RF-T2).
 */
export function parseEdital(textoBruto) {
  const linhas = limparTexto(textoBruto);

  const materias = [];
  let materiaAtual = null;
  /** prefixo numérico -> nó, para achar o pai de `1.2.3` em `1.2`. */
  let porPrefixo = new Map();
  let ultimoNo = null;

  const novaMateria = (nome) => {
    materiaAtual = {
      id: randomUUID(),
      subject: nome,
      color: CORES[materias.length % CORES.length],
      topics: [],
    };
    materias.push(materiaAtual);
    porPrefixo = new Map();
    ultimoNo = null;
  };

  for (const linha of linhas) {
    const numerada = NUMERADA.exec(linha);

    if (!numerada) {
      if (ROTULO_DE_MATERIA.test(linha) || pareceMateria(linha)) {
        novaMateria(tituloDeMateria(linha));
        continue;
      }
      // Sobra: continuação de um tópico que o PDF quebrou em duas linhas.
      if (ultimoNo) {
        ultimoNo.topic_text = juntarQuebra(ultimoNo.topic_text, linha);
      }
      continue;
    }

    const [, numeracao, resto] = numerada;
    const texto = normalizarTitulo(resto);
    if (!texto) continue;

    // Um tópico antes de qualquer matéria: o edital não rotulou a disciplina.
    if (!materiaAtual) novaMateria('Conteúdo programático');

    const no = { topic_text: texto, topic_number: numeracao, sub_topics: [] };

    const partes = numeracao.split('.');
    let pai = null;
    // Sobe até achar um ancestral que exista: `1.2.3` sem `1.2` no texto cai
    // em `1`, e sem `1` vira tópico de primeiro nível.
    for (let i = partes.length - 1; i > 0 && !pai; i--) {
      pai = porPrefixo.get(partes.slice(0, i).join('.')) ?? null;
    }

    if (pai) {
      pai.sub_topics.push(no);
      pai.is_grouping_topic = true;
    } else {
      materiaAtual.topics.push(no);
    }

    porPrefixo.set(numeracao, no);
    ultimoNo = no;
  }

  // A cor é atribuída depois do filtro: um falso positivo de matéria (um
  // "ANEXO II" em caixa alta, por exemplo) sai daqui sem tópico nenhum, e não
  // pode gastar uma cor da paleta.
  return materias
    .filter((materia) => materia.topics.length > 0)
    .map((materia, i) => limparMateria({ ...materia, color: CORES[i % CORES.length] }));
}

/** Cola a continuação de um tópico que o PDF quebrou em duas linhas. */
function juntarQuebra(anterior, proxima) {
  return `${anterior} ${proxima}`.replace(/\s+/g, ' ').trim();
}

/** Tira `sub_topics: []` vazio e marca quem agrupa. RF-C7 mora aqui também. */
function limparMateria(materia) {
  const limpar = (topicos) =>
    topicos.map((topico) => {
      const filhos = limpar(topico.sub_topics ?? []);
      // O ponto final do edital não é parte do tópico, e a continuação de
      // linha o traz de volta depois de `normalizarTitulo` já tê-lo tirado.
      const saida = { topic_text: topico.topic_text.replace(/[\s;.]+$/, '') };
      if (topico.topic_number) saida.topic_number = topico.topic_number;
      if (filhos.length > 0) {
        saida.is_grouping_topic = true;
        saida.sub_topics = filhos;
      }
      // Nada de `question_count`: ver o cabeçalho deste arquivo.
      return saida;
    });

  return { ...materia, topics: limpar(materia.topics) };
}

export function contarTopicos(topicos = []) {
  return topicos.reduce((total, t) => total + 1 + contarTopicos(t.sub_topics), 0);
}

export function contarTopicosDoPlano(materias) {
  return materias.reduce((total, m) => total + contarTopicos(m.topics), 0);
}

// -----------------------------------------------------------------------------
// Saída
// -----------------------------------------------------------------------------

export function slugify(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

function iconeComoDataUri(caminho) {
  const extensao = extname(caminho).toLowerCase();
  const mime = MIME_POR_EXTENSAO[extensao];
  if (!mime) {
    throw new Error(
      `Ícone ${caminho}: extensão ${extensao || '(nenhuma)'} não aceita pelo bucket. ` +
        `Use ${Object.keys(MIME_POR_EXTENSAO).join(', ')}.`
    );
  }
  const bytes = readFileSync(caminho);
  if (bytes.byteLength > ICONE_MAX_BYTES) {
    throw new Error(
      `Ícone ${caminho}: ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB, e o limite do bucket é 2 MB.`
    );
  }
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

/** Monta o arquivo no contrato da seção 6. */
export function montarTemplate({ subjects, nome, cargo, edital, banca, orgao, ano, url, observacoes, iconUrl }) {
  return {
    formato: FORMATO,
    versao: VERSAO,
    geradoEm: new Date().toISOString(),
    origem: {
      fonte: 'edital',
      ...(orgao ? { orgao } : {}),
      ...(edital ? { edital } : {}),
      ...(ano ? { ano: Number(ano) } : {}),
      ...(url ? { url } : {}),
    },
    plano: {
      name: nome,
      cargo: cargo ?? '',
      edital: edital ?? '',
      banca: banca ?? '',
      observations: observacoes ?? '',
      ...(iconUrl ? { iconUrl } : {}),
      subjects,
      // RF-C7: sempre vazio. Peso de tópico é o `userWeight`, que o usuário
      // preenche no `TopicWeightsModal`.
      bancaTopicWeights: {},
    },
  };
}

function desenharArvore(materias) {
  const linhas = [];
  for (const materia of materias) {
    linhas.push(`\n■ ${materia.subject}  (${contarTopicos(materia.topics)} tópicos)`);
    const andar = (topicos, nivel) => {
      for (const topico of topicos) {
        const numero = topico.topic_number ? `${topico.topic_number} ` : '';
        linhas.push(`${'  '.repeat(nivel + 1)}${numero}${topico.topic_text}`);
        andar(topico.sub_topics ?? [], nivel + 1);
      }
    };
    andar(materia.topics, 0);
  }
  return linhas.join('\n');
}

function atualizarIndice(entrada) {
  const caminho = join(DIR_CATALOGO, 'index.json');
  let indice = { templates: [] };
  if (existsSync(caminho)) {
    indice = JSON.parse(readFileSync(caminho, 'utf8'));
    if (!Array.isArray(indice.templates)) indice.templates = [];
  }

  const outros = indice.templates.filter((item) => item.slug !== entrada.slug);
  indice.templates = [...outros, entrada].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  writeFileSync(caminho, `${JSON.stringify(indice, null, 2)}\n`);
  return caminho;
}

// -----------------------------------------------------------------------------
// CLI
// -----------------------------------------------------------------------------

function lerArgumentos(argv) {
  const opcoes = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const chave = arg.slice(2);
    const proximo = argv[i + 1];
    if (proximo === undefined || proximo.startsWith('--')) {
      opcoes[chave] = true;
    } else {
      opcoes[chave] = proximo;
      i++;
    }
  }
  return opcoes;
}

function lerEntrada(caminho) {
  if (caminho === '-' || caminho === true) {
    return readFileSync(0, 'utf8');
  }
  return readFileSync(caminho, 'utf8');
}

async function principal() {
  const opcoes = lerArgumentos(process.argv.slice(2));

  if (!opcoes.texto || !opcoes.nome) {
    console.error(
      'Uso: node scripts/edital-para-plano.mjs --texto <arquivo|-> --nome "<nome do plano>"\n' +
        '     [--cargo X] [--edital X] [--banca X] [--orgao X] [--ano 2026] [--url https://...]\n' +
        '     [--icone logo.png] [--slug meu-slug] [--observacoes X] [--publicar]\n\n' +
        'Sem --publicar o script só PROPÕE a árvore na tela, para você conferir (RF-T2).'
    );
    process.exit(2);
  }

  const subjects = parseEdital(lerEntrada(opcoes.texto));
  if (subjects.length === 0) {
    console.error('Nenhuma matéria foi reconhecida no texto. Confira se o trecho colado é o anexo de conteúdo programático.');
    process.exit(1);
  }

  const iconUrl = opcoes.icone ? iconeComoDataUri(opcoes.icone) : undefined;
  const template = montarTemplate({
    subjects,
    nome: opcoes.nome,
    cargo: opcoes.cargo,
    edital: opcoes.edital,
    banca: opcoes.banca,
    orgao: opcoes.orgao,
    ano: opcoes.ano,
    url: opcoes.url,
    observacoes: opcoes.observacoes,
    iconUrl,
  });

  const slug = slugify(opcoes.slug === undefined || opcoes.slug === true ? opcoes.nome : opcoes.slug);
  const totalTopicos = contarTopicosDoPlano(subjects);

  console.log(desenharArvore(subjects));
  console.log(`\n${subjects.length} matérias, ${totalTopicos} tópicos. Slug: ${slug}`);

  if (!opcoes.url) {
    console.warn(
      '\nAVISO: sem --url o plano vai ao catálogo sem link para o PDF oficial, e o RF-C6 ' +
        '(procedência conferível) fica sem a metade que importa.'
    );
  }

  if (!opcoes.publicar) {
    console.log(
      '\n--- PROPOSTA, nada foi escrito ---\n' +
        'Confira a árvore acima contra o PDF. Quando estiver certa, rode de novo com --publicar.'
    );
    return;
  }

  mkdirSync(DIR_CATALOGO, { recursive: true });
  const caminhoDoPlano = join(DIR_CATALOGO, `${slug}.json`);
  writeFileSync(caminhoDoPlano, `${JSON.stringify(template, null, 2)}\n`);

  const caminhoDoIndice = atualizarIndice({
    slug,
    nome: opcoes.nome,
    ...(opcoes.cargo ? { cargo: opcoes.cargo } : {}),
    ...(opcoes.banca ? { banca: opcoes.banca } : {}),
    ...(opcoes.orgao ? { orgao: opcoes.orgao } : {}),
    ...(opcoes.ano ? { ano: Number(opcoes.ano) } : {}),
    materias: subjects.length,
    topicos: totalTopicos,
    atualizadoEm: new Date().toISOString().slice(0, 10),
  });

  console.log(`\nEscrito: ${caminhoDoPlano}\nAtualizado: ${caminhoDoIndice}\n\nAgora é commit e deploy.`);
}

// Só roda como CLI quando é o arquivo invocado; importado, exporta as funções
// puras para o teste.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  principal().catch((erro) => {
    console.error(erro.message);
    process.exit(1);
  });
}
