'use client';

import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import type { ChartOptions } from 'chart.js';
import { useTheme } from '../context/ThemeContext';



interface SimuladoLineChartProps {
  labels: string[];
  performanceData: number[];
  scoreData: number[];
  chartType: 'desempenho' | 'pontuacao';
}

export default function SimuladoLineChart({ labels, performanceData, scoreData, chartType }: SimuladoLineChartProps) {
  // As cores eram funções `(context) => ...` que liam a classe `dark` do
  // <html>. O chart.js não trata `color` como opção scriptable nesses pontos,
  // então o valor renderizado era a própria função. Com o tema vindo do
  // contexto, são strings — e o gráfico redesenha quando o tema muda.
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const strongText = isDark ? '#E5E7EB' : '#111827';
  const mutedText = isDark ? '#D1D5DB' : '#374151';
  const gridColor = isDark ? '#4B5563' : '#E5E7EB';
  const surface = isDark ? '#334155' : '#F9FAFB';

  const data = {
    labels,
    datasets: [
      {
        label: chartType === 'desempenho' ? 'Desempenho (%) ' : 'Pontuação Total',
        data: chartType === 'desempenho' ? performanceData : scoreData,
        borderColor: chartType === 'desempenho' ? 'rgb(75, 192, 192)' : 'rgb(153, 102, 255)',
        backgroundColor: chartType === 'desempenho' ? 'rgba(75, 192, 192, 0.5)' : 'rgba(153, 102, 255, 0.5)',
        tension: 0.3,
        fill: false,
        pointRadius: 5,
        pointHoverRadius: 7,
      },
    ],
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 1000, // milliseconds
      easing: 'easeInOutQuad',
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          font: {
            size: 14,
            weight: 'bold',
          },
          color: strongText,
        },
      },
      title: {
        display: true,
        text: chartType === 'desempenho' ? 'Desempenho dos Simulados ao Longo do Tempo' : 'Pontuação dos Simulados ao Longo do Tempo',
        font: {
          size: 18,
          weight: 'bold',
        },
        color: strongText,
      },
      tooltip: {
        backgroundColor: surface,
        titleFont: {
          size: 16,
          weight: 'bold',
        },
        bodyFont: {
          size: 14,
        },
        borderColor: '#6EE7B7', // Teal-300
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: false, // Hide color box in tooltip
        titleColor: strongText,
        bodyColor: mutedText,
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Data do Simulado',
          font: {
            size: 14,
            weight: 'bold',
          },
          color: strongText,
        },
        grid: {
          color: gridColor,
        },
        border: {
          color: gridColor,
        },
        ticks: {
          color: strongText,
          font: {
            size: 12,
          },
        },
      },
      y: {
        title: {
          display: true,
          text: chartType === 'desempenho' ? 'Desempenho (%) ' : 'Pontuação',
          font: {
            size: 14,
            weight: 'bold',
          },
          color: strongText,
        },
        beginAtZero: true,
        grid: {
          color: gridColor,
        },
        border: {
          color: gridColor,
        },
        ticks: {
          color: strongText,
          font: {
            size: 12,
          },
          callback: function(value: any) {
            return Math.round(value);
          },
        },
      },
    },
    elements: {
      point: {
        backgroundColor: '#6EE7B7', // Teal-300
        borderColor: '#0D9488', // Teal-700
        borderWidth: 2,
        radius: 5,
        hoverRadius: 7,
      },
    },
  };

  return <Line data={data} options={options} />;
}