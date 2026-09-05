# TODO — Migração para Supabase (v2)

## Objetivos originais

- [x] Utilizar Supabase para armazenar os dados → **Fases 1–3** — feito; nenhum acesso a `fs` sobrou no app.
- [x] Garantir que todas as tabelas do Supabase tenham RLS → **Fase 1** — 7/7 tabelas, confirmado
      por `supabase db advisors --type security` e pelo `npm run test:rls`.
- [x] Ter um comando para rodar apenas a interface, sem Electron → **Fase 5** — `npm run dev:web` /
      `npm run start:web`. Com o Electron removido (ver 0.4), *toda* instalação é só a interface.
- [ ] Ter automações no GitHub para migrations no Supabase e deploy → **Fase 6** — workflows escritos,
      nenhum rodou ainda (faltam os secrets; ver a tabela na Fase 6).

## Arquitetura alvo

```
v1:       Browser → Next Server (Node) → fs (JSON em DATA_DIR/<userId>/)
HOJE:     Browser → Supabase (Postgres + Auth + RLS)     ← a Fase 3 chegou aqui
DEPOIS:   Browser (bundle estático) → Supabase           ← falta o `output: 'export'` da Fase 5
```

Levantamento que definiu esta arquitetura:

- **15 das 17 páginas já eram `'use client'`.** As exceções são `layout.tsx` (só exporta `metadata`) e
  `page.tsx` (um `redirect`, que a Fase 5 troca).
- **Zero uso** de `cookies()`, `generateMetadata`, `revalidate` ou `dynamic`.
  (A Fase 2 introduziu **um** `cookies()`, em `src/lib/supabase/server.ts`. Ele sobreviveu à Fase 3:
  o último consumidor é a autenticação de `/api/import-guide`, e os dois morrem na Fase 5.)
- As rotas dinâmicas `[planId]` e `[subjectName]` leem o parâmetro via `useParams()` — no cliente.
  O servidor nunca precisa dele.
- Todo o acesso a dados passava por **um único arquivo**: `src/app/actions.tsx` (866 linhas, ~29
  server actions, todas `fs`). A Fase 3 o substituiu por `src/lib/data/`, no browser.

Conclusão: o servidor Node existia só por causa do `fs`. Removido ele, o app vira SPA estática,
hospedagem fica gratuita e **a RLS deixa de ser defesa em profundidade e passa a ser a única camada
de segurança dos dados** — o que já vale hoje, desde que a Fase 3 tirou o `fs` do caminho.

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
      ⚠️ **Revogada pela 0.4** — sem desktop, não há onde rodar o Chrome, e a importação de guia
      saiu do produto. O texto abaixo fica como registro do porquê ela não pôde ir para a web.
      → Manter a importação **só no desktop** (o Electron já embarca o Chrome); a web aceita
      upload do JSON. Alternativas para a web avaliadas em
      "Backlog — Extensão de browser" (adiado, não implementar agora). Consequência: `puppeteer` **não** pode ir para `optionalDependencies`
      junto com o resto na Fase 5 — ele é dependência real do build desktop.
- [x] **0.4 — Remover o Electron por completo.** → **Decidido pelo dono do projeto** (2026-09-05),
      depois que a Fase 5 fechou: *"pode apagar tudo que tem de electron, não vamos usar. quero
      funcional apenas o frontend SPA"*. Isso revoga a 0.2 e a 0.3.
      O que saiu: `electron/` (main, preload, importador de guia), `build/` (ícones do
      electron-builder), `.puppeteerrc.cjs`, a chave `build` e os scripts `*:electron` do
      `package.json`, e as dependências `electron`, `electron-builder`, `concurrently`, `wait-on`,
      `rimraf` e **`puppeteer`** — este último só existia por causa da decisão 0.2.
      O que precisou ser **reescrito**, e não apagado:
  - **O cronômetro.** O relógio vivia no processo main (`setInterval` + `timer-tick` por IPC), e no
    browser ele simplesmente não andava — apertar play não movia o mostrador. Virou
    `src/lib/stopwatch.ts`: estado de módulo (sobrevive a fechar o modal, como o processo separado
    fazia) e decorrido calculado por `Date.now()` em vez de somar ticks, porque aba em segundo
    plano tem `setInterval` estrangulado.
  - **A cor da barra de título** (`updateTitlebarColor`) e a faixa `draggable-region` do layout:
    não existem fora de uma janela nativa.
      **Perda assumida:** a importação de guia do Tec Concursos deixou de existir. Não há
      substituto na web (ver 0.2); o caminho que resta é o backup em JSON.
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

- [x] Instalar `@supabase/supabase-js` e `@supabase/ssr`
- [x] Criar `src/lib/supabase/client.ts` (browser). Usa `createBrowserClient`, que guarda a sessão em
      **cookie** e não em localStorage — ver a ponte temporária abaixo.
- [x] Reescrever `src/app/login/page.tsx` e `src/app/register/page.tsx` para `signInWithPassword` / `signUp`
- [x] **Supabase Auth exige e-mail**, o app usa username. Adicionado campo de e-mail no cadastro; o
      username viaja em `options.data` e o trigger `on_auth_user_created` o copia para `profiles`.
      O login passa a ser **por e-mail** — `profiles` não é legível pelo `anon`, então não há como
      traduzir username → e-mail antes de autenticar.
- [x] Guard de rota **client-side**: `src/context/AuthContext.tsx` (dentro do `Providers`) publica
      `status` no mesmo vocabulário do NextAuth (`loading`/`authenticated`/`unauthenticated`), e o
      `ClientLayoutWrapper`, que já redirecionava com base nessas strings, ficou intacto.
      ⚠️ Não usar `middleware.ts`: middleware não roda em export estático. Quem protege os dados de
      verdade é a RLS.
- [x] Remover `next-auth`, `bcryptjs`, `src/lib/users.ts` e `src/app/api/auth/**`
- [x] **Ponte temporária — `src/lib/supabase/server.ts`.** As ~29 actions de `actions.tsx` e a rota
      `/api/import-guide` ainda gravavam em disco e precisavam saber de quem era o diretório. Elas
      passaram a ler a sessão do Supabase pelo cookie (`getAuthenticatedUser()`, que usa `getUser()` e
      valida o JWT — `getSession()` confiaria no cookie, que é entrada do cliente).
      Este é o **único** uso de `cookies()` no projeto.
      ↪ **Correção:** a Fase 2 previu removê-lo na Fase 3, e não foi o que aconteceu. A Fase 3 tirou
      as actions do caminho, mas a rota de import continua precisando dele. O arquivo morre na
      Fase 5, junto com a rota.
- [x] `.env.local.example` com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`
      (antecipado da Fase 5: sem ele o app não sobe depois desta fase). O `.gitignore` ganhou
      `!.env.local.example`.

**Verificado em 2026-09-05** contra o Supabase local, com Puppeteer dirigindo o app de verdade:
guard redireciona `/dashboard` → `/login` sem sessão; cadastro entra direto no `/dashboard`;
sessão gravada em cookie `sb-*`; sidebar mostra o username lido de `profiles`; `/planos` carrega —
ou seja, a server action se autenticou pelo cookie; logout volta para `/login`; login por e-mail
funciona; senha errada mostra "Credenciais inválidas"; nenhum erro de JS no console.
Pela API: o trigger preenche `profiles`, a `anon key` sozinha recebe `42501` em `profiles`,
e-mail duplicado devolve `user_already_exists` e username duplicado devolve `23505`
(`profiles_username_key`) — as duas mensagens estão tratadas no formulário.

**Fica para a Fase 3:** `next.config.js` ainda tem `typescript.ignoreBuildErrors` ligado, então o
`tsc` continua barulhento. Confirmado que esta fase **não** acrescentou nenhum erro novo
(diff do `tsc --noEmit` antes/depois: só remoções).

## Fase 3 — Camada de dados

> **Concluída** em 2026-09-05. As ~29 server actions de `src/app/actions.tsx` deram lugar a
> `src/lib/data/`, que fala com o Postgres direto do browser. O arquivo `actions.tsx` foi apagado e
> nenhum código de dados roda mais no servidor.

### A camada nova

- [x] `src/lib/data/types.ts` — os tipos do domínio, antes espalhados e duplicados entre `actions.tsx`,
      `DataContext.tsx` e cada página.
- [x] `src/lib/data/mappers.ts` — a tradução `snake_case` ↔ `camelCase`. Todo `record.subject_id` do
      projeto mora aqui; o resto do app só enxerga os tipos.
- [x] `src/lib/data/index.ts` — as funções. Nenhuma delas filtra por dono para *autorizar*: o `user_id`
      que elas gravam existe para satisfazer o `with check` das políticas, e as leituras confiam no
      `using`. Quem decide o que cada usuário enxerga é a RLS.
- [x] `getUserDataDirectory()` virou `requireUserId()`, que usa `getUser()` (valida o JWT) e não
      `getSession()`.

| Antes (`actions.tsx`) | Agora (`@/lib/data`) |
|---|---|
| `getJsonFiles` + N × `getJsonContent` | `getPlans()` — uma consulta só |
| `getJsonContent(fileName)` | `getPlan(planId)` |
| `createPlanFile(FormData)` | `createPlan(input)` |
| `updatePlanFile` | `updatePlan` |
| `deletePlanFile` / `deleteJsonFile` | `deletePlan` |
| `uploadImage` (base64 no JSON) | `uploadPlanIcon` (Storage) |
| `saveStudyCycleToFile` / `getStudyCycleFromFile` / `deleteStudyCycleFile` | `saveStudyCycle` / `getStudyCycle` / `deleteStudyCycle` |
| `*Action` (renameSubject, addOrUpdateSubject, updateTopicWeight, updateAllTopicWeights) | mesmos nomes, sem o sufixo |
| `exportFullBackupAction` / `restoreFullBackupAction` | `exportAllData` / `restoreBackup` |
| `migrateStudyRecordIds`, `migrateToSubjectIds` | **descartadas** — o schema já exige o que elas consertavam |

- [x] `fileName` → `planId` (uuid) como chave de acesso, ponta a ponta: `selectedDataFile` virou
      `selectedPlanId`, `availablePlans` virou `availablePlanIds`, e a rota
      `src/app/planos/[fileName]` virou `src/app/planos/[planId]`.
      Consequência: o nome do plano deixou de ser identidade e virou rótulo. As telas que exibiam
      `fileName.replace('.json','')` (`PlanSelector`, `/planos`, `/planos/[planId]`,
      `/materias/[subjectName]`) passaram a ler `plan.name`, e o contexto ganhou `selectedPlan` para
      evitar o `availablePlanIds.indexOf(...)` espalhado pela UI.
- [x] A chave do `localStorage` mudou de `selectedDataFile` para `ouroboros.selectedPlanId` — o valor
      antigo é um nome de arquivo, que nunca casaria com um uuid. De quebra, a escolha do plano agora
      é de fato gravada: a v1 lia essa chave na carga mas só a escrevia ao excluir um plano.
- [x] IDs de registros, revisões e simulados passaram a ser `crypto.randomUUID()`, no lugar de
      `` `${Date.now()}-${random}` ``. Dois efeitos que exigiram mudança de lógica:
  - O ciclo de estudos lia o instante do registro de dentro do próprio ID para saber o que contava
    para o ciclo atual. Agora lê `created_at`, exposto como `StudyRecord.createdAt`.
  - O ID da revisão era `` `${studyRecordId}-${period}` ``, e reeditar um registro sobrescrevia as
    revisões dos mesmos períodos (vazando as dos períodos removidos). Sem esse determinismo,
    `updateStudyRecord` apaga as revisões do registro e regrava — o que também corrige o vazamento.

### Migration `0002_phase3_data_layer.sql`

A Fase 1 desenhou o schema a partir do TODO, não do runtime. Migrando as actions apareceram quatro
lacunas:

- [x] `plans.banca` — o importador de guia extrai a banca e o `CreatePlanModal` tem campo para ela;
      `/planos` exibe. Não havia coluna.
- [x] `study_cycles.completed_cycles` e `cycle_generation_timestamp` — o `DataContext` já gravava e
      lia os dois. Sem coluna, o contador de ciclos concluídos zeraria a cada recarga.
- [x] `plans.icon_url` → `icon_path`, e bucket privado `plan-icons` com quatro políticas comparando
      `(storage.foldername(name))[1]` com `auth.uid()`. A v1 embutia a imagem como data: URI dentro do
      plano, e ela viajava em toda leitura. A camada de dados assina as URLs em lote na leitura
      (1 hora de validade), então a UI continua recebendo `iconUrl` pronto para exibir.
- [x] `simulado_subjects`: o schema reservou `id uuid` supondo que o app mandasse o ID da matéria do
      plano. Não manda — o `AddSimuladoModal` monta cada linha como
      `{ name, weight, totalQuestions, correct, incorrect, color }`, sem ID. O vínculo é o nome, e é
      por nome que o rename de matéria propaga. `id` ficou como chave da linha, gerada pelo banco.

### Backup (o que era a Fase 4)

- [x] `exportAllData` gera `version: 4`, mantendo o esqueleto da v1 (`plans: [{ fileName, content }]`
      com os registros dentro do plano, `cycles` à parte) para que backup antigo e novo entrem pelo
      mesmo caminho. O `fileName` já não identifica nada: é rótulo derivado do nome.
- [x] `restoreBackup` limpa a conta e recria tudo, tolerando o formato da v1 — plano gravado como
      array puro de matérias, matéria sem `id`, matéria de simulado como `subjectName`. Os IDs são
      remapeados para uuid preservando o vínculo revisão → registro.
- [ ] **Falta testar com um backup real gerado pela v1.1.3** antes de anunciar. O teste automatizado
      cobre o ciclo exportar → restaurar dentro da v2; o formato antigo está coberto no código, não na
      prática.

### Compilador ligado

- [x] `typescript.ignoreBuildErrors: false`. Eram **166 erros pré-existentes** em 31 arquivos, todos
      escondidos; hoje `tsc --noEmit` está em zero e `next build` passa com a checagem ligada.
      O compilador pagou a passagem — cada item abaixo é um bug que ele expôs:
  - `/planos/[planId]` somava `record.correctQuestions` e `record.incorrectQuestions`, campos que
    nunca existiram em `StudyRecord`. Os contadores de questões daquela tela mostravam sempre zero.
  - O `StudyRegisterModal` montava o registro **sem `subjectId`**: editar um registro apagava o
    vínculo com a matéria, e só o nome sobrevivia a um rename.
  - O `AddSessionModal` criava sessões de ciclo sem `subjectId`, que por isso não casavam com
    nenhum registro de estudo.
  - `/historico` passava `onApplyFilters` para o `FilterModal`, que espera `onApply` — filtrar pelo
    histórico nunca funcionou.
  - `/revisoes` lia `studyRecord.comments`; o campo gravado é `notes`. O botão de comentário nunca
    aparecia. Também lia `studyRecord.material`, que **nada persiste** (ver dívida abaixo).
  - `SimuladoLineChart` passava funções em `color`, `titleColor` e afins. O chart.js não trata essas
    opções como scriptable: o valor renderizado era a própria função. Agora o tema vem do
    `ThemeContext` e as cores são strings.
  - `ConsistencyData` declarava `studied: boolean`; o que se grava é `status`, com quatro valores.
  - `NotificationContext` tipava só `success | error`, mas o app usa `warning` e `info` desde a v1 —
    e os dois caíam na cor de erro.
  - `PlanSelector` tinha três handlers mortos chamando um `setIsDeselectConfirmModalOpen` inexistente.
- [x] `EditalTopic` passou a declarar como opcionais os seis campos que são *derivados* por
      `calculateStats` (`completed`, `reviewed`, `total`, `percentage`, `last_study`, `is_completed`) —
      um tópico recém-criado ou vindo do importador não tem nenhum deles. O formato já calculado é o
      `ComputedEditalTopic`, no `DataContext`.
- [ ] `eslint.ignoreDuringBuilds` **continua `true`**. O `next lint` nunca chegou a rodar neste
      repositório (flat config + Next 14 abriam um wizard interativo), e agora que roda mostra ~200
      violações — 114 `no-unused-vars`, 73 `no-explicit-any`. É uma limpeza própria, não a migração de
      dados; registrada na Fase 6.

### Verificado em 2026-09-05

`scripts/test-data-layer.mjs` dirige o app com Puppeteer contra o Supabase local: **22/22, zero erro
de console**. Cobre cadastro, criação de plano, matéria, registro de estudo com duas revisões,
reedição do registro, ciclo manual, simulado, ícone e backup. Confirmado também no Postgres:

- o registro grava `subject_id`, `questions`, `review_periods` e `notes`, e as duas revisões nascem
  com as datas certas (`1d` → D+1, `7d` → D+7);
- ao reeditar removendo o período de `7d`, sobra **exatamente uma** revisão — sem duplicar (o que os
  uuid causariam sem o delete) e sem vazar a removida (o bug da v1);
- a sessão do ciclo grava `subjectId`, e `completed_cycles` faz o round-trip;
- a linha do simulado volta com `subject_name` e `position`;
- o ícone vive em `<uid>/<planId>-<rand>.png` no bucket privado e a URL assinada responde 200;
- restaurar o backup zera a conta e recria tudo, com o vínculo revisão → registro preservado;
- excluir o plano leva junto registros, revisões, ciclos **e** o objeto do Storage.

`npm run test:rls` continua passando com o schema da `0002`.

O teste precisa do `npm run dev` e do `npx supabase start` no ar. Não há linha no `package.json`
para ele; o comando é `node scripts/test-data-layer.mjs`.

### Dívidas que a Fase 3 deixa

- [ ] **`src/lib/supabase/server.ts` sobreviveu.** O TODO da Fase 2 dizia "remover na Fase 3", mas o
      único uso restante de `cookies()` é a autenticação da rota `/api/import-guide`, que é
      desktop-only (decisão 0.2) e morre na Fase 5, junto com o arquivo.
- [ ] **O input "Material" do `StudyRegisterModal` não grava nada.** O estado existe, o campo aparece,
      e o valor nunca entra no registro — em nenhuma versão. Duas telas liam `record.material` e
      recebiam `undefined`; essas leituras foram removidas. Persistir o campo pede coluna nova e é
      decisão de produto, não refactor.
- [ ] **`next/image` saiu dos ícones de plano**, em `/planos` e `/planos/[planId]`, porque a URL
      assinada do Storage tem query string e host que muda por ambiente. O `CreatePlanModal` ainda
      usa `next/image`, então `images: { unoptimized: true }` continua necessário na Fase 5.

## Fase 5 — Export estático + rodar só a interface

> Em andamento. O que não depende do `src/` já está feito; o resto espera a Fase 3 fechar, porque
> `output: 'export'` não pode ser ligado com o build instável.

### Feito

- [x] ~~Mover `electron`, `electron-builder`, `concurrently` e `wait-on` para `optionalDependencies`.~~
      **Superado pela 0.4:** os quatro (mais `puppeteer` e `rimraf`) foram removidos do projeto.
      **`puppeteer` ficou em `dependencies`**, pela decisão 0.2 — ele é dependência real do build
      desktop. Quem não quer o Chromium usa `PUPPETEER_SKIP_DOWNLOAD=true` na instalação.
      Verificado: `npm ci --omit=optional` remove os 4 pacotes e mais 233 transitivos, e mantém
      `next`, `typescript` e `puppeteer`.
- [x] Scripts `dev:web` e `start:web` no `package.json`. `start:web` roda `next build` e serve `out/`
      com `serve -s` — o mesmo fallback de SPA que o `_redirects` faz no Cloudflare Pages, então o
      preview local bate com produção. (`next start` deixa de existir sob `output: 'export'`.)
- [x] `electron-builder`: `!node_modules/{electron,electron-builder,concurrently,wait-on}/**` na chave
      `files`. `optionalDependencies` contam como dependência de produção, e sem isso o instalador
      passaria a embarcar as próprias ferramentas de build.
      ⚠️ **Não verificado** — depende de rodar `npm run build:electron`, que agora é sempre manual
      (não há mais workflow de release). Conferir no próximo empacotamento do desktop.
- [x] `setup-env.js` virou validador de `.env.local`: nada de `data/`, nada de `NEXTAUTH_SECRET`.
      Cria o arquivo a partir do `.env.local.example` se ele não existir e sai com código 1 quando
      falta variável, para servir de passo de pré-voo.
- [x] Criar `.env.local.example` com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` — feito na Fase 2
- [x] README: seção "Rodando Só a Interface (Web)" + "Configurando o Supabase". O resto do README
      (tecnologias, download, Docker com `NEXTAUTH_SECRET`) continua desatualizado e é da Fase 7.
- [x] ~~Importador de guia portado para o processo main do Electron: `electron/guide-importer.js`~~
      **Removido pela 0.4.** Chegou a ser verificado contra o guia real do TEC antes de sair
      (18 matérias, banca, contagem de tópicos e ícone), então o porte estava correto — o que mudou
      foi o produto não ter mais onde rodá-lo.
      (`ipcMain.handle('import-guide')` + `importGuide` no preload). É o porte de
      `src/app/api/import-guide/route.ts`, que **precisa** morrer: route handler `POST` não sobrevive
      a `output: 'export'`. Duas melhorias em relação à rota: a versão do Chrome empacotado é
      descoberta lendo o diretório em vez de ficar fixa no código, e o ícone volta como `data:` URI
      para o renderer subir no Storage, em vez de ser embutido no plano.
      ⚠️ **Não verificado** — precisa de uma importação real no Electron.

### Concluído em 2026-09-05

- [x] `next.config.js`: `output: 'export'` e `images: { unoptimized: true }`. O `next build` agora
      lista as 14 rotas como `○ (Static)` — nenhuma `ƒ` sobrou.
- [x] `src/app/page.tsx`: o `redirect()` de Server Component virou `router.replace` num efeito.
- [x] Rotas dinâmicas viraram query string. `[planId]` e `[subjectName]` deixaram de ser rotas:
      os componentes foram para `src/components/PlanDetail.tsx` e `src/components/SubjectDetail.tsx`,
      e `planos/page.tsx` / `materias/page.tsx` viraram um `Suspense` + `useSearchParams` que decide
      entre lista e detalhe. Foram mesmo 3 pontos de navegação, como o levantamento previa.
  - [x] `/planos?id=<uuid>`
  - [x] `/materias?nome=<x>`
- [x] `src/app/api/import-guide/route.ts` **deletada** — junto com a funcionalidade inteira (0.4).
- [x] `src/lib/supabase/server.ts` deletado. Não sobrou nenhum `cookies()` nem `next/headers` no `src/`.
- [x] `npm run start:web` conferido servindo `out/` — o E2E completo passa contra o bundle estático,
      sem servidor Node em lugar nenhum.
      ⚠️ **Correção:** o script usava `serve -s`, que reescreve *toda* rota para o `index.html` e
      anula o `.html` por rota que o export gera — `/register` abria a raiz. O `-s` saiu. O Cloudflare
      Pages serve o arquivo real primeiro e só cai no `_redirects` para o que não existe; sem `-s`,
      o `serve` faz o mesmo.

## Fase 6 — Automações no GitHub

> **Escopo: só a web.** O GitHub publica a SPA e cuida do banco — nada de build de desktop.
> O empacotamento do Electron fica manual, na máquina de quem faz a release.
>
> **Escrita.** Nenhum workflow rodou ainda: o `ci.yml` vai reprovar enquanto os erros de TypeScript
> da Fase 3 e os de ESLint não zerarem (é o comportamento correto — é justamente para isso que ele
> existe), e o `deploy.yml` só produz algo publicável depois que a Fase 5 ligar `output: 'export'`.
> Faltam os secrets, listados no fim desta seção.

- [x] **`npm run lint` estava quebrado e ninguém sabia.** O projeto usa flat config
      (`eslint.config.mjs`), e o `next lint` do Next 14 só enxerga `.eslintrc*` — o comando abria um
      wizard interativo perguntando como configurar o ESLint. Num CI, isso é um job travado.
      O script virou `cross-env ESLINT_USE_FLAT_CONFIG=true eslint src`.
- [x] **Zerar a dívida de lint: 200 erros → 0** (2026-09-05). Sobram os 10 warnings, que não
      reprovam o `ci.yml`. `eslint.ignoreDuringBuilds` foi para `false`: o `next build` reprova de
      novo. O que apareceu no caminho está no fim desta seção.
- [ ] ~~**Zerar a dívida de lint: 200 erros e 10 warnings**~~ (medido em 2026-09-05, com o lint
      finalmente rodando). São 114 `@typescript-eslint/no-unused-vars`, 73
      `@typescript-eslint/no-explicit-any`, 6 `prefer-const`, 6 `react/no-unescaped-entities`,
      1 `no-empty-object-type`; os warnings são 7 `react-hooks/exhaustive-deps` e
      3 `@next/next/no-img-element`. `--fix` resolve 5.
      Enquanto não zerar, o `ci.yml` fica vermelho. É de propósito: era essa a informação que o
      `eslint.ignoreDuringBuilds` escondia.
- [x] `.github/workflows/ci.yml` — em todo PR, dois jobs:
      **`web`** (`npm ci --omit=optional`, `tsc --noEmit`, `npm run lint`, `next build`) e
      **`migrations`** (`supabase db start` num Postgres limpo, `supabase db lint` e
      `supabase db advisors --type security`).
      O `--omit=optional` é de propósito: o CI instala exatamente o que o deploy instala, então um
      `import` de `electron` do lado da web quebra aqui e não em produção.
- [x] `supabase db lint` no PR — ficou no `ci.yml`, junto com a aplicação das migrations num banco
      limpo. Migration que não aplica reprova antes de chegar perto do banco remoto. Os dois
      comandos precisam de `--fail-on error`: sem isso eles imprimem o problema e saem 0.
      Verificados contra o Supabase local em 2026-09-05 — os dois passam no schema de hoje.
- [x] **Bônus: `supabase db advisors --type security` no mesmo job.** Ele reprova tabela em `public`
      sem RLS habilitada, ou seja, é o objetivo 2 do topo deste arquivo virando teste automático em
      vez de disciplina.
- [x] `.github/workflows/deploy.yml` — em push na `master`: job `migrations`
      (`supabase link` + `supabase db push --include-all`) e job `deploy`
      (`wrangler pages deploy out`) com `needs: migrations`.
      **Desvio do plano:** o TODO previa `migrations.yml` e `deploy.yml` separados, encadeados com
      `needs:`. `needs:` só existe entre jobs do mesmo workflow; a alternativa (`workflow_run`) roda
      em outro contexto e falha em silêncio. Viraram dois jobs de um arquivo só, que é o
      encadeamento que o TODO pedia.
      `--include-all` porque, sem ele, o `db push` para na primeira migration fora de ordem
      cronológica — o que acontece toda vez que dois PRs com migration são mergeados de véspera.
- [x] `public/_redirects` com `/* /index.html 200`. Vai em `public/` porque `output: 'export'` copia
      a pasta inteira para `out/`, que é o que o Pages publica.
- [x] ~~`.github/workflows/release.yml` — build do Electron em matrix `ubuntu-latest` +
      `windows-latest` em tag `v*`.~~ **Descartado em 2026-09-05, por decisão do dono do projeto:
      o que sai do GitHub é só a SPA.** O workflow chegou a ser escrito e foi removido.
      Consequência: o build desktop continua manual (`npm run build:electron`), e o link de download
      do README continua sendo atualizado à mão. O arquivo nunca chegou a ser commitado, então não
      está no histórico — se um dia isso incomodar, é reescrever do zero.
- [x] `.github/workflows/keepalive.yml` — `select 1` via `psql` a cada 3 dias, contra a pausa por
      inatividade do plano Free. ⚠️ O GitHub desativa workflows agendados em repositório sem commits
      por 60 dias; se ele parar de rodar, é isso.
- [x] **Supabase Branching — avaliado e descartado por ora.** Exige plano pago, e a tabela de custo
      abaixo depende do Free. O que ele resolveria (migration ruim derrubando produção) está coberto
      em boa parte pelo job `migrations` do `ci.yml`, que aplica as migrations num Postgres limpo a
      cada PR. Reavaliar se o projeto sair do Free.
- [ ] **SMTP próprio para o Supabase Auth.** O serviço de e-mail embutido do Supabase é declarado
      "só para teste": é limitado por hora (`[auth.rate_limit] email_sent` — o `config.toml` local
      usa 2) e, em projetos novos, **só entrega para membros da organização**. Ou seja, sem SMTP
      próprio, o cadastro com um e-mail pessoal qualquer falha em silêncio — a conta é criada, o
      link de confirmação nunca chega, e o usuário fica preso na tela de "Confirme seu e-mail".
      Provedor: Resend no free tier (3 mil e-mails/mês, 100/dia) atende com folga; a configuração
      é Authentication → Emails → SMTP Settings, mais os registros de DNS do domínio remetente.
      **Bloqueia ligar `enable_confirmations = true`** no projeto hospedado, e é por isso que a
      decisão sobre confirmação de e-mail em staging (ver `PLANO-STAGING.md`) depende deste item.
      Não confundir com o problema *dos testes*: `test-e2e.mjs` e `test-rls-isolation.mjs` usam
      `@example.com` e `@ouroboros.test`, domínios reservados e não roteáveis — nenhum SMTP, por
      melhor que seja, entrega para eles. Lá a saída é confirmar o usuário pela Admin API
      (`auth.admin.updateUserById(id, { email_confirm: true })`) com a `service_role key` vinda do
      ambiente local, nunca de um secret de CI.

### Secrets e variáveis que precisam ser criados no GitHub

Sem eles os workflows falham. `Settings → Secrets and variables → Actions`.

| Nome | Tipo | Onde achar | Usado por |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | secret | Project Settings → API | ci, deploy |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | secret | Project Settings → API | ci, deploy |
| `SUPABASE_ACCESS_TOKEN` | secret | `supabase login` / Account → Access Tokens | deploy |
| `SUPABASE_PROJECT_ID` | secret | `ttlfqwkavesblklhutoh` (staging) | deploy |
| `SUPABASE_DB_PASSWORD` | secret | senha do Postgres do projeto | deploy |
| `SUPABASE_DB_URL` | secret | Database → Connection string (URI) | keepalive |
| `CLOUDFLARE_API_TOKEN` | secret | Cloudflare → API Tokens (permissão Pages: Edit) | deploy |
| `CLOUDFLARE_ACCOUNT_ID` | secret | Cloudflare → Workers & Pages | deploy |
| `CLOUDFLARE_PROJECT_NAME` | **variável** | nome do projeto no Pages | deploy |

O job de deploy usa o environment `production`; vale criar esse environment com required reviewer
se a ideia for revisar antes de publicar.

## Fase 7 — Fechamento

> **Vazia.** Ela existia só para acertar o empacotamento do Electron; a decisão 0.4 apagou o
> assunto. Fica o registro dos dois itens, porque eles descrevem armadilhas reais para quem um dia
> pensar em ressuscitar o desktop:
>
> - `electron/main.js` ainda subia um servidor Next em runtime (`startNextServer()`), o que deixou
>   de fazer sentido quando o app virou export estático.
> - ⚠️ **Não usar `loadFile('out/index.html')`.** `createBrowserClient` guarda a sessão em
>   **cookie**, e o Chromium não dá cookie para origem `file://` — o login não persiste. O caminho
>   seria `protocol.handle('app', ...)` e carregar `app://ouroboros/index.html`, que é uma origem
>   de verdade.

## O que o lint escondia (Fase 6)

Zerar os 200 erros não foi só arrumar formatação — como na Fase 3 com o `tsc`, cada `any` que saiu
expôs alguma coisa:

- **Filtrar por matéria ou categoria nunca funcionou.** `FilterModal` sempre emitiu `subjects` e
  `categories` (arrays, do `MultiSelectDropdown`), e os dois consumidores — `/historico` e o
  `DataContext` — liam `subject` e `category` (strings, no singular). Com `onApply: (filters: any)`
  no meio, ninguém via. Agora o tipo é o que o modal manda de verdade, e os dois filtros passaram a
  funcionar, com múltipla escolha. É a camada seguinte do mesmo bug que a Fase 3 achou (a tela
  passava `onApplyFilters` para uma prop chamada `onApply`, então o filtro nem disparava).
- **IDs de sessão do ciclo eram `Date.now()`** em `CycleCreationModal` — inclusive
  `Date.now() + Math.random()` ao duplicar, que gera um id fracionário. Viraram `crypto.randomUUID()`,
  como todo o resto desde a Fase 3.
- **Código morto que ninguém tinha como alcançar:** o `AddTopicModal` do detalhe do plano (o botão
  que o abria já não existia), `generateCycle` em `/planejamento`, `handleCreateEmptyCycle`,
  `openStopwatchModal` de `/estatisticas`, e um punhado de estados que eram escritos e nunca lidos
  (ou lidos e nunca escritos, como `targetDuration` do cronômetro em `/estatisticas`, que era sempre
  `undefined`).
- **`subjectTopics.shift()`** no `DataContext` tinha o retorno guardado em `bestTopic` e nunca usado.
  A chamada ficou (o efeito colateral de desenfileirar é intencional), mas o comentário agora diz
  que é só isso. Vale um olhar: pelo nome, alguém quis usar esse tópico para alguma coisa.
- `@typescript-eslint/no-unused-vars` ganhou `ignoreRestSiblings` e `argsIgnorePattern: "^_"` no
  `eslint.config.mjs`. Sem isso, `const { id, ...resto } = obj` — que é como se omite um campo em
  JS — vira erro, e o jeito de calar o lint seria pior que o lint.
      A outra opção — trocar o storage da sessão para `localStorage` — muda o cliente do browser
      inteiro e não vale por causa do desktop.
- [ ] `docker-compose.yml`: trocar `NEXTAUTH_SECRET` pelas vars do Supabase e **remover o bind mount
      `.:/app`**, que hoje quebra a imagem de produção
- [ ] Remover `src/components/StudyRegisterModal1.bkp` e `StudyRegisterModal2.bkp`
- [ ] README: tecnologias (entra Supabase, sai o servidor Node), seção do Docker que ainda fala em
      `NEXTAUTH_SECRET` / `DATABASE_URL`, e o link de download
- [ ] Bump para v2.0.0 e atualizar README (tecnologias, instalação, download)

---

## Backlog — Migração dos dados da v1 (descartado por ora, NÃO implementar)

> Era a **Fase 4**. Removida em 2026-09-05: a v2 web é um produto **diferente** do que existe hoje,
> não a continuação da mesma base de dados. Ninguém precisa trazer histórico da v1.

Se alguém pedir, o caminho já está desenhado e é barato:

- Não existe base de usuários central para migrar — cada instalação é local (desktop ou Docker
  self-hosted). E o app já tem `exportFullBackupAction` / `restoreFullBackupAction` e a página `/backup`.
- Usuário exporta o backup JSON na v1 → cria conta na v2 → importa. Basta reescrever
  `restoreFullBackupAction` para gravar no Supabase **tolerando o formato antigo**. Nenhum script de
  migração server-side é necessário.
- Testar com um backup real gerado pela v1.1.3 antes de anunciar.

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

**Caminho crítico:** `0 → 1 → 2 → 3`
**Paralelizável depois da Fase 3:** Fases 5 e 6

> A numeração pula a Fase 4 de propósito: ela era a migração dos dados da v1 e foi descartada
> (ver o backlog). As fases 5–7 mantêm o número que sempre tiveram para não invalidar as
> referências no histórico e no código.

A parte cara é a **Fase 3** (~29 actions + troca de `fileName` por `planId`). Todo o resto é configuração.

## Custo mensal esperado

| Item | Custo |
|---|---|
| Frontend (Cloudflare Pages) | R$ 0 — banda ilimitada, SSL e domínio inclusos |
| Banco + Auth + Storage (Supabase Free) | R$ 0 — projetos inativos são pausados; ver Fase 6 |
| CI/CD (GitHub Actions, repo público) | R$ 0 |
| SMTP transacional (Resend free) | R$ 0 até 3 mil e-mails/mês, 100/dia |
| Importador de guia | R$ 0 se o teste da decisão 0.2 passar |
