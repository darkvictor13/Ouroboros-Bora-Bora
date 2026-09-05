/**
 * Tradução entre as linhas do Postgres (snake_case) e os tipos do domínio
 * (camelCase). Todo `record.subject_id` do projeto mora aqui: o resto do app só
 * enxerga os tipos de `./types.ts`.
 */

import type {
  EditalSubject,
  PlanData,
  ReviewRecord,
  SimuladoRecord,
  SimuladoSubject,
  StudyCycleData,
  StudyRecord,
} from './types';

/**
 * Cor de fallback das matérias.
 *
 * Existe porque a v1 gravava matérias sem cor, e três telas repetiam o mesmo
 * `subject.color || '#94A3B8'` para não renderizar um gráfico transparente.
 */
const DEFAULT_SUBJECT_COLOR = '#94A3B8';

// -----------------------------------------------------------------------------
// plans
// -----------------------------------------------------------------------------

export interface PlanRow {
  id: string;
  name: string;
  observations: string;
  cargo: string;
  edital: string;
  banca: string;
  icon_path: string | null;
  // Colunas JSONB: o Postgres devolve o que foi gravado, e backups da v1
  // gravaram formatos diferentes. `unknown` obriga a checagem que o corpo da
  // função já fazia.
  subjects: unknown;
  banca_topic_weights: unknown;
}

/** Uma matéria como ela pode vir do JSONB — todo campo pode faltar. */
type SubjectJson = Partial<EditalSubject> | null | undefined;

/** A linha do plano mais o ícone já resolvido para uma URL que a UI pode usar. */
export function rowToPlan(row: PlanRow, iconUrl?: string): PlanData {
  return {
    id: row.id,
    name: row.name,
    observations: row.observations ?? '',
    cargo: row.cargo ?? '',
    edital: row.edital ?? '',
    banca: row.banca ?? '',
    iconUrl,
    subjects: (Array.isArray(row.subjects) ? (row.subjects as SubjectJson[]) : []).map(
      (subject) => ({
        ...subject,
        color: subject?.color || DEFAULT_SUBJECT_COLOR,
        topics: Array.isArray(subject?.topics) ? subject.topics : [],
      })
    ) as PlanData['subjects'],
    bancaTopicWeights:
      row.banca_topic_weights && typeof row.banca_topic_weights === 'object'
        ? (row.banca_topic_weights as PlanData['bancaTopicWeights'])
        : {},
  };
}

// -----------------------------------------------------------------------------
// study_records
// -----------------------------------------------------------------------------

export interface StudyRecordRow {
  id: string;
  date: string;
  subject_id: string | null;
  subject: string | null;
  topic: string | null;
  study_time: number | null;
  questions: StudyRecord['questions'] | null;
  pages: StudyRecord['pages'] | null;
  videos: StudyRecord['videos'] | null;
  notes: string | null;
  category: string | null;
  review_periods: string[] | null;
  teoria_finalizada: boolean | null;
  count_in_planning: boolean | null;
  created_at?: string;
}

export function rowToStudyRecord(row: StudyRecordRow): StudyRecord {
  return {
    id: row.id,
    date: row.date,
    subjectId: row.subject_id ?? '',
    subject: row.subject ?? '',
    topic: row.topic ?? '',
    studyTime: row.study_time ?? 0,
    questions: row.questions ?? { correct: 0, total: 0 },
    pages: Array.isArray(row.pages) ? row.pages : [],
    videos: Array.isArray(row.videos) ? row.videos : [],
    notes: row.notes ?? '',
    category: row.category ?? '',
    reviewPeriods: row.review_periods ?? [],
    teoriaFinalizada: row.teoria_finalizada ?? false,
    countInPlanning: row.count_in_planning ?? true,
    createdAt: row.created_at,
  };
}

export function studyRecordToRow(
  record: StudyRecord,
  userId: string,
  planId: string
) {
  return {
    id: record.id,
    user_id: userId,
    plan_id: planId,
    date: record.date,
    subject_id: record.subjectId ?? '',
    subject: record.subject ?? '',
    topic: record.topic ?? '',
    study_time: Math.max(0, Math.round(record.studyTime ?? 0)),
    questions: record.questions ?? { correct: 0, total: 0 },
    pages: record.pages ?? [],
    videos: record.videos ?? [],
    notes: record.notes ?? '',
    category: record.category ?? '',
    review_periods: record.reviewPeriods ?? [],
    teoria_finalizada: record.teoriaFinalizada ?? false,
    count_in_planning: record.countInPlanning ?? true,
  };
}

// -----------------------------------------------------------------------------
// review_records
// -----------------------------------------------------------------------------

export interface ReviewRecordRow {
  id: string;
  study_record_id: string;
  scheduled_date: string;
  status: ReviewRecord['status'];
  original_date: string;
  subject_id: string | null;
  subject: string | null;
  topic: string | null;
  review_period: string;
  completed_date: string | null;
  ignored: boolean | null;
}

export function rowToReviewRecord(row: ReviewRecordRow): ReviewRecord {
  return {
    id: row.id,
    studyRecordId: row.study_record_id,
    scheduledDate: row.scheduled_date,
    status: row.status,
    originalDate: row.original_date,
    subjectId: row.subject_id ?? '',
    subject: row.subject ?? '',
    topic: row.topic ?? '',
    reviewPeriod: row.review_period,
    completedDate: row.completed_date ?? undefined,
    ignored: row.ignored ?? false,
  };
}

export function reviewRecordToRow(
  record: ReviewRecord,
  userId: string,
  planId: string
) {
  return {
    id: record.id,
    user_id: userId,
    plan_id: planId,
    study_record_id: record.studyRecordId,
    scheduled_date: record.scheduledDate,
    status: record.status ?? 'pending',
    original_date: record.originalDate,
    subject_id: record.subjectId ?? '',
    subject: record.subject ?? '',
    topic: record.topic ?? '',
    review_period: record.reviewPeriod,
    completed_date: record.completedDate ?? null,
    ignored: record.ignored ?? false,
  };
}

// -----------------------------------------------------------------------------
// simulado_records + simulado_subjects
// -----------------------------------------------------------------------------

export interface SimuladoSubjectRow {
  subject_name: string | null;
  weight: number | string | null;
  total_questions: number | null;
  correct: number | null;
  incorrect: number | null;
  color: string | null;
  position: number | null;
}

export interface SimuladoRecordRow {
  id: string;
  date: string;
  name: string | null;
  style: string | null;
  banca: string | null;
  time_spent: string | null;
  comments: string | null;
  simulado_subjects?: SimuladoSubjectRow[] | null;
}

/** Espera a linha com as matérias embutidas (`select ..., simulado_subjects(*)`). */
export function rowToSimuladoRecord(row: SimuladoRecordRow): SimuladoRecord {
  const subjects: SimuladoSubject[] = (row.simulado_subjects ?? [])
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((s) => ({
      name: s.subject_name ?? '',
      weight: Number(s.weight ?? 1),
      totalQuestions: s.total_questions ?? 0,
      correct: s.correct ?? 0,
      incorrect: s.incorrect ?? 0,
      color: s.color ?? '',
    }));

  return {
    id: row.id,
    date: row.date,
    name: row.name ?? '',
    style: row.style ?? '',
    banca: row.banca ?? '',
    timeSpent: row.time_spent ?? '00:00:00',
    subjects,
    comments: row.comments ?? '',
  };
}

export function simuladoRecordToRow(
  record: SimuladoRecord,
  userId: string,
  planId: string
) {
  return {
    id: record.id,
    user_id: userId,
    plan_id: planId,
    date: record.date,
    name: record.name ?? '',
    style: record.style ?? '',
    banca: record.banca ?? '',
    time_spent: record.timeSpent ?? '00:00:00',
    comments: record.comments ?? '',
  };
}

/** `position` reproduz a ordem que o array JSON da v1 preservava de graça. */
export function simuladoSubjectsToRows(
  record: SimuladoRecord,
  simuladoRecordId: string
) {
  return (record.subjects ?? []).map((subject, position) => ({
    simulado_record_id: simuladoRecordId,
    subject_name: subject.name ?? '',
    weight: subject.weight ?? 1,
    total_questions: Math.max(0, subject.totalQuestions ?? 0),
    correct: Math.max(0, subject.correct ?? 0),
    incorrect: Math.max(0, subject.incorrect ?? 0),
    color: subject.color ?? '',
    position,
  }));
}

// -----------------------------------------------------------------------------
// study_cycles
// -----------------------------------------------------------------------------

export interface StudyCycleRow {
  cycle: StudyCycleData['studyCycle'];
  study_hours: string | null;
  weekly_questions_goal: string | null;
  current_progress_minutes: number | null;
  session_progress_map: StudyCycleData['sessionProgressMap'] | null;
  reminder_notes: StudyCycleData['reminderNotes'] | null;
  study_days: string[] | null;
  completed_cycles: number | null;
  cycle_generation_timestamp: number | string | null;
}

export function rowToStudyCycle(row: StudyCycleRow): StudyCycleData {
  return {
    studyCycle: row.cycle ?? null,
    studyHours: row.study_hours ?? '0',
    weeklyQuestionsGoal: row.weekly_questions_goal ?? '0',
    currentProgressMinutes: row.current_progress_minutes ?? 0,
    sessionProgressMap: row.session_progress_map ?? {},
    reminderNotes: Array.isArray(row.reminder_notes) ? row.reminder_notes : [],
    studyDays: row.study_days ?? [],
    completedCycles: row.completed_cycles ?? 0,
    cycleGenerationTimestamp:
      row.cycle_generation_timestamp === null ||
      row.cycle_generation_timestamp === undefined
        ? null
        : Number(row.cycle_generation_timestamp),
  };
}

export function studyCycleToRow(
  data: StudyCycleData,
  userId: string,
  planId: string
) {
  return {
    user_id: userId,
    plan_id: planId,
    // O ciclo pode ser um objeto `{ groupA, groupB }` nos dados mais antigos; a
    // coluna aceita só array ou nulo, e o DataContext já achata na leitura.
    cycle: Array.isArray(data.studyCycle) ? data.studyCycle : null,
    study_hours: String(data.studyHours ?? '0'),
    weekly_questions_goal: String(data.weeklyQuestionsGoal ?? '0'),
    current_progress_minutes: Math.max(
      0,
      Math.round(data.currentProgressMinutes ?? 0)
    ),
    session_progress_map: data.sessionProgressMap ?? {},
    reminder_notes: data.reminderNotes ?? [],
    study_days: data.studyDays ?? [],
    completed_cycles: Math.max(0, data.completedCycles ?? 0),
    cycle_generation_timestamp: data.cycleGenerationTimestamp ?? null,
  };
}
