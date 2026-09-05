'use client';

import React, { useState } from 'react';
import { useNotification } from '../context/NotificationContext';
import { useData } from '../context/DataContext';
import { createPlan } from '@/lib/data';

/**
 * O ícone chega da rota como data: URI (ela baixa a imagem do CDN do TEC pelo
 * servidor, para escapar do CORS). Aqui ele vira um `File` para subir ao
 * Storage — o plano não guarda mais a imagem embutida.
 */
function dataUrlToFile(dataUrl: unknown, planName: string): File | undefined {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return undefined;

  try {
    const [header, base64] = dataUrl.split(',');
    const mimeType = header.match(/data:([^;]+)/)?.[1] ?? 'image/png';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const extension = mimeType.split('/')[1] ?? 'png';
    return new File([bytes], `${planName || 'plano'}.${extension}`, { type: mimeType });
  } catch (error) {
    // Um ícone ilegível não deve impedir a importação do edital inteiro.
    console.error('Falha ao converter o ícone do guia:', error);
    return undefined;
  }
}

const ImportGuideForm = () => {
  const { refreshPlans } = useData();
  const [guideUrl, setGuideUrl] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const { showNotification } = useNotification();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guideUrl) {
      showNotification('Por favor, insira uma URL válida.', 'error');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/import-guide', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ guideUrl }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Ocorreu um erro desconhecido.');
      }

      // A rota só raspa a página: ela roda no processo do Next e não tem o JWT
      // do usuário, então quem grava o plano é o browser, sob a RLS dele.
      const plan = result.plan;
      const created = await createPlan({
        name: plan.name,
        observations: '',
        cargo: plan.cargo ?? '',
        edital: plan.edital ?? '',
        banca: plan.banca ?? '',
        subjects: plan.subjects ?? [],
        bancaTopicWeights: plan.bancaTopicWeights ?? {},
        iconFile: dataUrlToFile(plan.iconUrl, plan.name),
      });

      if (!created.success) {
        throw new Error(created.error || 'Falha ao salvar o plano importado.');
      }

      showNotification('Guia importado com sucesso!', 'success');
      setGuideUrl('');
      await refreshPlans();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Falha na comunicação com o servidor.';
      showNotification(`Erro ao importar: ${errorMessage}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-8">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">Importar Guia de Estudo do Tec</h2>
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col sm:flex-row gap-4">
          <input
            type="url"
            value={guideUrl}
            onChange={(e) => setGuideUrl(e.target.value)}
            placeholder="Cole a URL do guia do Tec Concursos aqui"
            className="flex-grow px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900 dark:bg-gray-700 dark:text-gray-100 dark:dark:border-gray-600 dark:focus:ring-amber-400"
            disabled={isLoading}
          />
          
          <button
            type="submit"
            className="px-6 py-2 bg-amber-500 text-white font-semibold rounded-lg hover:bg-amber-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Importando...
              </>
            ) : (
              'Importar Guia'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ImportGuideForm;