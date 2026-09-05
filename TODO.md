# TODO — Migração para Supabase (v2)

## Objetivos originais

- [ ] Utilizar Supabase para armazenar os dados → **Fases 1–4**
- [ ] Garantir que todas as tabelas do Supabase tenham RLS → **Fase 1**
- [ ] Ter um comando para rodar apenas a interface, sem Electron → **Fase 5**
- [ ] Ter automações no GitHub para migrations no Supabase e deploy → **Fase 6**

## Arquitetura alvo

```
HOJE:     Browser → Next Server (Node) → fs (JSON em DATA_DIR/<userId>/)
DEPOIS:   Browser (bundle estático) → Supabase (Postgres + Auth + RLS)
```

Levantamento que define esta arquitetura:

- **15 das 17 páginas já são `'use client'`.** As exceções são `layout.tsx` (só exporta `metadata`) e
  `page.tsx` (um `redirect`).
- **Zero uso** de `cookies()`, `generateMetadata`, `revalidate` ou `dynamic`.
- As rotas dinâmicas `[fileName]` e `[subjectName]` leem o parâmetro via `useParams()` — no cliente.
  O servidor nunca precisa dele.
- Todo o acesso a dados passa por **um único arquivo**: `src/app/actions.tsx` (866 linhas, ~29 server
  actions, todas `fs`).

Conclusão: o servidor Node existe hoje só por causa do `fs`. Removido ele, o app vira SPA estática
(`output: 'export'`), hospedagem fica gratuita e **a RLS deixa de ser defesa em profundidade e passa a
ser a única camada de segurança dos dados**.

---

## Fase 0 — Decisões (bloqueiam o resto)

- [x] **0.1 — Adotar Supabase Auth** no lugar de NextAuth Credentials. → **Adotado.**
      Motivo: RLS depende de `auth.uid()` vindo do JWT do Supabase. Mantendo NextAuth e acessando o
      banco pelo servidor com `service_role key`, a RLS é ignorada por definição.
      Já materializado na Fase 1: todas as políticas usam `(select auth.uid())` e `profiles` pendura
      em `auth.users` via trigger `on_auth_user_created`.
- [x] **0.2 — Confirmar se o importador de guia precisa de browser headless.** → **PRECISA.**
      Testado em 2026-09-05 contra `https://www.tecconcursos.com.br/guias/pc-ba-2026/delegado-de-policia-pc-ba/-/-`.
      O `grep` do teste original devolve `6`, mas é **falso positivo**: as ocorrências de
      `cadernos-item` são o esqueleto de um `ng-repeat`, não dados. A página é AngularJS
      (`ng-app`, 5 `ng-repeat`, 26 `ng-if`) e o HTML servido traz os bindings crus —
      `{{cadernoGuia.disciplina}}`, `{{cadernoGuia.url}}`. Nenhum nome de matéria vem no HTML.
      A lista real chega por `GET /api/caderno-guia/listar-pelo-guia/<idGuia>`, que responde
      **403 Forbidden** fora de uma sessão de browser. Logo `fetch` + `cheerio` **não** resolve,
      e a Edge Function está descartada.
      → Manter a importação **só no desktop** (o Electron já embarca o Chrome); a web aceita
      upload do JSON. Alternativas para a web avaliadas em
      "Backlog — Extensão de browser" (adiado, não implementar agora). Consequência: `puppeteer` **não** pode ir para `optionalDependencies`
      junto com o resto na Fase 5 — ele é dependência real do build desktop.
- [x] **0.3 — Aceitar que o Electron vira cliente online.** → **Aceito** (2026-09-05). Hoje o desktop
      funciona offline. Com Supabase, não. A alternativa — manter o adapter de arquivo como provider
      paralelo — foi descartada: dobraria a Fase 3, que já é a mais cara, e abriria sincronização.
      O desktop segue com razão de existir: pela 0.2, a importação de guia é exclusiva dele.

---

## Fase 1 — Schema + RLS

> RLS nasce junto com as tabelas. Criar tabela hoje e política depois é como o objetivo 2 vira dívida.

- [x] `npx supabase init` (versionar a pasta `supabase/` no git)
- [x] `npx supabase link --project-ref ttlfqwkavesblklhutoh` (projeto `Ouroboros-Bora-Bora Staging`,
      região `sa-east-1`). `supabase migration list` confirma `0001` local e ausente no remoto — o
      `db push` fica para a Fase 6, junto com o `migrations.yml`.
- [x] `npx supabase start` para o ambiente local (migration aplica limpa)
- [x] Migration `supabase/migrations/0001_initial_schema.sql`:

  | Tabela | Colunas-chave | Motivo do formato |
  |---|---|---|
  | `profiles` | `id uuid` → `auth.users`, `username` | substitui `data/users.json` |
  | `plans` | `id`, `user_id`, `name`, `cargo`, `edital`, `icon_url`, `subjects jsonb`, `banca_topic_weights jsonb` | a árvore `subjects → topics → sub_topics` é recursiva e sempre lida/gravada inteira → JSONB |
  | `study_records` | `id`, `user_id`, `plan_id`, `date`, `subject_id`, `topic`, `study_time`, `questions jsonb`, `pages jsonb`, `videos jsonb` | volume alto, filtrado por data/matéria → relacional |
  | `review_records` | `id`, `user_id`, `plan_id`, `study_record_id`, `scheduled_date`, `status` | idem |
  | `simulado_records` + `simulado_subjects` | FK entre as duas | idem |
  | `study_cycles` | `plan_id` unique, `user_id`, `cycle jsonb`, `study_hours`, `session_progress_map jsonb` | substitui os arquivos `.cycle.json` |

- [x] `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` em **todas** as tabelas
- [x] 4 políticas por tabela (`select`/`insert`/`update`/`delete`) no padrão `auth.uid() = user_id`.
      Em `simulado_subjects`, que não tem `user_id`, a política vai por `EXISTS` na tabela pai.
- [x] `REVOKE ALL ON SCHEMA public FROM anon;`
- [x] Índices em `(user_id, plan_id)` e `(plan_id, date)`
- [x] **Teste de isolamento (obrigatório):** script que cria dois usuários e confirma que B recebe zero
      linhas de A usando a `anon key`. Sem esse teste, o objetivo 2 está feito só no papel.

## Fase 2 — Autenticação

- [ ] Instalar `@supabase/supabase-js` e `@supabase/ssr`
- [ ] Criar `src/lib/supabase/client.ts` (browser)
- [ ] Reescrever `src/app/login/page.tsx` e `src/app/register/page.tsx` para `signInWithPassword` / `signUp`
- [ ] **Supabase Auth exige e-mail**, o app usa username. Adicionar campo de e-mail no cadastro e
      manter `username` em `profiles`, populado por trigger `on_auth_user_created`.
- [ ] Guard de rota **client-side** no `Providers` (`useEffect` que redireciona sem sessão).
      ⚠️ Não usar `middleware.ts`: middleware não roda em export estático. Quem protege os dados de
      verdade é a RLS.
- [ ] Remover `next-auth`, `bcryptjs`, `src/lib/users.ts` e `src/app/api/auth/**`

## Fase 3 — Camada de dados (fase longa)

> Uma action por vez, em commits separados, **mantendo assinatura e retorno idênticos** para não tocar
> no `DataContext` (1797 linhas).

- [ ] Desligar `typescript.ignoreBuildErrors` e `eslint.ignoreDuringBuilds` em `next.config.js`
      **antes de começar**. Num refactor deste tamanho o compilador é o teste de regressão — hoje ele
      está silenciado.
- [ ] Trocar a chave de acesso das actions de `fileName` (`"meu-plano.json"`) para `planId` (uuid).
      Fazer agora; deixar `fileName` sobreviver como chave é a dívida que mais dói depois.
- [ ] `getUserDataDirectory()` (`actions.tsx:88`) vira `getAuthenticatedUser()` retornando o `uid`
- [ ] Migrar as actions nesta ordem (dependência crescente):
  - [ ] `getJsonFiles`, `getJsonContent`
  - [ ] `createPlanFile`, `updatePlanFile`, `deletePlanFile`
  - [ ] `saveStudyRecord`, `getStudyRecords`, `deleteStudyRecordAction`
  - [ ] `saveReviewRecord`, `getReviewRecords`
  - [ ] `saveSimuladoRecord`, `getSimuladoRecords`, `updateSimuladoRecord`, `deleteSimuladoRecordAction`
  - [ ] `saveStudyCycleToFile`, `getStudyCycleFromFile`, `deleteStudyCycleFile`
  - [ ] `renameSubjectAction`, `addOrUpdateSubjectAction`, `updateTopicWeightAction`, `updateAllTopicWeightsAction`
  - [ ] `clearAllDataAction`, `exportAllDataAction`
- [ ] Descartar `migrateStudyRecordIds` e `migrateToSubjectIds` — viram migrations SQL, não código de runtime
- [ ] `uploadImage` (`actions.tsx:421`) hoje devolve base64 embutido no JSON, o que incharia a linha do
      plano a cada leitura. Mover para Supabase Storage com bucket privado e política própria.

## Fase 4 — Migração dos dados existentes

- [ ] **Não existe base de usuários central para migrar** — cada instalação é local (desktop ou Docker
      self-hosted). E o app já tem `exportFullBackupAction` / `restoreFullBackupAction` e a página
      `/backup`.
- [ ] Caminho de migração: usuário exporta o backup JSON na v1 → cria conta na v2 → importa.
      Basta reescrever `restoreFullBackupAction` para gravar no Supabase **tolerando o formato antigo**.
      Nenhum script de migração server-side é necessário.
- [ ] Testar com um backup real gerado pela v1.1.3 antes de anunciar

## Fase 5 — Export estático + rodar só a interface

- [ ] `next.config.js`: `output: 'export'` e `images: { unoptimized: true }`
      (`next/image` é usado em `planos/page.tsx`, `planos/[fileName]/page.tsx` e `CreatePlanModal.tsx`;
      o otimizador exige servidor)
- [ ] `src/app/page.tsx`: o `redirect()` é de Server Component e quebra no export → virar redirect
      client-side ou a própria tela inicial
- [ ] Converter as rotas dinâmicas em query string (`output: 'export'` exigiria `generateStaticParams`,
      impossível para dados de usuário). Ambas já usam `useParams()`, então são 3 linhas de navegação:
  - [ ] `src/app/planos/page.tsx:182` → `/planos?id=<uuid>`
  - [ ] `src/app/materias/page.tsx:165` → `/materias?nome=<x>`
  - [ ] `src/app/planos/[fileName]/page.tsx:535`
  - [ ] (a página de matérias **já lê** `useSearchParams` — o padrão está no próprio código)
- [ ] Mover `electron`, `electron-builder`, `puppeteer`, `concurrently` e `wait-on` para
      `optionalDependencies`, para que `npm install --omit=optional && npm run dev` suba só a web
- [ ] Adicionar scripts `dev:web` e `start:web` no `package.json`
- [ ] Criar `.env.local.example` com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `setup-env.js`: remover a criação de `data/` e do `NEXTAUTH_SECRET` (vira validador de `.env.local`, ou some)
- [ ] Atualizar o README com a seção "Rodando só a interface"

## Fase 6 — Automações no GitHub

- [ ] `.github/workflows/ci.yml` — em todo PR: `npm ci`, `tsc --noEmit`, `next lint`, `next build`.
      Só faz sentido depois de desligar os `ignore` do passo da Fase 3.
- [ ] `.github/workflows/migrations.yml` — em push na `master`: `supabase link` + `supabase db push`.
      Secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`.
      Adicionar `supabase db lint` no PR para pegar migration quebrada antes do merge.
- [ ] Avaliar Supabase Branching (banco efêmero por PR) — evita que uma migration ruim derrube produção
- [ ] `.github/workflows/deploy.yml` — `wrangler pages deploy out/` no Cloudflare Pages.
      Encadear com `needs:` para a migration rodar **antes** do deploy.
- [ ] `_redirects` com `/* /index.html 200` para o roteamento SPA
- [ ] `.github/workflows/release.yml` — em tag `v*`: `build:electron` em matrix `ubuntu-latest` +
      `windows-latest`, publicando `.deb` / `.AppImage` / `.exe` na release.
      Hoje isso é manual e é o que segura a atualização do link de download no README.
- [ ] Workflow agendado com um `select 1` no Supabase (o plano free pausa projetos inativos)

## Fase 7 — Fechamento

- [ ] `electron/main.js`: remover `startNextServer()` (linha 94) e `ensureDataDir()` (linha 78);
      passar a usar `loadFile('out/index.html')`. Next sai das dependências de runtime do desktop.
      A lógica do timer via IPC é independente e permanece.
- [ ] `docker-compose.yml`: trocar `NEXTAUTH_SECRET` pelas vars do Supabase e **remover o bind mount
      `.:/app`**, que hoje quebra a imagem de produção
- [ ] Remover `src/components/StudyRegisterModal1.bkp` e `StudyRegisterModal2.bkp`
- [ ] Bump para v2.0.0 e atualizar README (tecnologias, instalação, download)

---

## Backlog — Extensão de browser para importar do TEC (NÃO implementar agora)

> Registrado em 2026-09-05 como decisão adiada, não como trabalho agendado. O caminho atual
> (importação desktop-only, Fase 0.2) continua valendo e é o padrão.

### Por que uma extensão, e não uma Edge Function ou um servidor

A 0.2 estabeleceu que o dado do guia é **público** — o Puppeteer de hoje não faz login no TEC, só
abre a URL. O que o TEC recusa é *cliente programático*: a página é AngularJS e o
`GET /api/caderno-guia/listar-pelo-guia/<idGuia>` devolve 403 fora de uma sessão de browser.

Uma extensão roda **dentro do browser do usuário**, com a sessão e a origem dele. Isso resolve as
três coisas que travam as alternativas de uma vez:

| | Edge Function | Servidor com Chrome | **Extensão** |
|---|---|---|---|
| Executa o Angular | ✗ | ✓ | ✓ |
| Passa pelo 403 do `/api` | ✗ | ✓ | ✓ (mesma origem + cookies) |
| CORS | ✗ | ✓ | ✓ (mesma origem) |
| Custo de hospedagem | R$ 0 | **paga RAM p/ Chrome** | R$ 0 |
| Tráfego concentrado num IP | — | **sim, muda a postura c/ o TEC** | não, cada um usa o próprio |

### Passo 0 — spike que decide o resto (fazer antes de qualquer código)

⚠️ **Não verificado.** Todo o desenho abaixo assume que, de um content script rodando em
`tecconcursos.com.br`, um `fetch('/api/caderno-guia/listar-pelo-guia/<id>', {credentials:'include'})`
devolve **200 + JSON**. É plausível (mesma origem, cookies de sessão vão junto), mas não foi testado.

- [ ] Abrir um guia logado, e no console da página rodar o `fetch` acima. Ver o status.
  - **200 + JSON** → caminho fácil: a extensão consome a API, sem raspar DOM nenhum. Preferir este.
  - **403** → cair para extração por DOM, e aí resolver o problema abaixo.

**O problema do DOM, se o spike falhar:** os tópicos vivem numa página por matéria
(`div.caderno-guia-arvore-indice ul`), e buscá-las com `fetch` + `DOMParser` devolve o template
Angular cru — o mesmo beco sem saída do `cheerio`, só que dentro do browser. Sairia com iframe
oculto por matéria (se o `X-Frame-Options` deles permitir) ou aba em background — ambos mais frágeis
e mais lentos. Se o spike der 403, reavaliar se a extensão ainda compensa.

### O que já existe e dá para reaproveitar

Os três `page.evaluate()` de `src/app/api/import-guide/route.ts` **já são código DOM puro** — usam só
`document.querySelector` e afins. Portam quase literais para um content script:

- `route.ts:136` — cabeçalho (`name`, `cargo`, `edital`, `iconUrl`, `banca`), com os dois branches de
  seletor (`guias-cabecalho-*` e o fallback `detalhes-cabecalho-*`)
- `route.ts:165` — lista de matérias (`div.guia-materia-item` / fallback `div.cadernos-item`)
- `route.ts:205` — árvore recursiva de tópicos + contagem de questões (`span.capitulo-questoes`),
  incluindo a regra de promover subtópico quando a contagem do pai é igual à do primeiro filho

O que **não** porta: `page.goto` e `page.waitForSelector`, que são do Puppeteer.
`extractTopicWeights` (`route.ts:289`) é lógica pura e vai inteira.

### Como o plano chega ao Ouroboros

- [ ] **v1 — sem autenticação nenhuma na extensão.** Extensão monta o `PlanData` e entrega como JSON
      (download ou clipboard); o usuário sobe no Ouroboros. Reaproveita o upload de JSON que a 0.2 já
      previu para a web, e a página `/backup` já tem `<input type="file">` funcionando.
- [ ] **v2 — um clique.** `externally_connectable` no manifest apontando para o domínio do Ouroboros,
      e o app fala com a extensão direto. Só vale depois que a v1 provar que a extração funciona.
- [ ] Não colocar credencial de Supabase na extensão. O código de uma extensão é público, e a anon
      key ali dentro não agrega nada que o app já não faça melhor.

### Escopo e custo

- [ ] Manifest V3, um content script, sem service worker de fundo se a v1 bastar
- [ ] Publicação na Chrome Web Store (taxa única de registro de dev) e/ou Firefox Add-ons (grátis)
- [ ] Repositório separado — não misturar com o build do Electron

**Antes de começar:** ler os termos de uso do TEC. É o mesmo dado que o app já lê hoje, e continua
saindo do browser do próprio usuário, mas distribuir uma ferramenta para isso é diferente de rodar
localmente.

---

## Ordem de execução

**Caminho crítico:** `0 → 1 → 2 → 3 → 4`
**Paralelizável depois da Fase 3:** Fases 5 e 6

A parte cara é a **Fase 3** (~29 actions + troca de `fileName` por `planId`). Todo o resto é configuração.

## Custo mensal esperado

| Item | Custo |
|---|---|
| Frontend (Cloudflare Pages) | R$ 0 — banda ilimitada, SSL e domínio inclusos |
| Banco + Auth + Storage (Supabase Free) | R$ 0 — projetos inativos são pausados; ver Fase 6 |
| CI/CD (GitHub Actions, repo público) | R$ 0 |
| Importador de guia | R$ 0 se o teste da decisão 0.2 passar |
