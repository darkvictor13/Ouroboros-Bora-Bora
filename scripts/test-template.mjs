#!/usr/bin/env node
/**
 * Teste do contrato do arquivo de plano (`src/lib/data/template.ts`).
 *
 * Cobre os requisitos que são decisão de código puro, e não de tela: RF-A2
 * (validação e mensagem de versão), RF-C4 (sufixo de nome), RF-C5 (ícone fora
 * dos limites do bucket), RF-C7 (nada de `question_count`) e a regra que
 * sustenta o clone - **uuid novo por matéria**.
 *
 * O `.ts` é importado direto: o Node 24 tira os tipos sozinho. Sem bundler,
 * sem browser, sem Supabase - a camada é pura de propósito.
 *
 * Roda com `npm run test:template`.
 */

import {
  PLAN_TEMPLATE_FORMAT,
  PLAN_TEMPLATE_VERSION,
  countTemplateTopics,
  dataUrlToIconFile,
  parsePlanFile,
  parsePlanTemplate,
  sanitizeSubjects,
  suggestPlanName,
  templateToPlanInput,
} from '../src/lib/data/template.ts';

const resultados = [];

function check(nome, ok, detalhe = '') {
  resultados.push({ nome, ok, detalhe });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${nome}${detalhe && !ok ? ` :: ${detalhe}` : ''}`);
}

const ID_MATERIA = '11111111-1111-4111-8111-111111111111';

function arquivoValido(extra = {}) {
  return {
    formato: PLAN_TEMPLATE_FORMAT,
    versao: PLAN_TEMPLATE_VERSION,
    geradoEm: '2026-09-08T12:00:00.000Z',
    origem: {
      fonte: 'edital',
      orgao: 'Órgão de Exemplo',
      edital: 'Edital nº 0/0000',
      ano: 2026,
      url: 'https://exemplo.gov.br/edital.pdf',
    },
    plano: {
      name: 'Plano de Exemplo',
      cargo: 'Cargo de Exemplo',
      banca: 'Banca de Exemplo',
      subjects: [
        {
          id: ID_MATERIA,
          subject: 'Direito Constitucional',
          color: '#EF4444',
          topics: [
            {
              topic_text: 'Princípios fundamentais',
              is_grouping_topic: true,
              sub_topics: [{ topic_text: 'Soberania' }],
            },
          ],
        },
      ],
      bancaTopicWeights: { [ID_MATERIA]: { 'Princípios fundamentais': 42 } },
      ...extra,
    },
  };
}

// ------------------------------------------------------------------- RF-A2
{
  const r = parsePlanTemplate(arquivoValido());
  check('arquivo no contrato é aceito', r.ok === true, r.ok ? '' : r.erro);
  check(
    'a origem sobrevive à validação, com o link do PDF (RF-C6)',
    r.ok && r.template.origem?.url === 'https://exemplo.gov.br/edital.pdf'
  );
}

{
  const r = parsePlanTemplate({ ...arquivoValido(), versao: 2 });
  check(
    'versão mais nova diz que quem está velho é o APP',
    !r.ok && /velho é o app/i.test(r.erro),
    r.ok ? 'aceitou' : r.erro
  );
}

{
  const r = parsePlanTemplate({ ...arquivoValido(), versao: 0 });
  check(
    'versão mais velha diz que quem está velho é o ARQUIVO',
    !r.ok && /velho é o arquivo/i.test(r.erro),
    r.ok ? 'aceitou' : r.erro
  );
}

{
  const r = parsePlanTemplate({ ...arquivoValido(), formato: 'outra-coisa' });
  check('formato desconhecido é recusado', !r.ok, r.ok ? 'aceitou' : '');
}

{
  const arquivo = arquivoValido();
  arquivo.plano.subjects = [];
  const r = parsePlanTemplate(arquivo);
  check('plano sem matéria é recusado', !r.ok && /matéria/i.test(r.erro), r.ok ? 'aceitou' : r.erro);
}

{
  const r = parsePlanFile('não é json de objeto');
  check('valor que não é objeto é recusado sem explodir', !r.ok);
}

// --------------------------------------------------- campo desconhecido (§6)
{
  const arquivo = arquivoValido();
  arquivo.plano.subjects[0].total_topics_count = 99;
  arquivo.plano.subjects[0].topics[0].completed = 5;
  arquivo.plano.subjects[0].topics[0].percentage = 80;
  arquivo.naoConheco = { nada: true };

  const r = parsePlanTemplate(arquivo);
  const materia = r.ok ? r.template.plano.subjects[0] : null;
  check(
    'campo desconhecido é ignorado, não rejeitado',
    r.ok === true && materia.total_topics_count === undefined,
    r.ok ? '' : r.erro
  );
  check(
    'campo derivado de estatística não entra no plano importado',
    materia?.topics[0].completed === undefined &&
      materia?.topics[0].percentage === undefined
  );
}

// ------------------------------------------------------------------- RF-C7
{
  const arquivo = arquivoValido();
  arquivo.plano.subjects[0].topics[0].question_count = 42;

  const comContagem = parsePlanTemplate(arquivo);
  check(
    'question_count sobrevive num arquivo do disco (é backup do próprio usuário)',
    comContagem.ok &&
      comContagem.template.plano.subjects[0].topics[0].question_count === 42
  );

  const doCatalogo = parsePlanTemplate(arquivo, { dropQuestionCount: true });
  check(
    'RF-C7: no catálogo, question_count é descartado na leitura',
    doCatalogo.ok &&
      !JSON.stringify(doCatalogo.template.plano.subjects).includes('question_count'),
    doCatalogo.ok ? '' : doCatalogo.erro
  );
  check(
    'RF-C7: no catálogo, bancaTopicWeights vem vazio',
    doCatalogo.ok &&
      Object.keys(doCatalogo.template.plano.bancaTopicWeights ?? {}).length === 0
  );
}

// ------------------------------------------------------- peso órfão e árvore
{
  const arquivo = arquivoValido();
  arquivo.plano.bancaTopicWeights = {
    [ID_MATERIA]: { 'Princípios fundamentais': 42 },
    'materia-que-nao-existe': { Qualquer: 7 },
  };
  const r = parsePlanTemplate(arquivo);
  check(
    'peso que aponta para matéria inexistente é descartado',
    r.ok && Object.keys(r.template.plano.bancaTopicWeights).length === 1,
    r.ok ? JSON.stringify(r.template.plano.bancaTopicWeights) : r.erro
  );
}

{
  const materias = sanitizeSubjects([
    { id: 'x', subject: '   ', color: '#000', topics: [] },
    { id: 'y', subject: 'Válida', topics: [{ topic_text: '  ' }, { topic_text: 'Tem texto' }] },
  ]);
  check(
    'matéria sem nome e tópico sem texto são descartados',
    materias.length === 1 && materias[0].topics.length === 1,
    JSON.stringify(materias)
  );
  check('matéria sem cor recebe a cor padrão', /^#[0-9A-F]{6}$/i.test(materias[0].color));
}

{
  const r = parsePlanTemplate(arquivoValido());
  check(
    'a contagem de tópicos atravessa a árvore inteira',
    r.ok && countTemplateTopics(r.template.plano.subjects) === 2,
    r.ok ? String(countTemplateTopics(r.template.plano.subjects)) : r.erro
  );
}

// ------------------------------------------------------ uuid novo por matéria
{
  const r = parsePlanTemplate(arquivoValido());
  const a = templateToPlanInput(r.template);
  const b = templateToPlanInput(r.template);

  check(
    'cada clone gera um id de matéria novo',
    a.subjects[0].id !== ID_MATERIA &&
      b.subjects[0].id !== ID_MATERIA &&
      a.subjects[0].id !== b.subjects[0].id,
    `${a.subjects[0].id} / ${b.subjects[0].id}`
  );
  check(
    'os pesos acompanham o id novo, e não sobra chave antiga',
    Object.keys(a.bancaTopicWeights).length === 1 &&
      a.bancaTopicWeights[a.subjects[0].id]?.['Princípios fundamentais'] === 42,
    JSON.stringify(a.bancaTopicWeights)
  );
  check(
    'o nome pode ser trocado na confirmação',
    templateToPlanInput(r.template, { name: '  Outro nome  ' }).name === 'Outro nome'
  );
  check(
    'o clone não carrega id de plano',
    !('id' in a),
    JSON.stringify(Object.keys(a))
  );
}

// ------------------------------------------------------------- RF-C4 / RF-A3
check(
  'nome livre é mantido como está',
  suggestPlanName('Plano X', ['Outro']) === 'Plano X'
);
check(
  'nome ocupado ganha o sufixo (2)',
  suggestPlanName('Plano X', ['Plano X']) === 'Plano X (2)',
  suggestPlanName('Plano X', ['Plano X'])
);
check(
  'o sufixo continua subindo enquanto houver colisão',
  suggestPlanName('Plano X', ['Plano X', 'Plano X (2)', 'plano x (3)']) === 'Plano X (4)',
  suggestPlanName('Plano X', ['Plano X', 'Plano X (2)', 'plano x (3)'])
);

// ---------------------------------------------------------------- RF-A1 backup
{
  const backup = {
    version: 4,
    plans: [
      {
        fileName: 'meu-plano.json',
        content: {
          name: 'Plano do Backup',
          subjects: [{ id: 'a', subject: 'Português', color: '#EF4444', topics: [{ topic_text: 'Crase' }] }],
          records: [{ id: 'r1' }],
        },
      },
      // A v1 gravava `content` como o array puro de matérias: o nome vem do arquivo.
      {
        fileName: 'plano-antigo.json',
        content: [{ id: 'b', subject: 'Matemática', topics: [{ topic_text: 'Razão' }] }],
      },
      { fileName: 'vazio.json', content: { name: 'Sem matéria', subjects: [] } },
    ],
  };

  const r = parsePlanFile(backup);
  check(
    'backup completo vira uma lista de planos importáveis (RF-A1)',
    r.ok && r.tipo === 'backup' && r.templates.length === 2,
    r.ok ? r.templates.map((t) => t.plano.name).join(' | ') : r.erro
  );
  check(
    'plano da v1 (content como array) recupera o nome pelo fileName',
    r.ok && r.templates[1].plano.name === 'plano-antigo'
  );
  check(
    'plano sem matéria do backup vira aviso, não erro do arquivo inteiro',
    r.ok && r.avisos.length === 1 && /Sem matéria/.test(r.avisos[0]),
    r.ok ? JSON.stringify(r.avisos) : r.erro
  );
  check(
    'o histórico do backup não viaja junto do plano',
    r.ok && !JSON.stringify(r.templates).includes('"records"')
  );
}

{
  const r = parsePlanFile({ formato: PLAN_TEMPLATE_FORMAT, versao: 7, plano: {} });
  check(
    'arquivo que se declara template não é tratado como backup: o erro é de versão',
    !r.ok && /versão 7/i.test(r.erro),
    r.ok ? 'aceitou' : r.erro
  );
}

// ------------------------------------------------------------------- RF-C5
{
  // 1x1 PNG transparente.
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const bom = dataUrlToIconFile(png, 'Plano de Exemplo');
  check(
    'data: URI de png vira File com o mime certo',
    bom.file instanceof File && bom.file.type === 'image/png' && bom.file.size > 0 && !bom.aviso,
    bom.aviso ?? String(bom.file?.size)
  );

  const semIcone = dataUrlToIconFile(undefined, 'x');
  check('plano sem ícone não gera aviso nenhum', !semIcone.file && !semIcone.aviso);

  const tipoRuim = dataUrlToIconFile('data:image/bmp;base64,QQ==', 'x');
  check(
    'mime fora do bucket é descartado com aviso, sem abortar',
    !tipoRuim.file && /não aceita/i.test(tipoRuim.aviso ?? ''),
    tipoRuim.aviso
  );

  const gigante = `data:image/png;base64,${'A'.repeat(3 * 1024 * 1024)}`;
  const grande = dataUrlToIconFile(gigante, 'x');
  check(
    'ícone acima de 2 MB é descartado com aviso, sem abortar',
    !grande.file && /limite é 2 MB/i.test(grande.aviso ?? ''),
    grande.aviso
  );

  const lixo = dataUrlToIconFile('https://exemplo.gov.br/logo.png', 'x');
  check(
    'o que não é data: URI é descartado com aviso',
    !lixo.file && Boolean(lixo.aviso),
    lixo.aviso
  );
}

console.log('\n================ RESUMO ================');
const ok = resultados.filter((r) => r.ok).length;
console.log(`${ok}/${resultados.length} checks passaram`);
for (const r of resultados.filter((r) => !r.ok)) {
  console.log(`  FAIL: ${r.nome} :: ${String(r.detalhe).slice(0, 200)}`);
}

process.exit(ok === resultados.length ? 0 : 1);
