/**
 * Teste de ponta a ponta do app, com Playwright.
 *
 * Dirige a SPA de verdade contra o Supabase local e cobre o caminho inteiro:
 * guard de rota, cadastro, plano, matéria, registro de estudo com revisões,
 * reedição, ciclo, simulado, ícone no Storage, backup, exclusão e login.
 *
 * Era `test-data-layer.mjs`, sobre Puppeteer. O Puppeteer saiu do projeto junto
 * com o Electron (ele existia para raspar o guia do TEC no processo main), e o
 * teste veio para o Playwright, que já era a ferramenta usada para conferir a
 * migração.
 *
 * Pré-requisitos:
 *   npx supabase start
 *   npm run dev          # ou `npm run start:web`, para testar o bundle estático
 *
 * Uso:
 *   npm run test:e2e
 *   BASE=http://localhost:3000 npm run test:e2e
 *   ALLOW_REMOTE=1 BASE=https://<projeto>.pages.dev npm run test:e2e
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const BASE = process.env.BASE || 'http://localhost:3000';

// O teste cadastra um usuário de verdade no Supabase por trás da SPA. Apontar o BASE
// para uma URL publicada significa sujar o Auth de um projeto hospedado, então isso
// exige consentimento explícito.
const LOCAIS = ['127.0.0.1', 'localhost', '::1', '0.0.0.0'];
if (!LOCAIS.includes(new URL(BASE).hostname) && process.env.ALLOW_REMOTE !== '1') {
  console.error(
    `\nRecusando rodar contra ${BASE}: não é um host local.\n` +
      'O teste cadastra um usuário real no Supabase que a SPA usa.\n' +
      'Se é isso que você quer, repita com ALLOW_REMOTE=1.\n'
  );
  process.exit(1);
}

// `randomBytes`, e não `Date.now()`: um e-mail derivado do relógio é enumerável por
// força bruta. `@example.com` é reservado, então nenhum e-mail sai de fato. A senha é
// descartável e nunca impressa — o sufixo satisfaz qualquer `password_requirements`
// que o projeto remoto tenha ligado.
const stamp = randomBytes(9).toString('hex');
const EMAIL = `e2e+${stamp}@example.com`;
const USER = `e2euser${stamp}`;
const PASS = randomBytes(24).toString('base64url') + 'aA1!';
const PLAN = `Plano E2E ${stamp}`;
const PLAN_ICON = `Plano com Ícone ${stamp}`;
const SUBJECT = 'Direito Constitucional';
const TOPIC = 'Controle de Constitucionalidade';

const dir = mkdtempSync(join(tmpdir(), 'ouroboros-e2e-'));
const ICON_PATH = join(dir, 'icone.png');
const BACKUP_PATH = join(dir, 'backup.json');
// PNG 1×1 — o teste só precisa de bytes de imagem válidos para exercitar o upload.
writeFileSync(ICON_PATH, Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
));

const results = [];
const errors = [];
let etapa = 'boot';

function check(nome, ok, detalhe = '') {
  results.push({ nome, ok, detalhe });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${nome}${detalhe ? '  :: ' + String(detalhe).slice(0, 170) : ''}`);
}

const IGNORAR = [/favicon/i, /React DevTools/i];

const browser = await chromium.launch({
  // `channel: 'chrome'` usa o Chrome do sistema e evita baixar um browser só
  // para o teste. Sem ele, rode `npx playwright install chromium` uma vez.
  channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
  args: ['--no-sandbox'],
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();

page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (IGNORAR.some((r) => r.test(t))) return;
  errors.push(`[${etapa}] ${t}`);
});
page.on('pageerror', (e) => errors.push(`[${etapa}] pageerror: ${e.message}`));

const passo = (s) => { etapa = s; console.log(`\n--- ${s}`); };
const sleep = (ms) => page.waitForTimeout(ms);
const ir = (rota) => page.goto(BASE + rota, { waitUntil: 'networkidle' });
const texto = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

/** Escreve num campo controlado pelo React sem depender do teclado. */
async function setValor(seletor, valor) {
  await page.evaluate(({ seletor, valor }) => {
    const el = document.querySelector(seletor);
    if (!el) return;
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement : window.HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, valor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, { seletor, valor });
}

/** Clica no primeiro botão cujo texto casa com a expressão. */
async function clicarBotao(regex, { ultimo = false } = {}) {
  return page.evaluate(({ fonte, flags, ultimo }) => {
    const re = new RegExp(fonte, flags);
    const achados = [...document.querySelectorAll('button')].filter((b) => re.test(b.textContent || ''));
    const btn = ultimo ? achados[achados.length - 1] : achados[0];
    if (!btn) return false;
    btn.click();
    return true;
  }, { fonte: regex.source, flags: regex.flags, ultimo });
}

/** Os dropdowns do app são botões "Selecione..." identificados pelo <label> acima. */
async function abrirDropdown(rotulo) {
  return page.evaluate((rotulo) => {
    const btn = [...document.querySelectorAll('button')].find((b) => {
      if (!/Selecione/.test(b.textContent || '')) return false;
      let node = b.parentElement;
      for (let i = 0; i < 4 && node; i++) {
        const l = node.querySelector('label');
        if (l) return l.textContent.trim() === rotulo;
        node = node.parentElement;
      }
      return false;
    });
    if (!btn) return false;
    btn.click();
    return true;
  }, rotulo);
}

async function escolherOpcao(alvo) {
  return page.evaluate((alvo) => {
    const cands = [...document.querySelectorAll('div, li')].filter((e) => {
      const proprio = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
      return e.textContent.trim() === alvo || proprio === alvo;
    });
    const el = cands[cands.length - 1];
    if (el) { el.click(); return true; }
    return false;
  }, alvo);
}

let planId = null;

try {
// ------------------------------------------------------------ 1. guard
passo('guard de rota');
await ir('/dashboard');
await sleep(1500);
check('sem sessão, /dashboard redireciona para /login', page.url().includes('/login'), page.url());

// --------------------------------------------------------- 2. cadastro
passo('cadastro');
await ir('/register');
await page.fill('#username', USER);
await page.fill('#email', EMAIL);
await page.fill('#password', PASS);
await page.fill('#confirmPassword', PASS);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith('/register'), { timeout: 25000 }).catch(() => {});
await sleep(2500);
check('cadastro entra na área logada', !/\/(register|login)/.test(page.url()), page.url());
check('sessão gravada em cookie sb-*', (await ctx.cookies()).some((c) => c.name.startsWith('sb-')));

await ir('/planos');
await sleep(2000);
check('sidebar mostra o username criado pelo trigger on_auth_user_created',
  (await texto()).includes(USER));

// ----------------------------------------------------- 3. criar plano
passo('criar plano');
await page.getByTitle('Criar Novo Plano').click();
await page.waitForSelector('#planName', { timeout: 10000 });
await setValor('#planName', PLAN);
await setValor('#cargo', 'Analista Judiciário');
await setValor('#banca', 'CESPE');
// o modal é em etapas: segue clicando até ele fechar
for (let i = 0; i < 4 && (await page.locator('#planName').count()) > 0; i++) {
  if (!(await clicarBotao(/avançar|salvar|criar plano|concluir|finalizar/i, { ultimo: true }))) break;
  await sleep(1500);
}
await sleep(2500);

const temCard = (await page.locator('h2', { hasText: PLAN }).count()) > 0;
check('plano aparece na lista com o nome digitado', temCard);

const href = temCard
  ? await page.locator('a', { has: page.locator('h2', { hasText: PLAN }) }).first().getAttribute('href')
  : null;
planId = href ? new URL(href, BASE).searchParams.get('id') : null;
check('o detalhe do plano é endereçado por ?id=<uuid> (e não por rota dinâmica)',
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(planId || ''), String(href));
check('banca gravada e exibida (coluna da migration 0002)', (await texto()).includes('CESPE'));

// -------------------------------------------------------- 4. matéria
passo('adicionar matéria');
await ir(`/planos?id=${planId}`);
await sleep(2000);
check('detalhe do plano carrega pela query string', !(await texto()).includes('Plano não encontrado'));

await clicarBotao(/adicionar disciplina|nova disciplina|adicionar matéria/i);
await page.waitForSelector('#subjectName', { timeout: 10000 });
await setValor('#subjectName', SUBJECT);
await setValor('#topicsContent', `${TOPIC}\nPrincípios Fundamentais`);
await clicarBotao(/^Salvar$/, { ultimo: true });
await sleep(3000);
check('matéria adicionada aparece no plano', (await texto()).includes(SUBJECT));

// ------------------------------------------- 5. registro com revisões
passo('registro de estudo');
await ir('/dashboard');
await sleep(2500);
await clicarBotao(/^Adicionar$/);
await sleep(1500);

await abrirDropdown('Disciplina'); await sleep(600);
check('dropdown de disciplina lista a matéria criada', await escolherOpcao(SUBJECT));
await sleep(800);
await abrirDropdown('Tópico'); await sleep(600);
check('dropdown de tópico lista o tópico da matéria', await escolherOpcao(TOPIC));
await sleep(600);
await abrirDropdown('Categoria'); await sleep(600);
await escolherOpcao('Teoria');
await sleep(500);

await setValor('#studyTime', '01:30:00');
await setValor('#acertos-0', '8');
await setValor('#erros-0', '2');
await setValor('#comments', 'Comentário do teste E2E');
const marcarRevisoes = page.locator('#programarRevisoes');
if ((await marcarRevisoes.count()) && !(await marcarRevisoes.isChecked())) await marcarRevisoes.click();
await sleep(1000);

async function adicionarRevisao(dias) {
  await page.evaluate(() => {
    const rotulo = [...document.querySelectorAll('label, span, div')]
      .find((e) => e.textContent.trim() === 'Programar Revisões');
    if (!rotulo) return;
    const mais = [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === '+')
      .find((b) => rotulo.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    mais?.click();
  });
  await sleep(1000);
  await page.evaluate((dias) => {
    const campos = [...document.querySelectorAll('input[type="number"], input[type="text"]')];
    const el = campos[campos.length - 1];
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, String(dias));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, dias);
  await sleep(400);
  await clicarBotao(/^Salvar$/, { ultimo: true });
  await sleep(900);
}
await adicionarRevisao(1);
await adicionarRevisao(7);
const form = await texto();
check('dois períodos de revisão registrados no formulário', /1d/.test(form) && /7d/.test(form));

await clicarBotao(/^Salvar$/, { ultimo: true });
await sleep(3500);
check('registro salvo e refletido no dashboard', /1h\s?30m/.test(await texto()));

// ------------------- 6. reeditar: revisões são recriadas, não duplicadas
passo('reeditar registro');
await ir('/historico');
await sleep(2500);
const abriuEdicao = await page.evaluate(() => {
  const btn = document.querySelector('tbody tr')?.querySelector('button');
  if (!btn) return false;
  btn.click();
  return true;
});
await sleep(1800);
check('registro aparece no histórico e abre para edição', abriuEdicao);

await page.evaluate(() => {
  const x = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '×' &&
    (b.previousSibling?.textContent || b.parentElement?.textContent || '').includes('7d'));
  x?.click();
});
await sleep(600);
const errosAntes = errors.length;
await clicarBotao(/^Salvar$/, { ultimo: true });
await sleep(3000);
check('edição do registro não gera erro de console', errors.length === errosAntes,
  errors.slice(errosAntes).join(' | '));

// -------------------------------------------------- 7. ciclo de estudos
passo('ciclo de estudos');
await ir('/planejamento');
await sleep(2500);
await clicarBotao(/começar novo ciclo/i);
await sleep(1800);
await page.evaluate(() => {
  const el = [...document.querySelectorAll('div, button, h3')]
    .find((e) => e.textContent.trim().startsWith('Modo Manual'));
  el?.click();
});
await sleep(1500);
await clicarBotao(/^Selecione uma matéria$/);
await sleep(600);
await escolherOpcao(SUBJECT);
await sleep(500);
await page.evaluate(() => {
  const num = [...document.querySelectorAll('input[type="number"]')].pop();
  if (!num) return;
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(num, '90');
  num.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(600);
await clicarBotao(/^Adicionar Sessão$/);
await sleep(1200);
check('sessão adicionada ao ciclo manual', /Sessões Adicionadas \(1\)/.test(await texto()));

await clicarBotao(/^Salvar Ciclo$/);
await sleep(3500);
const cicloSalvo = await texto();
check('ciclo salvo e painel renderizado',
  /Ciclo/.test(cicloSalvo) && !/Bem-vindo ao Planejamento/.test(cicloSalvo));

// ------------------------------------------------------- 8. simulado
passo('simulado');
await ir('/simulados');
await sleep(2000);
await clicarBotao(/^Novo Simulado$/);
await sleep(1500);
await page.evaluate(() => {
  const setVal = (el, v) => {
    if (!el) return;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  setVal(document.querySelectorAll('input[type="text"]')[0], 'Simulado E2E');
  const nums = document.querySelectorAll('input[type="number"]');
  setVal(nums[0], '1');   // peso
  setVal(nums[1], '20');  // total
  setVal(nums[2], '15');  // acertos
  setVal(nums[3], '5');   // erros
});
await sleep(600);
await clicarBotao(/salvar/i, { ultimo: true });
await sleep(3000);
check('simulado salvo aparece na lista', (await texto()).includes('Simulado E2E'));

await page.reload({ waitUntil: 'networkidle' });
await sleep(3000);
const simRecarregado = await texto();
check('simulado sobrevive ao reload com acertos e desempenho',
  simRecarregado.includes('Simulado E2E') && /15/.test(simRecarregado) && /75%/.test(simRecarregado));

await page.evaluate(() => {
  const el = [...document.querySelectorAll('h3')].find((e) => e.textContent.trim() === 'Simulado E2E');
  (el?.closest('div[class*="cursor"]') || el?.parentElement || el)?.click();
});
await sleep(1200);
check('a matéria do simulado volta do banco com o nome certo', (await texto()).includes(SUBJECT));

// --------------------------------------------------------- 9. backup
passo('exportar backup');
await ir('/backup');
await sleep(1500);
const backupJson = await page.evaluate(async () => {
  const btn = [...document.querySelectorAll('button')].find((b) => /exportar/i.test(b.textContent || ''));
  if (!btn) return null;
  // O export monta um <a href="data:..."> e clica nele; interceptamos o clique
  // para ler o conteúdo em vez de deixar o browser baixar o arquivo.
  let capturado = null;
  const original = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.href && this.href.startsWith('data:')) capturado = decodeURIComponent(this.href.split(',')[1]);
  };
  btn.click();
  await new Promise((r) => setTimeout(r, 4000));
  HTMLAnchorElement.prototype.click = original;
  return capturado;
});
let backup = null;
try { backup = backupJson ? JSON.parse(backupJson) : null; } catch { /* fica null */ }
if (backup) writeFileSync(BACKUP_PATH, JSON.stringify(backup));
check('backup exporta o plano com registros e revisões',
  !!backup && backup.plans?.length === 1 &&
  backup.plans[0].content.records?.length === 1 &&
  backup.plans[0].content.reviewRecords?.length === 1,
  backup ? `version=${backup.version} planos=${backup.plans?.length} registros=${backup.plans?.[0]?.content?.records?.length} revisões=${backup.plans?.[0]?.content?.reviewRecords?.length}` : 'sem backup');

// ------------------------------------------- 10. ícone vai ao Storage
passo('ícone no Storage');
await ir('/planos');
await sleep(1800);
await page.getByTitle('Criar Novo Plano').click();
await page.waitForSelector('#planName', { timeout: 10000 });
await page.setInputFiles('input[type="file"]', ICON_PATH);
await sleep(700);
await setValor('#planName', PLAN_ICON);
await sleep(400);
await clicarBotao(/avançar|salvar/i);
await sleep(4000);

const icone = await page.evaluate((plano) => {
  const h2 = [...document.querySelectorAll('h2')].find((e) => e.textContent.trim() === plano);
  return { achou: !!h2, src: h2?.closest('a')?.querySelector('img')?.getAttribute('src') || null };
}, PLAN_ICON);
check('plano com ícone aparece na lista', icone.achou);
check('ícone é servido por URL assinada do Storage',
  !!icone.src && icone.src.includes('/storage/v1/') && icone.src.includes('token='),
  (icone.src || '').slice(0, 110));
if (icone.src) {
  const status = await page.evaluate(async (src) => {
    try { return (await fetch(src)).status; } catch (e) { return 'erro: ' + e.message; }
  }, icone.src);
  check('URL assinada do ícone responde 200', status === 200, String(status));
}

// ------------------------------------------------ 11. restaurar backup
passo('restaurar backup');
await ir('/backup');
await sleep(1500);
if (backup) {
  await page.setInputFiles('input[type="file"]', BACKUP_PATH);
  await sleep(1200);
  // há dois "Importar": o da página e o do modal de confirmação
  check('confirmação de importação disponível', await clicarBotao(/^Importar$/, { ultimo: true }));
  await sleep(7000);
  await ir('/planos');
  await sleep(2500);
  const depois = await page.locator('h2').allInnerTexts();
  check('restaurar zera a conta e recria só o que estava no backup',
    depois.map((t) => t.trim()).includes(PLAN) && !depois.map((t) => t.trim()).includes(PLAN_ICON),
    JSON.stringify(depois.slice(0, 5)));
}

// ---------------------------------------------------- 12. cronômetro
passo('cronômetro');
// O relógio era do processo main do Electron. Com o desktop fora, ele passou a
// viver em `@/lib/stopwatch`; estes checks são o que garante que ele anda,
// pausa e sobrevive a fechar o modal — as três propriedades do original.
await ir('/dashboard');
await sleep(2500);
// `animate-float` nunca fica "stable" para o click do Playwright: vai por JS.
const abrirCronometro = () =>
  page.evaluate(() => document.querySelector('button.fixed.bottom-4.right-4')?.click());
const lerCronometro = () => page.evaluate(() => {
  const m = document.body.innerText.match(/\b\d{2}:\d{2}:\d{2}\b/);
  return m ? m[0] : null;
});
const emSegundos = (t) => (t ? t.split(':').reduce((a, v) => a * 60 + Number(v), 0) : -1);
const controle = (i) => page.evaluate((i) => {
  [...document.querySelectorAll('button.w-20.h-20')][i]?.click();
}, i);

await abrirCronometro();
await sleep(1500);
await controle(0);                       // play
await sleep(1200);
const crono1 = await lerCronometro();
await sleep(3300);
const crono2 = await lerCronometro();
check('o cronômetro avança no browser',
  emSegundos(crono2) > emSegundos(crono1) && emSegundos(crono2) >= 3, `${crono1} -> ${crono2}`);

await controle(0);                       // pause
await sleep(500);
const pausado = await lerCronometro();
await sleep(2500);
check('pausar congela a contagem', emSegundos(await lerCronometro()) === emSegundos(pausado), pausado);

await page.evaluate(() => document.querySelector('button.absolute.top-4.right-4')?.click());
await sleep(1200);
await abrirCronometro();
await sleep(1500);
const reaberto = await lerCronometro();
check('a contagem sobrevive a fechar e reabrir o modal',
  emSegundos(reaberto) >= emSegundos(pausado), `${pausado} -> ${reaberto}`);

await controle(1);                       // reset
await sleep(800);
check('reset zera o cronômetro', emSegundos(await lerCronometro()) === 0);
await page.evaluate(() => document.querySelector('button.absolute.top-4.right-4')?.click());
await sleep(800);

// ------------------------------------------------ 13. navegação geral
passo('navegação');
for (const rota of ['/dashboard', '/planos', '/edital', '/historico', '/revisoes',
                    '/estatisticas', '/simulados', '/planejamento', '/backup', '/materias']) {
  etapa = `navegação ${rota}`;
  const antes = errors.length;
  await ir(rota);
  await sleep(2200);
  const t = await texto();
  const quebrou = /Application error|Unhandled Runtime Error/.test(t) || t.trim().length < 20;
  check(`${rota} renderiza sem erro`, !quebrou && errors.length === antes,
    quebrou ? t.slice(0, 120) : errors.slice(antes).join(' | '));
}

passo('detalhe de matéria por query string');
await ir(`/materias?nome=${encodeURIComponent(SUBJECT)}`);
await sleep(2500);
check('/materias?nome=<x> abre o detalhe da matéria', (await texto()).includes(SUBJECT));

passo('raiz');
await ir('/');
await sleep(2000);
check('/ encaminha para /planos', page.url().includes('/planos'), page.url());

// ------------------------------------------------- 14. excluir plano
passo('excluir plano');
await ir('/planos');
await sleep(2500);
const antesDeExcluir = (await page.locator('h2').allInnerTexts()).length;
await page.evaluate(() => {
  document.querySelector('div.group')?.querySelector('button')?.click();
});
await sleep(900);
await clicarBotao(/excluir|confirmar/i);
await sleep(3500);
const depoisDeExcluir = (await page.locator('h2').allInnerTexts()).length;
check('plano excluído some da lista', depoisDeExcluir < antesDeExcluir,
  `antes=${antesDeExcluir} depois=${depoisDeExcluir}`);

// ---------------------------------------------- 15. logout e login
passo('logout');
const saiu = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button, a')].find((e) => /sair|logout/i.test(e.textContent || ''));
  if (!b) return false;
  b.click();
  return true;
});
await sleep(3000);
check('logout volta para /login', saiu && page.url().includes('/login'), page.url());

passo('login por e-mail');
await ir('/login');
await page.fill('#email', EMAIL);
await page.fill('#password', PASS);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25000 }).catch(() => {});
await sleep(2500);
check('login por e-mail entra na área logada', !/\/(login|register)/.test(page.url()), page.url());

passo('senha errada');
await ctx.clearCookies();
await ir('/login');
await page.fill('#email', EMAIL);
await page.fill('#password', 'SenhaErrada000!');
// O 400 do Supabase é o comportamento esperado aqui; não conta como erro de console.
const errosAntesDoLogin = errors.length;
await page.click('button[type="submit"]');
await sleep(3000);
errors.length = errosAntesDoLogin;
check('senha errada mostra erro e não autentica',
  page.url().includes('/login') && /inválid|incorret|erro/i.test(await texto()));

} catch (e) {
  check(`EXCEÇÃO em "${etapa}"`, false, e.message);
} finally {
  await browser.close();
}

console.log('\n================ RESUMO ================');
const ok = results.filter((r) => r.ok).length;
console.log(`${ok}/${results.length} checks passaram`);
for (const r of results.filter((r) => !r.ok)) console.log(`  FAIL: ${r.nome} :: ${String(r.detalhe).slice(0, 200)}`);
console.log(`\nErros de console: ${errors.length}`);
for (const e of errors.slice(0, 25)) console.log('  ' + e.slice(0, 220));
// O `username` localiza a linha em `profiles` e serve para depurar; o e-mail, não
// impresso, é metade de um par de login.
console.log(`\nusuário do teste: ${USER}   plano: ${planId}`);

process.exit(ok === results.length && errors.length === 0 ? 0 : 1);
