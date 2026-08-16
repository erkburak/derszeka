-- =====================================================================
-- Ders Zeka — Initial schema
-- Postgres 15 / Supabase (pgvector + pgcrypto)
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists vector;

-- ---------------------------------------------------------------------
-- ENUM types
-- ---------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('user', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type plan_type as enum ('free', 'premium');
exception when duplicate_object then null; end $$;

do $$ begin
  create type document_status as enum (
    'queued', 'extracting', 'analyzing', 'embedding', 'generating', 'completed', 'failed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type subscription_status as enum ('active', 'expired', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ai_operation as enum (
    'DOCUMENT_ANALYSIS', 'OCR', 'SUMMARY', 'TOPIC_EXTRACTION',
    'FLASHCARD_GENERATION', 'QUIZ_GENERATION', 'QUESTION_GENERATION',
    'ANSWER_EVALUATION', 'AI_TUTOR', 'STUDY_PLAN', 'GUIDED_STUDY', 'EMBEDDING'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type ai_provider as enum ('anthropic', 'openai', 'google');
exception when duplicate_object then null; end $$;

do $$ begin
  create type card_difficulty as enum ('easy', 'medium', 'hard', 'very_hard');
exception when duplicate_object then null; end $$;

do $$ begin
  create type card_result as enum ('known', 'unsure', 'unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type question_type as enum (
    'multiple_choice', 'true_false', 'fill_blank', 'matching', 'short_answer', 'open_ended'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type job_status as enum ('queued', 'processing', 'completed', 'failed', 'cancelled');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Utility: updated_at trigger
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- =====================================================================
-- 1. IDENTITY
-- =====================================================================
create table if not exists public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text,
  full_name           text,
  avatar_url          text,
  role                user_role   not null default 'user',
  plan                plan_type   not null default 'free',
  plan_expires_at     timestamptz,
  is_active           boolean     not null default true,
  -- onboarding / personalisation
  onboarding_completed boolean    not null default false,
  education_level     text,
  field_of_study      text,
  study_goal          text,
  daily_goal_minutes  integer     not null default 30,
  -- gamification
  xp                  integer     not null default 0,
  streak_count        integer     not null default 0,
  longest_streak      integer     not null default 0,
  last_study_date     date,
  -- lifecycle
  last_login_at       timestamptz,
  anonymized_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_plan_idx on public.profiles(plan);
create index if not exists profiles_created_at_idx on public.profiles(created_at desc);
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Auto-create a profile row for every new auth user
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role helper used by RLS policies
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.is_active
  );
$$;

-- =====================================================================
-- 2. BILLING (manual bank transfer)
-- =====================================================================
create table if not exists public.payment_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  full_name     text not null,
  email         text not null,
  amount        numeric(10,2) not null,
  currency      text not null default 'TRY',
  receipt_path  text,
  note          text,
  status        payment_status not null default 'pending',
  admin_note    text,
  reviewed_by   uuid references public.profiles(id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists payment_requests_user_idx on public.payment_requests(user_id);
create index if not exists payment_requests_status_idx on public.payment_requests(status, created_at desc);
drop trigger if exists payment_requests_touch on public.payment_requests;
create trigger payment_requests_touch before update on public.payment_requests
  for each row execute function public.touch_updated_at();

create table if not exists public.subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  plan               plan_type not null default 'premium',
  status             subscription_status not null default 'active',
  starts_at          timestamptz not null default now(),
  ends_at            timestamptz not null,
  source             text not null default 'bank_transfer',
  payment_request_id uuid references public.payment_requests(id) on delete set null,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on public.subscriptions(user_id, status);
create index if not exists subscriptions_ends_idx on public.subscriptions(ends_at);

-- =====================================================================
-- 3. DOCUMENTS & RAG
-- =====================================================================
create table if not exists public.documents (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null references public.profiles(id) on delete cascade,
  title                  text not null,
  original_filename      text not null,
  mime_type              text not null,
  file_size              bigint not null default 0,
  storage_path           text,
  source_kind            text not null default 'upload', -- upload | pasted_text
  status                 document_status not null default 'queued',
  progress               smallint not null default 0,
  status_message         text,
  error_message          text,
  page_count             integer not null default 0,
  char_count             integer not null default 0,
  language               text,
  extraction_method      text,
  processing_started_at  timestamptz,
  processing_completed_at timestamptz,
  deleted_at             timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists documents_owner_idx on public.documents(owner_id, created_at desc);
create index if not exists documents_status_idx on public.documents(status);
drop trigger if exists documents_touch on public.documents;
create trigger documents_touch before update on public.documents
  for each row execute function public.touch_updated_at();

create table if not exists public.document_pages (
  id                uuid primary key default gen_random_uuid(),
  document_id       uuid not null references public.documents(id) on delete cascade,
  owner_id          uuid not null references public.profiles(id) on delete cascade,
  page_number       integer not null,
  content           text not null default '',
  extraction_method text not null default 'text', -- text | vision | ocr
  created_at        timestamptz not null default now(),
  unique (document_id, page_number)
);
create index if not exists document_pages_doc_idx on public.document_pages(document_id, page_number);

create table if not exists public.document_chunks (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references public.documents(id) on delete cascade,
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  chunk_index    integer not null,
  content        text not null,
  token_estimate integer not null default 0,
  page_from      integer,
  page_to        integer,
  section_title  text,
  created_at     timestamptz not null default now(),
  unique (document_id, chunk_index)
);
create index if not exists document_chunks_doc_idx on public.document_chunks(document_id);
create index if not exists document_chunks_owner_idx on public.document_chunks(owner_id);
create index if not exists document_chunks_fts_idx
  on public.document_chunks using gin (to_tsvector('simple', content));

create table if not exists public.document_embeddings (
  id          uuid primary key default gen_random_uuid(),
  chunk_id    uuid not null references public.document_chunks(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  model       text not null,
  embedding   vector(1536) not null,
  created_at  timestamptz not null default now(),
  unique (chunk_id, model)
);
create index if not exists document_embeddings_doc_idx on public.document_embeddings(document_id);
create index if not exists document_embeddings_vec_idx
  on public.document_embeddings using hnsw (embedding vector_cosine_ops);

-- Topic hierarchy detected by the AI
create table if not exists public.topics (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  parent_id   uuid references public.topics(id) on delete cascade,
  title       text not null,
  description text,
  importance  smallint not null default 3, -- 1..5
  order_index integer not null default 0,
  page_from   integer,
  page_to     integer,
  created_at  timestamptz not null default now()
);
create index if not exists topics_doc_idx on public.topics(document_id, order_index);
create index if not exists topics_owner_idx on public.topics(owner_id);

-- =====================================================================
-- 4. STUDY MATERIAL
-- =====================================================================
create table if not exists public.study_sets (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid not null references public.documents(id) on delete cascade,
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  title            text not null,
  summary_short    text,
  summary_detailed text,
  section_summaries jsonb not null default '[]'::jsonb,
  key_points       jsonb not null default '[]'::jsonb,
  exam_critical    jsonb not null default '[]'::jsonb,
  definitions      jsonb not null default '[]'::jsonb,
  formulas         jsonb not null default '[]'::jsonb,
  dates            jsonb not null default '[]'::jsonb,
  names            jsonb not null default '[]'::jsonb,
  comparisons      jsonb not null default '[]'::jsonb,
  cause_effects    jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists study_sets_doc_idx on public.study_sets(document_id);
create index if not exists study_sets_owner_idx on public.study_sets(owner_id, created_at desc);
drop trigger if exists study_sets_touch on public.study_sets;
create trigger study_sets_touch before update on public.study_sets
  for each row execute function public.touch_updated_at();

create table if not exists public.flashcards (
  id           uuid primary key default gen_random_uuid(),
  study_set_id uuid references public.study_sets(id) on delete cascade,
  document_id  uuid not null references public.documents(id) on delete cascade,
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  topic_id     uuid references public.topics(id) on delete set null,
  front        text not null,
  back         text not null,
  hint         text,
  difficulty   card_difficulty not null default 'medium',
  source_ref   jsonb not null default '{}'::jsonb, -- {page, section, quote}
  created_at   timestamptz not null default now()
);
create index if not exists flashcards_doc_idx on public.flashcards(document_id);
create index if not exists flashcards_owner_idx on public.flashcards(owner_id, created_at desc);

-- Spaced repetition state (SM-2 variant)
create table if not exists public.flashcard_progress (
  id            uuid primary key default gen_random_uuid(),
  flashcard_id  uuid not null references public.flashcards(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  ease_factor   numeric(4,2) not null default 2.50,
  interval_days integer not null default 0,
  repetitions   integer not null default 0,
  lapses        integer not null default 0,
  review_count  integer not null default 0,
  last_result   card_result,
  last_reviewed_at timestamptz,
  due_at        timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (flashcard_id, user_id)
);
create index if not exists flashcard_progress_due_idx on public.flashcard_progress(user_id, due_at);
drop trigger if exists flashcard_progress_touch on public.flashcard_progress;
create trigger flashcard_progress_touch before update on public.flashcard_progress
  for each row execute function public.touch_updated_at();

create table if not exists public.flashcard_review_logs (
  id           uuid primary key default gen_random_uuid(),
  flashcard_id uuid not null references public.flashcards(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  result       card_result not null,
  response_ms  integer,
  reviewed_at  timestamptz not null default now()
);
create index if not exists flashcard_logs_user_idx on public.flashcard_review_logs(user_id, reviewed_at desc);

create table if not exists public.quizzes (
  id             uuid primary key default gen_random_uuid(),
  study_set_id   uuid references public.study_sets(id) on delete cascade,
  document_id    uuid not null references public.documents(id) on delete cascade,
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  topic_id       uuid references public.topics(id) on delete set null,
  title          text not null,
  mode           text not null default 'mixed', -- mixed | multiple_choice | ...
  difficulty     card_difficulty not null default 'medium',
  question_count integer not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists quizzes_doc_idx on public.quizzes(document_id);
create index if not exists quizzes_owner_idx on public.quizzes(owner_id, created_at desc);

create table if not exists public.quiz_questions (
  id             uuid primary key default gen_random_uuid(),
  quiz_id        uuid not null references public.quizzes(id) on delete cascade,
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  q_type         question_type not null,
  prompt         text not null,
  options        jsonb not null default '[]'::jsonb,
  correct_answer jsonb not null default '{}'::jsonb,
  explanation    text,
  source_ref     jsonb not null default '{}'::jsonb,
  difficulty     card_difficulty not null default 'medium',
  order_index    integer not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists quiz_questions_quiz_idx on public.quiz_questions(quiz_id, order_index);

create table if not exists public.quiz_attempts (
  id              uuid primary key default gen_random_uuid(),
  quiz_id         uuid not null references public.quizzes(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  total_questions integer not null default 0,
  correct_count   integer not null default 0,
  score           numeric(5,2) not null default 0,
  duration_seconds integer not null default 0
);
create index if not exists quiz_attempts_user_idx on public.quiz_attempts(user_id, started_at desc);
create index if not exists quiz_attempts_quiz_idx on public.quiz_attempts(quiz_id);

create table if not exists public.quiz_answers (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  user_answer jsonb not null default '{}'::jsonb,
  is_correct  boolean not null default false,
  score       numeric(5,2) not null default 0,
  ai_feedback text,
  answered_at timestamptz not null default now()
);
create index if not exists quiz_answers_attempt_idx on public.quiz_answers(attempt_id);

-- =====================================================================
-- 5. STUDY ACTIVITY & PROGRESS
-- =====================================================================
create table if not exists public.study_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  document_id      uuid references public.documents(id) on delete set null,
  topic_id         uuid references public.topics(id) on delete set null,
  mode             text not null default 'reading', -- reading | flashcard | quiz | tutor | guided
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  duration_seconds integer not null default 0,
  meta             jsonb not null default '{}'::jsonb
);
create index if not exists study_sessions_user_idx on public.study_sessions(user_id, started_at desc);

create table if not exists public.study_progress (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  topic_id       uuid references public.topics(id) on delete cascade,
  document_id    uuid not null references public.documents(id) on delete cascade,
  correct_count  integer not null default 0,
  wrong_count    integer not null default 0,
  mastery        numeric(5,4) not null default 0,
  last_studied_at timestamptz,
  next_review_at timestamptz,
  updated_at     timestamptz not null default now(),
  unique (user_id, document_id, topic_id)
);
create index if not exists study_progress_user_idx on public.study_progress(user_id, mastery);
drop trigger if exists study_progress_touch on public.study_progress;
create trigger study_progress_touch before update on public.study_progress
  for each row execute function public.touch_updated_at();

-- AI Teacher chat
create table if not exists public.tutor_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  title       text not null default 'Yeni sohbet',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists tutor_conversations_user_idx on public.tutor_conversations(user_id, updated_at desc);
drop trigger if exists tutor_conversations_touch on public.tutor_conversations;
create trigger tutor_conversations_touch before update on public.tutor_conversations
  for each row execute function public.touch_updated_at();

create table if not exists public.tutor_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.tutor_conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system')),
  content         text not null,
  citations       jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists tutor_messages_conv_idx on public.tutor_messages(conversation_id, created_at);

-- "Beni Çalıştır" guided study mode
create table if not exists public.guided_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  document_id      uuid not null references public.documents(id) on delete cascade,
  topic_id         uuid references public.topics(id) on delete set null,
  status           text not null default 'active', -- active | completed | abandoned
  step             integer not null default 0,
  difficulty_level smallint not null default 2, -- 1..4 adaptive
  correct_streak   integer not null default 0,
  wrong_streak     integer not null default 0,
  transcript       jsonb not null default '[]'::jsonb,
  state            jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists guided_sessions_user_idx on public.guided_sessions(user_id, updated_at desc);
drop trigger if exists guided_sessions_touch on public.guided_sessions;
create trigger guided_sessions_touch before update on public.guided_sessions
  for each row execute function public.touch_updated_at();

-- Personal study plan
create table if not exists public.study_plans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  title         text not null,
  exam_name     text,
  exam_date     date,
  daily_minutes integer not null default 60,
  status        text not null default 'active', -- active | completed | archived
  document_ids  uuid[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists study_plans_user_idx on public.study_plans(user_id, created_at desc);
drop trigger if exists study_plans_touch on public.study_plans;
create trigger study_plans_touch before update on public.study_plans
  for each row execute function public.touch_updated_at();

create table if not exists public.study_plan_items (
  id               uuid primary key default gen_random_uuid(),
  plan_id          uuid not null references public.study_plans(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  scheduled_date   date not null,
  topic_title      text not null,
  document_id      uuid references public.documents(id) on delete set null,
  activity         text not null default 'read', -- read | flashcard | quiz | review
  duration_minutes integer not null default 30,
  order_index      integer not null default 0,
  is_completed     boolean not null default false,
  completed_at     timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists study_plan_items_plan_idx on public.study_plan_items(plan_id, scheduled_date);
create index if not exists study_plan_items_user_date_idx on public.study_plan_items(user_id, scheduled_date);

-- =====================================================================
-- 6. AI INFRASTRUCTURE
-- =====================================================================
create table if not exists public.ai_providers (
  id               uuid primary key default gen_random_uuid(),
  provider         ai_provider not null unique,
  display_name     text not null,
  is_enabled       boolean not null default false,
  api_key_encrypted text,            -- AES-256-GCM, decrypted server-side only
  api_key_hint     text,             -- e.g. "…a9f2"
  base_url         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
drop trigger if exists ai_providers_touch on public.ai_providers;
create trigger ai_providers_touch before update on public.ai_providers
  for each row execute function public.touch_updated_at();

create table if not exists public.ai_models (
  id                    uuid primary key default gen_random_uuid(),
  provider              ai_provider not null,
  model_key             text not null,
  display_name          text not null,
  purpose               text not null default 'chat', -- chat | vision | embedding
  is_active             boolean not null default true,
  is_default            boolean not null default false,
  requires_premium      boolean not null default false,
  input_price_per_1m    numeric(12,4) not null default 0,   -- USD / 1M tokens
  output_price_per_1m   numeric(12,4) not null default 0,
  max_input_tokens      integer not null default 200000,
  max_output_tokens     integer not null default 8192,
  supports_vision       boolean not null default false,
  supports_pdf          boolean not null default false,
  priority              integer not null default 100,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (provider, model_key)
);
create index if not exists ai_models_active_idx on public.ai_models(purpose, is_active, priority);
drop trigger if exists ai_models_touch on public.ai_models;
create trigger ai_models_touch before update on public.ai_models
  for each row execute function public.touch_updated_at();

create table if not exists public.ai_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.profiles(id) on delete set null,
  user_plan     plan_type,
  provider      ai_provider not null,
  model_key     text not null,
  operation     ai_operation not null,
  document_id   uuid references public.documents(id) on delete set null,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens  integer not null default 0,
  cached_tokens integer not null default 0,
  cost_usd      numeric(14,6) not null default 0,
  cost_try      numeric(14,4) not null default 0,
  duration_ms   integer not null default 0,
  status        text not null default 'success', -- success | error
  error_code    text,
  error_message text,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists ai_requests_user_idx on public.ai_requests(user_id, created_at desc);
create index if not exists ai_requests_created_idx on public.ai_requests(created_at desc);
create index if not exists ai_requests_model_idx on public.ai_requests(provider, model_key, created_at desc);
create index if not exists ai_requests_op_idx on public.ai_requests(operation, created_at desc);

-- Daily rollup for fast admin analytics
create table if not exists public.ai_usage_daily (
  id            uuid primary key default gen_random_uuid(),
  day           date not null,
  user_id       uuid references public.profiles(id) on delete cascade,
  provider      ai_provider not null,
  model_key     text not null,
  operation     ai_operation not null,
  request_count integer not null default 0,
  error_count   integer not null default 0,
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  total_tokens  bigint not null default 0,
  cost_usd      numeric(14,6) not null default 0,
  cost_try      numeric(14,4) not null default 0,
  unique (day, user_id, provider, model_key, operation)
);
create index if not exists ai_usage_daily_day_idx on public.ai_usage_daily(day desc);
create index if not exists ai_usage_daily_user_idx on public.ai_usage_daily(user_id, day desc);

create or replace function public.rollup_ai_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.ai_usage_daily as d (
    day, user_id, provider, model_key, operation,
    request_count, error_count, input_tokens, output_tokens, total_tokens, cost_usd, cost_try
  ) values (
    (new.created_at at time zone 'UTC')::date, new.user_id, new.provider, new.model_key, new.operation,
    1, case when new.status = 'error' then 1 else 0 end,
    new.input_tokens, new.output_tokens, new.total_tokens, new.cost_usd, new.cost_try
  )
  on conflict (day, user_id, provider, model_key, operation) do update set
    request_count = d.request_count + 1,
    error_count   = d.error_count + case when new.status = 'error' then 1 else 0 end,
    input_tokens  = d.input_tokens + new.input_tokens,
    output_tokens = d.output_tokens + new.output_tokens,
    total_tokens  = d.total_tokens + new.total_tokens,
    cost_usd      = d.cost_usd + new.cost_usd,
    cost_try      = d.cost_try + new.cost_try;
  return new;
end $$;

drop trigger if exists ai_requests_rollup on public.ai_requests;
create trigger ai_requests_rollup after insert on public.ai_requests
  for each row execute function public.rollup_ai_request();

-- =====================================================================
-- 7. LIMITS, SETTINGS, OPS
-- =====================================================================
create table if not exists public.plan_limits (
  id          uuid primary key default gen_random_uuid(),
  plan        plan_type not null,
  limit_key   text not null,
  limit_value bigint not null,
  description text,
  updated_at  timestamptz not null default now(),
  unique (plan, limit_key)
);
drop trigger if exists plan_limits_touch on public.plan_limits;
create trigger plan_limits_touch before update on public.plan_limits
  for each row execute function public.touch_updated_at();

create table if not exists public.usage_counters (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  metric       text not null,
  period       text not null,     -- day | month
  period_start date not null,
  value        bigint not null default 0,
  updated_at   timestamptz not null default now(),
  unique (user_id, metric, period, period_start)
);
create index if not exists usage_counters_lookup_idx
  on public.usage_counters(user_id, metric, period, period_start);

create table if not exists public.system_settings (
  key        text primary key,
  value      jsonb not null,
  category   text not null default 'general',
  is_public  boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.legal_documents (
  slug       text primary key,
  title      text not null,
  content    text not null default '',
  version    text not null default '1.0',
  updated_at timestamptz not null default now()
);

create table if not exists public.consents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  consent_type text not null,
  version      text not null default '1.0',
  granted      boolean not null default true,
  ip           text,
  created_at   timestamptz not null default now()
);
create index if not exists consents_user_idx on public.consents(user_id, consent_type);

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null default 'info',
  title      text not null,
  body       text,
  link       text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, is_read, created_at desc);

create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,
  actor_email text,
  action      text not null,
  entity_type text,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs(actor_id, created_at desc);

-- Background job queue
create table if not exists public.processing_jobs (
  id          uuid primary key default gen_random_uuid(),
  job_type    text not null,
  payload     jsonb not null default '{}'::jsonb,
  status      job_status not null default 'queued',
  priority    smallint not null default 100,
  attempts    smallint not null default 0,
  max_attempts smallint not null default 3,
  run_after   timestamptz not null default now(),
  locked_at   timestamptz,
  locked_by   text,
  last_error  text,
  document_id uuid references public.documents(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists processing_jobs_claim_idx
  on public.processing_jobs(status, run_after, priority);
create index if not exists processing_jobs_doc_idx on public.processing_jobs(document_id);
drop trigger if exists processing_jobs_touch on public.processing_jobs;
create trigger processing_jobs_touch before update on public.processing_jobs
  for each row execute function public.touch_updated_at();

-- Security: login attempts + generic rate limiting
create table if not exists public.login_attempts (
  id         uuid primary key default gen_random_uuid(),
  email      text,
  ip         text,
  success    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists login_attempts_email_idx on public.login_attempts(email, created_at desc);
create index if not exists login_attempts_ip_idx on public.login_attempts(ip, created_at desc);

create table if not exists public.rate_limits (
  id           uuid primary key default gen_random_uuid(),
  bucket_key   text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  unique (bucket_key, window_start)
);
create index if not exists rate_limits_window_idx on public.rate_limits(window_start);

-- =====================================================================
-- 8. RPC HELPERS
-- =====================================================================

-- Atomic counter increment used by the limit system
create or replace function public.increment_usage(
  p_user_id uuid, p_metric text, p_period text, p_period_start date, p_amount bigint
) returns bigint language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  insert into public.usage_counters (user_id, metric, period, period_start, value)
  values (p_user_id, p_metric, p_period, p_period_start, p_amount)
  on conflict (user_id, metric, period, period_start)
  do update set value = public.usage_counters.value + p_amount, updated_at = now()
  returning value into v;
  return v;
end $$;

-- Fixed-window rate limiter
create or replace function public.bump_rate_limit(
  p_key text, p_window_start timestamptz
) returns integer language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  insert into public.rate_limits (bucket_key, window_start, count)
  values (p_key, p_window_start, 1)
  on conflict (bucket_key, window_start)
  do update set count = public.rate_limits.count + 1
  returning count into v;
  return v;
end $$;

-- Claim the next background job (SKIP LOCKED, lease-based)
create or replace function public.claim_job(p_worker text, p_lease_seconds integer default 300)
returns setof public.processing_jobs language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.processing_jobs j
  set status = 'processing',
      attempts = j.attempts + 1,
      locked_at = now(),
      locked_by = p_worker
  where j.id = (
    select id from public.processing_jobs
    where (status = 'queued' and run_after <= now())
       or (status = 'processing' and locked_at < now() - make_interval(secs => p_lease_seconds))
    order by priority asc, run_after asc
    limit 1
    for update skip locked
  )
  returning j.*;
end $$;

-- Vector similarity search scoped to the caller's own documents
create or replace function public.match_document_chunks(
  p_owner_id     uuid,
  p_query        vector(1536),
  p_document_ids uuid[] default null,
  p_match_count  integer default 8,
  p_min_score    float default 0.0
) returns table (
  chunk_id uuid, document_id uuid, chunk_index integer, content text,
  page_from integer, page_to integer, section_title text, score float
) language sql stable security definer set search_path = public as $$
  select c.id, c.document_id, c.chunk_index, c.content,
         c.page_from, c.page_to, c.section_title,
         1 - (e.embedding <=> p_query) as score
  from public.document_embeddings e
  join public.document_chunks c on c.id = e.chunk_id
  where e.owner_id = p_owner_id
    and (p_document_ids is null or e.document_id = any(p_document_ids))
    and 1 - (e.embedding <=> p_query) >= p_min_score
  order by e.embedding <=> p_query
  limit greatest(p_match_count, 1);
$$;

-- Keyword fallback (hybrid retrieval)
create or replace function public.keyword_search_chunks(
  p_owner_id     uuid,
  p_query        text,
  p_document_ids uuid[] default null,
  p_match_count  integer default 8
) returns table (
  chunk_id uuid, document_id uuid, chunk_index integer, content text,
  page_from integer, page_to integer, section_title text, score float
) language sql stable security definer set search_path = public as $$
  select c.id, c.document_id, c.chunk_index, c.content,
         c.page_from, c.page_to, c.section_title,
         ts_rank(to_tsvector('simple', c.content),
                 plainto_tsquery('simple', p_query))::float as score
  from public.document_chunks c
  where c.owner_id = p_owner_id
    and (p_document_ids is null or c.document_id = any(p_document_ids))
    and to_tsvector('simple', c.content) @@ plainto_tsquery('simple', p_query)
  order by score desc
  limit greatest(p_match_count, 1);
$$;

-- KVKK: anonymise instead of hard-deleting analytics rows
create or replace function public.anonymize_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.documents where owner_id = p_user_id;
  delete from public.tutor_conversations where user_id = p_user_id;
  delete from public.study_plans where user_id = p_user_id;
  delete from public.notifications where user_id = p_user_id;
  update public.ai_requests set user_id = null where user_id = p_user_id;
  update public.profiles set
    email = null, full_name = 'Silinmiş kullanıcı', avatar_url = null,
    education_level = null, field_of_study = null, study_goal = null,
    is_active = false, anonymized_at = now()
  where id = p_user_id;
end $$;

-- =====================================================================
-- 9. ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles              enable row level security;
alter table public.payment_requests      enable row level security;
alter table public.subscriptions         enable row level security;
alter table public.documents             enable row level security;
alter table public.document_pages        enable row level security;
alter table public.document_chunks       enable row level security;
alter table public.document_embeddings   enable row level security;
alter table public.topics                enable row level security;
alter table public.study_sets            enable row level security;
alter table public.flashcards            enable row level security;
alter table public.flashcard_progress    enable row level security;
alter table public.flashcard_review_logs enable row level security;
alter table public.quizzes               enable row level security;
alter table public.quiz_questions        enable row level security;
alter table public.quiz_attempts         enable row level security;
alter table public.quiz_answers          enable row level security;
alter table public.study_sessions        enable row level security;
alter table public.study_progress        enable row level security;
alter table public.tutor_conversations   enable row level security;
alter table public.tutor_messages        enable row level security;
alter table public.guided_sessions       enable row level security;
alter table public.study_plans           enable row level security;
alter table public.study_plan_items      enable row level security;
alter table public.notifications         enable row level security;
alter table public.consents              enable row level security;
alter table public.usage_counters        enable row level security;
alter table public.ai_requests           enable row level security;
alter table public.ai_usage_daily        enable row level security;
alter table public.ai_models             enable row level security;
alter table public.ai_providers          enable row level security;
alter table public.plan_limits           enable row level security;
alter table public.system_settings       enable row level security;
alter table public.legal_documents       enable row level security;
alter table public.audit_logs            enable row level security;
alter table public.processing_jobs       enable row level security;
alter table public.login_attempts        enable row level security;
alter table public.rate_limits           enable row level security;

-- profiles: self read/update; admins read all
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Generic owner policies
do $$
declare t text;
begin
  foreach t in array array[
    'documents','document_pages','document_chunks','document_embeddings','topics',
    'study_sets','flashcards','quizzes','quiz_questions'
  ] loop
    execute format('drop policy if exists %I_owner_all on public.%I', t, t);
    execute format(
      'create policy %I_owner_all on public.%I for all
         using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t, t);
  end loop;

  foreach t in array array[
    'flashcard_progress','flashcard_review_logs','quiz_attempts','quiz_answers',
    'study_sessions','study_progress','tutor_conversations','tutor_messages',
    'guided_sessions','study_plans','study_plan_items','notifications','consents',
    'payment_requests'
  ] loop
    execute format('drop policy if exists %I_user_all on public.%I', t, t);
    execute format(
      'create policy %I_user_all on public.%I for all
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);
  end loop;
end $$;

-- Read-only for the owner, written by the server (service role)
drop policy if exists subscriptions_read_own on public.subscriptions;
create policy subscriptions_read_own on public.subscriptions
  for select using (user_id = auth.uid());

drop policy if exists usage_counters_read_own on public.usage_counters;
create policy usage_counters_read_own on public.usage_counters
  for select using (user_id = auth.uid());

drop policy if exists ai_requests_read_own on public.ai_requests;
create policy ai_requests_read_own on public.ai_requests
  for select using (user_id = auth.uid());

-- Public catalogues
drop policy if exists legal_documents_read on public.legal_documents;
create policy legal_documents_read on public.legal_documents for select using (true);

drop policy if exists system_settings_public_read on public.system_settings;
create policy system_settings_public_read on public.system_settings
  for select using (is_public = true);

drop policy if exists plan_limits_read on public.plan_limits;
create policy plan_limits_read on public.plan_limits for select using (true);

-- ai_models / ai_providers / audit_logs / jobs / rate limits:
-- no policy => only the service role can touch them.

-- =====================================================================
-- 10. STORAGE BUCKETS
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 52428800)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit)
values ('receipts', 'receipts', false, 10485760)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit)
values ('public-assets', 'public-assets', true, 5242880)
on conflict (id) do nothing;

-- Objects are stored under "<user_id>/<...>" so the first path segment is the owner.
drop policy if exists documents_owner_rw on storage.objects;
create policy documents_owner_rw on storage.objects for all
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists receipts_owner_rw on storage.objects;
create policy receipts_owner_rw on storage.objects for all
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists public_assets_read on storage.objects;
create policy public_assets_read on storage.objects for select
  using (bucket_id = 'public-assets');
