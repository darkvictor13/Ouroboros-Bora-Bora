# O Ouroboros é uma SPA estática: o `next build` gera `out/`, e servir isso não
# precisa de Node em runtime. A imagem é em dois estágios para que o resultado
# carregue só os arquivos e o servidor estático, não o node_modules do build.

FROM node:20-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# As duas variáveis são `NEXT_PUBLIC_`: elas são embutidas no bundle em tempo de
# BUILD, então precisam estar aqui e não no `docker run`. Não são segredo — quem
# protege os dados é a RLS do Supabase.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

RUN npm run build

FROM node:20-slim
WORKDIR /app
RUN npm install -g serve@14
COPY --from=build /app/out ./out

EXPOSE 3000
# `-s` faz o fallback de SPA (toda rota cai no index.html), o mesmo papel do
# public/_redirects no Cloudflare Pages.
CMD ["serve", "out", "-s", "-l", "3000"]
