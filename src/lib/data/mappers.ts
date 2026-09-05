/**
 * Tradução entre as linhas do Postgres (snake_case) e os tipos do domínio
 * (camelCase). Todo `record.subject_id` do projeto mora aqui: o resto do app só
 * enxerga os tipos de `./types.ts`.
 */

import type {
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
  subjects: any;
  banca_topic_weights: any;
}

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
    subjects: (Array.isArray(row.subjects) ? row.subjects : []).map(
      (subject: any) => ({
        ...subject,
        color: subject?.color || DEFAULT_SUBJECT_COLOR,
        topics: Array.isArray(subject?.topics) ? subject.topics : [],
      })
    ),
    bancaTopicWeights:
      row.banca_topic_weights && typeof row.banca_topic_weights === 'object'
        ? row.banca_topic_weights
        : {},
  };
}

// -----------------------------------------------------------------------------
// study_records
// -----------------------------------------------------------------------------

export function rowToStudyRecord(row: any): StudyRecord {
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

export function rowToReviewRecord(row: any): ReviewRecord {
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

/** Espera a linha com as matérias embutidas (`select ..., simulado_subjects(*)`). */
export function rowToSimuladoRecord(row: any): SimuladoRecord {
  const subjects: SimuladoSubject[] = (row.simulado_subjects ?? [])
    .slice()
    .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
    .map((s: any) => ({
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

export function rowToStudyCycle(row: any): StudyCycleData {
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
