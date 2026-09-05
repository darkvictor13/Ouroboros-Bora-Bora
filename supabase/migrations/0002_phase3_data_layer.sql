-- =============================================================================
-- Ouroboros v2 — ajustes de schema exigidos pela Fase 3
--
-- A Fase 1 desenhou o schema a partir do TODO, não a partir do runtime. Ao
-- migrar as ~29 actions, três campos que o app grava desde a v1 apareceram sem
-- coluna, e o formato de `icon_url` mudou de data: URI para Storage.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- plans.banca
--
-- O importador de guia (`/api/import-guide`) extrai a banca do cabeçalho do TEC
-- e o CreatePlanModal tem campo para ela. A v1 gravava no JSON do plano; o
-- schema inicial não previu a coluna e `/planos` exibe o valor.
-- -----------------------------------------------------------------------------

alter table public.plans
  add column banca text not null default '';

-- -----------------------------------------------------------------------------
-- plans.icon_path — o ícone sai do JSON e vai para o Storage
--
-- A v1 embutia a imagem como data: URI dentro do plano. Como o plano é lido
-- inteiro a cada carga da SPA, uma logo de 200 KB viajava em cada leitura. A
-- coluna passa a guardar o caminho do objeto no bucket privado `plan-icons`, e
-- a camada de dados troca esse caminho por uma URL assinada na leitura.
-- -----------------------------------------------------------------------------

alter table public.plans
  rename column icon_url to icon_path;

comment on column public.plans.icon_path is
  'Caminho do objeto no bucket `plan-icons`, no formato `<user_id>/<plan_id>.<ext>`. Nulo quando o plano não tem ícone.';

-- -----------------------------------------------------------------------------
-- study_cycles: os dois campos de progresso que o DataContext já persistia
--
-- `saveStudyCycleToFile` gravava o objeto inteiro do ciclo, e o loader lia
-- `completedCycles` e `cycleGenerationTimestamp` de volta. Sem coluna, o
-- contador de ciclos concluídos zeraria a cada recarga e o filtro de "registros
-- feitos depois da geração do ciclo" perderia a referência.
-- -----------------------------------------------------------------------------

alter table public.study_cycles
  add column completed_cycles integer not null default 0,
  add column cycle_generation_timestamp bigint;

comment on column public.study_cycles.cycle_generation_timestamp is
  'Epoch em milissegundos (Date.now()) de quando o ciclo foi gerado. Delimita quais registros de estudo contam para o progresso do ciclo atual.';

alter table public.study_cycles
  add constraint study_cycles_completed_cycles_non_negative
    check (completed_cycles >= 0);

-- -----------------------------------------------------------------------------
-- simulado_subjects: a matéria do simulado é identificada por nome
--
-- O schema inicial reservou `id uuid` supondo que o app mandasse o ID da
-- matéria do plano. Não manda: o AddSimuladoModal monta cada linha como
-- `{ name, weight, totalQuestions, correct, incorrect, color }`, sem ID. O
-- vínculo com o plano é o nome, e é por nome que o rename de matéria propaga.
-- `id` continua existindo como chave da linha, gerada pelo banco.
-- -----------------------------------------------------------------------------

create index simulado_subjects_name_idx
  on public.simulado_subjects (subject_name);

-- =============================================================================
-- Storage — bucket `plan-icons`
--
-- Privado: o `select` também passa pela política, então a URL pública não
-- resolve e a leitura acontece com o JWT do usuário (ou por URL assinada, que é
-- o que a camada de dados emite). O primeiro segmento do caminho é o
-- `auth.uid()`, e é ele que a política compara.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'plan-icons',
  'plan-icons',
  false,
  2097152, -- 2 MB: é uma logo de concurso, não um upload de mídia
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do nothing;

create policy "plan-icons: usuário lê os próprios ícones"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'plan-icons'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "plan-icons: usuário envia os próprios ícones"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'plan-icons'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "plan-icons: usuário substitui os próprios ícones"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'plan-icons'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'plan-icons'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "plan-icons: usuário apaga os próprios ícones"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'plan-icons'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
