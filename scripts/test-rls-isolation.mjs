#!/usr/bin/env node
/**
 * Teste de isolamento da RLS.
 *
 * Cria dois usuários pela API pública e confirma, usando a anon key — o mesmo
 * caminho que o browser usa —, que o usuário B não enxerga, não altera e não
 * apaga nada do usuário A, e que a anon key sozinha não lê nada.
 *
 * Cada execução cria contas novas, com e-mail aleatório e senha de uso único que não
 * é impressa em lugar nenhum — contra um banco hospedado elas ficam inertes.
 *
 * Uso:
 *   npm run test:rls                          # contra o `supabase start` local
 *   ALLOW_REMOTE=1 SUPABASE_URL=... SUPABASE_ANON_KEY=... npm run test:rls
 */

import { randomBytes } from 'node:crypto';

const URL_BASE = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// O teste cria usuários de verdade via `signUp`. Contra um banco hospedado isso deixa
// contas para tras, então exigimos o consentimento explícito de ALLOW_REMOTE=1 — protege
// contra rodar `npm run test:rls` com o ambiente apontado para staging sem querer.
const LOCAIS = ['127.0.0.1', 'localhost', '::1', '0.0.0.0'];
if (!LOCAIS.includes(new URL(URL_BASE).hostname) && process.env.ALLOW_REMOTE !== '1') {
  console.error(
    `\nRecusando rodar contra ${URL_BASE}: não é um Supabase local.\n` +
      'O teste cria usuários reais. Se é isso que você quer, repita com ALLOW_REMOTE=1.\n'
  );
  process.exit(1);
}

/** Senha de uso único, com entropia de sobra e nunca impressa. O sufixo satisfaz
 *  qualquer `password_requirements` que o projeto remoto possa ter ligado. */
const senhaDescartavel = () => randomBytes(24).toString('base64url') + 'aA1!';

const TABELAS = [
  'profiles',
  'plans',
  'study_records',
  'review_records',
  'simulado_records',
  'simulado_subjects',
  'study_cycles',
];

let falhas = 0;

function ok(nome) {
  console.log(`  \x1b[32m✓\x1b[0m ${nome}`);
}

function falhou(nome, detalhe) {
  falhas++;
  console.log(`  \x1b[31m✗\x1b[0m ${nome}`);
  console.log(`    \x1b[31m${detalhe}\x1b[0m`);
}

function checar(nome, condicao, detalhe) {
  condicao ? ok(nome) : falhou(nome, detalhe);
}

async function auth(caminho, corpo) {
  const res = await fetch(`${URL_BASE}/auth/v1/${caminho}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`${caminho} respondeu ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

/** Uma requisição ao PostgREST com a anon key e, opcionalmente, o JWT do usuário. */
async function rest(token, metodo, caminho, { body, prefer } = {}) {
  const headers = { apikey: ANON_KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
    method: metodo,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const texto = await res.text();
  let dados = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = texto;
  }
  return { status: res.status, ok: res.ok, dados };
}

async function criarUsuario(rotulo) {
  // `randomBytes`, e não o timestamp de antes: um e-mail derivado do relógio é
  // enumerável por força bruta. O domínio `.test` é reservado e não roteável.
  const sufixo = randomBytes(12).toString('hex');
  const email = `rls-${rotulo}-${sufixo}@ouroboros.test`;
  const senha = senhaDescartavel();

  const sessao = await auth('signup', {
    email,
    password: senha,
    data: { username: `rls_${rotulo}_${sufixo}` },
  });

  const token = sessao.access_token ?? (await auth('token?grant_type=password', { email, password: senha })).access_token;
  if (!token) throw new Error(`Não veio access_token para o usuário ${rotulo}. Confirmação de e-mail está ligada?`);

  return { rotulo, token, id: sessao.user?.id ?? sessao.id };
}

/** Popula uma linha em cada tabela para o usuário dono do token. */
async function semear(usuario) {
  const criar = async (tabela, linha) => {
    const { ok: sucesso, status, dados } = await rest(usuario.token, 'POST', tabela, {
      body: linha,
      prefer: 'return=representation',
    });
    if (!sucesso) throw new Error(`Falha ao semear ${tabela} (${status}): ${JSON.stringify(dados)}`);
    return dados[0];
  };

  const plan = await criar('plans', {
    user_id: usuario.id,
    name: `Plano de ${usuario.rotulo}`,
    subjects: [{ id: 'mat-1', subject: 'Português', color: '#f00', topics: [] }],
  });

  const studyRecord = await criar('study_records', {
    user_id: usuario.id,
    plan_id: plan.id,
    date: '2026-01-15',
    subject_id: 'mat-1',
    subject: 'Português',
    topic: 'Crase',
    study_time: 3600,
    questions: { correct: 8, total: 10 },
  });

  const reviewRecord = await criar('review_records', {
    user_id: usuario.id,
    plan_id: plan.id,
    study_record_id: studyRecord.id,
    scheduled_date: '2026-01-16',
    original_date: '2026-01-15',
    subject_id: 'mat-1',
    subject: 'Português',
    topic: 'Crase',
    review_period: '1 dia',
  });

  const simulado = await criar('simulado_records', {
    user_id: usuario.id,
    plan_id: plan.id,
    date: '2026-01-20',
    name: 'Simulado 1',
    banca: 'CESPE',
  });

  const simuladoSubject = await criar('simulado_subjects', {
    simulado_record_id: simulado.id,
    subject_name: 'Português',
    total_questions: 20,
    correct: 15,
    incorrect: 5,
  });

  const cycle = await criar('study_cycles', {
    user_id: usuario.id,
    plan_id: plan.id,
    cycle: [{ id: 1, subject: 'Português', duration: 60 }],
    study_hours: '20',
  });

  return { plan, studyRecord, reviewRecord, simulado, simuladoSubject, cycle };
}

async function main() {
  console.log(`\nTeste de isolamento da RLS — ${URL_BASE}\n`);

  const a = await criarUsuario('a');
  const b = await criarUsuario('b');
  // O `id` basta para depurar e, ao contrário do e-mail, não é metade de um par de login.
  console.log(`Usuário A: ${a.id}`);
  console.log(`Usuário B: ${b.id}`);

  const dadosDeA = await semear(a);
  await semear(b);

  // Sanidade. Sem isto, "B não vê nada" também passaria com o banco vazio.
  console.log('\nSanidade — A enxerga os próprios dados:');
  for (const tabela of TABELAS) {
    const { dados, status } = await rest(a.token, 'GET', `${tabela}?select=id`);
    checar(
      `A lê ${tabela}`,
      Array.isArray(dados) && dados.length > 0,
      `esperava ao menos 1 linha, veio ${status}: ${JSON.stringify(dados)}`,
    );
  }

  console.log('\nLeitura — B não enxerga nada de A:');
  for (const tabela of TABELAS) {
    const { dados, status } = await rest(b.token, 'GET', `${tabela}?select=id`);
    if (!Array.isArray(dados)) {
      falhou(`B lê ${tabela}`, `resposta inesperada (${status}): ${JSON.stringify(dados)}`);
      continue;
    }
    // B tem os próprios dados; o que não pode aparecer é qualquer linha de A.
    const idsDeA = new Set(
      [
        dadosDeA.plan.id,
        dadosDeA.studyRecord.id,
        dadosDeA.reviewRecord.id,
        dadosDeA.simulado.id,
        dadosDeA.simuladoSubject.id,
        dadosDeA.cycle.id,
        a.id,
      ],
    );
    const vazados = dados.filter((linha) => idsDeA.has(linha.id));
    checar(
      `B não vê linhas de A em ${tabela}`,
      vazados.length === 0,
      `vazaram ${vazados.length} linha(s): ${JSON.stringify(vazados)}`,
    );
  }

  console.log('\nLeitura direcionada — B pede o id exato de uma linha de A:');
  const alvos = [
    ['profiles', a.id],
    ['plans', dadosDeA.plan.id],
    ['study_records', dadosDeA.studyRecord.id],
    ['review_records', dadosDeA.reviewRecord.id],
    ['simulado_records', dadosDeA.simulado.id],
    ['simulado_subjects', dadosDeA.simuladoSubject.id],
    ['study_cycles', dadosDeA.cycle.id],
  ];
  for (const [tabela, id] of alvos) {
    const { dados, status } = await rest(b.token, 'GET', `${tabela}?id=eq.${id}&select=id`);
    checar(
      `B recebe zero linhas de ${tabela}`,
      Array.isArray(dados) && dados.length === 0,
      `veio ${status}: ${JSON.stringify(dados)}`,
    );
  }

  console.log('\nEscrita — B não altera nem apaga dados de A:');
  const updates = [
    ['plans', dadosDeA.plan.id, { name: 'invadido' }],
    ['study_records', dadosDeA.studyRecord.id, { topic: 'invadido' }],
    ['review_records', dadosDeA.reviewRecord.id, { status: 'completed' }],
    ['simulado_records', dadosDeA.simulado.id, { name: 'invadido' }],
    ['simulado_subjects', dadosDeA.simuladoSubject.id, { correct: 0 }],
    ['study_cycles', dadosDeA.cycle.id, { study_hours: '999' }],
    ['profiles', a.id, { username: 'invadido' }],
  ];
  for (const [tabela, id, patch] of updates) {
    const { dados, status } = await rest(b.token, 'PATCH', `${tabela}?id=eq.${id}`, {
      body: patch,
      prefer: 'return=representation',
    });
    checar(
      `B não altera ${tabela} de A`,
      Array.isArray(dados) && dados.length === 0,
      `alterou ${JSON.stringify(dados)} (status ${status})`,
    );
  }

  for (const [tabela, id] of alvos) {
    const { dados, status } = await rest(b.token, 'DELETE', `${tabela}?id=eq.${id}`, {
      prefer: 'return=representation',
    });
    checar(
      `B não apaga ${tabela} de A`,
      Array.isArray(dados) && dados.length === 0,
      `apagou ${JSON.stringify(dados)} (status ${status})`,
    );
  }

  console.log('\nEscrita forjada — B tenta gravar linha em nome de A:');
  const forjados = [
    ['plans', { user_id: a.id, name: 'plano forjado' }],
    ['study_records', { user_id: a.id, plan_id: dadosDeA.plan.id, date: '2026-02-01', subject_id: 'x' }],
    ['simulado_records', { user_id: a.id, plan_id: dadosDeA.plan.id, date: '2026-02-01' }],
    ['study_cycles', { user_id: a.id, plan_id: dadosDeA.plan.id }],
    ['simulado_subjects', { simulado_record_id: dadosDeA.simulado.id, subject_name: 'forjada' }],
  ];
  for (const [tabela, linha] of forjados) {
    const { ok: sucesso, status, dados } = await rest(b.token, 'POST', tabela, {
      body: linha,
      prefer: 'return=representation',
    });
    checar(
      `B não insere em ${tabela} como A`,
      !sucesso,
      `insert aceito (status ${status}): ${JSON.stringify(dados)}`,
    );
  }

  console.log('\nAnon key sem sessão — não lê nada do schema public:');
  for (const tabela of TABELAS) {
    const { ok: sucesso, status, dados } = await rest(null, 'GET', `${tabela}?select=id`);
    checar(
      `anon é barrado em ${tabela}`,
      !sucesso || (Array.isArray(dados) && dados.length === 0),
      `respondeu ${status}: ${JSON.stringify(dados)}`,
    );
  }

  console.log('');
  if (falhas > 0) {
    console.error(`\x1b[31m${falhas} verificação(ões) falharam.\x1b[0m\n`);
    process.exit(1);
  }
  console.log('\x1b[32mIsolamento confirmado: B não alcança nenhum dado de A.\x1b[0m\n');
}

main().catch((erro) => {
  console.error(`\n\x1b[31mErro ao rodar o teste: ${erro.message}\x1b[0m\n`);
  process.exit(1);
});
