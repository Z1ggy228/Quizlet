import { useEffect, useState } from 'react'
import * as db from '../lib/db'
import { localDay, streakFrom } from '../lib/srs'
import { Button, Card, ErrorText, Input, Modal, plural, Spinner } from './ui'

/**
 * Стрик и дневная цель на главном экране.
 *
 * Грузится при монтировании, и этого достаточно: экран папок размонтируется,
 * когда вы уходите в набор, поэтому после занятия панель считает цифры заново.
 */
export default function DailyPanel({ user }) {
  const [streak, setStreak] = useState(0)
  const [today, setToday] = useState(0)
  const [goal, setGoal] = useState(db.DEFAULT_DAILY_GOAL)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    try {
      const [days, settings] = await Promise.all([db.listStudyDays(), db.getSettings(user.id)])
      // Стрик считаем от текущей цели: день засчитан, только если цель взята.
      setStreak(streakFrom(days, new Date(), settings.daily_goal))
      setToday(days.find((d) => d.day === localDay())?.words_count ?? 0)
      setGoal(settings.daily_goal)
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function saveGoal(e) {
    e.preventDefault()
    const value = Number(draft)
    if (!Number.isInteger(value) || value < 1 || value > 500) {
      setError('Цель — целое число от 1 до 500.')
      return
    }
    setBusy(true)
    try {
      await db.saveDailyGoal(user.id, value)
      setOpen(false)
      setError('')
      await load() // от цели зависит стрик — пересчитываем

    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return null

  const pct = Math.min(100, Math.round((today / goal) * 100))
  const done = today >= goal

  return (
    <>
      {/* На телефоне в строку не влезает: стрик и прогресс встают друг под друга. */}
      <Card className="mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
        <div
          className="flex shrink-0 items-center gap-2"
          title="Дней подряд, когда дневная цель была выполнена"
        >
          <span className={`text-3xl ${streak > 0 ? '' : 'grayscale'}`}>🔥</span>
          <span className="text-xl font-semibold leading-none tabular-nums">
            {plural(streak, ['день', 'дня', 'дней'])} подряд
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium">
              Сегодня:{' '}
              <span className={done ? 'text-emerald-600 dark:text-emerald-400' : ''}>
                {today} из {goal}
              </span>
            </span>
            <button
              onClick={() => {
                setDraft(String(goal))
                setOpen(true)
              }}
              className="shrink-0 text-xs text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
            >
              изменить цель
            </button>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                done
                  ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
                  : 'bg-gradient-to-r from-indigo-400 to-indigo-600'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {done ? 'Цель на сегодня взята — можно продолжать в удовольствие.' : `${pct}% дневной цели`}
          </p>
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Дневная цель">
        <form onSubmit={saveGoal} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Сколько слов в день
            </span>
            <Input
              autoFocus
              type="number"
              min={1}
              max={500}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Считаются выученные слова — те, что дошли до последнего уровня. День попадает в стрик,
            только если цель за него взята.
          </p>
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner className="h-4 w-4" />} Сохранить
            </Button>
          </div>
        </form>
      </Modal>

      {!open && error && <ErrorText>{error}</ErrorText>}
    </>
  )
}
