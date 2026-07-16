-- ============================================================================
--  Тренажёр английских слов — схема базы, RLS и хранилище картинок.
--  Как применить: панель Supabase → SQL Editor → New query → вставить целиком → Run.
--  Скрипт идемпотентный: повторный запуск ничего не сломает.
-- ============================================================================

create extension if not exists pgcrypto;

-- ────────────────────────────── ТАБЛИЦЫ ─────────────────────────────────────

create table if not exists public.folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (char_length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.sets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  folder_id  uuid not null references public.folders (id) on delete cascade,
  name       text not null check (char_length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.cards (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  set_id        uuid not null references public.sets (id) on delete cascade,
  word_en       text not null check (char_length(trim(word_en)) > 0),
  word_ru       text not null check (char_length(trim(word_ru)) > 0),
  image_path    text,                       -- путь к файлу в бакете card-images, может быть null
  context       text,                       -- предложение-пример, может быть null
  mastery_level smallint not null default 0 check (mastery_level between 0 and 3),
  created_at    timestamptz not null default now()
);

-- Индексы под запросы приложения (списки по владельцу и по родителю).
create index if not exists folders_user_id_idx on public.folders (user_id);
create index if not exists sets_user_id_idx    on public.sets (user_id);
create index if not exists sets_folder_id_idx  on public.sets (folder_id);
create index if not exists cards_user_id_idx   on public.cards (user_id);
create index if not exists cards_set_id_idx    on public.cards (set_id);

-- ─────────────────────────────── RLS ────────────────────────────────────────
--  Каждый пользователь видит и меняет только свои строки: user_id = auth.uid().

alter table public.folders enable row level security;
alter table public.sets    enable row level security;
alter table public.cards   enable row level security;

-- folders
drop policy if exists "folders_select_own" on public.folders;
create policy "folders_select_own" on public.folders
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "folders_insert_own" on public.folders;
create policy "folders_insert_own" on public.folders
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "folders_update_own" on public.folders;
create policy "folders_update_own" on public.folders
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "folders_delete_own" on public.folders;
create policy "folders_delete_own" on public.folders
  for delete to authenticated using (auth.uid() = user_id);

-- sets
drop policy if exists "sets_select_own" on public.sets;
create policy "sets_select_own" on public.sets
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "sets_insert_own" on public.sets;
create policy "sets_insert_own" on public.sets
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "sets_update_own" on public.sets;
create policy "sets_update_own" on public.sets
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "sets_delete_own" on public.sets;
create policy "sets_delete_own" on public.sets
  for delete to authenticated using (auth.uid() = user_id);

-- cards
drop policy if exists "cards_select_own" on public.cards;
create policy "cards_select_own" on public.cards
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "cards_insert_own" on public.cards;
create policy "cards_insert_own" on public.cards
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "cards_update_own" on public.cards;
create policy "cards_update_own" on public.cards
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "cards_delete_own" on public.cards;
create policy "cards_delete_own" on public.cards
  for delete to authenticated using (auth.uid() = user_id);

-- ───────────────────────── ХРАНИЛИЩЕ КАРТИНОК ───────────────────────────────
--  Публичный бакет card-images: файлы читаются по прямой ссылке (getPublicUrl),
--  а загружать, менять и удалять можно только внутри своей папки — путь всегда
--  вида "<user_id>/<файл>", и первый сегмент сверяется с auth.uid().

insert into storage.buckets (id, name, public)
values ('card-images', 'card-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "card_images_select_own" on storage.objects;
create policy "card_images_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "card_images_insert_own" on storage.objects;
create policy "card_images_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "card_images_update_own" on storage.objects;
create policy "card_images_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "card_images_delete_own" on storage.objects;
create policy "card_images_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
