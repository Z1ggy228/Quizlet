import { useEffect, useState } from 'react'
import * as db from '../lib/db'
import { Button, Card, EmptyState, ErrorText, Input, Modal, plural, Spinner } from './ui'
import { IconButton, PencilIcon, PlusIcon, TrashIcon } from './FoldersView'
import Flashcards from './Flashcards'
import Learn from './Learn'

function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function SetsView({ user, folder, onOpen }) {
  const [sets, setSets] = useState([])
  const [stats, setStats] = useState({}) // { [setId]: {total, mastered} }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  // Сессия по всей папке: карточки всех наборов одним списком, только на время
  // сессии. Ничего не создаём в базе, прогресс пишется тем же карточкам по их id.
  const [session, setSession] = useState(null) // null | {mode, cards}
  const [learnAllOpen, setLearnAllOpen] = useState(false)
  const [learnAllMode, setLearnAllMode] = useState('learn')
  const [shuffle, setShuffle] = useState(false)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    load()
  }, [folder.id])

  async function load() {
    try {
      setLoading(true)
      const rows = await db.listSets(folder.id)
      setSets(rows)
      setStats(await db.statsBySet(rows.map((s) => s.id)))
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function open(type, set) {
    setDialog({ type, set })
    setName(set?.name ?? '')
    setError('')
  }

  async function submit(e) {
    e?.preventDefault()
    setBusy(true)
    try {
      if (dialog.type === 'create') await db.createSet(user.id, folder.id, name.trim())
      if (dialog.type === 'rename') await db.renameSet(dialog.set.id, name.trim())
      if (dialog.type === 'delete') await db.deleteSet(dialog.set.id)
      setDialog(null)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function startFolderSession() {
    setStarting(true)
    setError('')
    try {
      const cards = await db.listFolderCards(folder.id)
      if (!cards.length) throw new Error('В папке пока нет ни одной карточки.')
      setSession({ mode: learnAllMode, cards: shuffle ? shuffleArray(cards) : cards })
      setLearnAllOpen(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setStarting(false)
    }
  }

  if (session) {
    const exit = () => {
      setSession(null)
      load() // счётчики и прогресс могли измениться за сессию
    }
    return session.mode === 'flash' ? (
      <Flashcards cards={session.cards} setName={`${folder.name} · все слова`} onExit={exit} />
    ) : (
      <Learn cards={session.cards} setName={`${folder.name} · все слова`} onExit={exit} />
    )
  }

  const totalCards = Object.values(stats).reduce((a, s) => a + s.total, 0)
  const totalMastered = Object.values(stats).reduce((a, s) => a + s.mastered, 0)

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{folder.name}</h1>
          {sets.length > 0 && (
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {plural(sets.length, ['набор', 'набора', 'наборов'])} · {plural(totalCards)} · выучено{' '}
              <span
                className={
                  totalMastered === totalCards && totalCards > 0
                    ? 'font-medium text-emerald-600 dark:text-emerald-400'
                    : ''
                }
              >
                {totalMastered}
              </span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="secondary"
            onClick={() => setLearnAllOpen(true)}
            disabled={totalCards === 0}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M10.394 2.08a1.75 1.75 0 0 0-.788 0l-7 1.75A1.75 1.75 0 0 0 1.25 5.53v.216c0 .524.234 1.02.638 1.35l6.75 5.5a1.75 1.75 0 0 0 2.224 0l6.75-5.5c.404-.33.638-.826.638-1.35V5.53a1.75 1.75 0 0 0-1.356-1.7l-7-1.75ZM3.5 9.35v3.9c0 .64.35 1.23.91 1.54 1.44.79 3.36 1.46 5.59 1.46s4.15-.67 5.59-1.46c.56-.31.91-.9.91-1.54v-3.9l-4.8 3.91a3.25 3.25 0 0 1-4.4 0L3.5 9.35Z" />
            </svg>
            <span className="hidden sm:inline">Учить все</span>
          </Button>
          <Button onClick={() => open('create')}>
            <PlusIcon /> <span className="hidden sm:inline">Новый набор</span>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Spinner />
        </div>
      ) : sets.length === 0 ? (
        <EmptyState
          title="В этой папке пока нет наборов"
          action={<Button onClick={() => open('create')}>Создать набор</Button>}
        />
      ) : (
        <ul className="space-y-2">
          {sets.map((s) => {
            const { total = 0, mastered = 0 } = stats[s.id] ?? {}
            const done = total > 0 && mastered === total
            // Округляем к нулю и к сотне: «100%» на невыученном слове и «0%» там,
            // где что-то уже сделано, читались бы как враньё.
            const raw = total ? (mastered / total) * 100 : 0
            const pct = done ? 100 : raw === 0 ? 0 : Math.min(99, Math.max(1, Math.round(raw)))
            return (
            <li key={s.id}>
              <Card
                // ! обязателен: Card уже несёт bg-white и ring-slate-200, приоритет у
                // одиночных утилит одинаковый, и в собранном css побеждает bg-white —
                // без ! плашка выученного набора остаётся белой.
                className={`flex items-center gap-2 p-4 transition ${
                  done
                    ? '!bg-emerald-50 !ring-emerald-400 dark:!bg-emerald-950/40 dark:!ring-emerald-700'
                    : 'hover:ring-indigo-300 dark:hover:ring-indigo-700'
                }`}
              >
                <button
                  onClick={() => onOpen(s)}
                  className="flex min-w-0 flex-1 flex-col gap-1.5 text-left"
                >
                  <span className="flex w-full items-center gap-2">
                    {done && (
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
                        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                          <path
                            fillRule="evenodd"
                            d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.79a1 1 0 0 1 1.4 0Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                    <span
                      className={`shrink-0 text-xs tabular-nums ${
                        done
                          ? 'font-medium text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {mastered} / {total} · {pct}%
                    </span>
                  </span>

                  <ProgressLine pct={pct} done={done} />
                </button>
                <div className="flex shrink-0 gap-1">
                  <IconButton label="Переименовать" onClick={() => open('rename', s)}>
                    <PencilIcon />
                  </IconButton>
                  <IconButton label="Удалить" danger onClick={() => open('delete', s)}>
                    <TrashIcon />
                  </IconButton>
                </div>
              </Card>
            </li>
            )
          })}
        </ul>
      )}

      {!dialog && error && <div className="mt-4"><ErrorText>{error}</ErrorText></div>}

      <Modal open={learnAllOpen} onClose={() => setLearnAllOpen(false)} title="Учить всю папку">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Все слова папки «{folder.name}» — {plural(totalCards)} из{' '}
            {plural(sets.length, ['набора', 'наборов', 'наборов'])} — одной сессией. Прогресс
            сохраняется тем же карточкам, что и при изучении набора по отдельности.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            <ModeOption
              title="Learn"
              hint="Адаптивный тренажёр"
              active={learnAllMode === 'learn'}
              onClick={() => setLearnAllMode('learn')}
            />
            <ModeOption
              title="Flashcards"
              hint="Карточки с переворотом"
              active={learnAllMode === 'flash'}
              onClick={() => setLearnAllMode('flash')}
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg p-1">
            <input
              type="checkbox"
              checked={shuffle}
              onChange={(e) => setShuffle(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 dark:border-slate-600 dark:bg-slate-800"
            />
            <span className="text-sm">
              Перемешать
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                По умолчанию порядок как в папке: наборы подряд, слова внутри набора по порядку.
              </span>
            </span>
          </label>

          <ErrorText>{error}</ErrorText>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLearnAllOpen(false)}>
              Отмена
            </Button>
            <Button onClick={startFolderSession} disabled={starting}>
              {starting && <Spinner className="h-4 w-4" />} Начать
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!dialog}
        onClose={() => setDialog(null)}
        title={
          dialog?.type === 'create'
            ? 'Новый набор'
            : dialog?.type === 'rename'
              ? 'Переименовать набор'
              : 'Удалить набор?'
        }
      >
        {dialog?.type === 'delete' ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Набор «{dialog.set.name}» удалится вместе со всеми карточками. Отменить это нельзя.
            </p>
            <ErrorText>{error}</ErrorText>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDialog(null)}>
                Отмена
              </Button>
              <Button variant="danger" disabled={busy} onClick={submit}>
                {busy && <Spinner className="h-4 w-4" />} Удалить
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Название набора"
              required
            />
            <ErrorText>{error}</ErrorText>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDialog(null)}>
                Отмена
              </Button>
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy && <Spinner className="h-4 w-4" />} Сохранить
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

function ProgressLine({ pct, done }) {
  return (
    <span
      className={`block h-1.5 w-full overflow-hidden rounded-full ${
        done ? 'bg-emerald-200 dark:bg-emerald-900' : 'bg-slate-200 dark:bg-slate-800'
      }`}
    >
      <span
        className="block h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </span>
  )
}

function ModeOption({ title, hint, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg p-3 text-left ring-1 transition ${
        active
          ? 'bg-indigo-50 ring-2 ring-indigo-600 dark:bg-indigo-950/60'
          : 'ring-slate-200 hover:ring-indigo-400 dark:ring-slate-700 dark:hover:ring-indigo-600'
      }`}
    >
      <span className="block text-sm font-medium">{title}</span>
      <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
    </button>
  )
}

