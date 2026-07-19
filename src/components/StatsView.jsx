import { useEffect, useState } from 'react'
import * as db from '../lib/db'
import { exportCsv, exportJson } from '../lib/export'
import { formatDue } from '../lib/srs'
import { Button, Card, EmptyState, ErrorText, plural, SpeakButton, Spinner } from './ui'
import ActivityGrid from './ActivityGrid'
import Learn from './Learn'

export default function StatsView({ user }) {
  const [stats, setStats] = useState(null)
  const [problem, setProblem] = useState([])
  const [activity, setActivity] = useState({ days: [], goal: db.DEFAULT_DAILY_GOAL })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [session, setSession] = useState(null) // null | {cards, title}
  const [exporting, setExporting] = useState('')
  const [exported, setExported] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      setLoading(true)
      const [s, p, days, settings] = await Promise.all([
        db.overallStats(),
        db.problemCards(),
        db.listStudyDays(),
        db.getSettings(user.id),
      ])
      setStats(s)
      setProblem(p)
      setActivity({ days, goal: settings.daily_goal })
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function unflag(card) {
    try {
      await db.setFlag(card.id, false)
      // Снятая пометка выбрасывает слово из списка, если его там больше ничто
      // не держит (нет ошибок или мало показов).
      setProblem((prev) =>
        prev
          .map((c) => (c.id === card.id ? { ...c, flagged: false } : c))
          .filter(
            (c) =>
              c.flagged ||
              (c.mastery_level < 3 && c.times_wrong > 0 && c.times_seen >= db.MIN_SEEN_FOR_PROBLEM),
          ),
      )
    } catch (e) {
      setError(e.message)
    }
  }

  async function runExport(kind) {
    setExporting(kind)
    setError('')
    setExported('')
    try {
      const count = kind === 'json' ? await exportJson() : await exportCsv()
      setExported(`Файл скачан: ${plural(count, ['карточка', 'карточки', 'карточек'])}.`)
    } catch (e) {
      setError('Не удалось выгрузить: ' + e.message)
    } finally {
      setExporting('')
    }
  }

  if (session) {
    const exit = () => {
      setSession(null)
      load() // за сессию поменялись и счётчики ошибок, и сроки повторения
    }
    return <Learn cards={session.cards} setName={session.title} onExit={exit} />
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Spinner />
      </div>
    )
  }

  // Без этого упавший запрос давал белый экран вместо сообщения об ошибке.
  if (!stats) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Статистика</h1>
        <ErrorText>{error || 'Не удалось загрузить статистику.'}</ErrorText>
        <Button onClick={load}>Попробовать ещё раз</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Статистика</h1>

      <ErrorText>{error}</ErrorText>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={stats.total} label="всего слов" />
        <Stat value={stats.mastered} label="выучено" tone="text-emerald-600 dark:text-emerald-400" />
        <Stat value={stats.learning} label="в работе" tone="text-indigo-600 dark:text-indigo-400" />
        <Stat value={problem.length} label="проблемные" tone="text-rose-600 dark:text-rose-400" />
      </div>

      <Card className="p-4 sm:p-5">
        <h2 className="text-lg font-semibold">Активность</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Сколько слов выучено в каждый день. Насыщенность квадрата — доля от дневной цели ({activity.goal}).
        </p>
        <div className="mt-4">
          <ActivityGrid days={activity.days} goal={activity.goal} />
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="text-lg font-semibold">Самые проблемные слова</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Те, на которых вы чаще всего промахиваетесь — по доле ошибок, а не по их числу. В счёт
          идут слова, которые спрашивали хотя бы {db.MIN_SEEN_FOR_PROBLEM} раза и которые ещё не
          выучены: доведёте слово до конца — оно уйдёт из списка, начнёте снова ошибаться —
          вернётся со всей своей историей.
        </p>
        {problem.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Проблемных слов сейчас нет — те, что давались трудно, вы уже довели до конца. Список
            наберётся снова, когда какие-то слова начнут упорно не даваться.
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button onClick={() => setSession({ mode: 'learn', cards: problem, title: 'Проблемные слова' })}>
                Прогнать проблемные ({problem.length})
              </Button>
              {/* Learn берёт слова по порядку пачками по семь, а список отсортирован
                  от худших — значит уйти на середине не жалко, тяжёлое уже пройдено. */}
              <span className="text-xs text-slate-400 dark:text-slate-500">
                начиная с самых тяжёлых — можно выйти в любой момент
              </span>
            </div>

            {/* Показываем примерно десяток, остальное прокруткой: список копится
                без предела, а занимать им весь экран незачем. */}
            <ul className="mt-4 max-h-[32rem] space-y-1 overflow-y-auto pr-1">
              {problem.map((c) => {
                const pct = Math.round(c.wrong_rate * 100)
                const hasErrors = c.times_wrong > 0
                return (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 odd:bg-slate-50 dark:odd:bg-slate-800/40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1">
                        {c.flagged && <FlagIcon />}
                        <span className="truncate whitespace-pre-line font-display font-medium">
                          {c.word_en}
                        </span>
                        <SpeakButton text={c.word_en} size="sm" />
                      </span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                        {c.word_ru}
                      </span>
                    </span>

                    {hasErrors ? (
                      <>
                        <span className="hidden h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 sm:block">
                          <span
                            className="block h-full rounded-full bg-rose-500"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span className="shrink-0 text-right text-xs text-slate-400 dark:text-slate-500">
                          <span className="block font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                            {pct}%
                          </span>
                          {c.times_wrong} из {c.times_seen} · {formatDue(c)}
                        </span>
                      </>
                    ) : (
                      <span className="shrink-0 text-right text-xs text-slate-400 dark:text-slate-500">
                        <span className="block font-medium text-rose-500 dark:text-rose-400">
                          вручную
                        </span>
                        {formatDue(c)}
                      </span>
                    )}

                    {c.flagged && (
                      <button
                        type="button"
                        onClick={() => unflag(c)}
                        title="Убрать из проблемных"
                        aria-label="Убрать из проблемных"
                        className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800"
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                        </svg>
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-semibold">Экспорт данных</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Все папки, наборы и карточки со всеми полями. Только текст, без картинок.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => runExport('json')} disabled={!!exporting}>
            {exporting === 'json' ? <Spinner className="h-4 w-4" /> : <DownloadIcon />} JSON
          </Button>
          <Button variant="secondary" onClick={() => runExport('csv')} disabled={!!exporting}>
            {exporting === 'csv' ? <Spinner className="h-4 w-4" /> : <DownloadIcon />} CSV
          </Button>
        </div>
        {exported && (
          <p className="mt-3 animate-pop text-sm text-emerald-600 dark:text-emerald-400">{exported}</p>
        )}
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          CSV — с точкой с запятой и BOM, чтобы Excel открыл его с кириллицей и не склеил колонки.
        </p>
      </Card>
    </div>
  )
}

function Stat({ value, label, tone = '' }) {
  return (
    <Card className="p-4">
      <p className={`text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </Card>
  )
}

function FlagIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-3.5 w-3.5 shrink-0 text-rose-500 dark:text-rose-400"
      title="Помечено вручную"
    >
      <path d="M4 2.75a.75.75 0 0 1 .75.75v13a.75.75 0 0 1-1.5 0v-13A.75.75 0 0 1 4 2.75Z" />
      <path d="M4.75 4h9.5a.5.5 0 0 1 .38.82L12.5 7.5l2.13 2.68a.5.5 0 0 1-.38.82h-9.5V4Z" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
      <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
    </svg>
  )
}
