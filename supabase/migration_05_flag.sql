-- ============================================================================
--  Миграция 05: ручная пометка «проблемное слово».
--
--  Зачем: раньше слово попадало в список проблемных только накопив ошибки.
--  Теперь его можно пометить руками прямо в Learn — флаг `flagged`.
--
--  Как применить: SQL Editor → New query → вставить целиком → Run.
--  Выполнять после migration_04_day_goal.sql. Скрипт идемпотентный.
-- ============================================================================

alter table public.cards add column if not exists flagged boolean not null default false;

-- Частичный индекс: помеченных слов мало, искать их так дешевле.
create index if not exists cards_user_flagged_idx
  on public.cards (user_id) where flagged;
