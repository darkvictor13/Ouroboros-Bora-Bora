'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useData } from '../context/DataContext';
import * as stopwatch from '@/lib/stopwatch';
import type { EditalTopic } from '@/lib/data';
import { FaHandSparkles } from 'react-icons/fa';

interface StopwatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveAndClose: (time: number, subject?: string, topic?: string) => void;
  targetDuration?: number; // in minutes
  subject?: string;
}

const StopwatchModal: React.FC<StopwatchModalProps> = ({ isOpen, onClose, onSaveAndClose, targetDuration = 0, subject: initialSubject }) => {
  const { studyPlans, selectedPlanId, availablePlanIds, getRecommendedSession, studyCycle, sessionProgressMap } = useData();
  const [mode, setMode] = useState('cronometro'); // 'cronometro' or 'timer'
  const [time, setTime] = useState(0); // time in milliseconds
  const [isRunning, setIsRunning] = useState(false);
  const [displayTimeInput, setDisplayTimeInput] = useState('');
  const [initialTimerTime, setInitialTimerTime] = useState(0); // Stores the initial time for timer mode
  const [selectedSubject, setSelectedSubject] = useState<string | undefined>(initialSubject);
  const [selectedTopic, setSelectedTopic] = useState<string | undefined>();

  const currentPlan = useMemo(() => {
    const planIndex = availablePlanIds.indexOf(selectedPlanId);
    return studyPlans[planIndex];
  }, [studyPlans, selectedPlanId, availablePlanIds]);

  const subjects = useMemo(() => {
    if (!currentPlan || !currentPlan.subjects) return [];
    return currentPlan.subjects.map((s) => s.subject);
  }, [currentPlan]);

  const topics = useMemo(() => {
    if (!selectedSubject || !currentPlan || !currentPlan.subjects) return [];
    const subjectData = currentPlan.subjects.find((s) => s.subject === selectedSubject);
    return subjectData ? subjectData.topics : [];
  }, [selectedSubject, currentPlan]);

  useEffect(() => {
    if (initialSubject) {
      setSelectedSubject(initialSubject);
    }
  }, [initialSubject]);

  const parseTimeInputToMs = (input: string): number => {
    const parts = input.split(':');
    let ms = 0;
    if (parts.length === 3) {
      ms += parseInt(parts[0]) * 3600 * 1000; // hours
      ms += parseInt(parts[1]) * 60 * 1000;  // minutes
      ms += parseInt(parts[2]) * 1000;     // seconds
    } else if (parts.length === 2) {
      ms += parseInt(parts[0]) * 60 * 1000;  // minutes
      ms += parseInt(parts[1]) * 1000;     // seconds
    } else if (parts.length === 1) {
      ms += parseInt(parts[0]) * 1000;     // seconds
    }
    return ms;
  };

  // --- CRONÔMETRO ---
  // O relógio vive em `@/lib/stopwatch`, fora do componente, para que fechar o
  // modal não perca a contagem. Antes ele vivia no processo main do Electron,
  // pelo mesmo motivo.
  useEffect(() => {
    if (!isOpen) return;

    const cancelar = stopwatch.subscribe((decorrido) => {
      if (mode === 'timer') {
        const restante = initialTimerTime - decorrido;
        if (restante <= 0) {
          setTime(0);
          stopwatch.pause();
          setIsRunning(false);
        } else {
          setTime(restante);
        }
      } else {
        setTime(decorrido);
      }
    });

    // Reabrir o modal com o cronômetro andando tem que mostrar o botão certo.
    setIsRunning(stopwatch.isRunning());

    return cancelar;
  }, [isOpen, mode, initialTimerTime]);

  const handlePlay = () => {
    stopwatch.start();
    setIsRunning(true);
  };

  const handlePause = () => {
    stopwatch.pause();
    setIsRunning(false);
  };

  const handleReset = () => {
    stopwatch.reset();
    setIsRunning(false);
  };

  const handleSaveAndClose = () => {
    stopwatch.pause();
    setIsRunning(false);

    let elapsedTime = 0;
    if (mode === 'timer') {
      // Em modo timer, o tempo decorrido é o tempo inicial menos o restante.
      elapsedTime = initialTimerTime - time;
    } else {
      // Em modo cronômetro, `time` já é o tempo decorrido.
      elapsedTime = time;
    }

    onSaveAndClose(Math.max(0, elapsedTime), selectedSubject, selectedTopic);
  };
  // --- FIM DO CRONÔMETRO ---

  // O modal é montado e desmontado a cada abertura (`{showStopwatchModal && ...}`),
  // então este efeito roda de novo toda vez que ele abre. Distinguir a montagem
  // da troca de modo é o que faz o tempo sobreviver a fechar a janela — que é a
  // razão de o relógio morar fora do componente.
  const primeiraExecucao = useRef(true);

  useEffect(() => {
    const montando = primeiraExecucao.current;
    primeiraExecucao.current = false;

    if (!montando) {
      // Trocar de modo zera: cronômetro e timer não compartilham contagem.
      stopwatch.reset();
      setIsRunning(false);
    }

    if (mode === 'timer') {
      // Se nenhuma duração for fornecida, usa 25 minutos como padrão (Pomodoro)
      const initialMs = targetDuration > 0 ? targetDuration * 60 * 1000 : 25 * 60 * 1000;
      setTime(initialMs);
      setInitialTimerTime(initialMs);
      setDisplayTimeInput(formatTime(initialMs));
    } else {
      // Ao montar, retoma o que o cronômetro já acumulou; ao trocar de modo,
      // ele acabou de ser zerado e isto dá zero de qualquer jeito.
      setTime(stopwatch.getElapsed());
      setInitialTimerTime(0);
    }
  }, [mode, targetDuration]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const handleGetRecommendation = () => {
    if (!studyCycle) {
      console.log("Ciclo de estudo não disponível.");
      return;
    }

    const nextSession = studyCycle.find(session => {
      const progress = sessionProgressMap[session.id as string] || 0;
      return progress < session.duration;
    });

    if (nextSession) {
      const { recommendedTopic } = getRecommendedSession({ forceSubject: nextSession.subject });
      
      if (recommendedTopic) {
        setMode('timer');
        setSelectedSubject(nextSession.subject);
        setSelectedTopic(recommendedTopic.topic);

        const timeInMs = nextSession.duration * 60 * 1000;
        setTime(timeInMs);
        setInitialTimerTime(timeInMs);
        setDisplayTimeInput(formatTime(timeInMs));
      } else {
        console.log(`Nenhum tópico recomendado encontrado para a matéria: ${nextSession.subject}`);
      }
    } else {
      console.log("Todas as sessões do ciclo foram concluídas.");
      // Opcional: Adicionar uma notificação para o usuário aqui.
    }
  };

  const formatProgressText = (currentTimeMs: number, initialTargetTimeMs: number) => {
    const currentMinutes = Math.floor(currentTimeMs / (1000 * 60));
    const currentHours = Math.floor(currentMinutes / 60);
    const remainingMinutes = currentMinutes % 60;

    const targetMinutes = Math.floor(initialTargetTimeMs / (1000 * 60));
    const targetHours = Math.floor(targetMinutes / 60);
    const targetMins = targetMinutes % 60;

    return `${String(currentHours).padStart(2, '0')}h${String(remainingMinutes).padStart(2, '0')} / ${String(targetHours).padStart(2, '0')}h${String(targetMins).padStart(2, '0')}`;
  };

  const timerProgress = initialTimerTime > 0 ? ((initialTimerTime - time) / initialTimerTime) * 100 : 0;
  const hasStarted = mode === 'cronometro' ? time > 0 || isRunning : time < initialTimerTime || isRunning;

  const renderTopicOptions = (topics: EditalTopic[], level = 0): React.JSX.Element[] => {
    return topics.flatMap(topic => {
      const prefix = '\u00A0\u00A0'.repeat(level);
      const isParent = topic.sub_topics && topic.sub_topics.length > 0;
      const displayName = topic.topic_text;
      
      if (!displayName) {
          return [];
      }
      
      const option = (
        <option key={displayName} value={displayName} disabled={isParent} title={displayName}>
          {prefix}{displayName.length > (25 - level*2) ? `${displayName.substring(0, (22 - level*2))}...` : displayName}
        </option>
      );

      if (isParent) {
        return [option, ...renderTopicOptions(topic.sub_topics ?? [], level + 1)];
      }
      
      return [option];
    });
  };

  if (!isOpen) return null;

  const barberPoleStyle = `
    @keyframes barberpole {
      from { background-position: 0 0; }
      to { background-position: 40px 0; }
    }
  `;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <style>{barberPoleStyle}</style>
      <div className="w-full max-w-4xl p-8 rounded-2xl text-gray-900 dark:text-white flex flex-col bg-white dark:bg-gray-800">
        <div className="flex justify-between items-center mb-6 gap-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">{initialSubject || 'Sessão de Estudo'}</h2>
          <div className="flex items-center space-x-4 flex-shrink-0">
            <div className="w-48">
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="">Selecione a Matéria</option>
                {subjects.map((s: string) => (
                  <option key={s} value={s} title={s}>
                    {s.length > 25 ? `${s.substring(0, 22)}...` : s}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-48">
              <select
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                disabled={!selectedSubject}
                className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="">Selecione o Tópico</option>
                {renderTopicOptions(topics)}
              </select>
            </div>
          </div>
        </div>

        <p className="text-sm text-gray-400 dark:text-gray-300 text-right mb-2">
          {mode === 'timer' ? formatProgressText(initialTimerTime - time, initialTimerTime) : ''}
        </p>
        <div className="w-full bg-gray-800/50 rounded-full h-8 mb-4 shadow-inner overflow-hidden dark:bg-gray-700/50">
          {mode === 'timer' ? (
            <div 
              className="bg-gradient-to-r from-brand-400 to-amber-500 h-8 rounded-full transition-all duration-500 ease-out shadow-lg shadow-amber-500/30"
              style={{ width: `${timerProgress}%` }}
            ></div>
          ) : (
            <div
              className="h-8 rounded-full"
              style={{
                width: '100%',
                backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.15) 75%, transparent 75%, transparent)',
                backgroundSize: '40px 40px',
                animation: isRunning ? 'barberpole 1s linear infinite' : 'none',
                backgroundColor: 'var(--accent)'
              }}
            ></div>
          )}
        </div>

        <div className="flex items-center justify-center mb-8">
          {(!isRunning && mode === 'timer') ? (
            <input
              type="text"
              value={displayTimeInput}
              onChange={(e) => setDisplayTimeInput(e.target.value)}
              onBlur={() => {
                const newTimeMs = parseTimeInputToMs(displayTimeInput);
                setTime(newTimeMs);
                setInitialTimerTime(newTimeMs);
              }}
              className="text-8xl font-mono font-bold text-center tracking-wider bg-transparent border-none focus:outline-none focus:ring-0 w-full text-amber-500 dark:text-amber-300"
            />
          ) : (
            <div className="text-8xl font-mono font-bold text-center tracking-wider text-amber-500 dark:text-amber-300 w-full">
              {formatTime(time)}
            </div>
          )}
          <div className="flex items-center ml-4">
            <div className="flex flex-col">
              <button onClick={() => setMode('cronometro')} className={`px-3 py-1 text-sm font-semibold rounded-full ${mode === 'cronometro' ? 'bg-amber-600 text-gray-900 dark:text-white dark:bg-amber-700' : 'text-gray-400 dark:text-gray-500'}`}>CRONÔMETRO</button>
              <button onClick={() => setMode('timer')} className={`mt-2 px-3 py-1 text-sm font-semibold rounded-full ${mode === 'timer' ? 'bg-amber-600 text-gray-900 dark:text-white dark:bg-amber-700' : 'text-gray-400 dark:text-gray-500'}`}>TIMER</button>
            </div>
            <button 
              onClick={handleGetRecommendation}
              title="Sugerir Próximo Estudo"
              className="ml-4 p-3 bg-amber-500 hover:bg-amber-600 text-white rounded-full shadow-lg shadow-amber-500/50 transition-colors"
            >
              <FaHandSparkles className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex justify-center space-x-6">
          {!isRunning ? (
            <button onClick={handlePlay} className="w-20 h-20 bg-amber-500 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-amber-600 transition-colors dark:bg-amber-600 dark:hover:bg-amber-700">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>
            </button>
          ) : (
            <button onClick={handlePause} className="w-20 h-20 bg-amber-500 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-amber-600 transition-colors dark:bg-amber-600 dark:hover:bg-amber-700">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" /></svg>
            </button>
          )}

          {hasStarted && (
            <button onClick={handleReset} className="w-20 h-20 bg-amber-500 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-amber-600 transition-colors dark:bg-amber-600 dark:hover:bg-amber-700">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h5M20 20v-5h-5" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 9a9 9 0 0 1 14.23-5.77M20 15a9 9 0 0 1-14.23 5.77" /></svg>
            </button>
          )}

          <button onClick={handleSaveAndClose} className="w-20 h-20 bg-gray-600 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-gray-700 transition-colors dark:bg-gray-700 dark:hover:bg-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </button>
        </div>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white text-3xl dark:text-gray-400 dark:hover:text-gray-100">&times;</button>
      </div>
    </div>
  );
};

export default StopwatchModal;
