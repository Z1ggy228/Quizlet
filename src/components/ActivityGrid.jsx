import { useMemo, useState } from 'react'
import { localDay } from '../lib/srs'
import { plural } from './ui'

// 17 недель — ровно столько влезает в 375px без горизонтальной прокрутки:
// 28px колонка дней + 17 × (13px клетка + 3px зазор) = 300px.
const WEEKS = 17
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

/** Пять ступеней: пусто → чем ближе к цели, тем гуще; цель взята — отдельный цвет. */
function level(count, goal) {
  if (!count) return 0
  if (count >= goal) return 4
  const share = count / goal
  if (share >= 0.66) return 3
  if (share >= 0.33) return 2
  return 1
}

const TONE = [
  'bg-slate-200 dark:bg-slate-800',
  'bg-emerald-200 dark:bg-emerald-900',
  'bg-emerald-300 dark:bg-emerald-700',
  'bg-emerald-400 dark:bg-emerald-600',
  'bg-emerald-500 ring-1 ring-emerald-600 dark:bg-emerald-400 dark:ring-emerald-300',
]

/** Понедельник недели, в которую попадает дата. */
function mondayOf(date) {
  const d = new Date(date)
  const shift = (d.getDay() + 6) % 7 // 0 = понедельник
  d.setDate(d.getDate() - shift)
  d.setHours(0, 0, 0, 0)
  return d
}

export default function ActivityGrid({ days, goal }) {
  const [hovered, setHovered] = useState(null)

  const { columns, months, total, bestDay } = useMemo(() => {
    const counts = new Map(days.map((d) => [d.day, d.words_count]))
    const today = new Date()
    const start = mondayOf(today)
    start.setDate(start.getDate() - (WEEKS - 1) * 7)

    const columns = []
    const months = []
    let total = 0
    let bestDay = null

    for (let w = 0; w < WEEKS; w++) {
      const week = []
      for (let d = 0; d < 7; d++) {
        const date = new Date(start)
        date.setDate(start.getDate() + w * 7 + d)
        const key = localDay(date)
        const future = date > today
        const count = future ? null : (counts.get(key) ?? 0)
        if (count) {
          total += count
          if (!bestDay || count > bestDay.count) bestDay = { key, count, date }
        }
        week.push({ key, date, count, future })
        // Подпись месяца ставим над неделей, в которой месяц начинается.
        if (d === 0 && date.getDate() <= 7) months.push({ week: w, label: MONTHS[date.getMonth()] })
      }
      columns.push(week)
    }
    return { columns, months, total, bestDay }
  }, [days])

  const активных = columns.flat().filter((c) => c.count > 0).length

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {total > 0
            ? `${plural(total, ['слово выучено', 'слова выучено', 'слов выучено'])} за ${plural(активных, ['день', 'дня', 'дней'])}`
            : 'Пока пусто — квадраты закрасятся, когда вы начнёте выучивать слова.'}
        </p>
        {bestDay && (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Лучший день: {bestDay.date.getDate()} {MONTHS[bestDay.date.getMonth()]} — {bestDay.count}
          </p>
        )}
      </div>

      {/* На узком экране сетка уезжает вбок, а не ломает вёрстку. */}
      <div className="activity-grid overflow-x-auto pb-1">
        <div className="inline-block">
          {/* Подписи месяцев кладём поверх ряда: в клетку 13px слово «апр» не
              влезает, и обычным потоком оно распирало бы колонки. */}
          <div className="relative ml-7 h-4">
            {months.map((m) => (
              <span
                key={m.week}
                className="absolute top-0 text-[9px] leading-4 text-slate-400 dark:text-slate-500"
                style={{ left: `calc(${m.week} * (var(--cell) + 3px))` }}
              >
                {m.label}
              </span>
            ))}
          </div>

          <div className="flex gap-[3px]">
            <div className="flex w-7 shrink-0 flex-col gap-[3px] pr-1">
              {WEEKDAYS.map((d, i) => (
                <span
                  key={d}
                  className="activity-cell w-auto text-right text-[9px] leading-[13px] text-slate-400 dark:text-slate-500 sm:leading-4"
                >
                  {i % 2 === 1 ? d : ''}
                </span>
              ))}
            </div>

            {columns.map((week, w) => (
              <div key={w} className="flex shrink-0 flex-col gap-[3px]">
                {week.map((cell) => (
                  <button
                    key={cell.key}
                    type="button"
                    disabled={cell.future}
                    onMouseEnter={() => !cell.future && setHovered(cell)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => !cell.future && setHovered(cell)}
                    aria-label={cell.future ? '' : `${cell.key}: ${cell.count}`}
                    className={`activity-cell rounded-[3px] transition ${
                      cell.future ? 'bg-transparent' : TONE[level(cell.count, goal)]
                    } ${hovered?.key === cell.key ? 'ring-2 ring-indigo-500' : ''}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="min-h-[1.25rem] text-xs text-slate-500 dark:text-slate-400">
          {hovered
            ? `${hovered.date.getDate()} ${MONTHS[hovered.date.getMonth()]} — ${
                hovered.count
                  ? plural(hovered.count, ['слово', 'слова', 'слов'])
                  : 'не занимались'
              }${hovered.count >= goal ? ' · цель взята' : ''}`
            : ''}
        </p>
        <div className="flex shrink-0 items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
          <span className="mr-1">меньше</span>
          {TONE.map((t, i) => (
            <span key={i} className={`h-[11px] w-[11px] rounded-[3px] ${t}`} />
          ))}
          <span className="ml-1">цель</span>
        </div>
      </div>
    </div>
  )
}
