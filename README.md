# Ouroboros

[![GitHub license](https://img.shields.io/github/license/grebsu/Ouroboros.svg)](https://github.com/grebsu/Ouroboros/blob/master/LICENSE)
[![GitHub package.json version](https://img.shields.io/github/package-json/version/grebsu/Ouroboros)](https://github.com/grebsu/Ouroboros/blob/master/package.json)
<!-- Adicione mais badges aqui, ex: status de build -->

O Ouroboros é uma aplicação completa para planejamento de estudos, projetada para ajudar estudantes a organizar seus horários, acompanhar o progresso e gerenciar revisões de forma eficaz.

## 📖 Sumário
- [🎥 Demonstração em Vídeo](#-demonstração-em-vídeo)
- [✨ Funcionalidades](#-funcionalidades)
- [🚀 Tecnologias Utilizadas](#-tecnologias-utilizadas)
- [🏁 Como Começar](#-como-começar)
  - [Pré-requisitos](#pré-requisitos)
  - [Instalação](#instalação)
  - [Configurando o Supabase](#configurando-o-supabase)
  - [Executando a Aplicação](#executando-a-aplicação)
    - [Modo de Desenvolvimento](#modo-de-desenvolvimento)
    - [Build de Produção](#build-de-produção)
    - [Modo de Produção com Docker](#modo-de-produção-com-docker)
- [🤝 Contribuição](#-contribuição)
- [📄 Licença](#-licença)
- [📞 Contato](#-contato)

## 🎥 Demonstração em Vídeo

Assista a uma breve introdução da aplicação e suas funcionalidades no vídeo abaixo:

**[➡️ Assistir à introdução no YouTube](https://youtu.be/nKAGOVKF7A8?si=D0Oa3fFRNpJWIz3W)**

Confira também o tutorial completo para aprender a usar todas as ferramentas:

**[➡️ Tutorial Completo no YouTube](https://youtu.be/vAGiZICjqSM)**

## 📥 Acesso

O Ouroboros é uma aplicação web: basta abrir no navegador, sem instalar nada.

> **Nota sobre a v1:** até a v1.1.3 havia também um aplicativo de desktop, em
> Electron. A v2 descontinuou o desktop — o app virou uma SPA estática que fala
> com o Supabase direto do navegador, e é a mesma em qualquer dispositivo. Os
> instaladores antigos continuam nas
> [releases](https://github.com/grebsu/Ouroboros/releases), mas guardam os dados
> em arquivos locais e não conversam com a versão nova.

## 💖 Apoie o Projeto

Se o Ouroboros te ajudou nos seus estudos, considere apoiar o projeto com uma doação! Sua contribuição ajuda a manter o desenvolvimento contínuo, a implementação de novas funcionalidades e a correção de bugs. O projeto visa ajudar estudantes hipossuficientes a ter acesso a uma ferramenta de estudos poderosa, visando democratizar o estudo. Qualquer valor é muito bem-vindo e faz uma grande diferença.

Você pode doar escaneando o QR Code abaixo com seu aplicativo de banco:

<p align="center">
  <img src="public/qrcode-pix.png" alt="QR Code PIX para doação" width="200">
</p>

Muito obrigado pelo seu apoio!


## ✨ Funcionalidades

- **Planejamento de Estudos por Ciclos:** Crie e gerencie ciclos de estudo com base em editais ou objetivos específicos.
- **Registro de Sessões:** Registre sessões de estudo para diferentes matérias, monitorando o tempo e o conteúdo estudado.
- **Estatísticas de Desempenho:** Visualize sua distribuição de estudos e desempenho com gráficos dinâmicos (progresso semanal, horas por matéria, etc.).
- **Gerenciamento de Revisões:** Agende e acompanhe revisões para garantir a retenção do conteúdo a longo prazo.
- **Acompanhamento de Simulados:** Registre os resultados dos simulados para monitorar sua evolução.
- **Cronômetro Integrado:** Utilize um cronômetro para marcar o tempo de estudo com precisão.
- **Matérias e Tópicos Personalizáveis:** Adicione suas próprias matérias e tópicos para adaptar o planejador às suas necessidades.
- **Modo Claro e Escuro:** Alterne entre temas para uma visualização mais confortável.
- **Interface com Drag-and-Drop:** Reordene e gerencie facilmente seus itens de estudo.

## 🚀 Tecnologias Utilizadas

- **Framework:** [Next.js](https://nextjs.org/)
- **Linguagem:** [TypeScript](https://www.typescriptlang.org/)
- **Estilização:** [Tailwind CSS](https://tailwindcss.com/)
- **Componentes de UI:** [Radix UI](https://www.radix-ui.com/) & [Ícones Lucide](https://lucide.dev/)
- **Visualização de Dados:** [Chart.js](https://www.chartjs.org/)
- **Drag & Drop:** [dnd-kit](https://dndkit.com/)
- **Gerenciamento de Datas:** [date-fns](https://date-fns.org/)
- **Backend:** [Supabase](https://supabase.com/) (Postgres, Auth e Storage, com Row Level Security)
- **Testes de ponta a ponta:** [Playwright](https://playwright.dev/)
- **Containerização:** [Docker](https://www.docker.com/)

## 🏁 Como Começar

Siga estas instruções para obter uma cópia do projeto e executá-lo em sua máquina local.

### Pré-requisitos

- [Node.js](https://nodejs.org/en/) (versão 20.x ou superior recomendada)
- [npm](https://www.npmjs.com/)
- [Docker](https://www.docker.com/get-started) e [Docker Compose](https://docs.docker.com/compose/install/) — opcional, só para rodar em contêiner
- [Supabase CLI](https://supabase.com/docs/guides/cli) — opcional, para subir um banco local

### Instalação

1. Clone o repositório:
   ```bash
   git clone https://github.com/grebsu/Ouroboros.git
   ```
2. Navegue até o diretório do projeto:
   ```bash
   cd Ouroboros
   ```
3. Instale as dependências:
   ```bash
   npm install
   ```

### Configurando o Supabase

O Ouroboros guarda os dados no [Supabase](https://supabase.com/) (Postgres + Auth,
com Row Level Security). O app fala com ele **direto do navegador**, então tudo
que ele precisa são duas variáveis públicas.

1. Copie o modelo e preencha:
   ```bash
   cp .env.local.example .env.local
   ```
   - **Supabase local** (`npx supabase start`): os valores saem de `npx supabase status`.
   - **Supabase hospedado:** Project Settings → API.

2. Confira que ficou tudo no lugar:
   ```bash
   npm run setup
   ```
   O comando valida o `.env.local` e falha com código de saída 1 se faltar algo.

> A `anon key` não é segredo: quem impede um usuário de ler os dados de outro é a
> RLS, aplicada no banco. **Nunca** coloque a `service_role key` no `.env.local`.

3. Aplique as migrations no banco:
   ```bash
   npx supabase db push          # banco hospedado
   npx supabase start            # banco local (já aplica as migrations)
   ```

### Executando a Aplicação

O Ouroboros é uma SPA estática: não há servidor Node em produção. O `next build`
gera a pasta `out/`, que é só arquivo — os dados vêm do Supabase direto do
navegador, e quem os protege é a Row Level Security do banco.

#### Modo de Desenvolvimento

```bash
npm run dev
```
Abra [http://localhost:3000](http://localhost:3000) no seu navegador.

#### Build de Produção

Para ver o bundle estático do mesmo jeito que ele vai para o ar:

```bash
npm run start:web
```

Isso roda o `next build` (que gera `out/`) e serve a pasta em
[http://localhost:3000](http://localhost:3000). O `serve` vai **sem** o `-s`
de propósito: o export gera um `.html` por rota, e o `-s` mandaria tudo para o
`index.html`, o que não é o que o Cloudflare Pages faz.

#### Testes

Com o Supabase local no ar (`npx supabase start`) e o app rodando:

```bash
npm run test:rls    # isolamento entre usuários, direto pela API
npm run test:e2e    # Playwright dirigindo o app inteiro
```

O `test:e2e` usa o Chrome do sistema. Se você não tiver um, rode
`npx playwright install chromium` e exporte `PLAYWRIGHT_CHANNEL=chromium`.

#### Modo de Produção com Docker

Para executar a aplicação em um contêiner Docker, garantindo um ambiente de produção consistente:

As duas variáveis do Supabase são embutidas no bundle em tempo de **build**, então
elas precisam estar no ambiente na hora do `build`, não do `up`:

1.  **Construa a imagem:**
    ```bash
    export $(grep -v '^#' .env.local | xargs)
    docker compose build
    ```

2.  **Inicie a aplicação:**
    ```bash
    docker compose up -d
    ```
    A aplicação estará disponível em [http://localhost:3000](http://localhost:3000).

## 🤝 Contribuição

Contribuições são muito bem-vindas! Se você tiver ideias, sugestões ou quiser reportar um bug, por favor, abra uma issue ou envie um pull request.

## 📄 Licença

Este projeto está licenciado sob a Licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 📞 Contato

Para dúvidas ou suporte, entre em contato com [Grebsu](mailto:glebson.olvr@gmail.com).
