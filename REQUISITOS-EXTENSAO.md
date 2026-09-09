# Requisitos — Extensão de browser "Importar guia do TEC"

> Levantamento feito em 2026-09-05. É **análise, não agendamento**: nada aqui está aprovado
> para implementação. Substitui e detalha a seção *"Backlog — Extensão de browser para importar
> do TEC"* do `TODO.md`, que continua valendo como registro da decisão.

## ⛔ Veredito — não construir

**O RL-1 foi verificado em 2026-09-05 e reprovou o projeto.** Os Termos de Uso do Tec Concursos
proíbem exatamente isto, e nomeiam extensão de navegador na letra da cláusula (seção 9). Não há
exceção para uso pessoal nem para o usuário rodar a ferramenta no próprio browser — que era
justamente a premissa em que todo o desenho se apoiava.

O restante deste documento fica como **registro da análise**: por que a extensão parecia a saída
certa do ponto de vista técnico, e o que exatamente a derrubou. **O RQ-0 (spike) não deve ser
executado** — rodar o `fetch` contra a API deles já é a conduta vedada.

O caminho que sobra está na [seção 13](#13--o-caminho-que-sobra).

## 1. Problema

A importação de guia do Tec Concursos **não existe mais no produto**. Ela morreu junto com o
Electron (decisão 0.4 do `TODO.md`): o Puppeteer vivia no processo principal, e a v2 é uma SPA
estática sem servidor Node.

Não dá para simplesmente reescrever a raspagem no browser do app, e o motivo está medido na
decisão 0.2:

- A página do guia é **AngularJS**. O HTML servido traz os bindings crus
  (`{{cadernoGuia.disciplina}}`); nenhum nome de matéria vem no HTML. `fetch` + `cheerio` devolve
  template, não dado.
- A lista real chega por `GET /api/caderno-guia/listar-pelo-guia/<idGuia>`, que responde
  **403 Forbidden** fora de uma sessão de browser.
- Qualquer chamada a partir do domínio do app esbarra em **CORS**.

|                                | Edge Function | Servidor com Chrome  | **Extensão**             |
| ------------------------------ | ------------- | -------------------- | ------------------------ |
| Executa o Angular              | ✗             | ✓                    | ✓                        |
| Passa pelo 403 do `/api`       | ✗             | ✓                    | ✓ (mesma origem + cookies) |
| CORS                           | ✗             | ✓                    | ✓ (mesma origem)         |
| Custo de hospedagem            | R$ 0          | **paga RAM p/ Chrome** | R$ 0                   |
| Tráfego concentrado num IP     | —             | **sim**              | não, cada um usa o próprio |

A extensão roda dentro do browser do usuário, com a sessão e a origem dele. É a única opção que
resolve as três travas de uma vez e custa R$ 0 de infraestrutura.

## 2. Escopo

**Dentro (v1):**

- Extensão Manifest V3 que, numa página de guia do `tecconcursos.com.br`, extrai o edital
  completo e entrega um **arquivo JSON** ao usuário.
- O lado do app: uma tela de **importar plano a partir de arquivo**, que hoje **não existe**
  (ver RF-A1).

**Fora (v1), explicitamente:**

- Autenticação de qualquer tipo dentro da extensão.
- Escrita no Supabase pela extensão. O código de uma extensão é público; a `anon key` ali dentro
  não agrega nada que o app já não faça melhor, sob a RLS do próprio usuário.
- Sincronização, atualização incremental de um plano já importado, importação de questões,
  cadernos, estatísticas ou qualquer coisa além do edital.
- Integração de um clique app↔extensão (`externally_connectable`) — é a v2, e só se justifica
  depois que a v1 provar que a extração funciona.

## 3. RQ-0 — Premissa bloqueante (spike antes de qualquer código)

⚠️ **Não verificado.** Todo o desenho abaixo assume que, de um content script rodando em
`tecconcursos.com.br`, a API responde 200 para o próprio browser do usuário.

- [ ] Abrir um guia **logado** e, no console da página, rodar:

  ```js
  await fetch('/api/caderno-guia/listar-pelo-guia/<idGuia>', { credentials: 'include' })
    .then(r => [r.status, r.headers.get('content-type')])
  ```

| Resultado    | Consequência para os requisitos                                                        |
| ------------ | -------------------------------------------------------------------------------------- |
| **200 + JSON** | Caminho fácil. A extensão consome a API, **RF-E3/E4 mudam de DOM para JSON**, some a necessidade de abrir uma página por matéria, e o tempo de importação cai de dezenas de segundos para um par de requisições. **Preferir este.** |
| **403**      | Cai para extração por DOM. E aí surge o problema abaixo.                                 |

**O problema do DOM, se o spike falhar:** os tópicos vivem numa página por matéria
(`div.caderno-guia-arvore-indice ul`). Buscá-las com `fetch` + `DOMParser` devolve o template
Angular cru — o mesmo beco sem saída do `cheerio`, só que dentro do browser. As saídas são iframe
oculto por matéria (se o `X-Frame-Options` deles permitir) ou aba em background — ambas mais
frágeis, mais lentas e mais visíveis para o TEC. **Se o spike der 403, reavaliar se a extensão
ainda compensa** antes de escrever qualquer linha.

## 4. Requisitos funcionais — extensão (RF-E)

Numeração estável; o `_(D)_` marca o que só se aplica no caminho DOM.

- **RF-E1 — Reconhecer a página.** A ação só fica disponível em uma URL de guia do
  `tecconcursos.com.br`. Fora dela, o popup explica o que fazer em vez de falhar.
- **RF-E2 — Cabeçalho do plano.** Extrair `name`, `cargo`, `edital`, `banca` e a URL do ícone.
  Manter os **dois branches de seletor** que o importador antigo tinha, porque o TEC serve dois
  layouts:
  | Campo | Seletor primário | Fallback |
  | --- | --- | --- |
  | `name` | `div.guias-cabecalho-concurso-nome` | `div.detalhes-cabecalho-informacoes-texto h1 span:not([class])`, e por último `document.title.split('-')[0]` |
  | `cargo` | `div.guias-cabecalho-concurso-cargo` | `div.detalhes-cabecalho-informacoes-orgao` |
  | `edital` | `div.guias-cabecalho-concurso-edital` | — |
  | `iconUrl` | `div.guias-cabecalho-logo img` | `div.detalhes-cabecalho-logotipo img`, `img[alt*="logotipo"]` |
  | `banca` | `span.detalhes-campos` cujo texto é `Banca` → `nextElementSibling`, cortando em `(` | — |
- **RF-E3 — Lista de matérias.** `div.guia-materia-item` (nome em `h4.guia-materia-item-nome a`),
  com fallback `div.cadernos-item` (nome em `span.cadernos-colunas-destaque`, link em
  `a.cadernos-ver-detalhes`). **Descartar a matéria chamada `Inéditas`.** Deduplicar por nome.
- **RF-E4 — Árvore de tópicos.** Para cada matéria, percorrer `div.caderno-guia-arvore-indice ul`
  recursivamente, produzindo `topic_text`, `sub_topics` e `question_count`. Três detalhes que o
  código antigo acertou e que **não podem se perder na porta**:
  1. O `<ul>` de subtópicos é **irmão** do `<li>` (`child.nextElementSibling`), não filho dele.
  2. `span.capitulo-questoes > span` traz a contagem como texto; `"uma questão"` vale 1, o resto
     sai de `match(/(\d+)/)`.
  3. **Regra de promoção:** se a contagem do pai for `> 0` e **igual** à do primeiro filho, o pai
     é descartado e os filhos sobem de nível. É o que evita o nível fantasma que o TEC cria.
  4. `is_grouping_topic = sub_topics.length > 0`.
- **RF-E5 — Pesos da banca.** Derivar `bancaTopicWeights[subjectId][topic_text] = question_count`
  percorrendo a árvore inteira, inclusive subtópicos. Lógica pura, porta literal de
  `extractTopicWeights`.
- **RF-E6 — Ícone.** Baixar a imagem do CDN do TEC e embutir como **data: URI** no JSON. O
  download roda no contexto da extensão, que não tem o problema de CORS do app. Falha ao baixar
  **não** aborta a importação: o plano vai sem ícone.
- **RF-E7 — Entrega.** Oferecer o resultado como **download de arquivo** `.json` e, alternativa,
  **copiar para a área de transferência**. Nome sugerido:
  `bora-estudar-<slug-do-guia>-<AAAA-MM-DD>.json`.
- **RF-E8 — Progresso.** _(D)_ Percorrer N matérias leva dezenas de segundos. O popup mostra
  "matéria X de N" e permite cancelar. No caminho API, basta um estado de carregando.
- **RF-E9 — Erros legíveis.** Distinguir e nomear, em pt-BR: sessão expirada / não logado, página
  que não é guia, guia sem matérias, e falha parcial (alguma matéria não extraída). Numa falha
  parcial, **oferecer o JSON do que deu certo**, dizendo o que faltou — um edital com 9 de 10
  matérias é mais útil que erro nenhum.
- **RF-E10 — Reexecução.** Rodar de novo na mesma página produz o mesmo JSON (a menos dos `id`s
  de matéria, que são uuid novos a cada extração). A extensão não guarda estado entre execuções.

## 5. Requisitos funcionais — app Bora Estudar (RF-A)

Esta é a metade que **falta no produto hoje**, e sem ela a extensão não serve para nada.

- **RF-A1 — Importar plano de arquivo, sem destruir nada.** Hoje o único caminho de importação é
  `/backup`, e ele chama `clearAllData()` antes de restaurar (`src/lib/data/index.ts:1084`) —
  apaga a conta inteira, como o `ImportConfirmationModal` avisa. Importar um guia **não pode**
  usar esse caminho. É preciso uma ação nova em `/planos`: escolher arquivo → validar → criar
  **um** plano, deixando o resto intacto.
- **RF-A2 — Validar o arquivo** contra o contrato da seção 6 antes de gravar, com mensagem
  específica quando falhar. O arquivo vem de fora e pode ter sido editado à mão.
- **RF-A3 — Colisão de nome.** A constraint `plans_user_name_unique (user_id, name)` faz o insert
  falhar se já existir um plano com aquele nome. Tratar explicitamente: sugerir um sufixo
  (`… (2)`) ou deixar o usuário renomear na tela de confirmação. Erro de banco cru não serve.
- **RF-A4 — Ícone.** Converter o data: URI para `File` e passar em `createPlan({ iconFile })` — o
  `ImportGuideForm` antigo já tinha essa função (`dataUrlToFile`) e ela porta inteira. Respeitar
  os limites do bucket `plan-icons`: **privado, 2 MB**, e apenas `image/png`, `image/jpeg`,
  `image/webp`, `image/gif`, `image/svg+xml`. Ícone acima do limite ou de tipo não aceito é
  descartado com aviso, sem abortar a importação.
- **RF-A5 — Prévia antes de gravar.** Mostrar nome, cargo, banca, nº de matérias e nº de tópicos
  para o usuário confirmar. Criar plano é barato de desfazer, mas confirmar é mais barato ainda.
- **RF-A6 — v2, um clique (futuro).** `externally_connectable` no manifest apontando para o
  domínio do app (`https://ouroboros-bora-bora-staging.pages.dev` hoje, mais o domínio de
  produção quando existir) e a página conversando com a extensão direto. **Só depois da v1.**

## 6. Contrato de dados

O JSON é a **fronteira entre dois repositórios** que versionam separado. Ele precisa de versão
própria, e o app precisa recusar o que não entende.

```jsonc
{
  "formato": "bora-estudar/plano",
  "versao": 1,
  "geradoEm": "2026-09-05T18:30:00.000Z",
  "origem": { "fonte": "tecconcursos", "url": "https://www.tecconcursos.com.br/guias/…" },
  "plano": {
    "name": "PC-BA 2026",
    "cargo": "Delegado de Polícia",
    "edital": "Edital nº 1/2026",
    "banca": "VUNESP",
    "observations": "",
    "iconUrl": "data:image/png;base64,…",          // opcional
    "subjects": [
      {
        "id": "b0c1…",                              // uuid gerado pela extensão
        "subject": "Direito Penal",
        "color": "#ef4444",
        "topics": [
          {
            "topic_text": "Princípios",
            "question_count": 42,
            "is_grouping_topic": true,
            "sub_topics": [
              { "topic_text": "Legalidade", "question_count": 12, "is_grouping_topic": false, "sub_topics": [] }
            ]
          }
        ]
      }
    ],
    "bancaTopicWeights": { "b0c1…": { "Princípios": 42, "Legalidade": 12 } }
  }
}
```

Regras do contrato:

- **`plano` espelha `PlanInput`** de `src/lib/data/types.ts` — sem `id` (quem gera é o
  `createPlan`) e com `iconUrl` como data: URI em vez do `icon_path` do Storage.
- **Não emitir `total_topics_count`.** O importador antigo gravava esse campo em cada matéria;
  o `EditalSubject` de hoje não o tem e a contagem é derivada. Campo desconhecido deve ser
  ignorado pelo app, não rejeitado.
- **Os `id` de matéria são uuid gerados pela extensão** e são a chave de `bancaTopicWeights`.
  Os dois precisam sair da mesma execução, ou os pesos apontam para o vazio.
- **`color`** sai de uma paleta fixa de 6 cores, rotacionada por índice — a mesma ideia do
  `SUBJECT_COLORS` do app.
- `versao` diferente da suportada → o app recusa com "atualize a extensão / atualize o app",
  dizendo qual das duas pontas está velha.
- O JSON **não carrega** registros de estudo, revisões, simulados ou ciclo. É um plano vazio.

## 7. Requisitos não funcionais

**Segurança e privacidade**

- **RNF-1** — Zero credencial na extensão. Nem `anon key`, nem URL de projeto Supabase, nem
  token do TEC.
- **RNF-2** — Zero telemetria, zero servidor próprio. O dado sai da página e vai para o disco do
  usuário; não passa por lugar nenhum.
- **RNF-3** — Permissões mínimas no manifest (seção 8). Cada permissão pedida é uma pergunta a
  mais na instalação e um item a mais na revisão da loja.
- **RNF-4** — Sem código remoto. O MV3 proíbe, e a revisão da Chrome Web Store rejeita.

**Compatibilidade**

- **RNF-5** — Chrome e Edge (mesmo MV3). Firefox é desejável, mas tem diferenças reais
  (`browser.*` vs `chrome.*`, service worker vs background scripts) — decidir antes de começar,
  não depois (ver seção 12).
- **RNF-6** — Os seletores do TEC são um contrato que ninguém assinou. A extração precisa
  degradar com elegância (RF-E9) e ser trivial de atualizar: seletores em **um só lugar**, não
  espalhados.

**Manutenção**

- **RNF-7** — Repositório separado. Não misturar com o build do app.
- **RNF-8** — A lógica de extração precisa ser testável sem browser: funções puras que recebem
  um `Document`/HTML e devolvem estrutura, com HTML de exemplo salvo como fixture. É o que
  permite consertar uma quebra de seletor sem ter conta no TEC.
- **RNF-9** — Interface em pt-BR.

**Desempenho**

- **RNF-10** — _(D)_ Uma página por matéria, **sequencial**, com pausa entre elas. Paralelizar
  10 abas contra o TEC é o tipo de coisa que muda a postura deles em relação à ferramenta.

## 8. Manifest V3 — permissões mínimas

| Permissão | Para quê | Dá para evitar? |
| --- | --- | --- |
| `content_scripts` em `*://*.tecconcursos.com.br/*` | rodar na origem certa, com os cookies do usuário | Não — é o núcleo da coisa |
| `activeTab` | agir só quando o usuário clica no ícone | Preferir a `activeTab` a `host_permissions` amplas, quando bastar |
| `downloads` | entregar o `.json` (RF-E7) | Sim, se a entrega for por `<a download>` na própria página |
| `clipboardWrite` | copiar o JSON | Sim, `navigator.clipboard` no gesto do usuário costuma bastar |
| `storage` | — | **Não pedir na v1.** Nada precisa sobreviver entre execuções (RF-E10) |
| service worker de fundo | — | **Não incluir na v1** se o content script bastar |

## 9. Publicação e restrições legais

- **RL-1 — Termos de uso do TEC. ⛔ VERIFICADO EM 2026-09-05: PROÍBE.**
  Seção 18, item 8 dos [Termos de Uso](https://www.tecconcursos.com.br/termos-de-uso), cujo
  próprio título é *"Uso de Robôs, Inteligência Artificial, **Extensões** e Ferramentas
  Automatizadas"*:

  > **8.1.** É expressamente proibida a utilização de robôs, scripts, crawlers, spiders,
  > scrapers, agentes autônomos, sistemas automatizados, ferramentas de inteligência artificial,
  > **extensões de navegador**, softwares de automação ou quaisquer mecanismos que realizem,
  > total ou parcialmente, a coleta, extração, captura, leitura, reprodução, processamento,
  > análise, indexação, armazenamento ou transmissão automatizada de conteúdos disponibilizados
  > na plataforma.
  >
  > **8.2.** A vedação prevista nesta cláusula aplica-se inclusive quando a ferramenta for
  > acionada diretamente pelo próprio usuário, **ainda que para fins pessoais** de estudo,
  > resumo, pesquisa, organização, análise ou interação com assistentes de inteligência
  > artificial.
  >
  > **8.4.** O usuário compromete-se a não utilizar **extensões de navegador**, plugins,
  > integrações, aplicativos ou ferramentas de terceiros que interajam com a plataforma de forma
  > não autorizada pelo TEC Concursos […]

  O 8.2 é o que mata o desenho: o argumento "roda no browser do próprio usuário, com a sessão
  dele, para uso pessoal" — que era a justificativa inteira da extensão sobre as alternativas —
  está previsto e vedado nominalmente. O 8.6 prevê **suspensão e cancelamento da assinatura**
  como sanção, ou seja, o risco não é abstrato: cai sobre a conta de quem instalar.

  Note também o **8.3**, que proíbe transmitir conteúdo da plataforma para sistemas de IA de
  terceiros (treino, RAG, inferência). Isso fecha o atalho de "copiar o edital da tela e pedir
  para uma IA estruturar" — ver a seção 13, que depende de a fonte **não** ser o TEC.
- **RL-2 — Chrome Web Store:** taxa única de registro de desenvolvedor, revisão manual, política
  de *single purpose* (a descrição precisa dizer exatamente uma coisa) e **política de privacidade
  publicada**, mesmo que ela diga "não coletamos nada".
- **RL-3 — Firefox Add-ons:** grátis, revisão própria, exige código-fonte revisável se houver
  build/minificação.
- **RL-4 — Marca.** Nome e ícone não podem sugerir que a extensão é do Tec Concursos. A marca
  *Bora Estudar Concursos* não está sob a licença MIT do código (ver README) — usá-la na loja é
  decisão do dono, não default.

## 10. Riscos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Spike RQ-0 dá 403 | Refaz metade do desenho, ou mata o projeto | **Rodar o spike primeiro.** Nada de código antes |
| TEC muda o HTML | Extração quebra silenciosamente | RNF-6 e RNF-8: seletores centralizados, fixtures, e falha que **diz** o que não achou |
| TEC muda os termos ou bloqueia | Extensão fica inviável | RL-1 antes de investir; nada de infraestrutura paga no caminho |
| Loja rejeita | Distribuição trava | Permissões mínimas (seção 8) e política de privacidade desde o começo; instalação em modo desenvolvedor como plano B |
| Guias com layout que não previmos | Importação parcial | RF-E9: entregar o parcial em vez de falhar |
| JSON editado à mão corrompe o plano | Dado ruim no banco | RF-A2 + RF-A5 |

## 11. Critérios de aceite (v1)

- [ ] Num guia real, logado, a extensão produz um JSON válido contra o contrato da seção 6.
- [ ] Os nomes de matéria e a árvore de tópicos batem com o que a página mostra, e `Inéditas`
      não aparece.
- [ ] A regra de promoção (RF-E4.3) foi verificada num guia que a exercita.
- [ ] Somar `bancaTopicWeights` de uma matéria bate com a contagem de questões exibida no TEC.
- [ ] Esse JSON, importado pelo app (RF-A1), cria **um** plano e **não altera** nenhum outro
      dado da conta — verificado com uma conta que já tinha planos e registros.
- [ ] Importar duas vezes o mesmo arquivo dá erro legível de nome duplicado (RF-A3), não erro de
      banco.
- [ ] Um guia sem ícone, e um com ícone acima de 2 MB, importam mesmo assim.
- [ ] O manifest não pede nenhuma permissão que a seção 8 não justifique.

## 12. Decisões em aberto

Nenhuma bloqueia o RQ-0 — todas bloqueiam o código.

1. **Firefox entra na v1?** Muda a estrutura do projeto (camada de compatibilidade) e dobra a
   superfície de teste.
2. **Publicar nas lojas, ou distribuir como ZIP para carregar em modo desenvolvedor?** A segunda
   é grátis e imediata, mas exige que o usuário saiba o que é `chrome://extensions`.
3. **Nome e identidade** da extensão, à luz do RL-4.
4. **Stack:** TypeScript com bundler (compartilhando os tipos de `src/lib/data/types.ts` por
   cópia versionada) ou JS puro sem build? O segundo simplifica a revisão da loja (RL-3).
5. **O RF-A1 é feito agora, independente da extensão?** Importar plano de arquivo é útil por si
   só — é a rota de fuga de quem tem um backup e não quer apagar a conta para usá-lo.

---

## 13 — O caminho que sobra

A necessidade real nunca foi "ler o TEC": era **não digitar 200 tópicos à mão** para começar a
estudar. O TEC era só o atalho mais conveniente para isso — e é o único atalho que está fechado.

### A fonte certa é o edital, não o guia

O edital de concurso é um **ato oficial**, publicado pelo órgão ou pela banca e disponível
publicamente. Pela [Lei 9.610/1998, art. 8º, IV](https://www.normaslegais.com.br/legislacao/trabalhista/lei9610_1998.htm),
"os textos de tratados ou convenções, leis, decretos, regulamentos, decisões judiciais e demais
atos oficiais" **não são objeto de proteção como direitos autorais**. É a fonte primária do
conteúdo programático, e não pertence ao TEC.

O que se perde ao trocar a fonte, e é justo perder: **`question_count` e `bancaTopicWeights`.**
A contagem de questões por tópico é a curadoria do TEC — as questões deles, classificadas por
eles. Isso é o produto deles, não o dado do edital. Os pesos continuam existindo no app como
`userWeight`, preenchidos pelo usuário.

> ⚠️ O parser precisa consumir o **PDF/texto do edital**. Copiar a árvore de tópicos já
> estruturada da tela do TEC e colar no campo é a mesma conduta vedada pelo 8.1 — e passá-la por
> uma IA para "arrumar" viola o 8.3 por cima.

### Opções, em ordem de custo

| # | Caminho | Custo | Observação |
| --- | --- | --- | --- |
| **A** | **Colar o texto do edital** num campo, e um parser monta a árvore pela numeração (`1`, `1.1`, `1.1.1`) | Baixo | O formato numérico do conteúdo programático é quase universal entre bancas. Melhor relação custo/benefício, e é onde eu começaria |
| **B** | **Subir o PDF do edital**, extrair o texto no browser (`pdf.js`) e cair no mesmo parser de A | Médio | Só vale depois que A provar que o parser presta. Some o passo de copiar e colar, mas herda o inferno de layout de PDF (colunas, quebra de página, cabeçalho repetido) |
| **C** | **RF-A1 — importar plano de arquivo JSON** | Baixo | **Vale por si só, independente de tudo acima.** É a rota de fuga de quem tem backup, e abre a porta para usuários compartilharem um plano pronto de um concurso entre si |
| **D** | **Pedir autorização expressa e escrita ao TEC** | Alto, e provavelmente não | O 8.3 e o 8.4 ressalvam "salvo autorização expressa e escrita". É o único caminho legítimo até o dado deles. Aposta longa, mas é de graça perguntar |

### Recomendação

**C primeiro, depois A.** O C é pequeno, conserta um buraco que existe hoje (importar sem apagar
a conta) e não depende de nenhuma decisão pendente. O A resolve a necessidade original — sair do
zero sem digitar o edital inteiro — com uma fonte que ninguém pode contestar.

O B fica para depois, se o A pegar. O D é uma carta, não um projeto.
