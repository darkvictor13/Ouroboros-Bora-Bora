'use client';

import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';

/**
 * Cores dos gráficos derivadas da identidade Bora Estudar.
 *
 * Antes cada gráfico escolhia hex fixos, incluindo uma cor de eixo de
 * compromisso que não reagia ao tema. Aqui a paleta é única e muda com o tema.
 */
export const BRAND = {
  accent: '#1A56DB',
  accentDark: '#74A7FF',
  accentMid: '#3B6FE8',
  success: '#1A7A4A',
  successDark: '#69D7A2',
  warning: '#9A5A00',
  warningDark: '#F0B85E',
  danger: '#B83232',
  dangerDark: '#FF8E98',
} as const;

export interface ChartTheme {
  isDark: boolean;
  /** Cor principal da marca — séries de destaque. */
  accent: string;
  /** Variação mais clara do azul, para segunda série ou pontos. */
  accentSoft: string;
  success: string;
  warning: string;
  danger: string;
  /** Linhas de grade. */
  grid: string;
  /** Rótulos de eixo e legenda. */
  tick: string;
  tooltipBg: string;
  tooltipText: string;
  /** Paleta categórica, para donuts e séries por matéria. */
  series: string[];
}

export function getChartTheme(isDark: boolean): ChartTheme {
  const accent = isDark ? BRAND.accentDark : BRAND.accent;

  return {
    isDark,
    accent,
    accentSoft: isDark ? '#91B8FF' : BRAND.accentMid,
    success: isDark ? BRAND.successDark : BRAND.success,
    warning: isDark ? BRAND.warningDark : BRAND.warning,
    danger: isDark ? BRAND.dangerDark : BRAND.danger,
    grid: isDark ? 'rgba(116, 167, 255, 0.14)' : 'rgba(26, 25, 22, 0.10)',
    tick: isDark ? '#C4CDDA' : '#6B6860',
    tooltipBg: isDark ? '#0E1624' : '#FFFFFF',
    tooltipText: isDark ? '#F5F8FF' : '#1A1916',
    series: isDark
      ? ['#74A7FF', '#69D7A2', '#F0B85E', '#FF8E98', '#B58CFF', '#5FD3E0', '#FFB27A', '#9FB4D8']
      : ['#1A56DB', '#1A7A4A', '#9A5A00', '#B83232', '#6C3FC5', '#0E7C93', '#C2621E', '#4A4E5C'],
  };
}

export function useChartTheme(): ChartTheme {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  return useMemo(() => getChartTheme(isDark), [isDark]);
}
