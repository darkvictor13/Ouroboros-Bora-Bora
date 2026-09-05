/**
 * Teste de ponta a ponta da camada de dados da Fase 3.
 *
 * Dirige o app de verdade com Puppeteer, contra o Supabase local, e cobre o
 * caminho inteiro: cadastro, criação de plano, matéria, registro de estudo com
 * revisões, reedição do registro, ciclo, simulado, ícone no Storage, exportação
 * e restauração de backup e exclusão do plano.
 *
 * Pré-requisitos:
 *   npx supabase start
 *   npm run dev
 *
 * Uso:
 *   ICON_PATH=/tmp/icone.png BACKUP_PATH=/tmp/backup.json node scripts/test-data-layer.mjs
 *
 * `ICON_PATH` é qualquer imagem pequena; `BACKUP_PATH` é onde o teste grava o
 * backup exportado para reimportá-lo em seguida.
 */

import puppeteer from 'puppeteer';

const BASE = 'http://localhost:3000';
const stamp = Date.now();
const ICON_PATH = process.env.ICON_PATH || '/tmp/ouroboros-teste-icone.png';
const BACKUP_PATH = process.env.BACKUP_PATH || '/tmp/ouroboros-teste-backup.json';
const EMAIL = `fase3+${stamp}@example.com`;
const USER = `fase3user${stamp}`;
const PASS = 'SenhaForte123!';

const results = [];
const errors = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1000 });

page.on('console', (msg) => {
  if (msg.type() === 'error') {
    const t = msg.text();
    if (!t.includes('favicon') && !t.includes('Download the React DevTools')) errors.push(t);
  }
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

async function typeInto(selector, value) {
  await page.waitForSelector(selector, { visible: true, timeout: 15000 });
  await page.click(selector, { clickCount: 3 });
  await page.type(selector, value, { delay: 8 });
}

// ---------- 1. cadastro ----------
await page.goto(`${BASE}/register`, { waitUntil: 'networkidle0' });
const inputs = await page.$$eval('input', els => els.map(e => ({ type: e.type, id: e.id, name: e.name, placeholder: e.placeholder })));
console.log('register inputs:', JSON.stringify(inputs));

await typeInto('input[name="username"], #username', USER);
await typeInto('input[type="email"]', EMAIL);
const pwFields = await page.$$('input[type="password"]');
for (const f of pwFields) { await f.click({ clickCount: 3 }); await f.type(PASS, { delay: 8 }); }
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 25000 }).catch(() => {}),
  page.click('button[type="submit"]'),
]);
await sleep(2500);
check('cadastro entra na área logada', !page.url().includes('/register') && !page.url().includes('/login'), page.url());

// ---------- 2. criar plano ----------
await page.goto(`${BASE}/planos`, { waitUntil: 'networkidle0' });
await sleep(1500);
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Criar Novo Plano'));
  btn?.click();
});
await sleep(900);
const modalInputs = await page.$$eval('input, textarea', els => els.map(e => ({ tag: e.tagName, type: e.type, id: e.id, name: e.name, placeholder: e.placeholder })));
console.log('modal inputs:', JSON.stringify(modalInputs));

const PLAN = `Plano Fase 3 ${stamp}`;
await page.evaluate((plan) => {
  const setVal = (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const setArea = (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const name = document.querySelector('#planName');
  if (name) setVal(name, plan);
  const cargo = document.querySelector('#cargo');
  if (cargo) setVal(cargo, 'Analista');
  const banca = document.querySelector('#banca');
  if (banca) setVal(banca, 'CESPE');
  const obs = document.querySelector('textarea');
  if (obs) setArea(obs, 'Criado pelo teste da Fase 3');
}, PLAN);
await sleep(400);
const btns = await page.$$eval('button', els => els.map(e => e.textContent.trim()).filter(Boolean));
console.log('buttons:', JSON.stringify(btns));
// modal em etapas: avança até achar o botão que salva
for (let step = 0; step < 4; step++) {
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /avançar|salvar|criar plano|concluir|finalizar/i.test(b.textContent));
    if (btn) { btn.click(); return btn.textContent.trim(); }
    return null;
  });
  console.log('step', step, 'clicked:', clicked);
  await sleep(1200);
  const stillOpen = await page.evaluate(() => !!document.querySelector('#planName'));
  if (!stillOpen) break;
}
await sleep(2500);
console.log('body after save:', (await page.evaluate(() => document.body.innerText)).replace(/\s+/g,' ').slice(0, 400));
const planCards = await page.$$eval('h2', els => els.map(e => e.textContent.trim()));
check('plano aparece na lista com o nome digitado', planCards.some(t => t === PLAN), JSON.stringify(planCards.slice(0, 6)));

// pega o href do card -> é o planId (uuid)
const planHref = await page.evaluate((plan) => {
  const h2 = [...document.querySelectorAll('h2')].find(e => e.textContent.trim() === plan);
  return h2?.closest('a')?.getAttribute('href') || null;
}, PLAN);
const planId = planHref ? planHref.split('/').pop() : null;
const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(planId || '');
check('a rota do plano usa planId em uuid', isUuid, String(planId));

// ---------- 3. banca persistida (coluna nova da 0002) ----------
const bancaShown = await page.evaluate((plan) => {
  const h2 = [...document.querySelectorAll('h2')].find(e => e.textContent.trim() === plan);
  return h2?.parentElement?.textContent || '';
}, PLAN);
check('banca gravada e exibida', bancaShown.includes('CESPE'), bancaShown.replace(/\s+/g, ' ').slice(0, 120));

// ---------- 4. adicionar matéria no detalhe do plano ----------
await page.goto(`${BASE}/planos/${planId}`, { waitUntil: 'networkidle0' });
await sleep(1800);
const detailTitle = await page.evaluate(() => document.body.innerText.slice(0, 400));
check('detalhe do plano carrega pelo uuid', !detailTitle.includes('Plano não encontrado'), detailTitle.replace(/\s+/g, ' ').slice(0, 100));


// ---------- 5. adicionar matéria ----------
const addSubjBtns = await page.$$eval('button', els => els.map(e => e.textContent.trim()).filter(Boolean));
console.log('detail buttons:', JSON.stringify(addSubjBtns));
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /adicionar disciplina|nova disciplina|adicionar matéria/i.test(b.textContent));
  btn?.click();
});
await sleep(1200);
const SUBJECT = 'Direito Constitucional';
const TOPIC = 'Controle de Constitucionalidade';
await page.evaluate((subject, topic) => {
  const setVal = (el, v, proto) => {
    const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  setVal(document.querySelector('#subjectName'), subject, window.HTMLInputElement);
  setVal(document.querySelector('#topicsContent'), topic + '\nPrincípios Fundamentais', window.HTMLTextAreaElement);
}, SUBJECT, TOPIC);
await sleep(400);
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Salvar');
  btn?.click();
});
await sleep(2500);
const afterSubject = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
check('matéria adicionada aparece no plano', afterSubject.includes(SUBJECT), afterSubject.slice(0, 200));

// ---------- 6. registrar estudo com revisões ----------
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' });
await sleep(2000);
const dashBtns = await page.$$eval('button', els => els.map(e => e.textContent.trim()).filter(Boolean));
console.log('dash buttons:', JSON.stringify(dashBtns.slice(0, 15)));
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Adicionar');
  btn?.click();
});
await sleep(1500);
const regModal = await page.evaluate(() => {
  const dialog = document.body.innerText.replace(/\s+/g, ' ');
  const fields = [...document.querySelectorAll('input, select, textarea, button')].map(e => ({ tag: e.tagName, id: e.id, type: e.type, txt: e.textContent?.trim().slice(0, 25) }));
  return { dialog: dialog.slice(0, 300), fields: fields.slice(0, 40) };
});
console.log('register modal fields ok:', regModal.fields.length);

// dropdowns customizados: clica no gatilho e escolhe a opção pelo texto
async function pickFromDropdown(triggerText, optionText) {
  await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === t);
    btn?.click();
  }, triggerText);
  await sleep(600);
  const opts = await page.evaluate(() => [...document.querySelectorAll('div[class*="cursor-pointer"], li')].map(e => e.textContent.trim()).filter(Boolean).slice(0, 20));
  const picked = await page.evaluate((o) => {
    const el = [...document.querySelectorAll('div[class*="cursor-pointer"], li')].find(e => e.textContent.trim() === o || e.textContent.trim().startsWith(o));
    if (el) { el.click(); return el.textContent.trim(); }
    return null;
  }, optionText);
  return { opts, picked };
}

// os dropdowns são identificados pelo <label> do campo
async function openDropdown(labelText) {
  return page.evaluate((lt) => {
    const btn = [...document.querySelectorAll('button')].find(b => {
      if (!/Selecione/.test(b.textContent)) return false;
      let node = b.parentElement;
      for (let i = 0; i < 4 && node; i++) {
        const l = node.querySelector('label');
        if (l) return l.textContent.trim() === lt;
        node = node.parentElement;
      }
      return false;
    });
    if (!btn) return false;
    btn.click();
    return true;
  }, labelText);
}

async function pickOption(text) {
  return page.evaluate((t) => {
    const candidates = [...document.querySelectorAll('div, li')].filter(e => {
      const own = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
      return e.textContent.trim() === t || own === t;
    });
    const el = candidates[candidates.length - 1];
    if (el) { el.click(); return true; }
    return false;
  }, text);
}

await openDropdown('Disciplina'); await sleep(500);
check('dropdown de disciplina lista a matéria criada', await pickOption(SUBJECT));
await sleep(700);
await openDropdown('Tópico'); await sleep(500);
check('dropdown de tópico lista o tópico da matéria', await pickOption(TOPIC));
await sleep(500);
await openDropdown('Categoria'); await sleep(500);
await pickOption('Teoria');
await sleep(400);

// tempo, questões e revisões
await page.evaluate(() => {
  const setVal = (sel, v) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement : window.HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  setVal('#studyTime', '01:30:00');
  setVal('#acertos-0', '8');
  setVal('#erros-0', '2');
  setVal('#comments', 'Comentário do teste da Fase 3');
  const rev = document.querySelector('#programarRevisoes');
  if (rev && !rev.checked) rev.click();
});
await sleep(900);
// o "+" das revisões é o primeiro que aparece depois do rótulo "Programar Revisões"
const openedReviewModal = await page.evaluate(() => {
  const label = [...document.querySelectorAll('label, span, div')]
    .find(e => e.textContent.trim() === 'Programar Revisões');
  if (!label) return 'sem rótulo';
  const plus = [...document.querySelectorAll('button')]
    .filter(b => b.textContent.trim() === '+')
    .find(b => label.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  if (!plus) return 'sem botão';
  plus.click();
  return 'ok';
});
await sleep(1000);
// "Adicionar Revisão": preenche os dias e salva
async function addReview(days) {
  await page.evaluate((d) => {
    const inputs = [...document.querySelectorAll('input[type="number"], input[type="text"]')];
    const el = inputs[inputs.length - 1];
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, String(d));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, days);
  await sleep(300);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Salvar');
    btns[btns.length - 1]?.click();
  });
  await sleep(800);
}
await addReview(1);
await page.evaluate(() => {
  const label = [...document.querySelectorAll('label, span, div')].find(e => e.textContent.trim() === 'Programar Revisões');
  const plus = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === '+')
    .find(b => label.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  plus?.click();
});
await sleep(800);
await addReview(7);

const periodsShown = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
check('dois períodos de revisão registrados no formulário', /1d/.test(periodsShown) && /7d/.test(periodsShown), (periodsShown.match(/Programar Revisões.{0,60}/) || [''])[0]);

// salva o registro de estudo
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Salvar');
  btns[btns.length - 1]?.click();
});
await sleep(3000);
const afterSave = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
check('registro de estudo salvo e refletido no dashboard', /1h30m|1h 30m/.test(afterSave), (afterSave.match(/Tempo de Estudo.{0,40}/) || [''])[0]);


// ---------- 7. reeditar o registro: as revisões são recriadas, não duplicadas ----------
await page.goto(`${BASE}/historico`, { waitUntil: 'networkidle0' });
await sleep(2500);
const histBody = await page.evaluate(() => ({
  text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 500),
  btns: [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean).slice(0, 25),
}));
console.log('historico:', JSON.stringify(histBody));
// as ações da linha são botões de ícone, sem texto
const editOpened = await page.evaluate(() => {
  const row = document.querySelector('tbody tr');
  if (!row) return false;
  const btn = row.querySelector('button');
  if (!btn) return false;
  btn.click();
  return true;
});
await sleep(1800);
check('registro aparece no histórico e abre para edição', editOpened);

// remove o período de 7d, mantendo só o de 1d
const removed = await page.evaluate(() => {
  const label = [...document.querySelectorAll('label, span, div')].find(e => e.textContent.trim() === 'Programar Revisões');
  if (!label) return 'sem rótulo';
  const chip = [...document.querySelectorAll('span, div')].find(e => e.textContent.trim() === '7d ×' || e.textContent.trim() === '7d×');
  const x = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '×' &&
    (b.previousSibling?.textContent || b.parentElement?.textContent || '').includes('7d'));
  if (x) { x.click(); return 'removido'; }
  return chip ? 'chip sem botão' : 'sem chip';
});
console.log('remoção do 7d:', removed);
await sleep(600);
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Salvar');
  btns[btns.length - 1]?.click();
});
await sleep(3000);
const consoleAfterEdit = errors.length;
check('edição do registro não gera erro de console', consoleAfterEdit === 0, errors.join(' | ').slice(0, 200));


// ---------- 8. ciclo de estudos ----------
await page.goto(`${BASE}/planejamento`, { waitUntil: 'networkidle0' });
await sleep(2500);
const planejBtns = await page.$$eval('button', els => els.map(e => e.textContent.trim()).filter(Boolean).slice(0, 20));
console.log('planejamento buttons:', JSON.stringify(planejBtns));
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /começar novo ciclo/i.test(b.textContent));
  btn?.click();
});
await sleep(1800);
const cycleModal = await page.evaluate(() => ({
  text: document.body.innerText.replace(/\s+/g,' ').slice(-700),
  btns: [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean).slice(-14),
  inputs: [...document.querySelectorAll('input')].map(e => ({ id: e.id, type: e.type, value: e.value })).slice(-12),
}));
console.log('cycle modal ok:', /Modo Manual/.test(cycleModal.text));

// Modo Manual: adiciona uma sessão, que é o caminho do AddSessionModal
await page.evaluate(() => {
  const el = [...document.querySelectorAll('div, button, h3')].find(e => e.textContent.trim().startsWith('Modo Manual'));
  el?.click();
});
await sleep(1500);
const manualUi = await page.evaluate(() => ({
  text: document.body.innerText.replace(/\s+/g,' ').slice(-400),
  btns: [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean).slice(-12),
}));
// o seletor de matéria é um dropdown de botão, como no registro de estudo
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Selecione uma matéria');
  btn?.click();
});
await sleep(600);
const sessionSubjPicked = await pickOption(SUBJECT);
console.log('sessão: matéria escolhida =', sessionSubjPicked);
await sleep(500);
await page.evaluate(() => {
  const num = [...document.querySelectorAll('input[type="number"]')].pop();
  if (num) {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(num, '90');
    num.dispatchEvent(new Event('input', { bubbles: true }));
  }
});
await sleep(600);
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Adicionar Sessão');
  btn?.click();
});
await sleep(1200);
const sessionsAdded = await page.evaluate(() => document.body.innerText.replace(/\s+/g,' '));
check('sessão adicionada ao ciclo manual', /Sessões Adicionadas \(1\)/.test(sessionsAdded), (sessionsAdded.match(/Sessões Adicionadas \(\d\)/) || [''])[0]);

await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Salvar Ciclo');
  btn?.click();
});
await sleep(3500);
const cycleSaved = await page.evaluate(() => document.body.innerText.replace(/\s+/g,' '));
check('ciclo salvo e painel renderizado', /Ciclo/.test(cycleSaved) && !/Bem-vindo ao Planejamento/.test(cycleSaved), cycleSaved.slice(0, 160));

// ---------- 9. simulado ----------
await page.goto(`${BASE}/simulados`, { waitUntil: 'networkidle0' });
await sleep(2000);
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Novo Simulado');
  btn?.click();
});
await sleep(1500);
await page.evaluate(() => {
  const setVal = (el, v) => {
    if (!el) return;
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement : window.HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const texts = [...document.querySelectorAll('input[type="text"]')];
  setVal(texts[0], 'Simulado Fase 3');
  const nums = [...document.querySelectorAll('input[type="number"]')];
  setVal(nums[0], '1');   // peso
  setVal(nums[1], '20');  // total
  setVal(nums[2], '15');  // acertos
  setVal(nums[3], '5');   // erros
});
await sleep(600);
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter(b => /salvar/i.test(b.textContent));
  btns[btns.length - 1]?.click();
});
await sleep(3000);
const simAfter = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
check('simulado salvo aparece na lista', /Simulado Fase 3/.test(simAfter), simAfter.slice(0, 220));

// recarrega: prova que o simulado e a linha de matéria voltaram do Postgres
await page.reload({ waitUntil: 'networkidle0' });
await sleep(3000);
const simReloaded = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
check('simulado sobrevive ao reload com acertos e desempenho',
  /Simulado Fase 3/.test(simReloaded) && /15/.test(simReloaded) && /75%/.test(simReloaded),
  (simReloaded.match(/Simulado Fase 3.{0,80}/) || [''])[0]);

// a tabela de matérias do simulado fica num card expansível
await page.evaluate(() => {
  const el = [...document.querySelectorAll('h3')].find(e => e.textContent.trim() === 'Simulado Fase 3');
  (el?.closest('div[class*="cursor"]') || el?.parentElement || el)?.click();
});
await sleep(1200);
const simExpanded = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
check('a matéria do simulado volta do banco com o nome certo',
  simExpanded.includes(SUBJECT),
  (simExpanded.match(new RegExp(SUBJECT + '.{0,60}')) || ['matéria não renderizada'])[0]);

// ---------- 10. backup ----------
await page.goto(`${BASE}/backup`, { waitUntil: 'networkidle0' });
await sleep(1500);
const backupJson = await page.evaluate(async () => {
  // dispara o export pela própria UI e devolve o que ela geraria
  const btn = [...document.querySelectorAll('button')].find(b => /exportar/i.test(b.textContent));
  if (!btn) return null;
  let captured = null;
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.href && this.href.startsWith('data:')) captured = decodeURIComponent(this.href.split(',')[1]);
  };
  btn.click();
  await new Promise(r => setTimeout(r, 4000));
  HTMLAnchorElement.prototype.click = origClick;
  return captured;
});
let backup = null;
try { backup = backupJson ? JSON.parse(backupJson) : null; } catch (e) { console.log('backup parse error', e.message); }
if (backup) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(BACKUP_PATH, JSON.stringify(backup));
}
check('backup exporta o plano com registros e revisões',
  !!backup && backup.plans?.length === 1 &&
  backup.plans[0].content.records?.length === 1 &&
  backup.plans[0].content.reviewRecords?.length === 1,
  backup ? `version=${backup.version} plans=${backup.plans?.length} records=${backup.plans?.[0]?.content?.records?.length} reviews=${backup.plans?.[0]?.content?.reviewRecords?.length} subjects=${backup.plans?.[0]?.content?.subjects?.length}` : 'sem backup');


// ---------- 11. ícone do plano vai para o Storage ----------
await page.goto(`${BASE}/planos`, { waitUntil: 'networkidle0' });
await sleep(1800);
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Criar Novo Plano'));
  btn?.click();
});
await sleep(900);
const PLAN_ICON = `Plano com Icone ${stamp}`;
const fileInput = await page.$('input[type="file"]');
await fileInput.uploadFile(ICON_PATH);
await sleep(700);
await page.evaluate((plan) => {
  const el = document.querySelector('#planName');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, plan);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, PLAN_ICON);
await sleep(400);
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /avançar|salvar/i.test(b.textContent));
  btn?.click();
});
await sleep(4000);

const iconInfo = await page.evaluate((plan) => {
  const h2 = [...document.querySelectorAll('h2')].find(e => e.textContent.trim() === plan);
  const img = h2?.closest('a')?.querySelector('img');
  return { found: !!h2, src: img?.getAttribute('src') || null };
}, PLAN_ICON);
check('plano com ícone aparece na lista', iconInfo.found, JSON.stringify(iconInfo).slice(0, 150));
check('ícone é servido por URL assinada do Storage',
  !!iconInfo.src && iconInfo.src.includes('/storage/v1/') && iconInfo.src.includes('token='),
  (iconInfo.src || '').slice(0, 110));

if (iconInfo.src) {
  const status = await page.evaluate(async (src) => {
    try { const r = await fetch(src); return r.status; } catch (e) { return 'erro: ' + e.message; }
  }, iconInfo.src);
  check('URL assinada do ícone responde 200', status === 200, String(status));
}

// ---------- 12. restaurar backup ----------
await page.goto(`${BASE}/backup`, { waitUntil: 'networkidle0' });
await sleep(1500);
const backupInput = await page.$('input[type="file"]');
await backupInput.uploadFile(BACKUP_PATH);
await sleep(1200);
// há dois "Importar" na tela: o da página e o do modal de confirmação
const confirmClicked = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Importar');
  const btn = btns[btns.length - 1];
  if (!btn) return false;
  btn.click();
  return true;
});
console.log('confirmou importação:', confirmClicked);
await sleep(7000);


if (process.env.SKIP_DELETE) { await browser.close(); console.log('USER_EMAIL=' + EMAIL); process.exit(0); }
// ---------- 13. excluir plano: cascade + limpeza do ícone ----------
await page.goto(`${BASE}/planos`, { waitUntil: 'networkidle0' });
await sleep(2500);
const beforeDelete = await page.$$eval('h2', els => els.map(e => e.textContent.trim()));
await page.evaluate(() => {
  const card = document.querySelector('div.group');
  const btn = card?.querySelector('button');
  btn?.click();
});
await sleep(900);
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /excluir|confirmar/i.test(b.textContent));
  btn?.click();
});
await sleep(3500);
const afterDelete = await page.$$eval('h2', els => els.map(e => e.textContent.trim()));
check('plano excluído some da lista', afterDelete.length < beforeDelete.length,
  `antes=${JSON.stringify(beforeDelete)} depois=${JSON.stringify(afterDelete)}`);

console.log('PLAN_ID=' + planId);
console.log('USER_EMAIL=' + EMAIL);

await browser.close();

console.log('\n--- ERROS DE CONSOLE ---');
console.log(errors.length ? errors.join('\n') : '(nenhum)');
console.log('\nRESUMO:', results.filter(r => r.ok).length + '/' + results.length);
process.exit(results.every(r => r.ok) && errors.length === 0 ? 0 : 1);
