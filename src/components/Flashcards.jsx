import { useEffect, useMemo, useState } from 'react'
import { imageUrl } from '../lib/supabase'
import { Button } from './ui'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function Flashcards({ cards, setName, onExit }) {
  const [order, setOrder] = useState(() => cards.map((_, i) => i))
  const [pos, setPos] = useState(0)
  const [flipped, setFlipped] = useState(false)

  const card = useMemo(() => cards[order[pos]], [cards, order, pos])

  const go = (delta) => {
    setFlipped(false)
    setPos((p) => Math.min(Math.max(p + delta, 0), order.length - 1))
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setFlipped((f) => !f)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [order.length])

  if (!card) return null

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onExit} className="px-2">
          ← <span className="hidden sm:inline">К набору</span>
        </Button>
        <span className="truncate text-sm text-slate-500 dark:text-slate-400">
          {setName} · {pos + 1} / {order.length}
        </span>
        <Button
          variant="secondary"
          onClick={() => {
            setOrder(shuffle(order))
            setPos(0)
            setFlipped(false)
          }}
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M3 5.5h3.2c1 0 2 .5 2.6 1.4l3.4 5c.6.9 1.6 1.4 2.6 1.4H17" />
            <path d="M3 14.4h3.2c1 0 2-.5 2.6-1.4l.9-1.3" />
            <path d="M11.3 8.3l.9-1.4c.6-.9 1.6-1.4 2.6-1.4H17" />
            <path d="M15 3.5l2 2-2 2M15 11.4l2 2-2 2" />
          </svg>
          <span className="hidden sm:inline">Перемешать</span>
        </Button>
      </div>

      <div className="flip-scene">
        <div
          className={`flip-card relative h-[22rem] w-full cursor-pointer sm:h-[26rem] ${
            flipped ? 'is-flipped' : ''
          }`}
          onClick={() => setFlipped((f) => !f)}
          role="button"
          tabIndex={0}
          aria-label="Перевернуть карточку"
        >
          {/* Лицо: русское слово */}
          <div className="flip-face absolute inset-0 flex flex-col items-center justify-center overflow-y-auto rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            <p className="whitespace-pre-line text-3xl font-semibold sm:text-4xl">{card.word_ru}</p>
            <p className="mt-6 text-xs text-slate-400 dark:text-slate-500">
              Нажмите, чтобы перевернуть
            </p>
          </div>

          {/* Оборот: английское слово, картинка, контекст */}
          <div className="flip-face flip-face-back absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-y-auto rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            <p className="whitespace-pre-line text-3xl font-semibold text-indigo-600 dark:text-indigo-400 sm:text-4xl">
              {card.word_en}
            </p>
            {card.image_path && (
              <img
                src={imageUrl(card.image_path)}
                alt=""
                className="max-h-40 rounded-lg object-contain"
              />
            )}
            {card.context && (
              <p className="max-w-md text-sm italic text-slate-500 dark:text-slate-400">
                «{card.context}»
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-center gap-3">
        <Button variant="secondary" onClick={() => go(-1)} disabled={pos === 0}>
          ← Назад
        </Button>
        <Button variant="secondary" onClick={() => go(1)} disabled={pos === order.length - 1}>
          Вперёд →
        </Button>
      </div>
      <p className="mt-3 text-center text-xs text-slate-400 dark:text-slate-500">
        Пробел — перевернуть, стрелки — листать
      </p>
    </div>
  )
}
