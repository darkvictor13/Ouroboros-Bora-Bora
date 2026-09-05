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

/**
 * Uma sessão do ciclo de estudos. Mora aqui, e não no `DataContext`, porque
 * `StudyCycleData` a contém e a camada de dados não pode depender da UI.
 */
export interface StudySession {
  id: string;
  /** ID da matéria no plano. */
  subjectId: string;
  /** Nome da matéria, mantido para exibição sem precisar resolver o ID. */
  subject: string;
  duration: number;
  color: string;
}

/** Um lembrete do painel de planejamento. */
export interface ReminderNote {
  id: string;
  text: string;
  completed: boolean;
}

export interface StudyCycleData {
  studyCycle: StudySession[] | null;
  studyHours: string;
  weeklyQuestionsGoal: string;
  currentProgressMinutes: number;
  sessionProgressMap: { [key: string]: number };
  reminderNotes: ReminderNote[];
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
// Os tipos abaixo descrevem o que pode vir DE FORA — um arquivo que o usuário
// escolheu. Tudo é opcional de propósito: a v1 gravou formatos diferentes ao
// longo do tempo (plano como array puro de matérias, matéria sem `id`, matéria
// de simulado como `subjectName`). Declarar isso é o que permite à restauração
// tolerar o formato antigo sem apagar a checagem de tipo do resto.

export type BackupStudyRecord = Partial<StudyRecord> & { id: string };
export type BackupReviewRecord = Partial<ReviewRecord> & { studyRecordId: string };
export type BackupSimuladoSubject = Partial<SimuladoSubject> & { subjectName?: string };
export type BackupSimuladoRecord = Partial<Omit<SimuladoRecord, 'subjects'>> & {
  subjects?: BackupSimuladoSubject[];
};

export interface BackupPlanContent {
  name?: string;
  observations?: string;
  cargo?: string;
  edital?: string;
  banca?: string;
  subjects?: Partial<EditalSubject>[];
  bancaTopicWeights?: PlanData['bancaTopicWeights'];
  records?: BackupStudyRecord[];
  reviewRecords?: BackupReviewRecord[];
  simuladoRecords?: BackupSimuladoRecord[];
}

/** A v1 gravou o ciclo ora como array, ora como dois grupos nomeados. */
export interface LegacyCycleGroups {
  groupA?: StudySession[];
  groupB?: StudySession[];
}

export type BackupCycleContent = Omit<Partial<StudyCycleData>, 'studyCycle'> & {
  studyCycle?: StudySession[] | LegacyCycleGroups | null;
};

/** Estado que só o cliente conhece; viaja junto para o backup ficar completo. */
export type BackupClientData = Partial<StudyCycleData> & {
  version?: number;
  selectedPlanId?: string | null;
};

export interface BackupData {
  version?: number;
  /** `content` pode ser o array puro de matérias, como a v1 gravava. */
  plans: { fileName?: string; content: BackupPlanContent | Partial<EditalSubject>[] }[];
  cycles?: { fileName?: string; planName?: string; content: BackupCycleContent }[];
  clientData?: BackupClientData;
}
