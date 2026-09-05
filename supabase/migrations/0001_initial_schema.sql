-- =============================================================================
-- Ouroboros v2 — schema inicial
--
-- Substitui o armazenamento em arquivos (DATA_DIR/<userId>/*.json) por Postgres.
-- Toda tabela nasce com RLS habilitada e quatro políticas no padrão
-- `auth.uid() = user_id`. O app v2 é uma SPA estática que fala direto com o
-- PostgREST usando a anon key, então a RLS é a única camada de segurança dos
-- dados — não há servidor de aplicação para checar autorização.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Utilitários
-- -----------------------------------------------------------------------------

-- Mantém `updated_at` sem depender do cliente, que é código não confiável aqui.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles — substitui data/users.json
-- -----------------------------------------------------------------------------

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_length check (char_length(username) between 3 and 50)
);

comment on table public.profiles is
  'Dados públicos do usuário. O e-mail e a senha vivem em auth.users; o username, que é como o app v1 identificava a pessoa, vive aqui.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- O Supabase Auth exige e-mail, mas o app usa username. O cadastro manda o
-- username em `options.data`, e o trigger o copia para `profiles`.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- plans — substitui os arquivos <plano>.json
--
-- A árvore `subjects → topics → sub_topics` é recursiva e o app sempre a lê e
-- grava inteira (o editor de edital manipula o nó raiz). Normalizar custaria uma
-- CTE recursiva em cada leitura sem nenhum ganho de consulta: fica JSONB.
-- -----------------------------------------------------------------------------

create table public.plans (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  name                text not null,
  observations        text not null default '',
  cargo               text not null default '',
  edital              text not null default '',
  icon_url            text,
  subjects            jsonb not null default '[]'::jsonb,
  banca_topic_weights jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint plans_name_not_blank check (btrim(name) <> ''),
  constraint plans_subjects_is_array check (jsonb_typeof(subjects) = 'array'),
  constraint plans_weights_is_object check (jsonb_typeof(banca_topic_weights) = 'object'),
  -- A v1 derivava o nome do arquivo do nome do plano, o que já os tornava
  -- únicos por usuário. Preservar isso mantém as mensagens de erro do app.
  constraint plans_user_name_unique unique (user_id, name)
);

comment on column public.plans.icon_url is
  'URL do ícone no Supabase Storage. Na v1 isso era um data: URI base64 embutido no JSON — ver Fase 3.';

create index plans_user_id_idx on public.plans (user_id);

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- study_records — volume alto, filtrado por data e matéria: relacional
-- -----------------------------------------------------------------------------

create table public.study_records (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  plan_id           uuid not null references public.plans (id) on delete cascade,
  date              date not null,
  subject_id        text not null,
  subject           text not null default '',
  topic             text not null default '',
  study_time        integer not null default 0,
  questions         jsonb not null default '{"correct": 0, "total": 0}'::jsonb,
  pages             jsonb not null default '[]'::jsonb,
  videos            jsonb not null default '[]'::jsonb,
  notes             text not null default '',
  category          text not null default '',
  review_periods    text[] not null default '{}',
  teoria_finalizada boolean not null default false,
  count_in_planning boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint study_records_study_time_non_negative check (study_time >= 0),
  constraint study_records_pages_is_array check (jsonb_typeof(pages) = 'array'),
  constraint study_records_videos_is_array check (jsonb_typeof(videos) = 'array'),
  constraint study_records_questions_is_object check (jsonb_typeof(questions) = 'object')
);

comment on column public.study_records.study_time is 'Duração em segundos.';
comment on column public.study_records.subject_id is
  'ID da matéria dentro de plans.subjects. É texto, não FK, porque a árvore de matérias é JSONB.';
comment on column public.study_records.subject is
  'Nome da matéria, desnormalizado para exibição — a v1 já carregava os dois campos.';

create index study_records_user_plan_idx on public.study_records (user_id, plan_id);
create index study_records_plan_date_idx on public.study_records (plan_id, date);
create index study_records_plan_subject_idx on public.study_records (plan_id, subject_id);

create trigger study_records_set_updated_at
  before update on public.study_records
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- review_records
--
-- ON DELETE CASCADE em study_record_id reproduz o que deleteStudyRecordAction
-- fazia à mão na v1: apagar um registro de estudo apaga as revisões dele.
-- -----------------------------------------------------------------------------

create table public.review_records (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  plan_id          uuid not null references public.plans (id) on delete cascade,
  study_record_id  uuid not null references public.study_records (id) on delete cascade,
  scheduled_date   date not null,
  status           text not null default 'pending',
  original_date    date not null,
  subject_id       text not null,
  subject          text not null default '',
  topic            text not null default '',
  review_period    text not null,
  completed_date   date,
  ignored          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint review_records_status_valid check (status in ('pending', 'completed', 'skipped'))
);

create index review_records_user_plan_idx on public.review_records (user_id, plan_id);
create index review_records_plan_scheduled_idx on public.review_records (plan_id, scheduled_date);
create index review_records_study_record_idx on public.review_records (study_record_id);

create trigger review_records_set_updated_at
  before update on public.review_records
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- simulado_records + simulado_subjects
-- -----------------------------------------------------------------------------

create table public.simulado_records (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  plan_id    uuid not null references public.plans (id) on delete cascade,
  date       date not null,
  name       text not null default '',
  style      text not null default '',
  banca      text not null default '',
  time_spent text not null default '00:00:00',
  comments   text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.simulado_records.time_spent is 'Duração no formato HH:MM:SS, como a v1 gravava.';

create index simulado_records_user_plan_idx on public.simulado_records (user_id, plan_id);
create index simulado_records_plan_date_idx on public.simulado_records (plan_id, date);

create trigger simulado_records_set_updated_at
  before update on public.simulado_records
  for each row execute function public.set_updated_at();

create table public.simulado_subjects (
  id                  uuid primary key default gen_random_uuid(),
  simulado_record_id  uuid not null references public.simulado_records (id) on delete cascade,
  subject_name        text not null default '',
  weight              numeric not null default 1,
  total_questions     integer not null default 0,
  correct             integer not null default 0,
  incorrect           integer not null default 0,
  color               text not null default '',
  position            integer not null default 0,
  constraint simulado_subjects_counts_non_negative
    check (total_questions >= 0 and correct >= 0 and incorrect >= 0)
);

comment on column public.simulado_subjects.position is
  'Ordem da matéria dentro do simulado — um array JSON preservava isso de graça, uma tabela filha não.';

create index simulado_subjects_record_idx on public.simulado_subjects (simulado_record_id);

-- -----------------------------------------------------------------------------
-- study_cycles — substitui os arquivos <plano>.cycle.json
--
-- Um ciclo por plano, como na v1 (um arquivo .cycle.json por plano).
-- -----------------------------------------------------------------------------

create table public.study_cycles (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users (id) on delete cascade,
  plan_id                  uuid not null unique references public.plans (id) on delete cascade,
  cycle                    jsonb,
  study_hours              text not null default '0',
  weekly_questions_goal    text not null default '0',
  current_progress_minutes integer not null default 0,
  session_progress_map     jsonb not null default '{}'::jsonb,
  reminder_notes           jsonb not null default '[]'::jsonb,
  study_days               text[] not null default '{}',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint study_cycles_cycle_is_array check (cycle is null or jsonb_typeof(cycle) = 'array'),
  constraint study_cycles_progress_map_is_object check (jsonb_typeof(session_progress_map) = 'object'),
  constraint study_cycles_reminder_notes_is_array check (jsonb_typeof(reminder_notes) = 'array')
);

comment on column public.study_cycles.study_hours is
  'Texto, não número: a v1 grava a meta como string vinda de um input.';

create index study_cycles_user_id_idx on public.study_cycles (user_id);

create trigger study_cycles_set_updated_at
  before update on public.study_cycles
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Row Level Security
--
-- Habilitada em todas as tabelas, sem exceção. `(select auth.uid())` em vez de
-- `auth.uid()` para que o planner avalie a função uma vez por query, e não uma
-- vez por linha.
-- =============================================================================

alter table public.profiles          enable row level security;
alter table public.plans             enable row level security;
alter table public.study_records     enable row level security;
alter table public.review_records    enable row level security;
alter table public.simulado_records  enable row level security;
alter table public.simulado_subjects enable row level security;
alter table public.study_cycles      enable row level security;

-- Sem FORCE, o dono da tabela ignora a RLS. As Edge Functions e os workflows de
-- migration se conectam como `postgres`, então isso fecha a porta dos fundos.
alter table public.profiles          force row level security;
alter table public.plans             force row level security;
alter table public.study_records     force row level security;
alter table public.review_records    force row level security;
alter table public.simulado_records  force row level security;
alter table public.simulado_subjects force row level security;
alter table public.study_cycles      force row level security;

-- profiles: a chave é `id`, não `user_id`. Não há política de delete — o perfil
-- morre junto com a linha em auth.users, via cascade.
create policy "profiles: usuário lê o próprio perfil"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles: usuário cria o próprio perfil"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles: usuário altera o próprio perfil"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- plans
create policy "plans: usuário lê os próprios planos"
  on public.plans for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "plans: usuário cria os próprios planos"
  on public.plans for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "plans: usuário altera os próprios planos"
  on public.plans for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "plans: usuário apaga os próprios planos"
  on public.plans for delete to authenticated
  using ((select auth.uid()) = user_id);

-- study_records
create policy "study_records: usuário lê os próprios registros"
  on public.study_records for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "study_records: usuário cria os próprios registros"
  on public.study_records for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "study_records: usuário altera os próprios registros"
  on public.study_records for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "study_records: usuário apaga os próprios registros"
  on public.study_records for delete to authenticated
  using ((select auth.uid()) = user_id);

-- review_records
create policy "review_records: usuário lê as próprias revisões"
  on public.review_records for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "review_records: usuário cria as próprias revisões"
  on public.review_records for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "review_records: usuário altera as próprias revisões"
  on public.review_records for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "review_records: usuário apaga as próprias revisões"
  on public.review_records for delete to authenticated
  using ((select auth.uid()) = user_id);

-- simulado_records
create policy "simulado_records: usuário lê os próprios simulados"
  on public.simulado_records for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "simulado_records: usuário cria os próprios simulados"
  on public.simulado_records for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "simulado_records: usuário altera os próprios simulados"
  on public.simulado_records for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "simulado_records: usuário apaga os próprios simulados"
  on public.simulado_records for delete to authenticated
  using ((select auth.uid()) = user_id);

-- simulado_subjects: não tem user_id. A autorização vai por EXISTS na tabela
-- pai, que por sua vez é filtrada pela RLS de simulado_records.
create policy "simulado_subjects: usuário lê as matérias dos próprios simulados"
  on public.simulado_subjects for select to authenticated
  using (
    exists (
      select 1 from public.simulado_records r
      where r.id = simulado_subjects.simulado_record_id
        and r.user_id = (select auth.uid())
    )
  );

create policy "simulado_subjects: usuário cria as matérias dos próprios simulados"
  on public.simulado_subjects for insert to authenticated
  with check (
    exists (
      select 1 from public.simulado_records r
      where r.id = simulado_subjects.simulado_record_id
        and r.user_id = (select auth.uid())
    )
  );

create policy "simulado_subjects: usuário altera as matérias dos próprios simulados"
  on public.simulado_subjects for update to authenticated
  using (
    exists (
      select 1 from public.simulado_records r
      where r.id = simulado_subjects.simulado_record_id
        and r.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.simulado_records r
      where r.id = simulado_subjects.simulado_record_id
        and r.user_id = (select auth.uid())
    )
  );

create policy "simulado_subjects: usuário apaga as matérias dos próprios simulados"
  on public.simulado_subjects for delete to authenticated
  using (
    exists (
      select 1 from public.simulado_records r
      where r.id = simulado_subjects.simulado_record_id
        and r.user_id = (select auth.uid())
    )
  );

-- study_cycles
create policy "study_cycles: usuário lê os próprios ciclos"
  on public.study_cycles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "study_cycles: usuário cria os próprios ciclos"
  on public.study_cycles for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "study_cycles: usuário altera os próprios ciclos"
  on public.study_cycles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "study_cycles: usuário apaga os próprios ciclos"
  on public.study_cycles for delete to authenticated
  using ((select auth.uid()) = user_id);

-- =============================================================================
-- Privilégios
--
-- Nenhum dado do app é público. `anon` só precisa falar com o GoTrue (login e
-- cadastro), que vive no schema `auth` — nunca com o schema `public`.
-- =============================================================================

revoke all on schema public from anon;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- `anon` herda de PUBLIC, e funções em `public` nascem com EXECUTE para PUBLIC:
-- o REVOKE acima não alcança isso. Hoje só há funções de trigger, que o
-- PostgREST não expõe como RPC, mas a primeira função comum criada aqui ficaria
-- aberta para quem só tem a anon key. Triggers continuam disparando: o EXECUTE
-- de uma função de trigger é checado ao criar o trigger, não ao dispará-lo.
revoke execute on all functions in schema public from public;
alter default privileges in schema public revoke execute on functions from public;
