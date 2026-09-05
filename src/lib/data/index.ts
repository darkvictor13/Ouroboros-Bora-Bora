/**
 * Camada de dados do Ouroboros v2.
 *
 * Substitui as ~29 server actions de `src/app/actions.tsx`, que gravavam JSON em
 * `DATA_DIR/<userId>/`. Agora tudo fala com o Postgres do Supabase direto do
 * browser, com a anon key: quem decide o que cada usuário enxerga é a RLS, não
 * este arquivo. Nenhuma função aqui filtra por dono para *autorizar* — o
 * `user_id` que elas escrevem existe para satisfazer o `with check` das
 * políticas, e as leituras confiam no `using` delas.
 *
 * A chave de acesso é o `planId` (uuid). Na v1 era o nome do arquivo
 * (`"meu-plano.json"`), que amarrava a identidade do plano ao seu nome.
 */

import { createClient } from '@/lib/supabase/client';
import {
  PlanRow,
  reviewRecordToRow,
  rowToPlan,
  rowToReviewRecord,
  rowToSimuladoRecord,
  rowToStudyCycle,
  rowToStudyRecord,
  simuladoRecordToRow,
  simuladoSubjectsToRows,
  studyCycleToRow,
  studyRecordToRow,
} from './mappers';
import type {
  BackupData,
  EditalSubject,
  EditalTopic,
  MutationResult,
  PlanData,
  PlanInput,
  ReviewRecord,
  SimuladoRecord,
  StudyCycleData,
  StudyRecord,
} from './types';

export * from './types';

const ICON_BUCKET = 'plan-icons';

/** Uma hora é bem mais do que a vida de uma sessão de navegação da SPA. */
const ICON_URL_TTL_SECONDS = 3600;

const PLAN_COLUMNS =
  'id, name, observations, cargo, edital, banca, icon_path, subjects, banca_topic_weights';

// -----------------------------------------------------------------------------
// Identidade
// -----------------------------------------------------------------------------

/**
 * Devolve o id do usuário logado. Substitui `getUserDataDirectory()`, que
 * montava o caminho `DATA_DIR/<userId>/` e criava a pasta.
 *
 * Usa `getUser()`, que valida o JWT, e não `getSession()`: mesmo rodando no
 * browser, um token expirado renderizaria a tela inteira antes de a primeira
 * query falhar com 401.
 */
async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Error('Usuário não autenticado.');
  }

  return data.user.id;
}

/** Mensagem de erro legível a partir de um erro do PostgREST. */
function describe(error: any, fallback: string): string {
  if (!error) return fallback;
  if (error.code === '23505') return 'Já existe um plano com esse nome.';
  return error.message || fallback;
}

// -----------------------------------------------------------------------------
// Ícones dos planos (Supabase Storage)
// -----------------------------------------------------------------------------

/**
 * Troca caminhos do bucket por URLs assinadas, numa chamada só.
 *
 * O bucket é privado, então não existe URL pública. Assinar em lote evita uma
 * requisição por plano na carga inicial.
 */
async function signIconPaths(
  paths: (string | null)[]
): Promise<Map<string, string>> {
  const unique = Array.from(
    new Set(paths.filter((p): p is string => typeof p === 'string' && p !== ''))
  );
  const signed = new Map<string, string>();
  if (unique.length === 0) return signed;

  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(ICON_BUCKET)
    .createSignedUrls(unique, ICON_URL_TTL_SECONDS);

  if (error || !data) {
    // Um ícone que não resolve não impede o plano de carregar.
    console.error('Falha ao assinar as URLs dos ícones dos planos:', error);
    return signed;
  }

  data.forEach((entry) => {
    if (entry.path && entry.signedUrl) {
      signed.set(entry.path, entry.signedUrl);
    }
  });

  return signed;
}

function iconExtension(file: File): string {
  const fromName = file.name.split('.').pop();
  if (fromName && fromName.length <= 5 && /^[a-z0-9]+$/i.test(fromName)) {
    return fromName.toLowerCase();
  }
  const fromType = file.type.split('/').pop();
  return fromType && /^[a-z0-9]+$/i.test(fromType) ? fromType : 'png';
}

async function putIcon(
  userId: string,
  planId: string,
  file: Blob,
  extension: string
): Promise<string> {
  const supabase = createClient();
  // O nome carrega um sufixo aleatório para que a troca de ícone não caia em
  // cache do browser com a URL antiga.
  const objectPath = `${userId}/${planId}-${crypto
    .randomUUID()
    .slice(0, 8)}.${extension}`;

  const { error } = await supabase.storage
    .from(ICON_BUCKET)
    .upload(objectPath, file, {
      contentType: file.type || `image/${extension}`,
      upsert: false,
    });

  if (error) {
    throw new Error(error.message || 'Falha ao enviar a imagem do plano.');
  }

  return objectPath;
}

async function removeIcon(path: string | null | undefined): Promise<void> {
  if (!path) return;
  const supabase = createClient();
  const { error } = await supabase.storage.from(ICON_BUCKET).remove([path]);
  if (error) {
    // Um objeto órfão custa alguns KB; travar a operação por causa dele custa
    // mais. Fica registrado no console.
    console.error(`Falha ao remover o ícone ${path}:`, error);
  }
}

/**
 * Envia (ou troca) o ícone de um plano e devolve uma URL já assinada, pronta
 * para exibir. Substitui `uploadImage`, que devolvia a imagem como data: URI
 * para ser embutida no JSON do plano.
 */
export async function uploadPlanIcon(
  planId: string,
  file: File
): Promise<{ success: boolean; iconUrl?: string; error?: string }> {
  if (!file || file.size === 0) {
    return { success: false, error: 'Nenhuma imagem foi fornecida.' };
  }

  try {
    const userId = await requireUserId();
    const supabase = createClient();

    const { data: current } = await supabase
      .from('plans')
      .select('icon_path')
      .eq('id', planId)
      .maybeSingle();

    const objectPath = await putIcon(userId, planId, file, iconExtension(file));

    const { error } = await supabase
      .from('plans')
      .update({ icon_path: objectPath })
      .eq('id', planId);

    if (error) {
      await removeIcon(objectPath);
      return { success: false, error: describe(error, 'Falha ao salvar o ícone.') };
    }

    await removeIcon(current?.icon_path);

    const signed = await signIconPaths([objectPath]);
    return { success: true, iconUrl: signed.get(objectPath) };
  } catch (error: any) {
    console.error('Erro ao enviar o ícone do plano:', error);
    return { success: false, error: error.message || 'Falha ao processar a imagem.' };
  }
}

// -----------------------------------------------------------------------------
// plans
// -----------------------------------------------------------------------------

/**
 * Todos os planos do usuário, com os ícones já resolvidos.
 *
 * Substitui o par `getJsonFiles()` + um `getJsonContent()` por arquivo, que
 * custava 1+N chamadas na carga inicial.
 */
export async function getPlans(): Promise<PlanData[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('plans')
    .select(PLAN_COLUMNS)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Falha ao carregar os planos:', error);
    return [];
  }

  const rows = (data ?? []) as unknown as PlanRow[];
  const signed = await signIconPaths(rows.map((row) => row.icon_path));

  return rows.map((row) =>
    rowToPlan(row, row.icon_path ? signed.get(row.icon_path) : undefined)
  );
}

/** Um plano pelo id. Substitui `getJsonContent(fileName)`. */
export async function getPlan(planId: string): Promise<PlanData | null> {
  if (!planId) return null;

  const supabase = createClient();
  const { data, error } = await supabase
    .from('plans')
    .select(PLAN_COLUMNS)
    .eq('id', planId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error(`Falha ao carregar o plano ${planId}:`, error);
    return null;
  }

  const row = data as unknown as PlanRow;
  const signed = await signIconPaths([row.icon_path]);
  return rowToPlan(row, row.icon_path ? signed.get(row.icon_path) : undefined);
}

/** Só as colunas que o app pode alterar — `icon_path` sai por `uploadPlanIcon`. */
function planInputToRow(input: Partial<PlanInput>) {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.name = input.name.trim();
  if (input.observations !== undefined) row.observations = input.observations ?? '';
  if (input.cargo !== undefined) row.cargo = input.cargo ?? '';
  if (input.edital !== undefined) row.edital = input.edital ?? '';
  if (input.banca !== undefined) row.banca = input.banca ?? '';
  if (input.subjects !== undefined) row.subjects = input.subjects ?? [];
  if (input.bancaTopicWeights !== undefined) {
    row.banca_topic_weights = input.bancaTopicWeights ?? {};
  }
  return row;
}

/**
 * Cria um plano. Substitui `createPlanFile(formData)`, que derivava o nome do
 * arquivo do nome do plano; agora o id é um uuid e o nome é só um rótulo (único
 * por usuário, como antes, por causa da constraint `plans_user_name_unique`).
 *
 * O ícone sobe *antes* do insert para que um upload que falha não deixe um
 * plano criado pela metade — a v1 também não criava o arquivo nesse caso.
 */
export async function createPlan(
  input: PlanInput & { iconFile?: File | null }
): Promise<{ success: boolean; planId?: string; error?: string }> {
  const name = (input.name ?? '').trim();
  if (!name) {
    return { success: false, error: 'O nome do plano não pode estar vazio.' };
  }

  try {
    const userId = await requireUserId();
    const supabase = createClient();
    const planId = crypto.randomUUID();

    let iconPath: string | null = null;
    if (input.iconFile && input.iconFile.size > 0) {
      iconPath = await putIcon(
        userId,
        planId,
        input.iconFile,
        iconExtension(input.iconFile)
      );
    }

    const { error } = await supabase.from('plans').insert({
      id: planId,
      user_id: userId,
      name,
      observations: input.observations ?? '',
      cargo: input.cargo ?? '',
      edital: input.edital ?? '',
      banca: input.banca ?? '',
      icon_path: iconPath,
      subjects: input.subjects ?? [],
      banca_topic_weights: input.bancaTopicWeights ?? {},
    });

    if (error) {
      await removeIcon(iconPath);
      return { success: false, error: describe(error, 'Falha ao criar o plano.') };
    }

    return { success: true, planId };
  } catch (error: any) {
    console.error('Erro ao criar o plano:', error);
    return { success: false, error: error.message || 'Falha ao criar o plano.' };
  }
}

/**
 * Atualiza os campos informados de um plano. Substitui `updatePlanFile`, que
 * fazia merge do objeto inteiro; aqui o merge é por coluna, e passar o plano
 * completo (como a tela de detalhes faz) continua funcionando.
 */
export async function updatePlan(
  planId: string,
  updates: Partial<PlanInput>
): Promise<MutationResult> {
  if (!planId) return { success: false, error: 'Plano não informado.' };

  const row = planInputToRow(updates);
  if (Object.keys(row).length === 0) return { success: true };

  const supabase = createClient();
  const { error } = await supabase.from('plans').update(row).eq('id', planId);

  if (error) {
    console.error(`Falha ao atualizar o plano ${planId}:`, error);
    return { success: false, error: describe(error, 'Falha ao atualizar o plano.') };
  }

  return { success: true };
}

/**
 * Apaga um plano. Os registros, revisões, simulados e o ciclo somem por
 * `on delete cascade` — na v1 isso era `unlink` de dois arquivos e uma limpeza
 * manual das revisões órfãs.
 */
export async function deletePlan(planId: string): Promise<MutationResult> {
  if (!planId) return { success: false, error: 'Plano não informado.' };

  const supabase = createClient();

  const { data: current } = await supabase
    .from('plans')
    .select('icon_path')
    .eq('id', planId)
    .maybeSingle();

  const { error } = await supabase.from('plans').delete().eq('id', planId);

  if (error) {
    console.error(`Falha ao excluir o plano ${planId}:`, error);
    return { success: false, error: describe(error, 'Falha ao excluir o plano.') };
  }

  await removeIcon(current?.icon_path);
  return { success: true };
}

// -----------------------------------------------------------------------------
// study_records
// -----------------------------------------------------------------------------

export async function getStudyRecords(planId: string): Promise<StudyRecord[]> {
  if (!planId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('study_records')
    .select('*')
    .eq('plan_id', planId)
    .order('date', { ascending: true });

  if (error) {
    console.error('Falha ao carregar os registros de estudo:', error);
    return [];
  }

  return (data ?? []).map(rowToStudyRecord);
}

/** Insere ou substitui um registro de estudo, pela chave `id`. */
export async function saveStudyRecord(
  planId: string,
  record: StudyRecord
): Promise<void> {
  const userId = await requireUserId();
  const supabase = createClient();

  const { error } = await supabase
    .from('study_records')
    .upsert(studyRecordToRow(record, userId, planId));

  if (error) {
    console.error('Falha ao salvar o registro de estudo:', error);
    throw new Error(describe(error, 'Falha ao salvar o registro de estudo.'));
  }
}

/**
 * Apaga um registro de estudo. As revisões dele vão junto por
 * `review_records.study_record_id ... on delete cascade`; a v1 filtrava o array
 * de revisões à mão.
 */
export async function deleteStudyRecord(
  planId: string,
  recordId: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('study_records')
    .delete()
    .eq('id', recordId);

  if (error) {
    console.error('Falha ao excluir o registro de estudo:', error);
    throw new Error(describe(error, 'Falha ao excluir o registro de estudo.'));
  }
}

// -----------------------------------------------------------------------------
// review_records
// -----------------------------------------------------------------------------

export async function getReviewRecords(planId: string): Promise<ReviewRecord[]> {
  if (!planId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('review_records')
    .select('*')
    .eq('plan_id', planId)
    .order('scheduled_date', { ascending: true });

  if (error) {
    console.error('Falha ao carregar as revisões:', error);
    return [];
  }

  return (data ?? []).map(rowToReviewRecord);
}

export async function saveReviewRecord(
  planId: string,
  record: ReviewRecord
): Promise<void> {
  const userId = await requireUserId();
  const supabase = createClient();

  const { error } = await supabase
    .from('review_records')
    .upsert(reviewRecordToRow(record, userId, planId));

  if (error) {
    console.error('Falha ao salvar a revisão:', error);
    throw new Error(describe(error, 'Falha ao salvar a revisão.'));
  }
}

export async function saveReviewRecords(
  planId: string,
  records: ReviewRecord[]
): Promise<void> {
  if (records.length === 0) return;

  const userId = await requireUserId();
  const supabase = createClient();

  const { error } = await supabase
    .from('review_records')
    .upsert(records.map((record) => reviewRecordToRow(record, userId, planId)));

  if (error) {
    console.error('Falha ao salvar as revisões:', error);
    throw new Error(describe(error, 'Falha ao salvar as revisões.'));
  }
}

/**
 * Remove as revisões de um registro de estudo.
 *
 * Necessário porque os IDs agora são uuid. Na v1 o id da revisão era
 * `${studyRecordId}-${period}`, então reeditar um registro sobrescrevia as
 * revisões dos mesmos períodos (e vazava as dos períodos removidos). Sem esse
 * determinismo, reeditar duplicaria tudo: o chamador apaga e regrava.
 */
export async function deleteReviewRecordsForStudyRecord(
  studyRecordId: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('review_records')
    .delete()
    .eq('study_record_id', studyRecordId);

  if (error) {
    console.error('Falha ao limpar as revisões do registro:', error);
    throw new Error(describe(error, 'Falha ao limpar as revisões do registro.'));
  }
}

// -----------------------------------------------------------------------------
// simulado_records
// -----------------------------------------------------------------------------

export async function getSimuladoRecords(
  planId: string
): Promise<SimuladoRecord[]> {
  if (!planId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('simulado_records')
    .select('*, simulado_subjects(*)')
    .eq('plan_id', planId)
    .order('date', { ascending: true });

  if (error) {
    console.error('Falha ao carregar os simulados:', error);
    return [];
  }

  return (data ?? []).map(rowToSimuladoRecord);
}

/**
 * Insere ou substitui um simulado e a lista de matérias dele.
 *
 * As matérias são reescritas por inteiro (delete + insert) em vez de
 * comparadas linha a linha: o formulário devolve a lista completa, e a ordem
 * das linhas é parte do dado.
 */
export async function saveSimuladoRecord(
  planId: string,
  record: SimuladoRecord
): Promise<void> {
  const userId = await requireUserId();
  const supabase = createClient();

  const { error: recordError } = await supabase
    .from('simulado_records')
    .upsert(simuladoRecordToRow(record, userId, planId));

  if (recordError) {
    console.error('Falha ao salvar o simulado:', recordError);
    throw new Error(describe(recordError, 'Falha ao salvar o simulado.'));
  }

  const { error: clearError } = await supabase
    .from('simulado_subjects')
    .delete()
    .eq('simulado_record_id', record.id);

  if (clearError) {
    console.error('Falha ao limpar as matérias do simulado:', clearError);
    throw new Error(describe(clearError, 'Falha ao salvar as matérias do simulado.'));
  }

  const subjectRows = simuladoSubjectsToRows(record, record.id);
  if (subjectRows.length === 0) return;

  const { error: subjectsError } = await supabase
    .from('simulado_subjects')
    .insert(subjectRows);

  if (subjectsError) {
    console.error('Falha ao salvar as matérias do simulado:', subjectsError);
    throw new Error(describe(subjectsError, 'Falha ao salvar as matérias do simulado.'));
  }
}

export async function deleteSimuladoRecord(
  planId: string,
  recordId: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('simulado_records')
    .delete()
    .eq('id', recordId);

  if (error) {
    console.error('Falha ao excluir o simulado:', error);
    throw new Error(describe(error, 'Falha ao excluir o simulado.'));
  }
}

// -----------------------------------------------------------------------------
// study_cycles
// -----------------------------------------------------------------------------

export async function getStudyCycle(
  planId: string
): Promise<StudyCycleData | null> {
  if (!planId) return null;

  const supabase = createClient();
  const { data, error } = await supabase
    .from('study_cycles')
    .select('*')
    .eq('plan_id', planId)
    .maybeSingle();

  if (error) {
    console.error('Falha ao carregar o ciclo de estudos:', error);
    return null;
  }

  return data ? rowToStudyCycle(data) : null;
}

/** Um ciclo por plano: o upsert vai pela unique de `plan_id`. */
export async function saveStudyCycle(
  planId: string,
  data: StudyCycleData
): Promise<MutationResult> {
  if (!planId) return { success: false, error: 'Plano não informado.' };

  try {
    const userId = await requireUserId();
    const supabase = createClient();

    const { error } = await supabase
      .from('study_cycles')
      .upsert(studyCycleToRow(data, userId, planId), {
        onConflict: 'plan_id',
      });

    if (error) {
      console.error('Falha ao salvar o ciclo de estudos:', error);
      return {
        success: false,
        error: describe(error, 'Falha ao salvar o ciclo de estudos.'),
      };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Falha ao salvar o ciclo.' };
  }
}

export async function deleteStudyCycle(planId: string): Promise<MutationResult> {
  if (!planId) return { success: false, error: 'Plano não informado.' };

  const supabase = createClient();
  const { error } = await supabase
    .from('study_cycles')
    .delete()
    .eq('plan_id', planId);

  if (error) {
    console.error('Falha ao excluir o ciclo de estudos:', error);
    return {
      success: false,
      error: describe(error, 'Falha ao excluir o ciclo de estudos.'),
    };
  }

  return { success: true };
}

// -----------------------------------------------------------------------------
// Matérias e pesos — operam sobre o JSONB `plans.subjects`
//
// Leitura, alteração em memória e escrita de volta, como a v1 fazia com o
// arquivo. Não há transação: é um app de um usuário só por conta, e duas abas
// editando o mesmo edital no mesmo instante é um cenário que a v1 também
// perdia.
// -----------------------------------------------------------------------------

async function loadSubjects(
  planId: string
): Promise<{ subjects: EditalSubject[] } | { error: string }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('plans')
    .select('subjects')
    .eq('id', planId)
    .maybeSingle();

  if (error || !data) {
    return { error: describe(error, 'Plano não encontrado.') };
  }

  return { subjects: Array.isArray(data.subjects) ? data.subjects : [] };
}

async function writeSubjects(
  planId: string,
  subjects: EditalSubject[]
): Promise<MutationResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from('plans')
    .update({ subjects })
    .eq('id', planId);

  if (error) {
    return { success: false, error: describe(error, 'Falha ao salvar as matérias.') };
  }

  return { success: true };
}

/**
 * Renomeia uma matéria e propaga o novo nome para tudo que guarda uma cópia
 * dele para exibição: registros, revisões, as linhas dos simulados e as sessões
 * do ciclo.
 *
 * Registros e revisões casam por `subject_id`, que é estável. As linhas de
 * simulado casam por nome, porque é só o nome que elas guardam.
 */
export async function renameSubject(
  planId: string,
  subjectId: string,
  newSubjectName: string
): Promise<{ success: boolean; error?: string; oldSubjectName?: string }> {
  if (!planId || !subjectId || !newSubjectName) {
    return { success: false, error: 'Parâmetros inválidos para renomear matéria.' };
  }

  const loaded = await loadSubjects(planId);
  if ('error' in loaded) return { success: false, error: loaded.error };

  const target = loaded.subjects.find((s) => s.id === subjectId);
  if (!target) {
    return { success: false, error: `Matéria com ID '${subjectId}' não encontrada.` };
  }
  const oldSubjectName = target.subject;

  const written = await writeSubjects(
    planId,
    loaded.subjects.map((s) =>
      s.id === subjectId ? { ...s, subject: newSubjectName } : s
    )
  );
  if (!written.success) return written;

  const supabase = createClient();

  const propagations = await Promise.all([
    supabase
      .from('study_records')
      .update({ subject: newSubjectName })
      .eq('plan_id', planId)
      .eq('subject_id', subjectId),
    supabase
      .from('review_records')
      .update({ subject: newSubjectName })
      .eq('plan_id', planId)
      .eq('subject_id', subjectId),
  ]);

  const failed = propagations.find((result) => result.error);
  if (failed) {
    console.error('Falha ao propagar o novo nome da matéria:', failed.error);
    return {
      success: false,
      error: describe(failed.error, 'Falha ao propagar o novo nome da matéria.'),
    };
  }

  // As matérias do simulado não guardam o ID, só o nome — a atualização precisa
  // ir por ele, e restrita aos simulados deste plano.
  const { data: simuladoIds } = await supabase
    .from('simulado_records')
    .select('id')
    .eq('plan_id', planId);

  const ids = (simuladoIds ?? []).map((row: { id: string }) => row.id);
  if (ids.length > 0) {
    const { error: subjectsError } = await supabase
      .from('simulado_subjects')
      .update({ subject_name: newSubjectName })
      .eq('subject_name', oldSubjectName)
      .in('simulado_record_id', ids);

    if (subjectsError) {
      console.error(
        'Falha ao renomear a matéria nas linhas de simulado:',
        subjectsError
      );
    }
  }

  // O ciclo guarda o nome dentro do JSONB das sessões.
  const cycle = await getStudyCycle(planId);
  if (cycle?.studyCycle) {
    const updatedCycle = cycle.studyCycle.map((session: any) =>
      session.subjectId === subjectId
        ? { ...session, subject: newSubjectName }
        : session
    );
    await saveStudyCycle(planId, { ...cycle, studyCycle: updatedCycle });
  }

  return { success: true, oldSubjectName };
}

/** Cria ou atualiza uma matéria do edital. Gera o ID quando é criação. */
export async function addOrUpdateSubject(
  planId: string,
  subjectData: { id?: string; subject: string; topics: EditalTopic[]; color: string }
): Promise<{ success: boolean; error?: string; subjectId?: string }> {
  if (!planId || !subjectData || !subjectData.subject) {
    return { success: false, error: 'Parâmetros inválidos.' };
  }

  const loaded = await loadSubjects(planId);
  if ('error' in loaded) return { success: false, error: loaded.error };

  const existingIndex = subjectData.id
    ? loaded.subjects.findIndex((s) => s.id === subjectData.id)
    : -1;

  let subjectId: string;
  let subjects: EditalSubject[];

  if (existingIndex !== -1) {
    subjectId = subjectData.id as string;
    subjects = loaded.subjects.map((s, index) =>
      index === existingIndex ? { ...s, ...subjectData, id: subjectId } : s
    );
  } else {
    subjectId = crypto.randomUUID();
    subjects = [
      ...loaded.subjects,
      {
        id: subjectId,
        subject: subjectData.subject,
        color: subjectData.color,
        topics: subjectData.topics,
      },
    ];
  }

  const written = await writeSubjects(planId, subjects);
  if (!written.success) return written;

  return { success: true, subjectId };
}

function applyWeights(
  topics: EditalTopic[],
  weights: { [topicText: string]: number }
): void {
  topics.forEach((topic) => {
    if (weights[topic.topic_text] !== undefined) {
      topic.userWeight = weights[topic.topic_text];
    }
    if (topic.sub_topics) applyWeights(topic.sub_topics, weights);
  });
}

export async function updateTopicWeight(
  planId: string,
  subjectId: string,
  topicText: string,
  newWeight: number
): Promise<MutationResult> {
  if (!planId || !subjectId || !topicText || newWeight === undefined) {
    return { success: false, error: 'Parâmetros inválidos.' };
  }

  const loaded = await loadSubjects(planId);
  if ('error' in loaded) return { success: false, error: loaded.error };

  const subject = loaded.subjects.find((s) => s.id === subjectId);
  if (!subject) {
    return { success: false, error: `Matéria com ID '${subjectId}' não encontrada.` };
  }

  const findAndApply = (topics: EditalTopic[]): boolean => {
    for (const topic of topics) {
      if (topic.topic_text === topicText) {
        topic.userWeight = newWeight;
        return true;
      }
      if (topic.sub_topics && findAndApply(topic.sub_topics)) return true;
    }
    return false;
  };

  if (!findAndApply(subject.topics)) {
    return {
      success: false,
      error: `Tópico '${topicText}' não encontrado na matéria com ID '${subjectId}'.`,
    };
  }

  return writeSubjects(planId, loaded.subjects);
}

export async function updateAllTopicWeights(
  planId: string,
  weightMap: { [subjectId: string]: { [topicText: string]: number } }
): Promise<MutationResult> {
  if (!planId || !weightMap) {
    return { success: false, error: 'Parâmetros inválidos.' };
  }

  const loaded = await loadSubjects(planId);
  if ('error' in loaded) return { success: false, error: loaded.error };

  Object.keys(weightMap).forEach((subjectId) => {
    const subject = loaded.subjects.find((s) => s.id === subjectId);
    if (subject) applyWeights(subject.topics, weightMap[subjectId]);
  });

  return writeSubjects(planId, loaded.subjects);
}

// -----------------------------------------------------------------------------
// Conta inteira — apagar tudo, exportar, restaurar
// -----------------------------------------------------------------------------

/**
 * Apaga todos os dados do usuário. Um `delete` em `plans` derruba registros,
 * revisões, simulados e ciclos por cascade; os ícones saem do bucket à parte,
 * porque o Storage não participa do cascade do Postgres.
 */
export async function clearAllData(): Promise<MutationResult> {
  try {
    const userId = await requireUserId();
    const supabase = createClient();

    const { data: plans } = await supabase.from('plans').select('id, icon_path');

    const { error } = await supabase.from('plans').delete().eq('user_id', userId);

    if (error) {
      console.error('Falha ao apagar todos os dados:', error);
      return { success: false, error: describe(error, 'Falha ao apagar os dados.') };
    }

    const iconPaths = (plans ?? [])
      .map((plan: { icon_path: string | null }) => plan.icon_path)
      .filter((path): path is string => !!path);

    if (iconPaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from(ICON_BUCKET)
        .remove(iconPaths);
      if (storageError) {
        console.error('Falha ao remover os ícones dos planos:', storageError);
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('Erro ao apagar todos os dados:', error);
    return { success: false, error: error.message || 'Falha ao apagar os dados.' };
  }
}

function slugify(text: string): string {
  return (text || 'plano')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}

/**
 * Backup completo da conta.
 *
 * O formato repete o da v1 — `plans: [{ fileName, content }]` com os registros
 * dentro do plano, e `cycles` à parte — para que backups antigos e novos entrem
 * pelo mesmo caminho na restauração. O `fileName` já não identifica nada: fica
 * como rótulo, derivado do nome do plano.
 */
export async function exportAllData(): Promise<BackupData> {
  const plans = await getPlans();

  const planEntries = [];
  const cycleEntries = [];

  for (const plan of plans) {
    const [records, reviewRecords, simuladoRecords, cycle] = await Promise.all([
      getStudyRecords(plan.id),
      getReviewRecords(plan.id),
      getSimuladoRecords(plan.id),
      getStudyCycle(plan.id),
    ]);

    const slug = slugify(plan.name);

    planEntries.push({
      fileName: `${slug}.json`,
      content: {
        name: plan.name,
        observations: plan.observations,
        cargo: plan.cargo,
        edital: plan.edital,
        banca: plan.banca,
        subjects: plan.subjects,
        bancaTopicWeights: plan.bancaTopicWeights,
        records,
        reviewRecords,
        simuladoRecords,
      },
    });

    if (cycle) {
      cycleEntries.push({
        fileName: `${slug}.cycle.json`,
        planName: plan.name,
        content: cycle,
      });
    }
  }

  return { version: 4, plans: planEntries, cycles: cycleEntries };
}

/** O que a Fase 3 exporta e a v1 exportava têm o mesmo esqueleto aqui. */
function backupPlanName(entry: { fileName?: string; content: any }): string {
  const fromContent = entry.content?.name;
  if (typeof fromContent === 'string' && fromContent.trim()) {
    return fromContent.trim();
  }
  return (entry.fileName || 'Plano importado').replace(/\.json$/i, '');
}

/**
 * Restaura um backup, substituindo tudo o que existe na conta.
 *
 * Aceita o formato da v1, em que o conteúdo do plano podia ser um array puro de
 * matérias e as matérias podiam não ter ID. A tolerância completa ao formato
 * antigo (incluindo backups sem `subjectId` nos registros) é assunto da Fase 4;
 * o que está aqui é o suficiente para o app não regredir.
 */
export async function restoreBackup(
  backupData: BackupData
): Promise<MutationResult> {
  if (!backupData?.plans || !Array.isArray(backupData.plans)) {
    return {
      success: false,
      error: "O backup está faltando a lista de 'planos' ou ela é inválida.",
    };
  }

  const cleared = await clearAllData();
  if (!cleared.success) return cleared;

  try {
    const userId = await requireUserId();
    const supabase = createClient();

    const cyclesBySlug = new Map<string, any>();
    (backupData.cycles ?? []).forEach((entry) => {
      const key = slugify(
        entry.planName || (entry.fileName || '').replace(/\.cycle\.json$/i, '')
      );
      cyclesBySlug.set(key, entry.content);
    });

    for (const entry of backupData.plans) {
      const raw = entry.content;
      // A v1 tinha planos gravados como array puro de matérias.
      const content = Array.isArray(raw) ? { subjects: raw } : raw ?? {};
      const name = backupPlanName(entry);

      const subjects = (Array.isArray(content.subjects) ? content.subjects : []).map(
        (subject: any) => ({
          ...subject,
          id: subject?.id || crypto.randomUUID(),
        })
      );

      const created = await createPlan({
        name,
        observations: content.observations ?? '',
        cargo: content.cargo ?? '',
        edital: content.edital ?? '',
        banca: content.banca ?? '',
        subjects,
        bancaTopicWeights: content.bancaTopicWeights ?? {},
      });

      if (!created.success || !created.planId) {
        throw new Error(created.error || `Falha ao restaurar o plano "${name}".`);
      }
      const planId = created.planId;

      // Os IDs do backup podem não ser uuid (a v1 usava `Date.now()-random`).
      // Regravar exige remapear, mantendo o vínculo revisão → registro.
      const studyIdMap = new Map<string, string>();
      const studyRows = (content.records ?? []).map((record: any) => {
        const newId = crypto.randomUUID();
        studyIdMap.set(record.id, newId);
        return studyRecordToRow({ ...record, id: newId }, userId, planId);
      });

      if (studyRows.length > 0) {
        const { error } = await supabase.from('study_records').insert(studyRows);
        if (error) throw new Error(describe(error, 'Falha ao restaurar os registros.'));
      }

      const reviewRows = (content.reviewRecords ?? [])
        .filter((review: any) => studyIdMap.has(review.studyRecordId))
        .map((review: any) =>
          reviewRecordToRow(
            {
              ...review,
              id: crypto.randomUUID(),
              studyRecordId: studyIdMap.get(review.studyRecordId) as string,
            },
            userId,
            planId
          )
        );

      if (reviewRows.length > 0) {
        const { error } = await supabase.from('review_records').insert(reviewRows);
        if (error) throw new Error(describe(error, 'Falha ao restaurar as revisões.'));
      }

      for (const simulado of content.simuladoRecords ?? []) {
        await saveSimuladoRecord(planId, {
          ...simulado,
          id: crypto.randomUUID(),
          // A v1 gravava a matéria do simulado como `subjectName` em alguns
          // pontos e `name` em outros.
          subjects: (simulado.subjects ?? []).map((subject: any) => ({
            ...subject,
            name: subject.name ?? subject.subjectName ?? '',
          })),
        });
      }

      const cycleContent = cyclesBySlug.get(slugify(name));
      if (cycleContent) {
        const studyCycle = Array.isArray(cycleContent.studyCycle)
          ? cycleContent.studyCycle
          : cycleContent.studyCycle
          ? [
              ...(cycleContent.studyCycle.groupA ?? []),
              ...(cycleContent.studyCycle.groupB ?? []),
            ]
          : null;

        await saveStudyCycle(planId, {
          studyCycle,
          studyHours: String(cycleContent.studyHours ?? '0'),
          weeklyQuestionsGoal: String(cycleContent.weeklyQuestionsGoal ?? '0'),
          currentProgressMinutes: cycleContent.currentProgressMinutes ?? 0,
          sessionProgressMap: cycleContent.sessionProgressMap ?? {},
          reminderNotes: cycleContent.reminderNotes ?? [],
          studyDays: cycleContent.studyDays ?? [],
          completedCycles: cycleContent.completedCycles ?? 0,
          cycleGenerationTimestamp: cycleContent.cycleGenerationTimestamp ?? null,
        });
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('Erro durante a restauração do backup:', error);
    return { success: false, error: error.message || 'Falha ao restaurar o backup.' };
  }
}
