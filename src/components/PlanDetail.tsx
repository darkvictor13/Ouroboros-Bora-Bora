'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { getPlan, updatePlan, getStudyRecords, deletePlan as deletePlanOnServer, uploadPlanIcon } from '@/lib/data';
import type { StudyRecord } from '@/lib/data';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import AddSubjectModal from '@/components/AddSubjectModal';
import CreatePlanModal from '@/components/CreatePlanModal';
import { FaPlusCircle, FaEdit, FaTrash, FaCamera, FaEye } from 'react-icons/fa';
import { useNotification } from '@/context/NotificationContext';
import ConfirmationModal from '@/components/ConfirmationModal';

import type { EditalSubject as Subject, EditalTopic as Topic } from '@/lib/data';
import type { PlanData } from '@/lib/data';

// Função auxiliar para formatar o tempo
const formatTime = (milliseconds: number) => {
  if (isNaN(milliseconds) || milliseconds < 0) {
    return '0h 0m';
  }
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

const countTopicsRecursively = (topics: Topic[]): number => {
  let count = 0;
  for (const topic of topics) {
    count++; // Count the current topic
    if (topic.sub_topics && topic.sub_topics.length > 0) {
      count += countTopicsRecursively(topic.sub_topics); // Add count of subtopics
    }
  }
  return count;
};

const countStudiedTopicsRecursively = (topics: Topic[], studiedTopicTexts: Set<string>): number => {
  let count = 0;
  for (const topic of topics) {
    if (studiedTopicTexts.has(topic.topic_text)) {
      count++;
    }
    if (topic.sub_topics && topic.sub_topics.length > 0) {
      count += countStudiedTopicsRecursively(topic.sub_topics, studiedTopicTexts);
    }
  }
  return count;
};

/**
 * Detalhe de um plano. Vive em `/planos?id=<uuid>` — sob `output: 'export'`
 * uma rota `[planId]` exigiria `generateStaticParams`, impossível para dado de
 * usuário. Quem lê o parâmetro e monta este componente é `src/app/planos/page.tsx`.
 */
export default function PlanDetail({ planId }: { planId: string }) {
  const router = useRouter();
  const { showNotification } = useNotification();
  
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [studyRecords, setStudyRecords] = useState<StudyRecord[]>([]); // Novo estado para registros de estudo
  
  // Estados dos modais
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [hoveredSubjectIndex, setHoveredSubjectIndex] = useState<number | null>(null); // Novo estado para hover
  const [subjectToEdit, setSubjectToEdit] = useState<Subject | null>(null); // Novo estado para a matéria a ser editada
  const [isEditPlanModalOpen, setIsEditPlanModalOpen] = useState(false); // Estado para o modal de edição do plano
  const [planToEdit, setPlanToEdit] = useState<PlanData | null>(null); // Estado para os dados do plano a ser editado
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<PlanData | null>(null);

  const handleEditPlan = () => {
    setPlanToEdit(planData); // Define o plano atual para edição
    setIsEditPlanModalOpen(true); // Abre o modal de edição
  };

  const planStats = React.useMemo(() => {
    if (!planData || !studyRecords) {
      return { totalStudyTime: 0, totalQuestions: 0, overallPerformance: 0 };
    }

    const planSubjectNames = new Set(planData.subjects.map(s => s.subject));

    const filteredRecords = studyRecords.filter(record => 
      planSubjectNames.has(record.subject)
    );

    const totalStudyTime = filteredRecords.reduce((acc, record) => acc + (record.studyTime || 0), 0);
    // A v1 somava `record.correctQuestions`/`incorrectQuestions`, campos que
    // nunca existiram em StudyRecord — os contadores desta tela mostravam
    // sempre zero. O dado real está em `record.questions`.
    const totalCorrectQuestions = filteredRecords.reduce((acc, record) => acc + (record.questions?.correct || 0), 0);
    const totalQuestions = filteredRecords.reduce((acc, record) => acc + (record.questions?.total || 0), 0);
    const overallPerformance = totalQuestions > 0 ? Math.round((totalCorrectQuestions / totalQuestions) * 100) : 0;

    return { totalStudyTime, totalQuestions, overallPerformance };
  }, [planData, studyRecords]);

  const calculateSubjectStats = useCallback((plan: PlanData | null, records: StudyRecord[]) => {
    const stats: { [key: string]: { studiedTopics: number; totalTopics: number; totalQuestions: number } } = {};

    if (!plan) return stats;

    plan.subjects.forEach(subject => {
      // CORREÇÃO: Usar a função global countTopicsRecursively
      const totalTopics = countTopicsRecursively(subject.topics || []);
      
      const studiedTopicTexts = new Set(records
        .filter(record => record.subject === subject.subject)
        .map(record => record.topic)
      );
      const studiedTopics = countStudiedTopicsRecursively(subject.topics || [], studiedTopicTexts);
      let totalQuestions = 0;

      // Questões resolvidas
      records.filter(record => record.subject === subject.subject).forEach(record => {
        totalQuestions += record.questions?.total || 0;
      });

      stats[subject.subject] = {
        studiedTopics,
        totalTopics,
        totalQuestions,
      };
    });
    return stats;
  }, []);

  const subjectStats = React.useMemo(() => {
    return calculateSubjectStats(planData, studyRecords);
  }, [planData, studyRecords, calculateSubjectStats]);

  const fetchPlanData = useCallback(async () => {
    setLoading(true);
    if (planId) {
      // `getPlan` já entrega o plano normalizado — o `normalizePlanData` local
      // existia para lidar com os três formatos de arquivo da v1.
      const [data, records] = await Promise.all([
        getPlan(planId),
        getStudyRecords(planId),
      ]);
      if (data) {
        setPlanData(data);
        setStudyRecords(records);
      }
    }
    setLoading(false);
  }, [planId]);

  useEffect(() => {
    fetchPlanData();
  }, [fetchPlanData]);

  const handleSaveSubject = async (subjectName: string, topics: Topic[], color: string) => {
    if (!planData) return;

    let updatedSubjects: Subject[];
    let successMessage: string;

    if (subjectToEdit) {
      // Modo de edição
      updatedSubjects = planData.subjects.map(s =>
        s.subject === subjectToEdit.subject
          ? { ...s, subject: subjectName, topics: topics, color: color } // Usa a estrutura de tópicos diretamente
          : s
      );
      successMessage = 'Disciplina atualizada com sucesso!';
    } else {
      // Modo de adição
      const newSubject: Subject = {
        // O ID é obrigatório: é ele que liga registros, revisões e sessões do
        // ciclo à matéria, e é o que sobrevive a um rename.
        id: crypto.randomUUID(),
        subject: subjectName,
        topics: topics,
        color: color,
      };
      updatedSubjects = [...planData.subjects, newSubject];
      successMessage = 'Disciplina adicionada com sucesso!';
    }

    // Opcional: Reindexar tópicos se você ainda precisar de topic_number
    // Esta lógica pode ser mais complexa com hierarquia e pode ser removida se não for estritamente necessária
    const reindexedSubjects = updatedSubjects.map((subj) => ({
      ...subj,
      // A reindexação aqui precisaria de uma função recursiva se os números precisarem ser hierárquicos (ex: 1.1, 1.1.1)
      // Por simplicidade, vamos remover a reindexação por enquanto, pois o modal não gera os números.
      topics: subj.topics,
    }));

    const updatedPlanData = {
      ...planData,
      subjects: reindexedSubjects,
    };

    setPlanData(updatedPlanData);
    setIsSubjectModalOpen(false);
    setSubjectToEdit(null); // Limpa o estado de edição

    const result = await updatePlan(planId, updatedPlanData);
    if (result.success) {
      showNotification(successMessage, 'success');
    } else {
      showNotification(`Erro ao salvar a disciplina: ${result.error}`, 'error');
    }
  };

  const handleSaveEditedPlan = async (updatedFields: { name: string; observations: string; cargo: string; edital: string; imageFile?: File; existingIconUrl?: string }) => {
    if (!planData) return;

    // O ícone tem caminho próprio: `uploadPlanIcon` sobe o arquivo para o
    // Storage e já grava `plans.icon_path`. Por isso ele não entra no update
    // dos outros campos, que nem enxerga a coluna.
    if (updatedFields.imageFile) {
      const uploadResult = await uploadPlanIcon(planId, updatedFields.imageFile);
      if (!uploadResult.success) {
        showNotification(`Erro ao fazer upload da nova imagem: ${uploadResult.error}`, 'error');
        return;
      }
    }

    const updatedPlanContent = {
      ...planData,
      name: updatedFields.name,
      observations: updatedFields.observations,
      cargo: updatedFields.cargo,
      edital: updatedFields.edital,
    };

    const result = await updatePlan(planId, updatedPlanContent);
    if (result.success) {
      showNotification('Plano atualizado com sucesso!', 'success');
      setIsEditPlanModalOpen(false);
      fetchPlanData(); // Recarrega os dados do plano para refletir as mudanças
    } else {
      showNotification(`Erro ao atualizar o plano: ${result.error}`, 'error');
    }
  };

  

  const handleEditSubject = (subject: Subject) => {
    setSubjectToEdit(subject);
    setIsSubjectModalOpen(true);
  };

  const handleDeleteSubject = async (subjectToDelete: Subject) => {
    if (!planData) return;

    const confirmDelete = confirm(`Tem certeza que deseja excluir a disciplina "${subjectToDelete.subject}"? Todos os tópicos e dados associados a ela serão removidos.`);
    
    if (confirmDelete) {
      const updatedSubjects = planData.subjects.filter(s => s.subject !== subjectToDelete.subject);
      const updatedPlanData = { ...planData, subjects: updatedSubjects };
      setPlanData(updatedPlanData);
  
      const result = await updatePlan(planId, updatedPlanData);
      if (result.success) {
        showNotification('Disciplina excluída com sucesso!', 'success');
        // Opcional: Recarregar dados para garantir consistência, embora o setPlanData já atualize o estado
        // fetchPlanData(); 
      } else {
        showNotification(`Erro ao excluir a disciplina: ${result.error}`, 'error');
      }
    }
  };

  const handleDeletePlan = () => {
    setPlanToDelete(planData);
    setIsConfirmModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (planToDelete) {
      const result = await deletePlanOnServer(planId);
      if (result.success) {
        showNotification('Plano excluído com sucesso!', 'success');
        router.push('/planos'); // Redireciona para a página de planos
      } else {
        showNotification(`Erro ao excluir o plano: ${result.error}`, 'error');
      }
      setIsConfirmModalOpen(false);
      setPlanToDelete(null);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center"><p className="dark:text-gray-100">Carregando detalhes do plano...</p></div>;
  }

  if (!planData) {
    return <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center"><p className="dark:text-gray-100">Plano não encontrado.</p></div>;
  }

  return (
    <>
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4 pt-12">
        <div className="max-w-5xl mx-auto">
          {/* Detalhes do Plano */}
          <div className="flex flex-col md:flex-row items-center gap-6 mb-8">
            {/* Seção do Ícone */}
            <div className="flex-shrink-0 w-48 h-48 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
              {planData.iconUrl ? (
                <div className="relative w-full h-full rounded-lg overflow-hidden">
                  <Image 
                    src={planData.iconUrl} 
                    alt={`Ícone do plano ${planData.name}`} 
                    layout="fill" 
                    objectFit="cover"
                  />
                </div>
              ) : (
                <FaCamera className="text-gray-400" size={80} />
              )}
            </div>

            {/* Seção de Informações do Plano */}
            <div className="relative flex-grow bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md w-full">
              {/* Botões de Edição/Exclusão (Canto Superior Direito) */}
              <div className="absolute top-4 right-4 flex space-x-2">
                <button
                  onClick={handleEditPlan}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 p-2 rounded-full hover:bg-gray-100 transition-colors"
                  title="Editar Plano"
                >
                  <FaEdit size={20} />
                </button>
                <button
                  onClick={handleDeletePlan}
                  className="text-red-500 hover:text-red-700 p-2 rounded-full hover:bg-gray-100 transition-colors dark:hover:bg-gray-700"
                  title="Excluir Plano"
                >
                  <FaTrash size={20} />
                </button>
              </div>

              {/* Botão Nova Disciplina (Canto Inferior Direito) */}
              <div className="absolute bottom-4 right-4">
                <button
                  onClick={() => { setIsSubjectModalOpen(true); setSubjectToEdit(null); }}
                  className="flex items-center px-4 py-2 bg-amber-500 text-white rounded-full shadow-lg hover:bg-amber-600 transition-all duration-300 text-base font-semibold"
                >
                  <FaPlusCircle className="mr-2 text-lg" />
                  Nova Disciplina
                </button>
              </div>

              {/* Informações */}
              <div>
                <h1 className="text-3xl font-bold text-amber-500 mb-4">{planData.name}</h1>
                {planData.edital && (
                  <p className="text-md text-gray-700 dark:text-gray-200">
                    <strong>Edital:</strong> {planData.edital}
                  </p>
                )}
                {planData.cargo && (
                  <p className="text-md text-gray-700 dark:text-gray-200">
                    <strong>Cargo:</strong> {planData.cargo}
                  </p>
                )}
                {planData.banca && (
                  <p className="text-md text-gray-700 dark:text-gray-200">
                    <strong>Banca:</strong> {planData.banca}
                  </p>
                )}
                <p className="text-md text-gray-700 dark:text-gray-200">
                  <strong>Disciplinas:</strong> {planData.subjects.length} | 
                  <strong> Tópicos:</strong> {(() => {
                    let totalTopics = 0;
                    planData.subjects.forEach(subject => {
                      totalTopics += countTopicsRecursively(subject.topics || []);
                    });
                    return totalTopics;
                  })()}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                  <strong>Observações:</strong> {planData.observations || 'Nenhuma.'}
                </p>
              </div>
            </div>
          </div>

          {/* Grid de Matérias */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" key="subjects-grid">
            <div className="lg:col-span-3 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md flex justify-around items-center text-center">
              <div className="flex flex-col items-center">
                <span className="text-2xl font-bold text-amber-500">{formatTime(planStats.totalStudyTime)}</span>
                <span className="text-sm text-gray-600 dark:text-gray-300">Horas Estudadas</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-2xl font-bold text-amber-500">{planStats.totalQuestions}</span>
                <span className="text-sm text-gray-600 dark:text-gray-300">Questões Resolvidas</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-2xl font-bold text-amber-500">{planStats.overallPerformance}%</span>
                <span className="text-sm text-gray-600 dark:text-gray-300">Desempenho</span>
              </div>
            </div>
            {planData.subjects && planData.subjects.map((subject, subjectIndex) => {
              const stats = subjectStats[subject.subject] || { studiedTopics: 0, totalTopics: 0, totalQuestions: 0 };
              return (
                <div 
                  key={`subject-${subjectIndex}-${subject.subject}`} 
                  className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-6 flex flex-col relative overflow-hidden" // Adicionado overflow-hidden
                  style={{ borderLeft: `8px solid ${subject.color || '#94A3B8'}` }} // Usar a cor da disciplina
                  onMouseEnter={() => setHoveredSubjectIndex(subjectIndex)}
                  onMouseLeave={() => setHoveredSubjectIndex(null)}
                >
                  <div className="flex items-center mb-2">
                    <span className="bg-amber-500 text-white text-xs font-semibold px-2.5 py-0.5 rounded-md mr-2">
                      {planData.name}
                    </span>
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100" key={`subject-title-${subjectIndex}`}>
                      {subject.subject}
                    </h3>
                  </div>
                  <div className="flex justify-around items-center w-full text-center mb-4">
                    <div className="flex flex-col items-center">
                      <span className="text-xl font-bold text-gray-800 dark:text-gray-100">{stats.studiedTopics}</span>
                      <span className="text-xs text-gray-600 dark:text-gray-300">Tópicos Estudados</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-xl font-bold text-gray-800 dark:text-gray-100">{stats.totalTopics}</span>
                      <span className="text-xs text-gray-600 dark:text-gray-300">Tópicos Totais</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-xl font-bold text-gray-800 dark:text-gray-100">{stats.totalQuestions}</span>
                      <span className="text-xs text-gray-600 dark:text-gray-300">Questões Resolvidas</span>
                    </div>
                  </div>

                  <div 
                    className={`absolute inset-0 flex flex-row items-center justify-center gap-4 transition-all duration-300 ease-in-out 
                      ${hoveredSubjectIndex === subjectIndex ? 'transform translate-x-0 opacity-100' : 'transform -translate-x-full opacity-0'}`}
                    style={{ backgroundColor: `${subject.color}E6` }} // Usar a cor da disciplina com 90% de opacidade
                  >
                    <button
                      onClick={() => router.push(`/materias?nome=${encodeURIComponent(subject.subject)}&plan=${planId}${planData.banca ? `&banca=${encodeURIComponent(planData.banca)}` : ''}`)}
                      className="bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 p-3 rounded-full hover:bg-gray-200 transition-colors shadow-md"
                      title="Visualizar"
                    >
                      <FaEye size={20} />
                    </button>
                    <button
                      onClick={() => handleEditSubject(subject)}
                      className="bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 p-3 rounded-full hover:bg-gray-200 transition-colors shadow-md"
                      title="Editar Disciplina"
                    >
                      <FaEdit size={20} />
                    </button>
                    <button
                      onClick={() => handleDeleteSubject(subject)}
                      className="bg-white dark:bg-gray-700 text-red-500 p-3 rounded-full hover:bg-gray-200 transition-colors shadow-md"
                      title="Excluir Disciplina"
                    >
                      <FaTrash size={20} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modais */}
      <AddSubjectModal
        isOpen={isSubjectModalOpen}
        onClose={() => { setIsSubjectModalOpen(false); setSubjectToEdit(null); }} // Limpa o estado de edição ao fechar
        onSave={handleSaveSubject}
        initialSubjectData={subjectToEdit ?? undefined} // Passa os dados da matéria para edição
        key="subject-modal"
      />
      <CreatePlanModal
        isOpen={isEditPlanModalOpen}
        onClose={() => setIsEditPlanModalOpen(false)}
        onSave={handleSaveEditedPlan}
        initialPlanData={planToEdit ?? undefined}
        isEditing={true}
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