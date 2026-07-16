import { useEffect, useState } from 'react'
import * as db from '../lib/db'
import { imageUrl } from '../lib/supabase'
import { Button, Card, EmptyState, ErrorText, Modal, plural, Spinner } from './ui'
import { IconButton, PencilIcon, PlusIcon, TrashIcon } from './FoldersView'
import CardDialog from './CardDialog'
import ImportDialog from './ImportDialog'
import Flashcards from './Flashcards'
import Learn from './Learn'

export default function SetView({ user, set }) {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('cards') // 'cards' | 'flash' | 'learn'
  const [cardDialog, setCardDialog] = useState(null) // null | {card?}
  const [importOpen, setImportOpen] = useState(false)
  const [toDelete, setToDelete] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    load()
  }, [set.id])

  async function load() {
    try {
      setLoading(true)
      setCards(await db.listCards(set.id))
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  /** Learn обновляет mastery в базе сам — здесь только синхронизируем список. */
  function applyMastery(cardId, level) {
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, mastery_level: level } : c)))
  }

  async function confirmDelete() {
    setBusy(true)
    try {
      await db.deleteCard(toDelete)
      setCards((prev) => prev.filter((c) => c.id !== toDelete.id))
      setToDelete(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Spinner />
      </div>
    )
  }

  if (mode === 'flash') {
    return <Flashcards cards={cards} onExit={() => setMode('cards')} setName={set.name} />
  }
  if (mode === 'learn') {
    return (
      <Learn
        cards={cards}
        setName={set.name}
        onMastery={applyMastery}
        onExit={() => setMode('cards')}
      />
    )
  }

  const mastered = cards.filter((c) => c.mastery_level >= 3).length

  return (
    <div>
      <div className="mb-5">
        <h1 className="truncate text-2xl font-semibold">{set.name}</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {plural(cards.length, ['карточка', 'карточки', 'карточек'])} · выучено {mastered}
        </p>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <ModeButton
          title="Flashcards"
          hint="Карточки с переворотом"
          disabled={cards.length === 0}
          onClick={() => setMode('flash')}
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M2 4.75A1.75 1.75 0 0 1 3.75 3h12.5A1.75 1.75 0 0 1 18 4.75v8.5A1.75 1.75 0 0 1 16.25 15H3.75A1.75 1.75 0 0 1 2 13.25v-8.5ZM5 17.25a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1-.75-.75Z" />
            </svg>
          }
        />
        <ModeButton
          title="Learn"
          hint="Адаптивный тренажёр"
          disabled={cards.length === 0}
          onClick={() => setMode('learn')}
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M10.394 2.08a1.75 1.75 0 0 0-.788 0l-7 1.75A1.75 1.75 0 0 0 1.25 5.53v.216c0 .524.234 1.02.638 1.35l6.75 5.5a1.75 1.75 0 0 0 2.224 0l6.75-5.5c.404-.33.638-.826.638-1.35V5.53a1.75 1.75 0 0 0-1.356-1.7l-7-1.75ZM3.5 9.35v3.9c0 .64.35 1.23.91 1.54 1.44.79 3.36 1.46 5.59 1.46s4.15-.67 5.59-1.46c.56-.31.91-.9.91-1.54v-3.9l-4.8 3.91a3.25 3.25 0 0 1-4.4 0L3.5 9.35Z" />
            </svg>
          }
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => setCardDialog({})}>
          <PlusIcon /> Добавить слова
        </Button>
        <Button variant="secondary" onClick={() => setImportOpen(true)}>
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
            <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
          </svg>
          Импортировать слова
        </Button>
      </div>

      <ErrorText>{error}</ErrorText>

      {cards.length === 0 ? (
        <EmptyState
          title="В наборе пока нет слов"
          hint="Добавьте их по одному или вставьте пачкой из Quizlet."
          action={<Button onClick={() => setCardDialog({})}>Добавить первое слово</Button>}
        />
      ) : (
        <ul className="space-y-2">
          {cards.map((c) => (
            <li key={c.id}>
              <Card className="flex items-center gap-3 p-3">
                {c.image_path ? (
                  <img
                    src={imageUrl(c.image_path)}
                    alt=""
                    loading="lazy"
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-300 dark:bg-slate-800 dark:text-slate-600">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                      <path d="M1 5.25A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25v9.5A2.25 2.25 0 0 1 16.75 17H3.25A2.25 2.25 0 0 1 1 14.75v-9.5Zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75v-2.69l-2.22-2.219a.75.75 0 0 0-1.06 0l-1.91 1.909.47.47a.75.75 0 1 1-1.06 1.06L6.53 8.091a.75.75 0 0 0-1.06 0l-2.97 2.97ZM12 7a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z" />
                    </svg>
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  {/* line-clamp, а не truncate: у части карточек значения в несколько строк */}
                  <p className="line-clamp-2 whitespace-pre-line font-display font-medium">
                    {c.word_en}
                  </p>
                  <p className="line-clamp-2 whitespace-pre-line text-sm text-slate-500 dark:text-slate-400">
                    {c.word_ru}
                  </p>
                  {c.context && (
                    <p className="mt-0.5 truncate text-xs italic text-slate-400 dark:text-slate-500">
                      {c.context}
                    </p>
                  )}
                </div>

                <MasteryDots level={c.mastery_level} />

                <div className="flex shrink-0 gap-1">
                  <IconButton label="Редактировать" onClick={() => setCardDialog({ card: c })}>
                    <PencilIcon />
                  </IconButton>
                  <IconButton label="Удалить" danger onClick={() => setToDelete(c)}>
                    <TrashIcon />
                  </IconButton>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <CardDialog
        open={!!cardDialog}
        onClose={() => setCardDialog(null)}
        user={user}
        set={set}
        card={cardDialog?.card ?? null}
        onSaved={(created) => (created ? setCards((prev) => [...prev, created]) : load())}
      />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        user={user}
        set={set}
        onImported={(created) => setCards((prev) => [...prev, ...created])}
      />

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Удалить карточку?">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            «{toDelete?.word_en}» удалится вместе с картинкой.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setToDelete(null)}>
              Отмена
            </Button>
            <Button variant="danger" disabled={busy} onClick={confirmDelete}>
              {busy && <Spinner className="h-4 w-4" />} Удалить
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function ModeButton({ title, hint, icon, ...props }) {
  return (
    <button
      className="flex items-center gap-3 rounded-xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 transition
        hover:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:ring-slate-200
        dark:bg-slate-900 dark:ring-slate-800 dark:hover:ring-indigo-600 dark:disabled:hover:ring-slate-800"
      {...props}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
        {icon}
      </span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
      </span>
    </button>
  )
}

export function MasteryDots({ level }) {
  return (
    <span
      className="hidden shrink-0 gap-1 sm:flex"
      title={`Уровень освоения: ${level} из 3`}
      aria-label={`Уровень освоения: ${level} из 3`}
    >
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={`h-1.5 w-4 rounded-full ${
            i <= level ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'
          }`}
        />
      ))}
    </span>
  )
}
