import { forwardRef, useEffect, useState } from 'react'
import { speak, speechSupported } from '../lib/speech'

const variants = {
  primary:
    'bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:outline-indigo-600 disabled:bg-indigo-600/50',
  secondary:
    'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-700',
  ghost:
    'text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
  danger: 'bg-rose-600 text-white hover:bg-rose-500',
}

export function Button({ variant = 'primary', className = '', ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
        disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      {...props}
    />
  )
}

export const Input = forwardRef(function Input({ className = '', ...props }, ref) {
  return (
    <input
      ref={ref}
      className={`w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm
        ring-1 ring-inset ring-slate-300 placeholder:text-slate-400
        focus:ring-2 focus:ring-inset focus:ring-indigo-600
        dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700 dark:placeholder:text-slate-500
        dark:focus:ring-indigo-500 ${className}`}
      {...props}
    />
  )
})

export const Textarea = forwardRef(function Textarea({ className = '', ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={`w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm
        ring-1 ring-inset ring-slate-300 placeholder:text-slate-400
        focus:ring-2 focus:ring-inset focus:ring-indigo-600
        dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700 dark:placeholder:text-slate-500
        dark:focus:ring-indigo-500 ${className}`}
      {...props}
    />
  )
})

export function Label({ children, className = '' }) {
  return (
    <span className={`mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400 ${className}`}>
      {children}
    </span>
  )
}

export function Card({ className = '', ...props }) {
  return (
    <div
      className={`rounded-xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 ${className}`}
      {...props}
    />
  )
}

export function Modal({ open, onClose, title, children, wide = false }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl
          animate-fade-in dark:bg-slate-900 sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="-m-1 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Закрыть"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Кнопка «прослушать». Если браузер не умеет синтез речи — её просто нет. */
export function SpeakButton({ text, className = '', size = 'md' }) {
  const [busy, setBusy] = useState(false)
  if (!speechSupported || !text) return null

  const px = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
  return (
    <button
      type="button"
      aria-label="Прослушать"
      title="Прослушать"
      onClick={async (e) => {
        e.stopPropagation() // на карточке клик переворачивает — озвучка не должна
        setBusy(true)
        await speak(text)
        setBusy(false)
      }}
      className={`shrink-0 rounded-lg p-1.5 transition ${
        busy
          ? 'text-indigo-600 dark:text-indigo-400'
          : 'text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400'
      } ${className}`}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className={px}>
        <path d="M10.5 3.75a.75.75 0 0 0-1.24-.57L5.9 6.25H3.5A1.5 1.5 0 0 0 2 7.75v4.5a1.5 1.5 0 0 0 1.5 1.5h2.4l3.36 3.07a.75.75 0 0 0 1.24-.57V3.75Z" />
        {busy && (
          <path d="M13.28 6.22a.75.75 0 0 1 1.06 0 5.35 5.35 0 0 1 0 7.56.75.75 0 1 1-1.06-1.06 3.85 3.85 0 0 0 0-5.44.75.75 0 0 1 0-1.06Zm2.47-2.47a.75.75 0 0 1 1.06 0 8.85 8.85 0 0 1 0 12.5.75.75 0 1 1-1.06-1.06 7.35 7.35 0 0 0 0-10.38.75.75 0 0 1 0-1.06Z" />
        )}
        {!busy && (
          <path d="M13.28 6.22a.75.75 0 0 1 1.06 0 5.35 5.35 0 0 1 0 7.56.75.75 0 1 1-1.06-1.06 3.85 3.85 0 0 0 0-5.44.75.75 0 0 1 0-1.06Z" />
        )}
      </svg>
    </button>
  )
}

/** Транскрипция и часть речи рядом со словом. */
export function WordInfo({ card, className = '' }) {
  if (!card?.transcription && !card?.part_of_speech) return null
  return (
    <span className={`flex flex-wrap items-center justify-center gap-2 text-sm ${className}`}>
      {card.transcription && (
        <span className="text-slate-500 dark:text-slate-400">{card.transcription}</span>
      )}
      {card.part_of_speech && (
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          {card.part_of_speech}
        </span>
      )}
    </span>
  )
}

export function Spinner({ className = '' }) {
  return (
    <svg className={`h-5 w-5 animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
      />
    </svg>
  )
}

export function EmptyState({ title, hint, action }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
      <p className="font-medium text-slate-700 dark:text-slate-300">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

export function ErrorText({ children }) {
  if (!children) return null
  return (
    <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
      {children}
    </p>
  )
}

/** Склонение: plural(2, ['слово','слова','слов']) → «2 слова». */
export function plural(n, forms = ['слово', 'слова', 'слов']) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} ${forms[0]}`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} ${forms[1]}`
  return `${n} ${forms[2]}`
}

/** Настройка режима, переживающая перезагрузку: хранится локально в браузере. */
export function useSetting(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(key) ?? initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* приватный режим — переживём без сохранения */
    }
  }, [key, value])
  return [value, setValue]
}

/** Выбор одного варианта из нескольких — плитками, а не радиокнопками. */
export function OptionGroup({ label, value, onChange, options }) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-lg p-3 text-left ring-1 transition ${
              value === o.value
                ? 'bg-indigo-50 ring-2 ring-indigo-600 dark:bg-indigo-950/60'
                : 'ring-slate-200 hover:ring-indigo-400 dark:ring-slate-700 dark:hover:ring-indigo-600'
            }`}
          >
            <span className="block text-sm font-medium">{o.label}</span>
            {o.hint && (
              <span className="block text-xs text-slate-500 dark:text-slate-400">{o.hint}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])
  return [dark, setDark]
}

export function ThemeToggle() {
  const [dark, setDark] = useTheme()
  return (
    <Button
      variant="ghost"
      onClick={() => setDark(!dark)}
      aria-label={dark ? 'Светлая тема' : 'Тёмная тема'}
      className="px-2"
    >
      {dark ? (
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
          <path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 2ZM10 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 1.75a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75ZM18 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 18 10ZM4.25 10.75a.75.75 0 0 0 0-1.5h-1.5a.75.75 0 0 0 0 1.5h1.5ZM15.657 4.343a.75.75 0 0 1 0 1.06l-1.06 1.061a.75.75 0 1 1-1.061-1.06l1.06-1.06a.75.75 0 0 1 1.06 0ZM6.464 14.596a.75.75 0 0 0-1.06-1.06l-1.061 1.06a.75.75 0 1 0 1.06 1.06l1.061-1.06ZM4.343 4.343a.75.75 0 0 1 1.06 0l1.061 1.06a.75.75 0 0 1-1.06 1.061l-1.061-1.06a.75.75 0 0 1 0-1.061ZM14.596 13.536a.75.75 0 0 0-1.06 1.06l1.06 1.061a.75.75 0 0 0 1.06-1.06l-1.06-1.061Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
          <path d="M7.455 2.004a.75.75 0 0 1 .26.77 7 7 0 0 0 9.958 7.967.75.75 0 0 1 1.067.853A8.5 8.5 0 1 1 6.647 1.921a.75.75 0 0 1 .808.083Z" />
        </svg>
      )}
    </Button>
  )
}
