# Plano — Supabase (backend) + Cloudflare Pages (frontend), ambiente **staging**

> Levantado em 2026-09-05. Complementa a **Fase 6** do `TODO.md`: lá estão os workflows
> (já escritos); aqui está o provisionamento.
>
> **Estado da execução (2026-09-05, fim da sessão):**
>
> | Etapa | Situação |
> |---|---|
> | 0 — credenciais de teste | **feita** — senha aleatória por execução, e-mail com `randomBytes`, nada de credencial no stdout, guarda `ALLOW_REMOTE` nos dois scripts |
> | A — Supabase remoto | **feita e verificada** — migrations 0001/0002 aplicadas, Auth configurado, `mailer_autoconfirm: true` |
> | B — Cloudflare Pages | **feita** — projeto criado com `--production-branch=master` e primeiro deploy manual no ar |
> | C — GitHub | **parcial** — environment `staging` criado, `deploy.yml` apontado para ele, 5 de 8 secrets postos |
> | D — verificação manual | **feita** — RLS e E2E passam contra o remoto (ver abaixo); o ciclo *automático* ainda não rodou |
>
> ### Verificação contra staging (2026-09-05)
>
> - `test-rls-isolation.mjs`: todos os checks. B não lê, não altera, não apaga e não forja
>   linha de A; anon sem sessão é barrada nas 7 tabelas.
> - `test-e2e.mjs` contra `https://ouroboros-bora-bora-staging.pages.dev`: **46/46 checks,
>   0 erros de console** — cadastro, plano, ícone no Storage, estudo, revisões, ciclo,
>   simulado, backup/restauração, exclusão, login, logout e senha errada.
> - `db advisors --type security --level warn`: nenhum finding de RLS e nenhum `ERROR`.
>   Três `WARN`: `handle_new_user()` e `set_updated_at()` chamáveis por RPC pelo role
>   `authenticated` (o `revoke execute ... from public` da `0001:469` não alcança
>   `authenticated`, que recebe EXECUTE pelos default privileges do Supabase — as duas são
>   funções de trigger e quebram sem contexto de trigger, então não são exploráveis, mas o
>   comentário da migration descreve um efeito que não acontece), e leaked password
>   protection desligada.
>
> ### Pendências
>
> 1. Os 3 secrets restantes: `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL`
>    (Database → Connection string → URI) e `CLOUDFLARE_API_TOKEN`
>    (My Profile → API Tokens, permissão `Account → Cloudflare Pages → Edit`).
> 2. Commitar e dar push na `master` para o `deploy.yml` rodar pela primeira vez.
> 3. Conferir na aba Actions que o `keepalive.yml` aparece na lista de schedules — fork.
>
> ### Achado da Etapa B: `public/_redirects` é inerte
>
> O `out/404.html` que o `output: 'export'` gera vence a regra `/* /index.html 200`: o Pages
> serve o 404 do próprio Next, com status 404. Não é problema — cada rota tem seu `.html`, então
> deep link funciona e rota inexistente cai na página de "não encontrada" do app. Mas o
> comentário dentro do `_redirects` descreve um efeito que não acontece.
>
> **Detalhes do provisionamento**, para não redescobrir depois: a conta do Cloudflare é a do
> `bora.estudar.saas@gmail.com`; o Account ID sai de `npx wrangler whoami` e já está no secret
> `CLOUDFLARE_ACCOUNT_ID`. O `CLOUDFLARE_API_TOKEN` é um *account-owned token* — por isso ele é
> rejeitado no `/user/tokens/verify` e só valida em
> `/accounts/<id>/tokens/verify`. A chave posta em `NEXT_PUBLIC_SUPABASE_ANON_KEY` é a
> **publishable** (`sb_publishable_…`), não o JWT anon legado; as duas funcionam, e trocar
> exige rebuild, porque o valor é inlinado no bundle.

## Nomes (staging dos dois lados)

| | Nome | URL |
|---|---|---|
| Supabase | `Ouroboros-Bora-Bora Staging` (já existe, ref `ttlfqwkavesblklhutoh`, `sa-east-1`) | `https://ttlfqwkavesblklhutoh.supabase.co` |
| Cloudflare Pages | `ouroboros-bora-bora-staging` (criar) | `https://ouroboros-bora-bora-staging.pages.dev` |
| GitHub Environment | `staging` (hoje o `deploy.yml` diz `production` — 2 linhas a trocar) | — |

---

## Etapa 0 — BLOQUEIO: credenciais de teste públicas

Os dois scripts de teste criam usuários **reais** via `signUp` na API pública. Contra o
Supabase local isso é inofensivo; contra staging, não — porque a senha dos dois está no
repositório público.

| Script | Onde | O problema |
|---|---|---|
| `scripts/test-e2e.mjs` | linha 31 | `PASS = 'SenhaForte123!'` é constante literal. O e-mail é `e2e+${Date.now()}@example.com` — enumerável por força bruta sobre o timestamp. |
| `scripts/test-rls-isolation.mjs` | linhas 82-83 | A senha é `Senha!${sufixo}` e o e-mail é `rls-<rótulo>-${sufixo}@ouroboros.test`: a senha é **função pura do e-mail**. A linha 169 ainda imprime os dois e-mails no stdout, que num repo público vira log de Actions público. |

Consequência se rodar como está: qualquer pessoa loga nessas contas no
`ouroboros-bora-bora-staging.pages.dev` e passa a escrever no banco de staging com um
usuário legítimo — a RLS funciona exatamente como deveria e deixa entrar, porque quem
entrou é o dono das linhas.

**Correção antes de apontar qualquer teste para o remoto:**

1. **Senha aleatória por execução, nunca impressa.** Trocar a constante e a senha derivada por
   `crypto.randomBytes(24).toString('base64url') + 'aA1!'` (o sufixo garante o
   `password_requirements`). Ninguém precisa saber a senha depois do teste: o script já tem a
   sessão em memória. Conta criada com senha que não existe em lugar nenhum é conta inerte.
2. **Parar de imprimir credencial.** `test-rls-isolation.mjs:168-169` e
   `test-e2e.mjs:555` podem imprimir o `user.id` em vez do e-mail — serve igual para depurar
   e não é material de login.
3. **E-mail com entropia de verdade**, não timestamp: mesmo `randomBytes` no local-part.
   Manter os domínios `@example.com` e `@ouroboros.test`, que são TLDs reservados e não
   roteáveis — nenhum e-mail sai de fato.
4. **Guarda de destino.** No topo dos dois scripts, recusar rodar contra host que não seja
   `127.0.0.1`/`localhost` a menos que venha `ALLOW_REMOTE=1` explícito. Evita o acidente de
   um `npm run test:e2e` com `.env.local` apontado para staging.

**Não** vale resolver isso pondo a senha num secret do GitHub: o `test:e2e` roda contra a SPA
publicada, e uma senha fixa compartilhada entre execuções é justamente o que se quer evitar.

Limpeza: mesmo corrigido, cada execução deixa usuários residuais no Auth de staging. Apagar
periodicamente pelo painel, ou escrever um `scripts/purge-test-users.mjs` que rode **só na
máquina do dev**, com a `service_role key` vinda do ambiente — ela nunca entra no repo nem em
secret de CI.

---

## Etapa A — Supabase remoto (backend)

O projeto existe e está linkado (`supabase/.temp/linked-project.json`), mas as migrations
`0001_initial_schema.sql` e `0002_phase3_data_layer.sql` nunca foram aplicadas no remoto.

```bash
npx supabase migration list                              # confirma o link e o que falta lá
npx supabase db push                                     # pede a senha do Postgres
npx supabase db advisors --type security --level warn    # RLS em 7/7 tabelas, agora no remoto
```

⚠️ A `0002` cria o bucket de Storage `plan-icons` e as políticas dele. O `db push` faz isso
sozinho — **não criar o bucket à mão no painel**.

Em **Authentication → URL Configuration**:

- Site URL: `https://ouroboros-bora-bora-staging.pages.dev`
- Redirect URLs:
  - `https://*.ouroboros-bora-bora-staging.pages.dev/**` — cada preview de branch é outra origem
  - `http://localhost:3000/**`

Em **Authentication → Sign In / Providers → Email**: **desligar "Confirm email"**, igualando o
`enable_confirmations = false` do `supabase/config.toml`. Motivo prático: o SMTP embutido do
Supabase manda ~2 e-mails/hora e, em projetos novos, só para membros da organização. Com
confirmação ligada, `/register` trava e os dois scripts de teste falham no `signUp` —
o `test-rls-isolation.mjs:92` já prevê exatamente esse erro na mensagem.

Guardar de **Project Settings → API**: a URL e a *anon / publishable key*. Ela é inlinada no
bundle e não é segredo — quem protege os dados é a RLS. A `service_role key` não entra em
lugar nenhum: nem em `.env.local`, nem em secret, nem em workflow.

## Etapa B — Cloudflare Pages (frontend)

`wrangler login` já foi feito.

```bash
npx wrangler pages project create ouroboros-bora-bora-staging --production-branch=master
npx wrangler whoami                                      # anota o Account ID
```

O `--production-branch=master` importa: sem ele o Pages assume `main`, e o `--branch=master`
do `deploy.yml` viraria deploy de *preview* — a URL principal ficaria eternamente vazia.

**Não conectar o repositório do GitHub no painel do Pages.** O `deploy.yml` publica por upload
direto (`wrangler pages deploy out`); conectar o Git faria o Cloudflare buildar por conta
própria e dois deploys da mesma branch competiriam.

Primeiro deploy manual, para validar antes de automatizar:

```bash
npm run build
npx wrangler pages deploy out --project-name=ouroboros-bora-bora-staging --branch=master
```

API token para o CI: **My Profile → API Tokens → Create Custom Token**, permissão
`Account → Cloudflare Pages → Edit`.

## Etapa C — Amarrar os dois no GitHub

Detalhe do fork (`darkvictor13/Ouroboros-Bora-Bora`, público): **Actions vem desabilitado por
padrão em repositório forkado**, e workflows agendados ficam desligados de vez. Abrir a aba
*Actions*, habilitar, e depois confirmar que o `keepalive.yml` aparece na lista de schedules —
sem ele o projeto Free é pausado por inatividade em ~7 dias.

```bash
gh secret set NEXT_PUBLIC_SUPABASE_URL       # https://ttlfqwkavesblklhutoh.supabase.co
gh secret set NEXT_PUBLIC_SUPABASE_ANON_KEY
gh secret set SUPABASE_ACCESS_TOKEN          # ~/.supabase/access-token, ou Account → Access Tokens
gh secret set SUPABASE_PROJECT_ID            # ttlfqwkavesblklhutoh
gh secret set SUPABASE_DB_PASSWORD
gh secret set SUPABASE_DB_URL                # Database → Connection string (URI), para o keepalive
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
gh variable set CLOUDFLARE_PROJECT_NAME --body ouroboros-bora-bora-staging
```

`CLOUDFLARE_PROJECT_NAME` é **variable**, não secret — o `deploy.yml` lê `vars.` e como secret
chegaria vazio.

Criar o environment `staging` (Settings → Environments) e trocar os dois
`environment: production` do `deploy.yml` por `staging`. Se a ideia for revisar antes de
publicar, é aqui que entra o *required reviewer*.

## Etapa D — Primeiro ciclo automático e verificação

O `deploy.yml` dispara em push na `master`. Hoje há bastante coisa **não commitada** (favicons,
`src/lib/chartTheme.ts`, remoção do modal de doação, mudanças em ~15 componentes) — nada disso
vai ao ar antes de virar commit.

Verificação, com os scripts que já existem apontados para o remoto — **só depois da Etapa 0**:

```bash
ALLOW_REMOTE=1 SUPABASE_URL=https://ttlfqwkavesblklhutoh.supabase.co \
  SUPABASE_ANON_KEY=<anon> npm run test:rls

ALLOW_REMOTE=1 BASE=https://ouroboros-bora-bora-staging.pages.dev npm run test:e2e
```

---

## Armadilhas já previstas

- **Sessão em cookie.** `src/lib/supabase/client.ts` usa `createBrowserClient`, que guarda a
  sessão em cookie. Em `https://*.pages.dev` funciona; o que quebraria é `file://` — registrado
  na Fase 7 do `TODO.md`.
- **Cada preview de branch é outra origem.** Sem o wildcard nos Redirect URLs, login em preview
  falha em silêncio.
- **A anon key é inlinada no bundle no momento do build.** Trocar de projeto Supabase depois
  exige rebuild, não basta mexer no secret.
- **Pausa por inatividade** do Free: coberta pelo `keepalive.yml`, *desde que* Actions esteja
  habilitado no fork.

## Decisões que dependem do dono do projeto

1. **Autorizar o `db push` no remoto** — é a primeira escrita num banco hospedado.
2. **Confirmação de e-mail desligada em staging** — recomendado pelo limite de SMTP; significa
   conta ativa sem verificar e-mail.

## Ordem de execução

`Etapa 0` (código, bloqueia D) → `A` → `B` → `C` → `D`.
As etapas A e B são independentes entre si e podem ser feitas em qualquer ordem; a C precisa
das duas, porque consome credenciais das duas.
