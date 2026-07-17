import { useEffect, useState } from 'react'
import * as db from '../lib/db'
import { exportCsv, exportJson } from '../lib/export'
import { formatDue } from '../lib/srs'
import { Button, Card, EmptyState, ErrorText, plural, SpeakButton, Spinner } from './ui'
import ActivityGrid from './ActivityGrid'
import Learn from './Learn'
import Listening from './Listening'

export default function StatsView({ user }) {
  const [stats, setStats] = useState(null)
  const [problem, setProblem] = useState([])
  const [activity, setActivity] = useState({ days: [], goal: db.DEFAULT_DAILY_GOAL })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [session, setSession] = useState(null) // null | {mode, cards}
  const [starting, setStarting] = useState('')
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
        db.problemCards(15),
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

  async function startReview(mode) {
    setStarting(mode)
    setError('')
    try {
      const cards = await db.listReviewCards()
      if (!cards.length) throw new Error('Повторять нечего — на сегодня всё чисто.')
      setSession({ mode, cards })
    } catch (e) {
      setError(e.message)
    } finally {
      setStarting('')
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
      load()
    }
    const title = 'Повторение'
    return session.mode === 'listen' ? (
      <Listening cards={session.cards} setName={title} onExit={exit} />
    ) : (
      <Learn cards={session.cards} setName={title} onExit={exit} />
    )
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
        <Stat value={stats.due} label="на повторение" tone="text-amber-600 dark:text-amber-400" />
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

      {/* Повторение поверх папок: важно не «где лежит слово», а «когда его пора показать». */}
      <Card className="p-5">
        <h2 className="text-lg font-semibold">На повторение</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {stats.due > 0
            ? `${plural(stats.due, ['слово ждёт', 'слова ждут', 'слов ждут'])} повторения — из всех наборов сразу, независимо от папок.`
            : 'Сегодня повторять нечего. Слова вернутся, когда подойдёт их срок по интервальному повторению.'}
        </p>
        {stats.due > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => startReview('learn')} disabled={!!starting}>
              {starting === 'learn' && <Spinner className="h-4 w-4" />} Повторить в Learn
            </Button>
            <Button variant="secondary" onClick={() => startReview('listen')} disabled={!!starting}>
              {starting === 'listen' && <Spinner className="h-4 w-4" />} Повторить на слух
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-semibold">Самые проблемные слова</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Те, на которых вы чаще всего ошибаетесь.
        </p>
        {problem.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Ошибок пока нет — список появится, когда вы начнёте заниматься.
          </p>
        ) : (
          <ul className="mt-4 space-y-1">
            {problem.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-2 rounded-lg px-2 py-2 odd:bg-slate-50 dark:odd:bg-slate-800/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    <span className="truncate whitespace-pre-line font-display font-medium">
                      {c.word_en}
                    </span>
                    <SpeakButton text={c.word_en} size="sm" />
                  </span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                    {c.word_ru}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs text-slate-400 dark:text-slate-500">
                  <span className="block font-medium text-rose-600 dark:text-rose-400">
                    {plural(c.times_wrong, ['ошибка', 'ошибки', 'ошибок'])}
                  </span>
                  из {c.times_seen} · {formatDue(c)}
                </span>
              </li>
            ))}
          </ul>
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

function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
      <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
    </svg>
  )
}
