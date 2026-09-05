#!/usr/bin/env node
/**
 * Valida o `.env.local`.
 *
 * Até a v1 este script criava `data/` + `data/users.json` e sorteava um
 * `NEXTAUTH_SECRET`. Nada disso existe mais: os dados moraram no Postgres do
 * Supabase (Fase 1) e a autenticação é do Supabase Auth (Fase 2). O que sobrou
 * é conferir se as duas variáveis que o app precisa estão preenchidas — sem
 * elas, `createClient()` em `src/lib/supabase/client.ts` lança no primeiro
 * acesso, e o erro aparece só no browser.
 */

const fs = require('fs');
const path = require('path');

const OBRIGATORIAS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const OBSOLETAS = ['NEXTAUTH_SECRET', 'NEXTAUTH_URL', 'DATA_DIR'];

const raiz = __dirname;
const envPath = path.join(raiz, '.env.local');
const examplePath = path.join(raiz, '.env.local.example');

if (!fs.existsSync(envPath)) {
  if (!fs.existsSync(examplePath)) {
    console.error('✗ Não achei nem .env.local nem .env.local.example.');
    process.exit(1);
  }
  fs.copyFileSync(examplePath, envPath);
  console.log('→ .env.local criado a partir de .env.local.example.');
  console.log('  Preencha os valores e rode `npm run setup` de novo.');
  console.log('  Para o Supabase local, eles saem de `npx supabase status`.');
  process.exit(1);
}

// Parser deliberadamente bobo: só o suficiente para `CHAVE=valor`. Quem lê o
// arquivo de verdade é o Next.
const valores = new Map();
for (const linha of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const limpa = linha.trim();
  if (!limpa || limpa.startsWith('#')) continue;
  const igual = limpa.indexOf('=');
  if (igual === -1) continue;
  valores.set(limpa.slice(0, igual).trim(), limpa.slice(igual + 1).trim());
}

const faltando = OBRIGATORIAS.filter((chave) => !valores.get(chave));

if (faltando.length > 0) {
  console.error('✗ .env.local incompleto. Sem valor:');
  for (const chave of faltando) console.error(`    ${chave}`);
  console.error('\n  Supabase local: `npx supabase status`.');
  console.error('  Supabase hospedado: Project Settings → API.');
  process.exit(1);
}

const sobras = OBSOLETAS.filter((chave) => valores.has(chave));
if (sobras.length > 0) {
  console.warn(`⚠ Restos da v1 no .env.local (pode apagar): ${sobras.join(', ')}`);
}

console.log('✓ .env.local ok.');
console.log(`  NEXT_PUBLIC_SUPABASE_URL = ${valores.get('NEXT_PUBLIC_SUPABASE_URL')}`);
