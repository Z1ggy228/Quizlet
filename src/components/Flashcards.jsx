import { useEffect, useMemo, useRef, useState } from 'react'
import { imageUrl } from '../lib/supabase'
import { nextPraise } from '../lib/praise'
import { playClick, playCorrect } from '../lib/sound'
import {
  Button,
  Card,
  IconArrowLeft,
  IconArrowRight,
  Modal,
  OptionGroup,
  SpeakButton,
  WordInfo,
  useSetting,
} from './ui'

// Насколько далеко надо утащить карточку, чтобы это засчиталось за ответ.
const SWIPE = 110

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function Flashcards({ cards, setName, onExit }) {
  const [front, setFront] = useSetting('flashcards.front', 'ru') // 'ru' | 'en'
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [deck, setDeck] = useState(() => cards)
  const [pos, setPos] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [known, setKnown] = useState([]) // id карточек, помеченных «знаю»
  const [unknown, setUnknown] = useState([])
  const [finished, setFinished] = useState(false)
  const [praise, setPraise] = useState(null)

  // Перетаскивание: dx — смещение по горизонтали, leaving — сторона, в которую
  // карточка улетает после ответа.
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [leaving, setLeaving] = useState(null) // null | 'right' | 'left'
  const startX = useRef(0)
  const moved = useRef(false)
  const timer = useRef(null)

  const card = deck[pos]

  useEffect(() => () => clearTimeout(timer.current), [])

  function reset(next) {
    clearTimeout(timer.current)
    setDeck(next)
    setPos(0)
    setFlipped(false)
    setKnown([])
    setUnknown([])
    setFinished(false)
    setDx(0)
    setLeaving(null)
  }

  function advance(delta) {
    setFlipped(false)
    setPos((p) => Math.min(Math.max(p + delta, 0), deck.length - 1))
  }

  /** Ответ свайпом или кнопкой: вправо — знаю, влево — не знаю. */
  function grade(isKnown) {
    if (leaving) return
    setLeaving(isKnown ? 'right' : 'left')
    if (isKnown) {
      setKnown((k) => [...k, card.id])
      setPraise(nextPraise())
      playCorrect()
    } else {
      setUnknown((u) => [...u, card.id])
      playClick()
    }
    // Даём карточке улететь, только потом показываем следующую.
    timer.current = setTimeout(() => {
      setLeaving(null)
      setDx(0)
      setPraise(null)
      if (pos >= deck.length - 1) setFinished(true)
      else advance(1)
    }, 260)
  }

  function onPointerDown(e) {
    if (leaving) return
    // Захват указателя нужен, чтобы карточка тянулась и за пределами своей рамки;
    // если браузер его не даёт — перетаскивание всё равно должно работать.
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* не критично */
    }
    startX.current = e.clientX
    moved.current = false
    setDragging(true)
  }

  function onPointerMove(e) {
    if (!dragging) return
    const d = e.clientX - startX.current
    if (Math.abs(d) > 6) moved.current = true
    setDx(d)
  }

  function onPointerUp() {
    if (!dragging) return
    setDragging(false)
    if (Math.abs(dx) >= SWIPE) grade(dx > 0)
    else {
      setDx(0)
      // Короткое нажатие без протяжки — это клик, переворачиваем карточку.
      if (!moved.current) setFlipped((f) => !f)
    }
  }

  useEffect(() => {
    const onKey = (e) => {
      if (finished) return
      if (e.key === 'ArrowRight') advance(1)
      if (e.key === 'ArrowLeft') advance(-1)
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setFlipped((f) => !f)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deck.length, finished])

  if (finished) {
    const stillLearning = deck.filter((c) => unknown.includes(c.id))
    return (
      <FinalScreen
        known={known.length}
        unknown={unknown.length}
        total={deck.length}
        onExit={onExit}
        onRepeatUnknown={stillLearning.length ? () => reset(stillLearning) : null}
        onRestart={() => reset(cards)}
      />
    )
  }

  if (!card) return null

  const faceRu = <span className="whitespace-pre-line font-display">{card.word_ru}</span>
  const faceEn = (
    <span className="whitespace-pre-line font-display text-indigo-600 dark:text-indigo-400">
      {card.word_en}
    </span>
  )
  // Транскрипция и озвучка нужны только рядом с английским словом.
  const enExtras = (
    <>
      <div className="flex items-center justify-center gap-1">
        <SpeakButton text={card.word_en} />
      </div>
      <WordInfo card={card} />
    </>
  )
  // Оборот всегда несёт картинку и контекст — они привязаны к слову, а не к стороне.
  const extras = (
    <>
      {card.image_path && (
        <img src={imageUrl(card.image_path)} alt="" className="max-h-40 rounded-lg object-contain" />
      )}
      {card.context && (
        <p className="max-w-md whitespace-pre-line text-sm italic text-slate-500 dark:text-slate-400">
          «{card.context}»
        </p>
      )}
    </>
  )

  // Чем дальше утащили, тем заметнее подсветка стороны.
  const intensity = Math.min(Math.abs(dx) / SWIPE, 1)
  const offset = leaving === 'right' ? 700 : leaving === 'left' ? -700 : dx

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={onExit} className="px-2">
          <IconArrowLeft /> <span className="hidden sm:inline">К набору</span>
        </Button>
        <span className="min-w-0 truncate text-sm text-slate-500 dark:text-slate-400">
          {setName} · {pos + 1} / {deck.length}
        </span>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" onClick={() => setSettingsOpen(true)} className="px-2" title="Настройки">
            <GearIcon />
          </Button>
          <Button variant="ghost" onClick={() => reset(shuffle(cards))} className="px-2" title="Перемешать">
            <ShuffleIcon />
          </Button>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3 text-sm font-medium tabular-nums">
        <span className="text-rose-600 dark:text-rose-400">Не знаю: {unknown.length}</span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <span
            className="block h-full rounded-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${((pos + (leaving ? 1 : 0)) / deck.length) * 100}%` }}
          />
        </span>
        <span className="text-emerald-600 dark:text-emerald-400">Знаю: {known.length}</span>
      </div>

      {/* Слой перетаскивания. touch-none — иначе палец на телефоне скроллит страницу. */}
      <div
        className={`relative touch-none select-none ${leaving || !dragging ? 'transition-transform duration-300' : ''}`}
        style={{
          transform: `translateX(${offset}px) rotate(${offset / 28}deg)`,
          opacity: leaving ? 0 : 1,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="flip-scene">
          <div className={`flip-card relative h-[22rem] w-full cursor-grab active:cursor-grabbing sm:h-[26rem] ${flipped ? 'is-flipped' : ''}`}>
            <div className="flip-face absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
              <p className="text-3xl font-semibold sm:text-4xl">{front === 'ru' ? faceRu : faceEn}</p>
              {front === 'en' && enExtras}
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                Нажмите, чтобы перевернуть · тяните вправо «знаю», влево «не знаю»
              </p>
            </div>
            <div className="flip-face flip-face-back absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
              <p className="text-3xl font-semibold sm:text-4xl">{front === 'ru' ? faceEn : faceRu}</p>
              {front === 'ru' && enExtras}
              {extras}
            </div>
          </div>
        </div>

        {/* Подсветка ответа поверх карточки */}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl transition-colors"
          style={{
            backgroundColor:
              dx > 0
                ? `rgba(16, 185, 129, ${intensity * 0.28})`
                : dx < 0
                  ? `rgba(244, 63, 94, ${intensity * 0.28})`
                  : 'transparent',
            boxShadow: intensity > 0.15 ? `0 0 0 3px ${dx > 0 ? '#10b981' : '#f43f5e'}` : 'none',
          }}
        />
        {intensity > 0.15 && (
          <span
            className={`pointer-events-none absolute top-6 rounded-lg border-4 px-3 py-1 text-xl font-extrabold uppercase tracking-wide ${
              dx > 0
                ? 'right-6 rotate-12 border-emerald-500 text-emerald-500'
                : 'left-6 -rotate-12 border-rose-500 text-rose-500'
            }`}
            style={{ opacity: intensity }}
          >
            {dx > 0 ? 'Знаю' : 'Не знаю'}
          </span>
        )}
        {praise && (
          <span className="pointer-events-none absolute inset-x-0 top-1/3 z-10 animate-float-up text-center font-display text-3xl text-emerald-500 drop-shadow-[0_2px_8px_rgba(255,255,255,0.9)] dark:drop-shadow-[0_2px_8px_rgba(2,6,23,0.9)] sm:text-4xl">
            {praise}
          </span>
        )}
      </div>

      <div className="mt-5 flex items-center justify-center gap-2">
        <Button
          variant="secondary"
          onClick={() => grade(false)}
          className="flex-1 border-rose-200 !text-rose-600 ring-rose-200 hover:!bg-rose-50 dark:!text-rose-400 dark:ring-rose-900 dark:hover:!bg-rose-950/50 sm:flex-none sm:px-8"
        >
          ✕ Не знаю
        </Button>
        <Button variant="ghost" onClick={() => advance(-1)} disabled={pos === 0} className="px-2" title="Предыдущая">
          <IconArrowLeft className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          onClick={() => advance(1)}
          disabled={pos === deck.length - 1}
          className="px-2"
          title="Следующая"
        >
          <IconArrowRight className="h-5 w-5" />
        </Button>
        <Button
          variant="secondary"
          onClick={() => grade(true)}
          className="flex-1 !text-emerald-600 ring-emerald-200 hover:!bg-emerald-50 dark:!text-emerald-400 dark:ring-emerald-900 dark:hover:!bg-emerald-950/50 sm:flex-none sm:px-8"
        >
          ✓ Знаю
        </Button>
      </div>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Настройки Flashcards">
        <div className="space-y-4">
          <OptionGroup
            label="Лицевая сторона"
            value={front}
            onChange={setFront}
            options={[
              { value: 'ru', label: 'Русский', hint: 'Вспоминаете английское слово' },
              { value: 'en', label: 'Английский', hint: 'Вспоминаете перевод' },
            ]}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Картинка и контекст всегда на обороте. Настройка запоминается.
          </p>
          <div className="flex justify-end">
            <Button onClick={() => setSettingsOpen(false)}>Готово</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function FinalScreen({ known, unknown, total, onExit, onRepeatUnknown, onRestart }) {
  const graded = known + unknown
  const pct = graded ? Math.round((known / graded) * 100) : 0
  return (
    <div className="mx-auto max-w-md text-center">
      <div className="animate-pop text-6xl">{pct === 100 ? '🏆' : '🎉'}</div>
      <h1 className="mt-4 text-2xl font-semibold">Колода пройдена</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {unknown === 0 ? 'Все карточки отмечены как знакомые.' : 'Незнакомые можно сразу повторить.'}
      </p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {known}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">знаю</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-semibold tabular-nums text-rose-600 dark:text-rose-400">
            {unknown}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">не знаю</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-semibold tabular-nums">{total}</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">всего</p>
        </Card>
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        {onRepeatUnknown && <Button onClick={onRepeatUnknown}>Повторить незнакомые ({unknown})</Button>}
        <Button variant="secondary" onClick={onRestart}>
          Начать заново
        </Button>
        <Button variant="secondary" onClick={onExit}>
          К набору
        </Button>
      </div>
    </div>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path
        fillRule="evenodd"
        d="M8.34 1.804A1 1 0 0 1 9.32 1h1.36a1 1 0 0 1 .98.804l.295 1.473c.497.144.971.342 1.416.587l1.25-.834a1 1 0 0 1 1.262.125l.962.962a1 1 0 0 1 .125 1.262l-.834 1.25c.245.445.443.919.587 1.416l1.473.294a1 1 0 0 1 .804.98v1.361a1 1 0 0 1-.804.98l-1.473.295a6.95 6.95 0 0 1-.587 1.416l.834 1.25a1 1 0 0 1-.125 1.262l-.962.962a1 1 0 0 1-1.262.125l-1.25-.834c-.445.245-.919.443-1.416.587l-.294 1.473a1 1 0 0 1-.98.804H9.32a1 1 0 0 1-.98-.804l-.295-1.473a6.95 6.95 0 0 1-1.416-.587l-1.25.834a1 1 0 0 1-1.262-.125l-.962-.962a1 1 0 0 1-.125-1.262l.834-1.25a6.95 6.95 0 0 1-.587-1.416l-1.473-.294A1 1 0 0 1 1 10.68V9.32a1 1 0 0 1 .804-.98l1.473-.295c.144-.497.342-.971.587-1.416l-.834-1.25a1 1 0 0 1 .125-1.262l.962-.962A1 1 0 0 1 5.38 3.03l1.25.834a6.95 6.95 0 0 1 1.416-.587l.294-1.473ZM13 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function ShuffleIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M3 5.5h3.2c1 0 2 .5 2.6 1.4l3.4 5c.6.9 1.6 1.4 2.6 1.4H17" />
      <path d="M3 14.4h3.2c1 0 2-.5 2.6-1.4l.9-1.3" />
      <path d="M11.3 8.3l.9-1.4c.6-.9 1.6-1.4 2.6-1.4H17" />
      <path d="M15 3.5l2 2-2 2M15 11.4l2 2-2 2" />
    </svg>
  )
}
