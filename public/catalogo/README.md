# Catálogo de planos prontos

Cada arquivo `<slug>.json` aqui é um **plano pronto** que o usuário pode clonar
para a própria conta em `/planos/catalogo`. O `index.json` é a vitrine: é ele
que a tela lê primeiro, e ele lista o que existe.

Isto é dado estático, versionado no git e servido pelo mesmo CDN do app.
**Publicar um plano é um commit** — não há tela de admin, não há tabela, não há
papel no schema. Revisão de plano é code review; histórico é o git; rollback é
`git revert`. O raciocínio está na seção 5 do `REQUISITOS-CATALOGO-PLANOS.md`.

## De onde o conteúdo pode vir

**Só do edital.** O conteúdo programático publicado pelo órgão ou pela banca é
ato oficial e, pela Lei 9.610/1998, art. 8º, IV, não é objeto de proteção
autoral.

**Nunca de plataforma de terceiro.** Árvore de tópicos com contagem de questões
é base de dados de quem classificou aquelas questões, e reproduzi-la aqui seria
distribuí-la. Por isso nenhum template tem `question_count`, e
`bancaTopicWeights` é sempre `{}` (RF-C7). O peso de tópico que o app usa é o
`userWeight`, preenchido pelo próprio usuário no `TopicWeightsModal`.

## Como publicar um plano

```bash
# 1. copie o anexo de conteúdo programático do PDF para um .txt
# 2. proponha a árvore e CONFIRA na tela (nada é escrito neste passo)
node scripts/edital-para-plano.mjs \
  --texto /tmp/edital.txt \
  --nome "PC-BA 2026 - Delegado" \
  --cargo "Delegado de Polícia" \
  --orgao "Polícia Civil da Bahia" \
  --edital "Edital nº 1/2026" \
  --banca VUNESP \
  --ano 2026 \
  --url https://exemplo.gov.br/edital-01-2026.pdf

# 3. corrija o que o parser errou (no .txt, e rode de novo)
# 4. publique e commite
node scripts/edital-para-plano.mjs ... --publicar
```

O passo 3 não é opcional: o parser propõe, e **alguém precisa ter olhado a
árvore** antes de ela virar plano na conta de outra pessoa (RF-T2). O erro
corrigido aqui é corrigido para todo mundo — é essa a vantagem de curar uma vez
por concurso em vez de uma vez por usuário.

O `--url` também não é decorativo: é o link que a tela mostra ao usuário para
ele conferir a árvore contra o documento oficial (RF-C6).

## Manutenção

Um catálogo com três planos velhos é pior que catálogo nenhum. Antes de
anunciar a funcionalidade, decida o recorte (só concursos abertos? só os
grandes?) e apague o que venceu.

Retificação de conteúdo programático é rotina, e **o clone não sincroniza**:
quem já clonou fica com a árvore antiga. Atualizar o template aqui só muda o que
os próximos clones recebem.
