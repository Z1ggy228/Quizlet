import { useEffect, useState } from 'react'
import * as db from '../lib/db'
import { Button, Card, EmptyState, ErrorText, Input, Modal, Spinner } from './ui'
import { IconButton, PencilIcon, PlusIcon, TrashIcon } from './FoldersView'

export default function SetsView({ user, folder, onOpen }) {
  const [sets, setSets] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    load()
  }, [folder.id])

  async function load() {
    try {
      setLoading(true)
      const rows = await db.listSets(folder.id)
      setSets(rows)
      setCounts(await db.countCardsBySet(rows.map((s) => s.id)))
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

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{folder.name}</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Наборы внутри папки — например «Серия 1».
          </p>
        </div>
        <Button onClick={() => open('create')}>
          <PlusIcon /> <span className="hidden sm:inline">Новый набор</span>
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Spinner />
        </div>
      ) : sets.length === 0 ? (
        <EmptyState
          title="В этой папке пока нет наборов"
          hint="Набор — это порция слов, которую вы учите за раз."
          action={<Button onClick={() => open('create')}>Создать набор</Button>}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sets.map((s) => (
            <li key={s.id}>
              <Card className="flex items-center gap-2 p-4 transition hover:ring-indigo-300 dark:hover:ring-indigo-700">
                <button
                  onClick={() => onOpen(s)}
                  className="flex min-w-0 flex-1 flex-col items-start text-left"
                >
                  <span className="w-full truncate font-medium">{s.name}</span>
                  <span className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {plural(counts[s.id] || 0)}
                  </span>
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
          ))}
        </ul>
      )}

      {!dialog && error && <div className="mt-4"><ErrorText>{error}</ErrorText></div>}

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

function plural(n) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} слово`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} слова`
  return `${n} слов`
}
