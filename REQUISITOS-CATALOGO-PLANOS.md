# Requisitos — Catálogo de planos prontos ("admin importa, usuário escolhe")

> Análise feita em 2026-09-08, a pedido do dono do projeto: *"será que é possível eu como admin
> importar os planos e os usuários conseguirem escolher um plano para seguir?"*
> É **análise, não agendamento**. Complementa o [`REQUISITOS-EXTENSAO.md`](REQUISITOS-EXTENSAO.md),
> que continua valendo: a extensão está descartada.
>
> ✅ **F1, F2 e F3 implementadas em 2026-09-08.** O que mudou de fato em relação ao desenho abaixo
> está anotado na seção 7 e na *Fase 8* do [`TODO.md`](TODO.md). F4 e F5 seguem fora.

## Veredito em duas partes

| Pergunta | Resposta |
| --- | --- |
| **Admin extrai os guias do TEC e distribui aos usuários?** | ⛔ **Não.** É pior que a extensão, não melhor. Ver seção 1 |
| **Admin curar planos prontos e o usuário escolher um para seguir?** | ✅ **Sim, e vale a pena.** Trocando a fonte de "guia do TEC" para "edital". Ver seção 2 em diante |

A ideia de produto está certa. O que não passa é a **fonte do dado**, exatamente como no caso da
extensão — só que agora com um agravante novo, que a extensão não tinha.

## 1. Por que o "admin importa" é pior que a extensão

### 1.1 A vedação é sobre a conduta, não sobre quem se beneficia

A **seção 18, item 8.1** dos [Termos de Uso](https://www.tecconcursos.com.br/termos-de-uso)
proíbe "robôs, scripts, crawlers, spiders, scrapers, agentes autônomos, sistemas automatizados
[…] extensões de navegador" que realizem "coleta, extração, captura, leitura, reprodução […]
armazenamento ou transmissão automatizada de conteúdos disponibilizados na plataforma".

Não há nada na cláusula sobre *quem* roda a ferramenta. O admin é um usuário do TEC como qualquer
outro, e o item **8.2** já tinha fechado a saída mais generosa que existia — a de uso pessoal
acionado pelo próprio usuário. O caso do admin é ainda mais distante disso: não é uso pessoal.

### 1.2 O agravante novo: distribuição a terceiros

Este é o ponto que não existia no desenho da extensão. A **seção 20 — Direitos Autorais**:

> As obras intelectuais (comentários, material teórico, **base dados**, entre outros) estão
> protegidas pela Lei nº 9.610, de 19/02/98 — Lei dos Direitos Autorais, sendo proibida a
> **reprodução total ou parcial** do conteúdo citado, **por qualquer meio ou processo**.

A árvore de tópicos de um guia com a contagem de questões por tópico é *base de dados* deles: é a
classificação das questões do acervo do TEC, feita pelo TEC. Duas consequências:

1. **"Por qualquer meio ou processo"** significa que transcrever à mão não conserta nada. A 8.1
   pega a automação; a seção 20 pega a reprodução, automatizada ou não.
2. A extensão, apesar de proibida, ao menos mantinha a cópia **na máquina de quem extraiu**. O
   catálogo faz o oposto: **reproduz e distribui** a base deles para terceiros, inclusive para
   quem não é assinante do TEC. Isso é o núcleo do que a seção 20 proíbe.

### 1.3 O risco muda de dono, e de tamanho

| | Extensão (descartada) | Catálogo com dado do TEC |
| --- | --- | --- |
| Quem se expõe | o usuário que instalou | **o admin, nominalmente** |
| Sanção provável | suspensão/cancelamento da assinatura (item 8.6) | notificação, takedown, e o que vier de direito autoral |
| Onde a prova fica | disco do usuário | **repositório público no GitHub + app hospedado** |
| Se o app for monetizado | — | encosta no item **18.9** (rateio com fins comerciais), e no espírito do **18.7** (uma assinatura servindo muita gente) |

O item 18.9 e o 18.7 não descrevem literalmente este caso, mas descrevem o incômodo que ele
causa: uma assinatura virando fonte de conteúdo para um grupo. Não é o terreno onde se quer estar
com o nome na frente.

### 1.4 O que sobreviveria de legítimo

Nada da parte do TEC. O que a fonte alternativa entrega está na seção 2. E o item **8.3** — que
proíbe transmitir conteúdo da plataforma para sistemas de IA de terceiros — fecha também o atalho
de "colar o guia numa IA para estruturar".

Resta a **carta** (opção D do outro documento): o TEC ressalva "autorização expressa e escrita".
Para um catálogo curado por um admin, o pedido é até mais plausível que para uma extensão — é uma
negociação, com uma pessoa identificável, sobre um uso delimitado. Continua sendo uma aposta
longa, e continua sendo de graça perguntar. **Nada neste plano depende dela.**

## 2. A versão que passa: catálogo montado a partir do edital

A necessidade real nunca foi ler o TEC — era **não digitar 200 tópicos à mão**. O edital é um
**ato oficial**, publicado pelo órgão ou pela banca, e pela
[Lei 9.610/1998, art. 8º, IV](https://www.normaslegais.com.br/legislacao/trabalhista/lei9610_1998.htm)
não é objeto de proteção autoral. É a fonte primária do conteúdo programático, e não pertence ao
TEC.

**O que se perde, e é justo perder:** `question_count` e `bancaTopicWeights`. Continuam existindo
no app como `userWeight`, preenchido pelo usuário no `TopicWeightsModal`.

**O que se ganha em relação à extensão, e não é pouco:**

- **A curadoria acontece uma vez por concurso, não uma vez por usuário.** O parser de edital
  (opção A do outro documento) deixa de precisar ser perfeito: um humano revisa a árvore antes de
  publicar. Errar numa numeração de PDF passa a ser um problema do admin, corrigido para todo
  mundo, em vez de um plano torto na conta de cada um.
- **Zero instalação, zero permissão de browser, zero loja de extensão.** Some a seção 8 e a seção
  9 inteiras do outro documento (manifest, Chrome Web Store, Firefox, política de privacidade).
- **Funciona para quem não tem conta no TEC.** O público deixa de ser "assinante do TEC que sabe
  o que é `chrome://extensions`".

### 2.1 Fluxo ponta a ponta

Duas metades que se encontram num arquivo JSON. Nada é compartilhado em tempo de execução: o
catálogo é dado estático somente leitura, e o plano do usuário é uma **cópia integral**. Não há
chave estrangeira entre os dois, nem leitura entre contas — a RLS de hoje continua intocada.

```
ADMIN (uma vez por concurso)                    USUÁRIO (cada vez que escolhe)
─────────────────────────────                   ──────────────────────────────
1. PDF do edital no site do órgão
2. copia o conteúdo programático
3. scripts/edital-para-plano.mjs
   → árvore pela numeração 1 / 1.1 / 1.1.1
4. REVISA a árvore e corrige à mão   ⟵ o passo que a extensão não tinha
5. ícone do órgão (opcional, ≤ 2 MB)
6. public/catalogo/<slug>.json
   + entrada no index.json
7. commit → deploy                              ── CDN ──▶ 8. /planos/catalogo (index.json)
                                                           9. clica num card → <slug>.json
                                                          10. prévia: cabeçalho, árvore,
                                                              procedência, contagens
                                                          11. confirma (pode renomear)
                                                          12. valida contrato → uuid novo por
                                                              matéria → data: URI vira File
                                                          13. createPlan()  ──▶ 1 row em plans
                                                                             + ícone em
                                                                               plan-icons/<uid>/
                                                          14. refreshPlans() → o plano é dele
```

**Lado do admin, com o detalhe que importa em cada passo:**

1. **Fonte.** PDF do edital no site do órgão ou da banca. A URL vai para `origem.url` e é ela que
   o RF-C6 mostra ao usuário — é o que permite conferir a árvore contra o documento oficial.
2. **Texto.** Copiar o anexo de conteúdo programático. É aqui que o PDF cobra o preço: coluna
   dupla, cabeçalho repetido a cada página, hifenização na quebra de linha.
3. **Parser** (`RF-T1`). Recebe texto, devolve `EditalSubject[]`. A numeração (`1`, `1.1`,
   `1.1.1`) dá o aninhamento; a mudança de matéria costuma vir em maiúsculas ou depois de
   "DISCIPLINA:". Função pura, testável com fixture — sem browser, sem rede.
4. **Revisão humana** (`RF-T2`). O parser propõe, o admin corrige. **É o passo que muda a
   economia do projeto:** um erro de parsing é corrigido uma vez, antes de publicar, em vez de
   virar um plano torto na conta de cada usuário. Por isso o parser pode ser imperfeito.
5. **Ícone.** Do site do órgão, dentro dos limites do bucket (2 MB; png/jpeg/webp/gif/svg).
   Entra no JSON como data: URI. Opcional — plano sem ícone funciona.
6. **Saída** (`RF-T3`): `public/catalogo/<slug>.json` no contrato da seção 6, com
   `bancaTopicWeights: {}` e sem `question_count` (RF-C7), mais uma linha em
   `public/catalogo/index.json` (slug, nome, cargo, banca, ano, contagens, `atualizadoEm`).
7. **Publicar = commit.** Revisão de plano é code review; histórico é o git; rollback é `revert`.
   Nenhuma tela de admin, nenhum papel no schema (seção 5.2).

**Lado do usuário:**

8. **Entrada.** Em `/planos` (`src/app/planos/page.tsx`), ao lado de "Criar plano", um segundo
   caminho: "Escolher um plano pronto". No `WelcomeScreen` de conta nova, ele é o botão principal
   — é ali que o usuário está mais longe de ter o que digitar.
9. **Catálogo** (`RF-C1`). `/planos/catalogo` busca `index.json` do CDN. Dado estático e público:
   não passa pelo Supabase, não gasta requisição autenticada, e a lista pode ser vista antes do
   clique custar nada.
10. **Prévia** (`RF-C2`, `RF-C6`). Busca `<slug>.json` e mostra cabeçalho, árvore somente leitura
    (reaproveitando a renderização de `PlanDetail`/`SubjectDetail`), contagens e a procedência com
    link para o PDF. Ainda não gravou nada.
11. **Confirmação** (`RF-A5`, `RF-C4`). O nome vem preenchido com o do template e é **editável**,
    porque `plans_user_name_unique (user_id, name)` faz o segundo clone falhar. Sugerir `… (2)`
    aqui é mais barato que tratar erro de banco depois.
12. **Preparo do clone.** Validar `formato`/`versao` (`RF-A2`); gerar **uuid novo para cada
    matéria** (o `id` da matéria é a chave dos registros de estudo, e não pode ser o mesmo entre
    contas nem entre clones); converter o data: URI para `File` — o `CreatePlanModal` já faz o
    caminho inverso com `FileReader` (`src/components/CreatePlanModal.tsx:55`).
13. **Gravação.** Um único `createPlan({ name, cargo, edital, banca, subjects, iconFile })`
    (`src/lib/data/index.ts:295`). Ele sobe o ícone **antes** do insert, para não deixar plano
    criado pela metade, e grava sob o `auth.uid()` do próprio usuário. **Um insert em `plans`, e
    nada mais é tocado** (`RF-A1`/`RF-C3`) — nenhuma chamada a `clearAllData()`, que é o que o
    `/backup` faz hoje (`src/lib/data/index.ts:1083`).
14. **Depois.** `refreshPlans()` e o plano aparece na lista como qualquer outro. Editar, renomear
    ou apagar tópico não afeta o template nem o plano de ninguém — é cópia, não referência. O
    contra disso está no risco 2: edital retificado **não** volta para quem já clonou.

**Onde o dado fica em cada momento:**

| Momento | Onde | Quem lê |
| --- | --- | --- |
| Template publicado | `public/catalogo/*.json` (CDN, versionado no git) | qualquer um, sem autenticação |
| Clone | uma row em `public.plans` com `user_id` | só o dono, pela RLS de `0001_initial_schema.sql:307` |
| Ícone do clone | `plan-icons/<auth.uid()>/<planId>.<ext>` (bucket privado) | só o dono, por URL assinada |

**O caminho de arquivo (F1) é o mesmo motor.** Trocando os passos 8–10 por um seletor de arquivo
`.json` em `/planos` — o padrão de `src/app/backup/page.tsx:152` —, os passos 11–14 são
idênticos. Por isso o F1 vem primeiro: ele é o F3 sem a vitrine, e vale sozinho para quem tem um
backup e hoje precisaria apagar a conta para usá-lo.

## 3. Escopo

**Dentro (v1):**

- **Catálogo de planos prontos**, versionado no repositório, montado pelo admin a partir de
  editais.
- Uma tela onde o usuário navega o catálogo e **clona um plano para a própria conta**.
- **RF-A1** do outro documento — importar plano de arquivo sem destruir nada. É o mesmo motor.

**Fora (v1):**

- Qualquer dado vindo do TEC (seção 1).
- Usuário **publicar** plano no catálogo (seção 8, item 3 — precisa de moderação e de termo
  próprio).
- Sincronizar um plano clonado com atualizações posteriores do template (seção 8, item 2).
- Tela de admin dentro do app. Publicar = commit (seção 5).

## 4. Requisitos funcionais

### Catálogo (RF-C)

- **RF-C1 — Listar.** Uma rota `/planos/catalogo` lista os templates disponíveis: nome, cargo,
  banca, ano, nº de matérias, nº de tópicos. Filtro por texto basta na v1.
- **RF-C2 — Prévia.** Antes de clonar, o usuário vê a árvore de matérias e tópicos, somente
  leitura. Reaproveita a renderização de `PlanDetail`/`SubjectDetail`.
- **RF-C3 — Clonar.** "Usar este plano" cria **um** plano na conta do usuário via `createPlan`
  (`src/lib/data/index.ts:295`), sem tocar em nada mais. A partir daí o plano é dele: editar,
  renomear e apagar tópicos não afeta o template nem outros usuários.
- **RF-C4 — Colisão de nome.** A constraint `plans_user_name_unique (user_id, name)`
  (`supabase/migrations/0001_initial_schema.sql:97`) faz o insert falhar se o usuário já tem um
  plano com aquele nome — e clonar o mesmo template duas vezes é um caso realista. Sugerir sufixo
  `… (2)` ou deixar renomear na confirmação. Erro de banco cru não serve.
- **RF-C5 — Ícone.** O template traz o ícone como data: URI; converter para `File` e passar em
  `createPlan({ iconFile })`, que grava sob o `auth.uid()` do usuário no bucket privado
  `plan-icons`. **Nenhum bucket novo é necessário** — cada clone tem a própria cópia. Respeitar o
  limite de 2 MB e os mime types do bucket (`0002_phase3_data_layer.sql:78`); ícone fora disso é
  descartado com aviso, sem abortar.
- **RF-C6 — Procedência visível.** Cada template mostra a fonte: órgão, número do edital, ano e
  link para o PDF oficial. É o que sustenta a legitimidade do dado e o que permite ao usuário
  conferir.
- **RF-C7 — Sem `question_count`.** Nem no template, nem no clone. Um campo desses num plano do
  catálogo só poderia ter vindo de onde não pode.

### Importar de arquivo (RF-A) — porta do outro documento

**RF-A1** a **RF-A5** da seção 5 do `REQUISITOS-EXTENSAO.md` valem literalmente, com uma troca:
o arquivo pode vir do catálogo em vez do disco. Em especial:

- **RF-A1** — o caminho de importação de hoje (`/backup`) chama `clearAllData()` antes de
  restaurar (`src/lib/data/index.ts:958`, chamado em `:1083`): apaga a conta inteira. O clone
  **não pode** passar por ali.
- **RF-A2** — validar contra o contrato antes de gravar. O template vem de arquivo, e arquivo
  pode estar velho ou editado à mão.

### Ferramenta do admin (RF-T)

- **RF-T1 — Parser de edital.** Colar o texto do conteúdo programático e montar a árvore pela
  numeração (`1`, `1.1`, `1.1.1`). É a opção A do outro documento, agora rodando na mão do admin.
- **RF-T2 — Revisão humana obrigatória.** O parser propõe; o admin corrige antes de publicar.
  Nenhum template vai ao catálogo sem alguém ter olhado a árvore.
- **RF-T3 — Emitir o JSON** no contrato da seção 6, pronto para commit.
- **RF-T4 — Onde isso roda.** Um script em `scripts/` ou uma rota não linkada. **Não** é tela de
  produto: não há conceito de admin no schema (seção 5.2) e a v1 não precisa criar um.

## 5. Decisão de arquitetura: onde o catálogo mora

### 5.1 Recomendado para a v1 — JSON versionado no repositório

`public/catalogo/index.json` (a lista) + `public/catalogo/<slug>.json` (um por plano).

| A favor | Contra |
| --- | --- |
| Zero migration, zero RLS, zero conceito de admin | Publicar exige build e deploy |
| Publicar = commit; revisão de plano = code review; histórico = git | O `index.json` cresce junto com o bundle estático |
| Combina com a SPA estática (decisão 0.4 do `TODO.md`) | Corrigir um tópico obriga a um deploy |
| Cache de CDN de graça | |

### 5.2 A alternativa, e por que ela fica para depois

Uma tabela `plan_templates` com leitura pública e escrita restrita ao admin. O problema é que
**não existe papel de admin no schema**: toda tabela nasce com RLS e as quatro políticas
`user_id = auth.uid()` (`0001_initial_schema.sql:5`). Um catálogo em banco pediria uma das duas
coisas — uma coluna de papel em `profiles` com política própria, ou escrita só pela service role
fora do app. As duas são trabalho novo que a v1 não precisa fazer para provar a ideia.

**Migrar depois é fácil**, e é por isso que a ordem é essa: se o contrato de dados (seção 6) for o
mesmo, trocar "buscar JSON do CDN" por "buscar do PostgREST" é uma função na camada de dados. O
gatilho para migrar é operacional: quando "deploy para consertar um tópico" começar a doer.

## 6. Contrato de dados

O mesmo da seção 6 do `REQUISITOS-EXTENSAO.md`, com três diferenças:

```jsonc
{
  "formato": "bora-estudar/plano",
  "versao": 1,
  "geradoEm": "2026-09-08T12:00:00.000Z",
  "origem": {
    "fonte": "edital",                              // (1) nunca "tecconcursos"
    "orgao": "Polícia Civil da Bahia",
    "edital": "Edital nº 1/2026",
    "ano": 2026,
    "url": "https://…/edital-01-2026.pdf"           // (2) PDF oficial, para o RF-C6
  },
  "plano": {
    "name": "PC-BA 2026 — Delegado",
    "cargo": "Delegado de Polícia",
    "edital": "Edital nº 1/2026",
    "banca": "VUNESP",
    "observations": "",
    "iconUrl": "data:image/png;base64,…",           // opcional
    "subjects": [ /* EditalSubject[], sem question_count */ ],
    "bancaTopicWeights": {}                          // (3) sempre vazio — RF-C7
  }
}
```

Regras que continuam valendo: `plano` espelha `PlanInput` de `src/lib/data/types.ts:107`, sem
`id`; `versao` incompatível é recusada com mensagem dizendo qual ponta está velha; campo
desconhecido é ignorado, não rejeitado; o JSON não carrega registro de estudo, revisão, simulado
nem ciclo.

Acréscimos do catálogo:

- **`slug`** no `index.json`, estável, é a identidade do template entre versões.
- **`atualizadoEm`** por template, para o dia em que alguém perguntar se a árvore está velha.
- A coluna `banca` existe em `plans` desde a `0002_phase3_data_layer.sql:18` — o template pode
  preenchê-la.

## 7. Fases

| # | Entrega | Depende de | Vale por si só? | Estado |
| --- | --- | --- | --- | --- |
| **F1** | **RF-A1/A2** — importar plano de arquivo, sem apagar a conta | nada | **Sim.** Conserta um buraco de hoje: quem tem backup precisa apagar a conta para usá-lo | ✅ 2026-09-08 |
| **F2** | Parser de edital (RF-T1/T3) como script de admin | F1 (para testar o JSON de ponta a ponta) | Sim, como ferramenta | ✅ 2026-09-08 |
| **F3** | Catálogo em JSON + `/planos/catalogo` + clonar (RF-C1..C7) | F1, F2 | É a resposta à pergunta | ✅ 2026-09-08 |
| **F4** | Catálogo em tabela, com papel de admin | F3, e a dor da seção 5.2 | Só quando doer | — |
| **F5** | Carta ao TEC (seção 1.4) | nada | Independente. Se vier autorização, o catálogo pode carregar `question_count` | — |

**F1 primeiro** — é pequeno, é útil sozinho e é o motor de tudo o mais.

### O que a implementação decidiu diferente do desenho

Três desvios, todos para mais:

1. **O F1 aceita backup completo, além do template.** O desenho falava em "arquivo no contrato da
   seção 6"; na prática o arquivo que as pessoas *têm* é o do `/backup`, com N planos dentro. A
   tela extrai os planos, deixa escolher um e ignora registros, revisões e simulados. Sem isso o
   RF-A1 não resolveria o problema que o justifica.
2. **A prévia não reusa `PlanDetail`/`SubjectDetail`.** Os dois são telas de plano **já gravado**:
   carregam registros de estudo, gráficos e modais a partir de um `planId` que, na prévia, ainda
   não existe. O que se aproveitou foi a forma, num `TopicTree` somente leitura de 110 linhas.
3. **O RF-C7 é aplicado também na leitura**, e não só na geração do template: `fetchCatalogTemplate`
   passa `dropQuestionCount`. Um arquivo do catálogo com `question_count` só poderia ter vindo de
   onde não pode, e o app não precisa confiar no arquivo para descobrir isso.

E uma ponta que ficou aberta de propósito: **o catálogo foi publicado vazio.** Preencher exige um
PDF de edital real e alguém conferindo a árvore contra ele (RF-T2) — o passo que não dá para
terceirizar sem transformar o catálogo naquilo que o §8.4 diz que é pior que catálogo nenhum. A
tela tem um estado vazio decente enquanto isso.

## 8. Riscos e pontas soltas

1. **Usuário importando plano raspado do TEC.** O RF-A1 aceita arquivo arbitrário. Se um dia
   existir compartilhamento de planos entre usuários (item 3 abaixo), o app vira o distribuidor do
   que o usuário subiu. **Mitigação:** quando o compartilhamento existir, o termo de uso do
   próprio app precisa proibir conteúdo de plataforma de terceiros, e a moderação precisa checar.
   Enquanto a importação for só do disco para a própria conta, o problema não é do app.
2. **Edital retificado.** Retificação de conteúdo programático é rotina. O template ganha
   `atualizadoEm`, mas o **clone não sincroniza** — quem clonou antes fica com a árvore velha.
   Assumido na v1; a alternativa (diff e merge de árvore num plano que o usuário já editou) é
   projeto próprio.
3. **Usuário publicar plano no catálogo.** É o pedido óbvio depois do F3, e é o que transforma o
   catálogo em produto. Precisa de moderação, de identidade de autor e do termo do item 1. Fora da
   v1 de propósito.
4. **Manutenção do catálogo.** Cada concurso é trabalho manual do admin. Um catálogo com 3 planos
   velhos é pior que catálogo nenhum. Decidir o recorte (só concursos abertos? só os grandes?)
   antes de anunciar a coisa.
5. **Marca.** Nome de órgão e de banca em template e ícone é referência factual a ato oficial, não
   uso de marca. Não usar identidade visual do TEC em lugar nenhum, e manter a ressalva do RL-4
   do outro documento sobre a marca *Bora Estudar Concursos*.

## 9. Critérios de aceite (F3)

- [x] Um template do catálogo, clonado, cria **um** plano e **não altera** nenhum outro dado da
      conta — verificado com conta que já tinha planos e registros. *(`test:e2e`, passo 11b: o
      mesmo arquivo que o `/backup` usa para zerar a conta é importado sem apagar nada.)*
- [x] Clonar o mesmo template duas vezes dá erro legível de nome duplicado (RF-C4), não erro de
      banco. *(Barrado antes do insert: nome sugerido com sufixo `… (2)`, botão desabilitado e
      aviso na tela — `test:template` e `test:e2e`.)*
- [ ] A árvore do plano clonado bate com o conteúdo programático do PDF oficial linkado no RF-C6.
      **Pendente por não haver template publicado** — depende de escolher um concurso real e
      revisar a árvore (RF-T2). O motor está testado contra a fixture sintética (`test:edital`).
- [x] Nenhum template do catálogo tem `question_count` ou `bancaTopicWeights` preenchido (RF-C7).
      *(Garantido na geração e de novo na leitura.)*
- [x] Um template sem ícone e um com ícone acima de 2 MB clonam mesmo assim (RF-C5).
      *(`test:template`: os dois casos viram aviso, não abortam.)*
- [x] Editar o plano clonado não muda o template nem o plano de outro usuário. *(Não há chave
      estrangeira para o template: o clone é cópia, e o template é arquivo estático somente
      leitura.)*
- [x] `versao` incompatível no arquivo produz mensagem dizendo qual ponta está velha.
      *(`test:template`: "quem está velho é o app" / "quem está velho é o arquivo".)*
