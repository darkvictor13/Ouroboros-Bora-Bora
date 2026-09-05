const { fontFamily } = require("tailwindcss/defaultTheme")

/**
 * Paleta da marca Bora Estudar: azul institucional.
 * As chaves 500/400/900 vêm da identidade original (#1A56DB, #3B6FE8, #061E5E);
 * as demais completam a escala.
 */
const brand = {
  '50': '#EBF0FD',
  '100': '#D6E2FB',
  '200': '#AEC5F7',
  '300': '#7FA3F1',
  '400': '#3B6FE8',
  '500': '#1A56DB',
  '600': '#1547B4',
  '700': '#0B42B8',
  '800': '#0A3183',
  '900': '#061E5E',
  '950': '#041238',
}

module.exports = {
  darkMode: ["class"],
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './public/**/*.html'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-dm-sans)", ...fontFamily.sans],
        mono: ["var(--font-dm-mono)", ...fontFamily.mono],
      },
      gridTemplateColumns: {
        '15': 'repeat(15, minmax(0, 1fr))',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'bright-pulse': {
          '0%, 100%': {
            filter: 'drop-shadow(0 0 2px #3B6FE8)',
            transform: 'scale(1)'
          },
          '50%': {
            filter: 'drop-shadow(0 0 6px #3B6FE8)',
            transform: 'scale(1.1)'
          }
        }
      },
      animation: {
        float: 'float 3s ease-in-out infinite',
        'bright-pulse': 'bright-pulse 2s ease-in-out infinite',
      },
      colors: {
        brand,
        // `amber` e `gold` eram a cor de marca do tema anterior e continuam
        // espalhados pelo código. Apontá-los para `brand` reponta todas as
        // ocorrências de uma vez, sem varrer os componentes.
        amber: brand,
        gold: brand,

        // Neutros da identidade: quentes no claro, azul-marinho no escuro.
        gray: {
          '50': '#F5F4F0',
          '100': '#EFEEEA',
          '200': '#E4E2DC',
          '300': '#CCC9C1',
          '400': '#A8A69F',
          '500': '#6B6860',
          '600': '#4A4E5C',
          '700': '#26364D',
          '800': '#0E1624',
          '900': '#080D16',
          '950': '#04070D',
        },

        // Semânticos. A paleta `amber` deixou de significar "atenção" ao virar
        // azul, então o aviso passa a ter nome próprio.
        success: { light: '#E4F5EE', DEFAULT: '#1A7A4A', dark: '#69D7A2' },
        warning: { light: '#FEF3E2', DEFAULT: '#9A5A00', dark: '#F0B85E' },
        danger:  { light: '#FDECEC', DEFAULT: '#B83232', dark: '#FF8E98' },
      }
    },
  },
  plugins: [require("tailwindcss-animate")],
}
