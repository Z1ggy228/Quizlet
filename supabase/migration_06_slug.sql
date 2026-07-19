-- ============================================================================
--  Миграция 06: адрес папки и набора словами (slug).
--
--  Зачем: в ссылке нужны английские слова — ziglish.ru/english-from-scratch,
--  а не транслит «angliyskiy-s-nulya» и не id. Название в интерфейсе остаётся
--  русским, английский вариант хранится отдельно.
--
--  Заполняется приложением: при создании и переименовании название переводится
--  (тот же endpoint Google, что и в карточках), результат можно поправить
--  руками в том же диалоге. Пока колонка пустая, приложение строит адрес
--  транслитерацией — старые ссылки продолжают работать.
--
--  Как применить: SQL Editor → New query → вставить целиком → Run.
--  Выполнять после migration_05_flag.sql. Скрипт идемпотентный.
-- ============================================================================

alter table public.folders add column if not exists slug text;
alter table public.sets add column if not exists slug text;

-- Адрес обязан быть различим внутри своего уровня, иначе ссылка ведёт в первый
-- попавшийся: папки уникальны у пользователя, наборы — внутри папки.
-- Индексы частичные: строки без адреса друг другу не мешают.
create unique index if not exists folders_user_slug_idx
  on public.folders (user_id, slug) where slug is not null;

create unique index if not exists sets_folder_slug_idx
  on public.sets (folder_id, slug) where slug is not null;
