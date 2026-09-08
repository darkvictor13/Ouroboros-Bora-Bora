# Plano — Sentry no plano gratuito, com dois deploys (staging + produção)

> Levantado em 2026-09-08. Responde a uma pergunta só: **cabe?** Complementa o `PLANO-STAGING.md`
> (que provisionou o primeiro dos dois ambientes) e a Fase 6 do `TODO.md`.
>
> **Veredito: cabe, e sem truque — mas o gargalo não é o número de deploys, é o teto de
> 5.000 erros/mês da organização inteira.** Projeto é ilimitado no Free; quota não é.
>
> **Estado da execução (2026-09-08):**
>
> | Parte | Situação |
> |---|---|
> | Código do app (§7.1) | **feito** — `@sentry/react` 10.73.0, `initSentry`, `setUser`, barreira de erro |
> | Sourcemaps no build (§7.3) | **feito** — `@sentry/webpack-plugin` 5.4.0, só na compilação de cliente e só com token |
> | `deploy.yml` (§7.2) | **feito** — 7 variáveis, todas opcionais, mais a guarda do `find` |
> | Environment `staging` no GitHub | **feito** — secret `NEXT_PUBLIC_SENTRY_DSN` + variables `SENTRY_ENVIRONMENT`, `SENTRY_ORG` (`bora-estudar`), `SENTRY_PROJECT` (`bora-estudar-staging`) |
> | Verificação contra staging (`npm run test:sentry`) | **9/9** no deploy 34270019667 — inclusive `ingest aceitou o evento :: HTTP 200` |
> | Sourcemaps | **subindo** — `Successfully uploaded source maps to Sentry`, 73 arquivos |
> | Conta, projetos, token, Spike Protection, Allowed Domains | **do dono do projeto** — nada disso tem API antes da conta existir |
> | Uptime monitor e cron monitor (§7.4) | **esperam produção existir** (ver §8) |
>
> ### O que a verificação provou (9/9, staging real, 2026-09-08)
>
> SDK inicializado a partir do DSN inlinado (`o4512052295827456`); integração `Supabase`
> registrada sobre o cliente singleton; erro real sai da aba, chega ao endpoint do projeto e
> volta **HTTP 200** — aceito, não recusado por origem; evento marcado com `environment=staging`
> e `release` = SHA do commit; **`user` sem e-mail, sem username e sem IP**; `ignoreErrors`
> derrubando `Failed to fetch`; e nenhum `.map` servido (404).
>
> O 9º check existe porque de dentro da aba "enviado" e "aceito" são idênticos: só a resposta do
> ingest distingue os dois, e um 403 do Allowed Domains seria a diferença entre a issue existir
> e não existir.
>
> Falta **um** item, e ele não tem API: abrir a issue no painel e confirmar que o stack trace
> veio desminificado. Só um token com `project:read` permitiria checar isso daqui.
>
> ### Custo no bundle
>
> **+33 kB gzipado** (+100 kB cru) somando todos os chunks — medido contra um build do `08936c0`
> em worktree separada. É o SDK inteiro, sem tracing e sem replay; as duas integrações ficaram
> ausentes justamente por isso (§5.4).
>
> ### Achado 2: config pela metade também era silenciosa (deploy 34268546566)
>
> O primeiro deploy com o código no ar saiu **verde e sem Sentry**. Chegaram ao runner só o
> `SENTRY_AUTH_TOKEN` e o `NEXT_PUBLIC_SENTRY_RELEASE`; DSN, `SENTRY_ORG`, `SENTRY_PROJECT` e
> `SENTRY_ENVIRONMENT` vieram vazios. O plugin reagiu com **Warning**, não com erro
> (`No project provided. Will not upload source maps.`), então o `errorHandler` do Achado 1
> nunca foi chamado. A guarda de agora está no `next.config.js`, antes do build:
>
> | Token | DSN | org+project | Resultado |
> |---|---|---|---|
> | — | — | — | build normal, Sentry desligado |
> | ✓ | — | — | build normal + **aviso no log**: "este bundle vai SEM Sentry" |
> | ✓ | ✓ | — | **build reprova** — subiria sem mapa e toda issue viria minificada |
> | ✓ | ✓ | ✓ | upload de sourcemap |
>
> Ou seja: **o DSN é o interruptor por ambiente** (é ele que decide se aquele deploy tem
> Sentry), e config pela metade não passa. O que continua fora do alcance do compilador é
> "esqueci o DSN": para isso existe o `npm run test:sentry`.
>
> ### Achado 1: falha de upload de sourcemap era silenciosa
>
> Testado com um token inválido: o `@sentry/webpack-plugin` **loga** `Invalid org token (401)` e
> o `next build` sai **0**. Como os `.map` são apagados depois do upload, o deploy seguiria e
> produção inteira ficaria com stack trace minificado, sem nada vermelho em lugar nenhum.
> Corrigido com um `errorHandler` que relança: agora o build reprova e a versão anterior fica
> no ar. Para publicar sem mapas de propósito, tire o `SENTRY_AUTH_TOKEN` do environment.

## 1. O que o plano Developer (Free) dá

Conferido na [página de preços](https://sentry.io/pricing/) em 2026-09-08:

| Recurso | Free |
|---|---|
| Erros | **5.000/mês** |
| Spans (tracing) | 5.000.000/mês |
| Session Replays | **50/mês** |
| Uptime monitors | **1** |
| Cron monitors | **1** |
| Attachments | 1 GB |
| Usuários (seats) | **1** |
| Projetos | **ilimitados** |
| Retenção | **30 dias** |

O que **não** vem, e que importa aqui:

| Faltante | Consequência prática |
|---|---|
| Rate limit por chave de DSN (só Business/Enterprise, [docs](https://docs.sentry.io/pricing/quotas/manage-event-stream-guide/)) | Não dá para dizer "staging no máximo 500 erros/mês". O controle tem que ser **no SDK** (`sampleRate`, `ignoreErrors`, `beforeSend`) e no Spike Protection. |
| Delete & Discard, filtro por release e por mensagem de erro | Um erro barulhento não pode ser descartado no servidor; tem que sair no `beforeSend` e exigir rebuild. |
| Quota por projeto ("advanced quota management") | **Um projeto pode consumir os 5.000 sozinho.** Ver §4. |
| Mais de 1 seat | Só o dono vê o painel. Se o Grebsu precisar olhar, é conta compartilhada ou upgrade. |
| Integrações de terceiros (Slack/Jira etc.) | Alerta é por **e-mail**. Confirmar no painel se GitHub/Slack aparecem — a página de preços diz que não. |

> Sites de terceiros anunciam "5 GB de logs e métricas" no Free. A página oficial da Sentry lista
> logs e métricas como **fora** do Developer. Não vale resolver a divergência: nem logs nem
> métricas entram neste plano.

## 2. A regra que decide tudo: quota é da organização

Os 5.000 erros são **da organização**, somados sobre todos os projetos. Então a pergunta
"consigo dois deploys no Free?" não é sobre limite de projetos — é sobre **dividir 5.000/mês
entre staging e produção**, ou ~166/dia.

Para um app com poucos usuários isso é folgado. O que estoura um teto desse tamanho não é
usuário: é **um erro em loop** (um `useEffect` que falha e re-renderiza) ou **tráfego forjado
contra o DSN**, que é público por definição — ele vai inlinado no bundle, igual à `anon key`.
Daí o §5 ser obrigatório, não opcional.

## 3. Decisão S1 — dois projetos Sentry, um por ambiente

| | 1 projeto + tag `environment` | **2 projetos** (recomendado) |
|---|---|---|
| Custo no Free | zero (projetos ilimitados) | zero |
| Triagem de produção | issue de staging e de prod **agrupam na mesma issue** (mesmo stack trace); toda visão exige filtro | stream de prod só tem prod |
| Spike Protection | é **por projeto** → um loop em staging estrangula o projeto todo, prod incluída | staging estrangula sozinho; prod segue reportando |
| Alertas | uma regra tem que distinguir ambiente | regra por projeto, e-mail só do que dói |
| Sourcemaps/release | um `SENTRY_PROJECT` | um `SENTRY_PROJECT` por environment do GitHub |
| Ver "esse bug também está em staging?" | de graça | não tem (cross-project issue tracking é pago) |

Nomes propostos: `bora-estudar-staging` e `bora-estudar-prod`, na mesma organização.

**Os dois ambientes reportam desde o início.** O `test-e2e.mjs` roda contra o site publicado de
staging e já afirma "0 erros de console" — no caminho saudável, staging gera **zero** eventos, e o
consumo de quota é proporcional a quebra. Isso é exatamente o que se quer pagar.

## 4. Decisão S2 — `@sentry/react`, não `@sentry/nextjs`

O app é `output: 'export'` (`next.config.js:9`): não existe runtime Node nem Edge. O
`@sentry/nextjs` foi feito para o que não temos, e cobra por isso:

- ele sobe **artifact bundles de node e edge** num build estático, sem `sentry.server.config.js`
  nem `instrumentation.js` para justificar
  ([sentry-javascript#12420](https://github.com/getsentry/sentry-javascript/issues/12420));
- o `tunnelRoute` se implementa com `rewrites`, e `rewrites` é **proibido** com `output: 'export'`
  ([#8285](https://github.com/getsentry/sentry-javascript/issues/8285),
  [#9785](https://github.com/getsentry/sentry-javascript/issues/9785)).

O que se perde ao ir de `@sentry/react`, e como cada perda se paga:

| Perda | Como resolver |
|---|---|
| Upload automático de sourcemap | `@sentry/webpack-plugin` dentro do `webpack()` do `next.config.js` + `productionBrowserSourceMaps: true`. Ver §7.3. |
| `tunnelRoute` (driblar ad blocker) | **Não tem substituto sem servidor.** Uma fração dos erros de browser nunca chega — bloqueador de anúncio corta requisição para `*.sentry.io`. Perda assumida; se um dia incomodar, o túnel cabe num Cloudflare Worker (100k req/dia no Free) no mesmo domínio. |
| Instrumentação automática de Server Components/rotas | Não existe nada disso aqui. Nada a perder. |

## 5. Guardas de quota — o que impede o Free de virar tela em branco

Quando os 5.000 acabam, a Sentry **descarta em silêncio** até o ciclo virar. Então as guardas não
são higiene, são o que mantém produção observável no dia 28 do mês.

1. **Spike Protection ligado nos dois projetos.** Disponível no Developer
   ([docs](https://docs.sentry.io/pricing/quotas/spike-protection/)); é por projeto, e por isso a
   decisão S1 importa. `Settings → Spike Protection → Enable All`.
2. **Inbound filters** (grátis em todo plano): extensões de browser, `localhost`, crawlers,
   browsers legados.
3. **Allowed Domains** por projeto (`Settings → Security & Privacy`): só aceita evento cuja origem
   seja o domínio daquele ambiente. É o que sobra contra "alguém achou meu DSN", já que rate limit
   por chave é pago.
4. **No SDK**, do mais barato para o mais caro:
   - `tracesSampleRate: 0` no começo. 5M spans é folgado, mas span sem ninguém lendo é ruído; sobe
     para `0.1` quando houver pergunta de performance para responder.
   - **Replay desligado** (`replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 0`).
     50/mês esgota numa tarde ruim e não avisa.
   - `ignoreErrors` para o ruído conhecido de browser: `ResizeObserver loop`,
     `Non-Error promise rejection captured`, `Failed to fetch`/`Load failed` de rede caída,
     `AbortError`.
   - `beforeSend` como último portão: derruba evento sem `stacktrace` e evento cujo `culprit` seja
     `chrome-extension://`.
   - `sampleRate: 1.0` em produção (queremos todo erro real), e é aí que o Spike Protection e o
     `ignoreErrors` fazem o trabalho — não o sampling.
5. **Nunca inicializar sem DSN**: `if (!dsn) return`. Build local e `npm run dev` não devem
   reportar nada, e é isso que impede o dev de comer a quota de produção.

## 6. Privacidade — o ponto sensível deste app

A `Fase 5` deixou a **RLS como única camada de segurança dos dados**. O Sentry é a primeira coisa
desde então que copia dado de usuário para fora do Supabase. Então:

- `sendDefaultPii: false` (é o default; deixar explícito no código, com o comentário do porquê).
- `Sentry.setUser({ id })` e **nada além**. Sem e-mail, sem `username` — o e-mail é a credencial de
  login (`Fase 2`), e ele não tem por que existir em dois lugares.
- Integração do Supabase: **não** passar `sendOperationData: true`. O default já redige filtros de
  query e corpo de mutação, e é exatamente o que não pode sair: o corpo de um `study_records` é o
  conteúdo de estudo do usuário.
- Se algum dia ligar Replay: `maskAllText: true` e `blockAllMedia: true`.

A integração do Supabase vale a pena: ela transforma "erro em `src/lib/data/index.ts`" em "qual
operação, em qual tabela, com qual código de erro do Postgres". Vem embutida no SDK a partir da
v9.14; em SDK mais antigo, é o pacote comunitário `@supabase/sentry-js-integration`
([Supabase docs](https://supabase.com/docs/guides/telemetry/sentry-monitoring)). Conferir a
assinatura exportada na versão que for instalada — ela mudou entre o pacote comunitário e o
embutido.

## 7. Implementação

### 7.1 Onde o código entra

| Arquivo | O que faz |
|---|---|
| `src/lib/observability/sentry.ts` (novo) | `initSentry()`: lê `NEXT_PUBLIC_SENTRY_DSN`, sai calado se não houver, aplica §5.4 e a integração do Supabase (recebendo o cliente de `src/lib/supabase/client.ts`, que já é singleton). |
| `src/app/providers.tsx` | chama `initSentry()` — é o único client component que roda em toda página (`layout.tsx` é server e só exporta `metadata`). |
| `src/context/AuthContext.tsx` | `Sentry.setUser({ id })` no login, `Sentry.setUser(null)` no logout. |
| `src/components/…` (novo `ErrorBoundary`) | `Sentry.ErrorBoundary` em volta do conteúdo. Hoje **não existe** `error.tsx` nem `global-error.tsx` — erro de render vira tela branca sem nada reportado. |
| `scripts/test-sentry-smoke.mjs` (novo) | `npm run test:sentry`: os 8 checks acima, contra qualquer `BASE`. É o que responde "o secret certo chegou ao bundle?", que nenhum teste unitário alcança. |
| — | Os 47 `console.error` espalhados pelo `src/` continuam onde estão; quem quiser virar issue precisa de `Sentry.captureException` explícito. Não converter em massa: metade é fluxo esperado. |

### 7.2 Variáveis

| Variável | Onde | staging | produção |
|---|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | secret do environment | DSN de `bora-estudar-staging` | DSN de `bora-estudar-prod` |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | variable do environment | `staging` | `production` |
| `NEXT_PUBLIC_SENTRY_RELEASE` | build | `${{ github.sha }}` | `${{ github.sha }}` |
| `SENTRY_AUTH_TOKEN` | **secret do repositório** | \<mesmo token de org\> | idem |
| `SENTRY_ORG` / `SENTRY_PROJECT` | variable do environment | `bora-estudar-staging` | `bora-estudar-prod` |

`SENTRY_AUTH_TOKEN` é **segredo de verdade** (escopo `project:releases`), diferente do DSN e da
`anon key`. Não pode virar `NEXT_PUBLIC_`.

### 7.3 Sourcemaps sem publicar sourcemap

Sem os mapas, o stack trace de um bundle minificado é inútil. Com eles servidos pelo Pages,
qualquer um lê o código. Os dois passos:

1. `productionBrowserSourceMaps: true` no `next.config.js` + `sentryWebpackPlugin` no hook
   `webpack()`, com `sourcemaps.filesToDeleteAfterUpload`.
2. **Guarda no workflow**, depois do build e antes do `wrangler pages deploy`:
   `find out -name '*.map' -delete`. O `output: 'export'` copia `.next/static` para
   `out/_next/static` no mesmo comando, e a ordem entre o delete do plugin e essa cópia não é
   contratual. O `find` é uma linha e fecha a questão.

### 7.4 Os dois monitores grátis

1 uptime + 1 cron, então cada um vai para o lugar de maior valor:

- **Uptime monitor → URL de produção.** Staging fica sem; quem cobre staging é o `test-e2e.mjs`.
- **Cron monitor → `keepalive.yml`.** O comentário do workflow já registra o risco: o GitHub
  desativa schedule em repo sem commit por 60 dias, e aí o projeto Supabase pausa por inatividade
  e o app sai do ar sem ninguém saber. Um check-in do Sentry no fim do job transforma esse silêncio
  em e-mail.

## 8. Pré-requisito que não é do Sentry: o segundo deploy não existe

Hoje há **um** ambiente. O `deploy.yml` tem `environment: staging` fixo nos dois jobs e dispara em
push na `master`. Antes de haver "dois deploys" para instrumentar, faltam: segundo projeto
Supabase, segundo projeto no Cloudflare Pages, environment `production` no GitHub e um gatilho que
separe os dois (tag `v*` para produção é o mais simples, e casa com o `version` do
`package.json`). **O Sentry não depende dessa divisão para começar** — dá para instrumentar
staging hoje e só duplicar o secret quando produção existir.

## 9. Quando o Free deixar de servir

O sinal é o gráfico de `Stats → Usage` bater no teto sem que a causa seja um bug em loop. Aí:

- **Sentry Team** (~US$ 26/mês, 50k erros) — resolve quota e o limite de 1 seat de uma vez.
- **GlitchTip** auto-hospedado — compatível com o SDK da Sentry, então a troca é só o DSN. Mas
  exige um servidor com Postgres, e a v2 nasceu justamente para não ter servidor. Só faz sentido se
  já houver uma VPS por outro motivo.

## 10. Checklist

Feito:

- [x] `npm i @sentry/react` e `npm i -D @sentry/webpack-plugin`
- [x] `src/lib/observability/sentry.ts` com as guardas do §5.4 e a privacidade do §6
- [x] `initSentry()` no `providers.tsx`; `setUser` no `AuthContext`; `AppErrorBoundary`
- [x] `next.config.js`: `productionBrowserSourceMaps` + `sentryWebpackPlugin` (só cliente, só com token)
- [x] `deploy.yml`: variáveis do §7.2 e o `find out -name '*.map' -delete`
- [x] `scripts/test-sentry-smoke.mjs` + `npm run test:sentry` — 8/8 com DSN de teste
- [x] `npx tsc --noEmit`, `npm run lint` (0 erros) e `npm run build` verdes com e sem Sentry

Do dono do projeto (nada abaixo existe antes da conta):

- [x] Criar org (`bora-estudar`) + projeto `bora-estudar-staging` (o de produção fica para o §8)
- [ ] Spike Protection nos dois; inbound filters; Allowed Domains por projeto
- [x] Auth token de org (escopo de release) → secret `SENTRY_AUTH_TOKEN` **do repositório**
- [x] No environment `staging`: secret `NEXT_PUBLIC_SENTRY_DSN` e variables `SENTRY_ENVIRONMENT=staging`,
      `SENTRY_ORG`, `SENTRY_PROJECT` (região US, então sem `SENTRY_URL`)

Depois do primeiro deploy com DSN:

- [x] `BASE=https://ouroboros-bora-bora-staging.pages.dev ESPERADO_ENV=staging npm run test:sentry` — 9/9
- [ ] Conferir na issue que o stack trace veio **desminificado** (é o que prova o upload de sourcemap)
- [ ] Uptime monitor em produção; cron monitor no `keepalive.yml` (§7.4, dependem do §8)
- [ ] Olhar `Stats → Usage` depois de uma semana, antes de ligar tracing ou replay
