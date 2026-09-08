/**
 * Verificação de ponta a ponta do Sentry, contra o bundle publicado.
 *
 * Responde às perguntas que só o build final responde — nenhuma delas o
 * `tsc` ou o teste unitário alcança:
 *
 *   1. O DSN chegou ao bundle? (ele é inlinado no build; secret errado = SDK morto e silencioso)
 *   2. A integração do Supabase pegou o cliente singleton?
 *   3. Um erro de verdade sai da aba e chega ao endpoint do projeto?
 *   4. O evento vai marcado com o `environment` e a `release` certos?
 *   5. O `user` do evento tem só o `id` — sem e-mail, que é credencial de login?
 *   6. O `ignoreErrors` derruba o ruído de rede, que é o que estoura 5.000 erros/mês?
 *   7. O deploy publicou algum `.map`? (publicar mapa é publicar o código-fonte)
 *
 * Custo: manda 1 evento de verdade para o projeto. Ver PLANO-SENTRY.md.
 *
 * Uso:
 *   npm run start:web                             # ou o deploy que se quer conferir
 *   npm run test:sentry
 *   BASE=https://<projeto>.pages.dev ESPERADO_ENV=staging npm run test:sentry
 */

import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3000';
const ESPERADO_ENV = process.env.ESPERADO_ENV || null;

const results = [];
function check(nome, ok, detalhe = '') {
  results.push({ nome, ok, detalhe });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${nome}${detalhe ? '  :: ' + String(detalhe).slice(0, 170) : ''}`);
}

const browser = await chromium.launch({
  // Mesma escolha do test-e2e.mjs: Chrome do sistema, sem baixar browser.
  channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();

/** Cada envelope é NDJSON: cabeçalho, cabeçalho do item, payload. */
const envelopes = [];
page.on('request', (r) => {
  if (!r.url().includes('/envelope/')) return;
  const corpo = r.postData() || '';
  const eventos = corpo
    .split('\n')
    .map((linha) => { try { return JSON.parse(linha); } catch { return null; } })
    .filter((o) => o && (o.exception || o.message));
  envelopes.push({ url: r.url(), corpo, eventos });
});

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });

  const iniciado = await page.evaluate(() => Boolean(window.__SENTRY__));
  check('SDK inicializado (o DSN chegou ao bundle)', iniciado);

  const integracoes = await page.evaluate(() => {
    const carrier = window.__SENTRY__;
    if (!carrier) return [];
    for (const chave of Object.keys(carrier)) {
      const cliente =
        carrier[chave]?.stack?.getClient?.() ?? carrier[chave]?.defaultCurrentScope?.getClient?.();
      if (cliente?._integrations) return Object.keys(cliente._integrations);
    }
    return [];
  });
  check('integração do Supabase registrada', integracoes.includes('Supabase'), integracoes.join(', '));

  // 6 antes de 3: o ruído de rede não pode gerar evento, e é mais fácil afirmar isso
  // enquanto nenhum evento legítimo foi enviado ainda.
  await page.evaluate(() => { setTimeout(() => { throw new Error('Failed to fetch'); }, 0); });
  await page.waitForTimeout(2000);
  check(
    'ignoreErrors derruba erro de rede',
    !envelopes.some((e) => e.corpo.includes('Failed to fetch')),
    `${envelopes.length} envelope(s) até aqui`
  );

  const marca = `smoke-sentry-${Date.now()}`;
  await page.evaluate((m) => { setTimeout(() => { throw new Error(m); }, 0); }, marca);
  await page.waitForTimeout(3000);

  const envelope = envelopes.find((e) => e.corpo.includes(marca));
  check('erro real chega ao endpoint do projeto', Boolean(envelope), envelope?.url ?? 'nenhum envelope com a marca');

  const evento = envelope?.eventos.find((e) => JSON.stringify(e).includes(marca));
  check('evento traz release', Boolean(evento?.release), evento?.release ?? '');
  check(
    ESPERADO_ENV ? `evento traz environment = ${ESPERADO_ENV}` : 'evento traz environment',
    ESPERADO_ENV ? evento?.environment === ESPERADO_ENV : Boolean(evento?.environment),
    evento?.environment ?? ''
  );
  // O `beforeSend` do initSentry existe para esta linha: se um dia alguém puser e-mail no
  // `setUser`, é aqui que o teste reprova, e não no vazamento.
  const user = evento?.user ?? {};
  check(
    'evento não carrega e-mail, username nem IP',
    !user.email && !user.username && !user.ip_address,
    Object.keys(user).join(', ')
  );

  // 7 — o `.map` de um chunk qualquer não pode estar no ar.
  const chunk = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .find((n) => /_next\/static\/chunks\/.*\.js$/.test(n))
  );
  if (chunk) {
    const resposta = await page.request.get(`${chunk}.map`);
    check('sourcemap não está publicado', !resposta.ok(), `${chunk.split('/').pop()}.map → ${resposta.status()}`);
  } else {
    check('sourcemap não está publicado', false, 'nenhum chunk encontrado para testar');
  }
} catch (e) {
  check('EXCEÇÃO', false, e.message);
} finally {
  await browser.close();
}

console.log('\n================ RESUMO ================');
const ok = results.filter((r) => r.ok).length;
console.log(`${ok}/${results.length} checks passaram`);
for (const r of results.filter((r) => !r.ok)) console.log(`  FAIL: ${r.nome} :: ${String(r.detalhe).slice(0, 200)}`);
process.exit(ok === results.length ? 0 : 1);
