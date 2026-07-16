-- ============================================================================
--  Миграция 02: явный порядок наборов и карточек.
--
--  Зачем: раньше порядок держался на created_at, но пакетная вставка проставляет
--  всем строкам одно и то же время транзакции — после импорта порядок карточек
--  внутри набора стал бы случайным. Позиция задаёт его явно и заодно служит
--  ключом идемпотентности при повторном импорте (набор + позиция).
--
--  Как применить: SQL Editor → New query → вставить целиком → Run.
--  Выполнять после migration.sql. Скрипт идемпотентный.
-- ============================================================================

alter table public.sets  add column if not exists position integer not null default 0;
alter table public.cards add column if not exists position integer not null default 0;

-- Проставляем позиции уже существующим строкам, сохраняя текущий порядок.
-- Трогаем только нули, чтобы повторный запуск не перетасовал уже расставленное.
with numbered as (
  select id, row_number() over (partition by folder_id order by created_at, id) as rn
  from public.sets
  where position = 0
)
update public.sets s
set position = numbered.rn
from numbered
where s.id = numbered.id;

with numbered as (
  select id, row_number() over (partition by set_id order by created_at, id) as rn
  from public.cards
  where position = 0
)
update public.cards c
set position = numbered.rn
from numbered
where c.id = numbered.id;

-- Под сортировку списков и под поиск «карточка на позиции N» при импорте.
create index if not exists sets_folder_position_idx on public.sets (folder_id, position);
create index if not exists cards_set_position_idx   on public.cards (set_id, position);
