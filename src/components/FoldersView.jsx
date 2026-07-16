import { useEffect, useState } from 'react'
import * as db from '../lib/db'
import { Button, Card, EmptyState, ErrorText, Input, Modal, Spinner } from './ui'

export default function FoldersView({ user, onOpen }) {
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState(null) // {type:'create'|'rename'|'delete', folder?}
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      setLoading(true)
      setFolders(await db.listFolders())
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function open(type, folder) {
    setDialog({ type, folder })
    setName(folder?.name ?? '')
    setError('')
  }

  async function submit(e) {
    e?.preventDefault()
    setBusy(true)
    try {
      if (dialog.type === 'create') await db.createFolder(user.id, name.trim())
      if (dialog.type === 'rename') await db.renameFolder(dialog.folder.id, name.trim())
      if (dialog.type === 'delete') await db.deleteFolder(dialog.folder.id)
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
        <div>
          <h1 className="text-2xl font-semibold">Папки</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Например «Финес и Ферб» — внутри наборы по сериям.
          </p>
        </div>
        <Button onClick={() => open('create')}>
          <PlusIcon /> <span className="hidden sm:inline">Новая папка</span>
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Spinner />
        </div>
      ) : folders.length === 0 ? (
        <EmptyState
          title="Пока нет ни одной папки"
          hint="Папка — это тема или сериал. Внутри лежат наборы слов."
          action={<Button onClick={() => open('create')}>Создать первую папку</Button>}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((f) => (
            <li key={f.id}>
              <Card className="group flex items-center gap-2 p-4 transition hover:ring-indigo-300 dark:hover:ring-indigo-700">
                <button
                  onClick={() => onOpen(f)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                    <FolderIcon />
                  </span>
                  <span className="truncate font-medium">{f.name}</span>
                </button>
                <div className="flex shrink-0 gap-1">
                  <IconButton label="Переименовать" onClick={() => open('rename', f)}>
                    <PencilIcon />
                  </IconButton>
                  <IconButton label="Удалить" danger onClick={() => open('delete', f)}>
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
            ? 'Новая папка'
            : dialog?.type === 'rename'
              ? 'Переименовать папку'
              : 'Удалить папку?'
        }
      >
        {dialog?.type === 'delete' ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Папка «{dialog.folder.name}» удалится вместе со всеми наборами и карточками внутри.
              Отменить это нельзя.
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
              placeholder="Название папки"
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

export function IconButton({ children, label, danger, ...props }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800 ${
        danger ? 'hover:text-rose-600' : 'hover:text-slate-700 dark:hover:text-slate-200'
      }`}
      {...props}
    >
      {children}
    </button>
  )
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
    </svg>
  )
}
export function FolderIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path d="M3.75 3A1.75 1.75 0 0 0 2 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0 0 18 15.25v-8.5A1.75 1.75 0 0 0 16.25 5h-5.836a.25.25 0 0 1-.177-.073L8.823 3.513A1.75 1.75 0 0 0 7.586 3H3.75Z" />
    </svg>
  )
}
export function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-.793.793-2.828-2.828.793-.793ZM11.379 5.793 3 14.172V17h2.828l8.38-8.379-2.83-2.828Z" />
    </svg>
  )
}
export function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path
        fillRule="evenodd"
        d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325A41.4 41.4 0 0 1 10 4Zm-.86 3.71a.75.75 0 1 0-1.5.058l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.498Zm3.22.058a.75.75 0 1 0-1.498-.06l-.3 7.5a.75.75 0 0 0 1.498.06l.3-7.5Z"
        clipRule="evenodd"
      />
    </svg>
  )
}
