import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import AuthScreen from './components/AuthScreen'
import FoldersView from './components/FoldersView'
import SetsView from './components/SetsView'
import SetView from './components/SetView'
import StatsView from './components/StatsView'
import { Button, Card, Spinner, ThemeToggle } from './components/ui'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  // Навигация без роутера: два уровня вложенности, обратно — по хлебным крошкам.
  const [folder, setFolder] = useState(null)
  const [set, setSet] = useState(null)
  const [stats, setStats] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) {
        setFolder(null)
        setSet(null)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!isSupabaseConfigured) return <ConfigNotice />

  if (loading) {
    return (
      <div className="grid min-h-full place-items-center text-slate-400">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (!session) return <AuthScreen />

  const user = session.user
  const home = () => {
    setFolder(null)
    setSet(null)
    setStats(false)
  }

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-slate-50/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <button onClick={home} className="flex shrink-0 items-center gap-2">
            <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-lg" />
            <span className="hidden font-display text-lg sm:inline">Ziglish</span>
          </button>

          {stats ? (
            <nav className="flex min-w-0 items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
              <span className="text-slate-300 dark:text-slate-600">/</span>
              <span className="text-slate-900 dark:text-slate-100">Статистика</span>
            </nav>
          ) : (
            <Breadcrumbs
              folder={folder}
              set={set}
              onRoot={home}
              onFolder={() => setSet(null)}
            />
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <span className="hidden max-w-[12rem] truncate text-xs text-slate-500 dark:text-slate-400 lg:inline">
              {user.email}
            </span>
            <Button
              variant="ghost"
              onClick={() => {
                setStats((v) => !v)
                setFolder(null)
                setSet(null)
              }}
              className="px-2"
              aria-label="Статистика"
              title="Статистика"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 3 0v-13A1.5 1.5 0 0 0 15.5 2ZM10 7a1.5 1.5 0 0 0-1.5 1.5v8a1.5 1.5 0 0 0 3 0v-8A1.5 1.5 0 0 0 10 7ZM4.5 11A1.5 1.5 0 0 0 3 12.5v4a1.5 1.5 0 0 0 3 0v-4A1.5 1.5 0 0 0 4.5 11Z" />
              </svg>
            </Button>
            <ThemeToggle />
            <Button
              variant="ghost"
              onClick={() => supabase.auth.signOut()}
              className="px-2"
              aria-label="Выйти"
              title="Выйти"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path
                  fillRule="evenodd"
                  d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z"
                  clipRule="evenodd"
                />
                <path
                  fillRule="evenodd"
                  d="M6 10a.75.75 0 0 1 .75-.75h9.19l-1.97-1.72a.75.75 0 1 1 1.06-1.06l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 1 1-1.06-1.06l1.97-1.72H6.75A.75.75 0 0 1 6 10Z"
                  clipRule="evenodd"
                />
              </svg>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        {stats ? (
          <StatsView user={user} />
        ) : set ? (
          <SetView user={user} set={set} />
        ) : folder ? (
          <SetsView user={user} folder={folder} onOpen={setSet} />
        ) : (
          <FoldersView user={user} onOpen={setFolder} />
        )}
      </main>
    </div>
  )
}

function Breadcrumbs({ folder, set, onRoot, onFolder }) {
  if (!folder) return null
  return (
    <nav className="flex min-w-0 items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
      <span className="text-slate-300 dark:text-slate-600">/</span>
      <button onClick={onRoot} className="shrink-0 hover:text-slate-900 dark:hover:text-slate-100">
        Папки
      </button>
      <span className="text-slate-300 dark:text-slate-600">/</span>
      <button
        onClick={onFolder}
        className={`max-w-[8rem] truncate hover:text-slate-900 dark:hover:text-slate-100 ${
          set ? '' : 'text-slate-900 dark:text-slate-100'
        }`}
      >
        {folder.name}
      </button>
      {set && (
        <>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <span className="max-w-[8rem] truncate text-slate-900 dark:text-slate-100">
            {set.name}
          </span>
        </>
      )}
    </nav>
  )
}

function ConfigNotice() {
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <Card className="max-w-lg p-6">
        <h1 className="text-lg font-semibold">Нужно подключить Supabase</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Откройте файл <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">src/lib/supabase.js</code>{' '}
          и вставьте свои значения в переменные{' '}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">SUPABASE_URL</code> и{' '}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">SUPABASE_ANON_KEY</code>.
          Найти их можно в панели Supabase: Settings → API.
        </p>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          Затем выполните SQL из файла{' '}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">supabase/migration.sql</code>{' '}
          в SQL Editor вашего проекта.
        </p>
      </Card>
    </div>
  )
}
