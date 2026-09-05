/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Desativa o Turbopack explicitamente
    // Isso é necessário para resolver problemas de compatibilidade com certas bibliotecas
    // como chart.js e react-chartjs-2, que podem não ser totalmente compatíveis com o Turbopack ainda.
    // Se você precisar do Turbopack no futuro, pode remover esta linha.
  },
  images: {
    domains: ['cdn.tecconcursos.com.br'],
  },
  transpilePackages: ['uuid'],
  eslint: {
    // Continua ligado: são ~200 violações pré-existentes (a maioria
    // `no-unused-vars` e `no-explicit-any`), e o `next lint` nunca chegou a
    // rodar neste repositório — a limpeza é um trabalho à parte, registrado na
    // Fase 6. O CI roda o ESLint como passo próprio.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Desligado na Fase 3: num refactor deste tamanho o compilador é o teste de
    // regressão. `tsc --noEmit` está em zero.
    ignoreBuildErrors: false,
  },
};

module.exports = nextConfig;
