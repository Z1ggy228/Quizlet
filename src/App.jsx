import { useEffect, useRef, useState } from 'react'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import * as db from './lib/db'
import {
  CARDS,
  currentPath,
  entitySlug,
  folderPath,
  folderSessionPath,
  go,
  parseRoute,
  ROUTE_EVENT,
  rootPath,
  setPath,
  statsPath,
} from './lib/route'
import AuthScreen from './components/AuthScreen'
import FoldersView from './components/FoldersView'
import SetsView from './components/SetsView'
import SetView from './components/SetView'
import StatsView from './components/StatsView'
import { Button, Card, ErrorText, Spinner } from './components/ui'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  // Где мы находимся — в адресе, а не в состоянии: иначе «назад» в браузере
  // уводит из приложения целиком, а F5 возвращает к списку папок.
  const [route, setRoute] = useState(() => parseRoute(currentPath()))
  // Папка и набор целиком: по прямой ссылке в памяти их нет, дочитываем по id.
  const [folder, setFolder] = useState(null)
  const [set, setSet] = useState(null)
  const [routeError, setRouteError] = useState('')
  // Мы ли сами добавили в историю запись режима — от этого зависит, как из него
  // выходить (см. changeMode ниже).
  const modeHistoryRef = useRef(false)

  useEffect(() => {
    // popstate — кнопки «назад» и «вперёд», своё событие — наши переходы:
    // pushState сам по себе ничего не вызывает.
    const onNav = () => setRoute(parseRoute(currentPath()))
    window.addEventListener('popstate', onNav)
    window.addEventListener(ROUTE_EVENT, onNav)
    return () => {
      window.removeEventListener('popstate', onNav)
      window.removeEventListener(ROUTE_EVENT, onNav)
    }
  }, [])

  // Ссылка старого образца (#/angliyskiy-s-nulya) — переписываем на обычный
  // путь, чтобы в адресной строке не оставалось решётки.
  useEffect(() => {
    if (window.location.hash.startsWith('#/')) {
      window.history.replaceState(null, '', window.location.hash.slice(1))
    }
  }, [])

  // Из режима могли выйти и кнопкой браузера — тогда снимать запись уже нечего.
  useEffect(() => {
    const inMode = route.view === 'folderSession' || (route.mode && route.mode !== CARDS)
    if (!inMode) modeHistoryRef.current = false
  }, [route.view, route.mode])

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
      if (!s) go(rootPath(), { replace: true })
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  /**
   * Подтягиваем папку и набор под текущий адрес. Пока не подтянули, экран ниже
   * показывает спиннер: рисовать набор, не зная его названия, нечем.
   *
   * В адресе название, а не id, поэтому ищем перебором по списку. Списки
   * короткие (папок единицы, наборов десятки), и лишний запрос случается только
   * при заходе по прямой ссылке — при переходах внутри приложения нужный объект
   * уже в руках и совпадает по slug.
   */
  useEffect(() => {
    if (!session) return
    let cancelled = false

    async function resolve() {
      if (!route.folderSlug) {
        setFolder(null)
        setSet(null)
        return
      }
      try {
        setRouteError('')
        let f = entitySlug(folder) === route.folderSlug ? folder : null
        if (!f) {
          const folders = await db.listFolders()
          if (cancelled) return
          f = folders.find((x) => entitySlug(x) === route.folderSlug) ?? null
        }
        // Папку могли удалить или переименовать, а ссылка осталась. replace, а не
        // обычный переход: иначе «назад» вернёт на ту же мёртвую ссылку.
        if (!f) return go(rootPath(), { replace: true })

        let s = null
        if (route.setSlug) {
          s = set?.folder_id === f.id && entitySlug(set) === route.setSlug ? set : null
          if (!s) {
            // Наборы отсортированы по позиции: при одинаковых названиях ссылка
            // всегда ведёт в один и тот же — первый.
            const sets = await db.listSets(f.id)
            if (cancelled) return
            s = sets.find((x) => entitySlug(x) === route.setSlug) ?? null
          }
          if (!s) return go(folderPath(f), { replace: true })
        }
        setFolder(f)
        setSet(s)
      } catch (e) {
        if (!cancelled) setRouteError(e.message)
      }
    }

    resolve()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, route.folderSlug, route.setSlug])

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
  const home = () => go(rootPath())

  /**
   * Вход в занятие — новой записью в истории, выход — шагом назад по ней.
   *
   * Если выходить обычным переходом, в истории остаётся пара «набор → режим →
   * набор», и первое нажатие «назад» выглядит как холостое. Шаг назад снимает
   * запись режима ровно так, как её и добавили. Но когда режим открыт по прямой
   * ссылке (закладка или F5 посреди занятия), снимать нечего — там нужен
   * replace, иначе «назад» уведёт из приложения.
   */
  const enterMode = (path) => {
    modeHistoryRef.current = true
    go(path)
  }
  const exitMode = (fallback) => {
    if (modeHistoryRef.current) {
      modeHistoryRef.current = false
      return window.history.back()
    }
    go(fallback, { replace: true })
  }
  // Данные под адрес доехали? Пока нет — рисуем спиннер вместо чужого экрана.
  const ready =
    route.view === 'root' ||
    route.view === 'stats' ||
    (entitySlug(folder) === route.folderSlug &&
      (!route.setSlug || entitySlug(set) === route.setSlug))

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-slate-50/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <button onClick={home} className="flex shrink-0 items-center gap-2">
            <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-lg" />
            <span className="hidden font-display text-lg sm:inline">Ziglish</span>
          </button>

          {/* Хлебных крошек тут больше нет: где мы находимся, видно по заголовку
              экрана и по адресу, а «на уровень выше» отдано кнопке «назад» в
              браузере — она теперь работает (см. route.js). Логотип слева
              возвращает к списку папок. */}

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              onClick={() => go(route.view === 'stats' ? rootPath() : statsPath())}
              className="px-2"
              aria-label="Статистика"
              title="Статистика"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 3 0v-13A1.5 1.5 0 0 0 15.5 2ZM10 7a1.5 1.5 0 0 0-1.5 1.5v8a1.5 1.5 0 0 0 3 0v-8A1.5 1.5 0 0 0 10 7ZM4.5 11A1.5 1.5 0 0 0 3 12.5v4a1.5 1.5 0 0 0 3 0v-4A1.5 1.5 0 0 0 4.5 11Z" />
              </svg>
            </Button>
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
        {routeError ? (
          <div className="space-y-4">
            <ErrorText>{routeError}</ErrorText>
            <Button onClick={home}>К списку папок</Button>
          </div>
        ) : !ready ? (
          <div className="flex justify-center py-16 text-slate-400">
            <Spinner />
          </div>
        ) : route.view === 'stats' ? (
          <StatsView user={user} />
        ) : route.view === 'set' ? (
          <SetView
            user={user}
            set={set}
            mode={route.mode}
            onMode={(m) =>
              m === CARDS
                ? exitMode(setPath(folder, set))
                : enterMode(setPath(folder, set, m))
            }
          />
        ) : route.view === 'folder' || route.view === 'folderSession' ? (
          <SetsView
            user={user}
            folder={folder}
            sessionMode={route.view === 'folderSession' ? route.mode : null}
            onSession={(m) =>
              m ? enterMode(folderSessionPath(folder, m)) : exitMode(folderPath(folder))
            }
            onOpen={(s) => go(setPath(folder, s))}
          />
        ) : (
          <FoldersView user={user} onOpen={(f) => go(folderPath(f))} />
        )}
      </main>
    </div>
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
