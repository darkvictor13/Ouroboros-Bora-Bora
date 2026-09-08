const { sentryWebpackPlugin } = require('@sentry/webpack-plugin');

// O upload de sourcemap exige as duas pontas: o token (só o CI tem) e o DSN (que é o
// interruptor do Sentry por ambiente). Sem elas nem os mapas são gerados, o que também garante
// que nenhum build acidental publique o código-fonte. Ver PLANO-SENTRY.md §7.3.
const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const sentryToken = process.env.SENTRY_AUTH_TOKEN;
const uploadDeSourcemaps = Boolean(sentryToken && sentryDsn);

// Config pela metade é o pior dos mundos, e o plugin não reclama dela: com `project` vazio ele
// emite um *Warning* ("Will not upload source maps"), o `errorHandler` não é chamado e o build
// sai 0 — verificado no deploy 34268546566. O resultado seria produção reportando erro com
// stack trace minificado, sem nada vermelho em lugar nenhum. Então a checagem é aqui.
if (uploadDeSourcemaps && !(process.env.SENTRY_ORG && process.env.SENTRY_PROJECT)) {
  throw new Error(
    'Sentry: NEXT_PUBLIC_SENTRY_DSN e SENTRY_AUTH_TOKEN estão definidos, mas SENTRY_ORG e/ou ' +
      'SENTRY_PROJECT não. O build sairia sem sourcemap e toda issue viria minificada. ' +
      'Defina as duas como variables do environment, ou remova o DSN para desligar o Sentry.'
  );
}

// O caso oposto — token presente, DSN vazio — não é erro: é um ambiente que ainda não tem
// projeto no Sentry. Mas é silencioso demais para passar batido no log de um deploy.
if (sentryToken && !sentryDsn) {
  console.warn(
    '[sentry] SENTRY_AUTH_TOKEN presente, NEXT_PUBLIC_SENTRY_DSN vazio: este bundle vai SEM ' +
      'Sentry. Se não é isso que você quer, confira o secret do environment.'
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fase 5: o app virou SPA estática. Não há mais nada de servidor no caminho —
  // os dados vêm do Supabase direto do browser e quem os protege é a RLS — então
  // `next build` gera `out/`, que o Cloudflare Pages publica como arquivo.
  // Consequências já absorvidas no código: nenhuma rota `[param]` (viraram query
  // string), nenhum route handler e nenhum `redirect()` de Server Component.
  output: 'export',

  images: {
    // O otimizador de imagem do Next é um serviço: ele exige o servidor que
    // acabou de sair. `next/image` continua em uso (CreatePlanModal), só que
    // servindo o arquivo original.
    unoptimized: true,
  },

  // Sem os mapas, o stack trace de um bundle minificado não aponta para linha nenhuma.
  productionBrowserSourceMaps: uploadDeSourcemaps,

  transpilePackages: ['uuid'],
  eslint: {
    // A dívida de lint foi zerada na Fase 6; o build volta a reprovar de
    // verdade se alguém reintroduzir uma violação.
    ignoreDuringBuilds: false,
  },
  typescript: {
    // Desligado na Fase 3: num refactor deste tamanho o compilador é o teste de
    // regressão. `tsc --noEmit` está em zero.
    ignoreBuildErrors: false,
  },

  webpack(config, { isServer }) {
    // `!isServer` é o ponto todo de não usar o `@sentry/nextjs`: mesmo num build estático o Next
    // roda uma compilação de servidor (é ela que pré-renderiza o HTML), e subir aquele bundle
    // criaria artifact de um runtime que não existe em produção.
    if (uploadDeSourcemaps && !isServer) {
      config.plugins.push(
        sentryWebpackPlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
          // Só necessário na região EU (`https://de.sentry.io`); vazio usa sentry.io.
          url: process.env.SENTRY_URL || undefined,
          // O mesmo valor que o `Sentry.init` recebe em `release`, senão a issue aponta para
          // uma release que não tem mapa nenhum.
          release: { name: process.env.NEXT_PUBLIC_SENTRY_RELEASE },
          sourcemaps: {
            assets: ['.next/static/**/*.js', '.next/static/**/*.map'],
            // Apaga o mapa depois de subir. Não é a única guarda: o `output: 'export'` copia
            // `.next/static` para `out/_next/static` no mesmo comando, e a ordem entre este
            // delete e a cópia não é contratual — por isso o `find` no deploy.yml.
            filesToDeleteAfterUpload: ['.next/static/**/*.map'],
          },
          telemetry: false,
          // Sem isto o plugin apenas LOGA a falha e o `next build` sai 0 — verificado com um
          // token inválido: `Invalid org token (401)` no log, build verde. E como os `.map`
          // são apagados depois do upload, o resultado silencioso seria produção inteira com
          // stack trace minificado. Reprovar é mais barato: a versão anterior fica no ar.
          // Para publicar de propósito sem mapas (Sentry fora do ar, por exemplo), tire o
          // SENTRY_AUTH_TOKEN do environment do GitHub.
          errorHandler: (err) => {
            throw err;
          },
        })
      );
    }

    return config;
  },
};

module.exports = nextConfig;
