-- ============================================================================
--  Миграция 04: дневная цель запоминается в самом дне.
--
--  Зачем: раньше и стрик, и цвет квадратов в «Активности» считались от текущей
--  цели, поэтому её изменение переписывало всю историю задним числом — поднял
--  цель с 20 до 40, и взятые когда-то дни переставали быть взятыми, а стрик
--  обрывался. Теперь каждый день оценивается по той планке, что стояла в тот
--  момент, и прошлое не меняется.
--
--  Как применить: SQL Editor → New query → вставить целиком → Run.
--  Выполнять после migration_03_srs.sql. Скрипт идемпотентный.
-- ============================================================================

do $$
declare
  -- Заполнять историю нужно только один раз, при первом запуске: иначе
  -- повторный прогон миграции снова переписал бы прошлые дни текущей целью.
  first_run boolean := not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'study_days' and column_name = 'goal'
  );
begin
  alter table public.study_days
    add column if not exists goal integer not null default 20;

  if not exists (select 1 from pg_constraint where conname = 'study_days_goal_check') then
    alter table public.study_days add constraint study_days_goal_check check (goal between 1 and 500);
  end if;

  if first_run then
    -- Какой была цель месяц назад, история не помнит: ставим прошлым дням
    -- нынешнюю — это лучшее, что о них известно.
    update public.study_days sd
    set goal = us.daily_goal
    from public.user_settings us
    where us.user_id = sd.user_id;
  end if;
end $$;

-- ─────────────────────── СЧЁТЧИК ДНЯ ────────────────────────────────────────
--  Цель функция берёт сама из настроек пользователя: вызывающему коду о ней
--  знать незачем, а подделать чужую цель через аргумент нельзя.
--
--  При повторном занятии в тот же день цель обновляется на текущую: пока день
--  идёт, его планка — это ваша сегодняшняя норма. Закончился день — застыла.

create or replace function public.bump_study_day(p_day date, p_words integer default 1)
returns public.study_days
language plpgsql
as $$
declare
  result   public.study_days;
  cur_goal integer;
begin
  select coalesce(daily_goal, 20) into cur_goal
  from public.user_settings
  where user_id = auth.uid();

  cur_goal := coalesce(cur_goal, 20);

  insert into public.study_days (user_id, day, words_count, goal)
  values (auth.uid(), p_day, greatest(p_words, 0), cur_goal)
  on conflict (user_id, day) do update
    set words_count = public.study_days.words_count + greatest(p_words, 0),
        goal = excluded.goal
  returning * into result;

  return result;
end;
$$;

grant execute on function public.bump_study_day(date, integer) to authenticated;
