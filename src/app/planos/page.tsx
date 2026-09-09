'use client';

import React, { Suspense, useState, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext'; // Use useData
import { createPlan, parsePlanFile } from '@/lib/data';
import type { PlanTemplateFile } from '@/lib/data';
import Link from 'next/link';
import CreatePlanModal from '../../components/CreatePlanModal';
import ImportPlanModal from '../../components/ImportPlanModal';
import { FaPlusCircle, FaFileAlt, FaTrash, FaUpload, FaThList } from 'react-icons/fa';
import { useNotification } from '../../context/NotificationContext';
import ConfirmationModal from '../../components/ConfirmationModal';
import WelcomeScreen from '../../components/WelcomeScreen';
import PlanDetail from '../../components/PlanDetail';

// Interfaces (keep as is)
interface Topic {
  topic_text: string;
  sub_topics?: Topic[];
}

interface PlanInfo {
  id: string;
  name: string;
  iconUrl?: string;
  subjectCount: number;
  topicCount: number;
  banca?: string;
}

function PlanList() {
  const { status } = useAuth();
  const { deletePlan, studyPlans, loading: dataContextLoading, refreshPlans } = useData();
  const { showNotification } = useNotification();
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<PlanInfo | null>(null);
  // O arquivo escolhido pode trazer um plano (contrato `bora-estudar/plano`) ou
  // vários (um backup completo da conta); os dois viram esta lista.
  const [templatesDoArquivo, setTemplatesDoArquivo] = useState<PlanTemplateFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDeleteClick = (event: React.MouseEvent, plan: PlanInfo) => {
    event.preventDefault();
    event.stopPropagation();
    setPlanToDelete(plan);
    setIsConfirmModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (planToDelete) {
      await deletePlan(planToDelete.id);
      showNotification(`Plano "${planToDelete.name}" excluído com sucesso.`, 'success');
      setPlanToDelete(null);
      setIsConfirmModalOpen(false);
    }
  };

  const handleSavePlan = async (planData: { name: string; observations: string; cargo: string; edital: string; banca?: string; imageFile?: File }) => {
    // A v1 mandava um FormData porque a action rodava no servidor e a imagem
    // precisava atravessar a fronteira. Agora o upload vai direto ao Storage.
    const result = await createPlan({
      name: planData.name,
      observations: planData.observations,
      cargo: planData.cargo,
      edital: planData.edital,
      banca: planData.banca ?? '',
      iconFile: planData.imageFile,
    });

    if (result.success) {
      showNotification(`Plano "${planData.name}" criado com sucesso!`, 'success');
      setIsModalOpen(false);
      await refreshPlans(); // Refresh plans after creating a new one
    } else {
      showNotification(`Erro: ${result.error}`, 'error');
    }
  };

  /**
   * RF-A1: importar um plano de arquivo **sem destruir nada**.
   *
   * O outro caminho de importação do app é o `/backup`, que chama
   * `clearAllData()` antes de restaurar. Este aqui não passa por lá: valida o
   * arquivo (RF-A2), mostra a prévia (RF-A5) e cria um plano só.
   */
  const handleArquivoEscolhido = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = event.target.files?.[0];
    // Zerado já: sem isto, escolher o mesmo arquivo duas vezes seguidas não
    // dispara `change` de novo.
    event.target.value = '';
    if (!arquivo) return;

    let bruto: unknown;
    try {
      bruto = JSON.parse(await arquivo.text());
    } catch {
      showNotification('Este arquivo não é um JSON válido.', 'error');
      return;
    }

    const resultado = parsePlanFile(bruto);
    if (!resultado.ok) {
      showNotification(resultado.erro, 'error');
      return;
    }

    // Plano do backup que ficou de fora (sem nome, sem matéria) é aviso, não
    // motivo para recusar o arquivo inteiro.
    if (resultado.avisos.length > 0) {
      showNotification(resultado.avisos.join(' '), 'warning');
    }
    setTemplatesDoArquivo(resultado.templates);
  };

  const plansToDisplay: PlanInfo[] = useMemo(() => {
    const countTopicsRecursively = (topics: Topic[]): number => {
      if (!topics) return 0;
      return topics.reduce(
        (count, topic) => count + 1 + countTopicsRecursively(topic.sub_topics || []),
        0
      );
    };

    return studyPlans.map((plan) => {
      // A v1 deduplicava as matérias por nome porque os arquivos antigos podiam
      // repeti-las; o dado normalizado do banco mantém a garantia.
      const uniqueSubjects = Array.from(
        new Map(plan.subjects.map((s) => [s.subject, s])).values()
      );

      return {
        id: plan.id,
        name: plan.name,
        iconUrl: plan.iconUrl,
        subjectCount: uniqueSubjects.length,
        topicCount: uniqueSubjects.reduce(
          (total, subject) => total + countTopicsRecursively(subject.topics || []),
          0
        ),
        banca: plan.banca,
      };
    });
  }, [studyPlans]);

  // Memoizado porque o `ImportPlanModal` usa a identidade deste array para
  // decidir quando reescrever o campo de nome.
  const nomesUsados = useMemo(() => studyPlans.map((plan) => plan.name), [studyPlans]);

  if (status === 'loading' || (status === 'authenticated' && dataContextLoading)) {
    return <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center"><p>Carregando...</p></div>;
  }

  if (status === 'unauthenticated') {
    // Sem sessão não há o que importar nem onde clonar; o
    // `ClientLayoutWrapper` manda para `/login` logo em seguida.
    return <WelcomeScreen onOpenModal={() => setIsModalOpen(true)} />;
  }

  if (status === 'authenticated') {
    return (
      <>
        {/* Um só input de arquivo serve a lista e o estado vazio. */}
        <input
          type="file"
          accept=".json,application/json"
          ref={fileInputRef}
          onChange={handleArquivoEscolhido}
          className="hidden"
        />
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4 pt-12">
          <div className="w-full">
            <div className="mb-6">
              <header className="flex justify-between items-center pt-4 flex-wrap gap-4">
                <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-100">Meus Planos de Estudo</h1>
                <div className="flex items-center space-x-3">
                  <Link
                    href="/planos/catalogo"
                    className="flex items-center px-4 py-2 bg-white dark:bg-gray-800 text-amber-600 dark:text-amber-400 border border-amber-500 rounded-full shadow hover:bg-amber-50 dark:hover:bg-gray-700 transition-all duration-300 text-base font-semibold"
                    title="Escolher um plano pronto do catálogo"
                  >
                    <FaThList className="mr-2 text-lg" />
                    Planos prontos
                  </Link>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center px-4 py-2 bg-white dark:bg-gray-800 text-amber-600 dark:text-amber-400 border border-amber-500 rounded-full shadow hover:bg-amber-50 dark:hover:bg-gray-700 transition-all duration-300 text-base font-semibold"
                    title="Importar um plano de um arquivo JSON, sem apagar nada"
                  >
                    <FaUpload className="mr-2 text-lg" />
                    Importar de arquivo
                  </button>
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center px-4 py-2 bg-amber-500 text-white rounded-full shadow-lg hover:bg-amber-600 transition-all duration-300 text-base font-semibold"
                    title="Criar Novo Plano"
                  >
                    <FaPlusCircle className="mr-2 text-lg" />
                    Criar Novo Plano
                  </button>
                </div>
              </header>
              <hr className="mt-2 mb-6 border-gray-300 dark:border-gray-700" />
            </div>
            {plansToDisplay.length === 0 ? (
              // Conta nova: é aqui que o usuário está mais longe de ter o que
              // digitar, então o caminho principal é o catálogo.
              <WelcomeScreen
                onOpenModal={() => setIsModalOpen(true)}
                onImportFile={() => fileInputRef.current?.click()}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {plansToDisplay.map((plan) => (
                  <div key={plan.id} className="relative bg-white dark:bg-gray-800 rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col items-center text-center p-6 group">
                    <Link href={`/planos?id=${plan.id}`} className="w-full h-full">
                      {plan.iconUrl ? (
                        <div className="relative w-24 h-24 mb-4 rounded-full overflow-hidden border-4 border-amber-500 shadow-md mx-auto">
                          {/* `<img>` e não `next/image`: a URL do ícone é assinada
                              pelo Storage, tem query string e host variável por
                              ambiente — nada que o otimizador do Next saiba tratar,
                              e ele exige um servidor que a Fase 5 vai remover. */}
                          <img src={plan.iconUrl} alt={`Ícone do plano ${plan.name}`} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-24 h-24 mb-4 flex items-center justify-center bg-gray-200 dark:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400 mx-auto">
                          <FaFileAlt size={48} />
                        </div>
                      )}
                      <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">{plan.name}</h2>
                      {plan.banca && <p className="text-gray-600 dark:text-gray-300 text-sm">Banca: <span className="font-semibold">{plan.banca}</span></p>}
                      <p className="text-gray-600 dark:text-gray-300 text-sm">Matérias: <span className="font-semibold">{plan.subjectCount}</span></p>
                      <p className="text-gray-600 dark:text-gray-300 text-sm">Tópicos: <span className="font-semibold">{plan.topicCount}</span></p>
                    </Link>
                    <button
                      onClick={(e) => handleDeleteClick(e, plan)}
                      className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-opacity duration-300"
                      title="Excluir Plano"
                    >
                      <FaTrash />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <CreatePlanModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSavePlan}
        />
        <ImportPlanModal
          isOpen={templatesDoArquivo.length > 0}
          templates={templatesDoArquivo}
          takenNames={nomesUsados}
          title="Importar plano de arquivo"
          confirmLabel="Importar plano"
          onClose={() => setTemplatesDoArquivo([])}
          onImported={async (planId) => {
            setTemplatesDoArquivo([]);
            await refreshPlans();
            if (planId) router.push(`/planos?id=${planId}`);
          }}
        />
        <ConfirmationModal
          isOpen={isConfirmModalOpen}
          onClose={() => setIsConfirmModalOpen(false)}
          onConfirm={handleConfirmDelete}
          title="Confirmar Exclusão"
          message={`Tem certeza que deseja excluir o plano "${planToDelete?.name}"? Esta ação é irreversível.`}
          confirmText="Excluir"
          cancelText="Cancelar"
        />
      </>
    );
  }

  return null;
}

/**
 * `/planos` mostra a lista; `/planos?id=<uuid>`, o detalhe de um plano.
 *
 * Era uma rota `[planId]` até a Fase 5. Sob `output: 'export'` o Next exige
 * `generateStaticParams` para gerar cada caminho dinâmico em build — o que é
 * impossível quando o parâmetro é um uuid de dado do usuário. A query string
 * não faz parte do caminho, então uma página só cobre os dois casos.
 */
function PlanosRouter() {
  const planId = useSearchParams().get('id');
  return planId ? <PlanDetail planId={planId} /> : <PlanList />;
}

export default function PlanosPage() {
  // `useSearchParams` obriga um limite de Suspense: sem ele o Next se recusa a
  // pré-renderizar a página no export.
  return (
    <Suspense fallback={null}>
      <PlanosRouter />
    </Suspense>
  );
}
