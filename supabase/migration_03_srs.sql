-- ============================================================================
--  Миграция 03: интервальное повторение, словарные поля, стрик и дневная цель.
--
--  Как применить: панель Supabase → SQL Editor → New query → вставить целиком → Run.
--  Выполнять после migration.sql и migration_02_positions.sql.
--  Скрипт идемпотентный: повторный запуск ничего не сломает и не сотрёт.
-- ============================================================================

-- ─────────────────────── ПОЛЯ КАРТОЧЕК ──────────────────────────────────────
--  Состояние алгоритма SM-2 живёт прямо в карточке: так расписание переживает
--  закрытие вкладки и доступно с любого устройства.

alter table public.cards add column if not exists ease_factor   real        not null default 2.5;
alter table public.cards add column if not exists interval_days integer     not null default 0;
alter table public.cards add column if not exists repetitions   integer     not null default 0;
alter table public.cards add column if not exists due_date      timestamptz not null default now();
alter table public.cards add column if not exists times_seen    integer     not null default 0;
alter table public.cards add column if not exists times_wrong   integer     not null default 0;
alter table public.cards add column if not exists transcription text;   -- IPA, может быть null
alter table public.cards add column if not exists part_of_speech text;  -- часть речи, может быть null

-- SM-2 не опускает лёгкость ниже 1.3, а отрицательных интервалов не бывает.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cards_ease_factor_check') then
    alter table public.cards add constraint cards_ease_factor_check check (ease_factor >= 1.3);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cards_interval_days_check') then
    alter table public.cards add constraint cards_interval_days_check check (interval_days >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cards_repetitions_check') then
    alter table public.cards add constraint cards_repetitions_check check (repetitions >= 0);
  end if;
end $$;

-- Очередь на повторение: «мои карточки, у которых срок наступил».
create index if not exists cards_user_due_idx     on public.cards (user_id, due_date);
-- Список проблемных слов в статистике.
create index if not exists cards_user_wrong_idx   on public.cards (user_id, times_wrong desc);

-- ─────────────────────── НАСТРОЙКИ ПОЛЬЗОВАТЕЛЯ ─────────────────────────────

create table if not exists public.user_settings (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  daily_goal integer not null default 20 check (daily_goal between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "user_settings_select_own" on public.user_settings;
create policy "user_settings_select_own" on public.user_settings
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "user_settings_insert_own" on public.user_settings;
create policy "user_settings_insert_own" on public.user_settings
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_update_own" on public.user_settings
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_settings_delete_own" on public.user_settings;
create policy "user_settings_delete_own" on public.user_settings
  for delete to authenticated using (auth.uid() = user_id);

-- ─────────────────────── ДНИ ЗАНЯТИЙ ────────────────────────────────────────
--  Одна строка на день. Уникальность пары (user_id, day) даёт и защиту от
--  дублей, и возможность делать upsert одним запросом.

create table if not exists public.study_days (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  day         date not null default current_date,
  words_count integer not null default 0 check (words_count >= 0),
  created_at  timestamptz not null default now(),
  unique (user_id, day)
);

create index if not exists study_days_user_day_idx on public.study_days (user_id, day desc);

alter table public.study_days enable row level security;

drop policy if exists "study_days_select_own" on public.study_days;
create policy "study_days_select_own" on public.study_days
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "study_days_insert_own" on public.study_days;
create policy "study_days_insert_own" on public.study_days
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "study_days_update_own" on public.study_days;
create policy "study_days_update_own" on public.study_days
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "study_days_delete_own" on public.study_days;
create policy "study_days_delete_own" on public.study_days
  for delete to authenticated using (auth.uid() = user_id);

-- ─────────────────────── СЧЁТЧИК ДНЯ ────────────────────────────────────────
--  PostgREST не умеет «words_count = words_count + 1» одним запросом, а
--  читать-и-писать из браузера — гонка: два ответа подряд затрут друг друга.
--  Функция делает это атомарно. security invoker (по умолчанию) — значит RLS
--  продолжает действовать, а user_id берётся из токена, не из аргументов.
--
--  День приходит с клиента, а не берётся как current_date: сервер живёт по UTC,
--  и занятие в час ночи по Москве записалось бы во вчера, разорвав стрик.

create or replace function public.bump_study_day(p_day date, p_words integer default 1)
returns public.study_days
language plpgsql
as $$
declare
  result public.study_days;
begin
  insert into public.study_days (user_id, day, words_count)
  values (auth.uid(), p_day, greatest(p_words, 0))
  on conflict (user_id, day)
    do update set words_count = public.study_days.words_count + greatest(p_words, 0)
  returning * into result;
  return result;
end;
$$;

grant execute on function public.bump_study_day(date, integer) to authenticated;
