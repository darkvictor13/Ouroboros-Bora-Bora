/**
 * Tipos do domínio, compartilhados entre a camada de dados e a UI.
 *
 * Eles descrevem o formato que o app manipula em memória — camelCase, datas
 * como `YYYY-MM-DD`, árvore de matérias aninhada. O mapeamento para as colunas
 * snake_case do Postgres vive em `./mappers.ts` e não sai de lá.
 */

export interface EditalTopic {
  topic_text: string;
  /** Numeração do tópico no edital. Nada grava hoje; sobrevive de backups da v1. */
  topic_number?: string;
  userWeight?: number;
  is_grouping_topic?: boolean;
  /** Número de questões da banca no tópico, quando o plano veio de um guia. */
  question_count?: number;
  sub_topics?: EditalTopic[];
  // Os campos abaixo são *derivados* dos registros de estudo por
  // `calculateStats`, não gravados no plano. Um tópico recém-criado pelo
  // AddTopicModal ou vindo do importador não tem nenhum deles.
  completed?: number;
  reviewed?: number;
  total?: number;
  percentage?: number;
  last_study?: string;
  is_completed?: boolean;
}

export interface EditalSubject {
  id: string;
  subject: string;
  color: string;
  topics: EditalTopic[];
}

export interface StudyRecord {
  id: string;
  date: string;
  subjectId: string;
  subject: string;
  topic: string;
  studyTime: number;
  questions?: { correct: number; total: number };
  pages: { start: number; end: number }[];
  videos: { title: string; start: string; end: string }[];
  notes: string;
  category: string;
  reviewPeriods?: string[];
  teoriaFinalizada: boolean;
  countInPlanning: boolean;
  /**
   * Instante em que a linha nasceu, vindo de `created_at`. A v1 extraía isso do
   * próprio ID (`Date.now()-random`); com IDs uuid não há timestamp para ler, e
   * o ciclo de estudos precisa saber quais registros vieram depois da geração
   * do ciclo atual.
   */
  createdAt?: string;
}

export interface ReviewRecord {
  id: string;
  studyRecordId: string;
  scheduledDate: string;
  status: 'pending' | 'completed' | 'skipped';
  originalDate: string;
  subjectId: string;
  subject: string;
  topic: string;
  reviewPeriod: string;
  completedDate?: string;
  ignored?: boolean;
}

/**
 * Uma linha da tabela de matérias dentro de um simulado.
 *
 * Sem ID de matéria: o AddSimuladoModal monta cada linha a partir do nome, e é
 * por nome que o rename de matéria propaga. O schema inicial supôs um ID aqui —
 * ver o comentário na migration `0002`.
 */
export interface SimuladoSubject {
  name: string;
  weight: number;
  totalQuestions: number;
  correct: number;
  incorrect: number;
  color: string;
}

export interface SimuladoRecord {
  id: string;
  date: string;
  name: string;
  style: string;
  banca: string;
  timeSpent: string;
  subjects: SimuladoSubject[];
  comments: string;
}

export interface PlanData {
  id: string;
  name: string;
  observations: string;
  cargo: string;
  edital: string;
  banca: string;
  iconUrl?: string;
  subjects: EditalSubject[];
  bancaTopicWeights: {
    [subjectId: string]: {
      [topicText: string]: number;
    };
  };
}

/** Campos que o app pode criar ou alterar num plano. */
export type PlanInput = Partial<Omit<PlanData, 'id'>> & { name: string };

export interface StudyCycleData {
  studyCycle: any[] | null;
  studyHours: string;
  weeklyQuestionsGoal: string;
  currentProgressMinutes: number;
  sessionProgressMap: { [key: string]: number };
  reminderNotes: any[];
  studyDays: string[];
  completedCycles: number;
  cycleGenerationTimestamp: number | null;
}

/** Retorno padrão das operações de escrita, no formato que a UI já consome. */
export interface MutationResult {
  success: boolean;
  error?: string;
}

/**
 * Backup completo da conta. `version: 4` é o primeiro formato gerado contra o
 * Supabase; a restauração também aceita os formatos da v1, que eram listas de
 * arquivos JSON.
 */
export interface BackupData {
  version?: number;
  plans: { fileName?: string; content: any }[];
  cycles?: { fileName?: string; planName?: string; content: any }[];
  clientData?: any;
}
