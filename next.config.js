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
};

module.exports = nextConfig;
