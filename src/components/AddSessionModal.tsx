'use client';

import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { getPlan } from '@/lib/data';
import type { EditalSubject } from '@/lib/data';
import { useNotification } from '../context/NotificationContext';

type Subject = EditalSubject;

interface AddSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AddSessionModal: React.FC<AddSessionModalProps> = ({ isOpen, onClose }) => {
  const { studyCycle, setStudyCycle, selectedPlanId } = useData();
  const { showNotification } = useNotification();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [duration, setDuration] = useState<number>(60);

  useEffect(() => {
    async function loadSubjects() {
      if (selectedPlanId) {
        // `getPlan` já devolve as matérias com cor padrão; o ramo que tratava o
        // plano como array puro era resquício dos arquivos da v1.
        const plan = await getPlan(selectedPlanId);
        setSubjects(plan?.subjects ?? []);
      }
    }
    if (selectedPlanId) {
      loadSubjects();
    }
  }, [selectedPlanId]);

  const handleAddSession = () => {
    if (!selectedSubject) {
      showNotification('Por favor, selecione uma matéria.', 'error');
      return;
    }
    if (duration <= 0) {
      showNotification('A duração da sessão deve ser maior que zero.', 'error');
      return;
    }

    const subjectData = subjects.find(s => s.subject === selectedSubject);
    const newSession = {
      id: `${Date.now()}`,
      // Sem `subjectId` a sessão não casa com nenhum registro de estudo, e o
      // rename de matéria passa por ela sem atualizar nada.
      subjectId: subjectData?.id ?? '',
      subject: selectedSubject,
      duration,
      color: subjectData?.color || '#94A3B8',
    };

    setStudyCycle(prevCycle => [...(prevCycle || []), newSession]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-2xl w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-200">Adicionar Sessão de Estudo</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Matéria</label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
            >
              <option value="" disabled>Selecione uma matéria</option>
              {subjects.map(subject => (
                <option key={subject.subject} value={subject.subject}>{subject.subject}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Duração (minutos)</label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value))}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
            />
          </div>
        </div>
        <div className="flex justify-end space-x-4 mt-8">
          <button onClick={onClose} className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg dark:bg-gray-600 dark:hover:bg-gray-500 dark:text-gray-200">
            Cancelar
          </button>
          <button onClick={handleAddSession} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg dark:bg-green-600 dark:hover:bg-green-700">
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddSessionModal;
