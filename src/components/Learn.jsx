import { useEffect, useRef, useState } from 'react'
import * as db from '../lib/db'
import { imageUrl } from '../lib/supabase'
import { Button, Card, ErrorText, Input, Spinner } from './ui'

const MASTERED = 3 // столько правильных ответов подряд — и слово считается выученным

const PRAISE = [
  'Отлично!',
  'Точно в цель!',
  'Так держать!',
  'Идеально!',
  'Красота!',
  'Ты в ударе!',
  'Влёт!',
  'Супер!',
  'Как по нотам!',
  'Чётко!',
]

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Сравниваем ответы мягко: регистр, пробелы, артикль и пунктуация не важны. */
function normalize(s) {
  return s
    .toLowerCase()
    .trim()
    .replace(/^(to|a|an|the)\s+/, '')
    .replace(/[.,!?;:"'`’]/g, '')
    .replace(/\s+/g, ' ')
}

function isCorrectAnswer(given, expected) {
  const g = normalize(given)
  if (!g) return false
  // «cat / kitty» и «cat, kitty» — засчитываем любой из вариантов.
  return expected
    .split(/[/,]/)
    .map(normalize)
    .filter(Boolean)
    .some((v) => v === g)
}

/**
 * Вес карточки в выдаче: чем хуже освоено и чем больше ошибок в этой сессии,
 * тем чаще слово всплывает.
 */
function weightOf(st) {
  const base = [6, 4, 2][st.mastery] ?? 1
  return base + Math.min(st.wrong, 3) * 3
}

function pickWeighted(pool) {
  const total = pool.reduce((sum, st) => sum + weightOf(st), 0)
  let r = Math.random() * total
  for (const st of pool) {
    r -= weightOf(st)
    if (r <= 0) return st
  }
  return pool[pool.length - 1]
}

function buildQuestion(states, allCards, lastId) {
  const pool = states.filter((s) => s.mastery < MASTERED)
  if (!pool.length) return null

  // Не спрашиваем то же слово два раза подряд, пока есть выбор.
  const candidates = pool.length > 1 ? pool.filter((s) => s.id !== lastId) : pool
  const st = pickWeighted(candidates.length ? candidates : pool)

  // Новые слова — выбором из вариантов, освоенные — ручным вводом.
  let type
  if (st.mastery === 0) type = 'choice'
  else if (st.mastery === 1) type = Math.random() < 0.5 ? 'choice' : 'input'
  else type = 'input'
  if (allCards.length < 2) type = 'input'

  let options = null
  if (type === 'choice') {
    const distractors = shuffle(
      allCards.filter((c) => c.id !== st.id && c.word_en !== st.card.word_en).map((c) => c.word_en),
    ).slice(0, 3)
    options = shuffle([st.card.word_en, ...new Set(distractors)])
  }

  return { state: st, type, options }
}

export default function Learn({ cards, setName, onMastery, onExit }) {
  const [states, setStates] = useState(() =>
    cards.map((c) => ({ id: c.id, card: c, mastery: c.mastery_level ?? 0, wrong: 0, errored: false })),
  )
  const [question, setQuestion] = useState(null)
  const [feedback, setFeedback] = useState(null) // {correct, given, praise}
  const [typed, setTyped] = useState('')
  const [finished, setFinished] = useState(false)
  const [stats, setStats] = useState({ correct: 0, wrong: 0 })
  const [error, setError] = useState('')
  const [resetting, setResetting] = useState(false)

  const nextStatesRef = useRef(states)
  const lastIdRef = useRef(null)
  const timerRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    const q = buildQuestion(states, cards, null)
    if (q) setQuestion(q)
    else setFinished(true)
    return () => clearTimeout(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (question?.type === 'input' && !feedback) inputRef.current?.focus()
  }, [question, feedback])

  function advance() {
    clearTimeout(timerRef.current)
    const s = nextStatesRef.current
    const q = buildQuestion(s, cards, lastIdRef.current)
    setFeedback(null)
    setTyped('')
    if (!q) setFinished(true)
    else setQuestion(q)
  }

  function answer(given) {
    if (feedback) return
    const st = question.state
    const correct = isCorrectAnswer(given, st.card.word_en)

    // mastery = число верных ответов подряд, ошибка обнуляет счётчик.
    const mastery = correct ? Math.min(MASTERED, st.mastery + 1) : 0

    const newStates = states.map((s) =>
      s.id === st.id
        ? { ...s, mastery, wrong: s.wrong + (correct ? 0 : 1), errored: s.errored || !correct }
        : s,
    )
    nextStatesRef.current = newStates
    lastIdRef.current = st.id
    setStates(newStates)
    setStats((p) => ({
      correct: p.correct + (correct ? 1 : 0),
      wrong: p.wrong + (correct ? 0 : 1),
    }))

    // Прогресс уходит в базу сразу, чтобы он не потерялся при закрытии вкладки.
    db.setMastery(st.id, mastery).catch((e) => setError('Прогресс не сохранился: ' + e.message))
    onMastery?.(st.id, mastery)

    setFeedback({
      correct,
      given,
      praise: PRAISE[Math.floor(Math.random() * PRAISE.length)],
    })

    // Верный ответ пролистываем сами, на ошибке даём разглядеть правильный.
    if (correct) timerRef.current = setTimeout(advance, 900)
  }

  async function restart() {
    setResetting(true)
    try {
      await db.resetMastery(cards[0].set_id)
      const fresh = states.map((s) => ({ ...s, mastery: 0, wrong: 0, errored: false }))
      fresh.forEach((s) => onMastery?.(s.id, 0))
      nextStatesRef.current = fresh
      lastIdRef.current = null
      setStates(fresh)
      setStats({ correct: 0, wrong: 0 })
      setFeedback(null)
      setTyped('')
      setFinished(false)
      setQuestion(buildQuestion(fresh, cards, null))
    } catch (e) {
      setError(e.message)
    } finally {
      setResetting(false)
    }
  }

  const total = states.length
  const mastered = states.filter((s) => s.mastery >= MASTERED).length
  const toReview = states.filter((s) => s.errored && s.mastery < MASTERED).length

  if (finished) {
    return (
      <FinalScreen
        total={total}
        mastered={mastered}
        reviewed={states.filter((s) => s.errored).length}
        stats={stats}
        onExit={onExit}
        onRestart={restart}
        resetting={resetting}
        error={error}
      />
    )
  }

  if (!question) return null

  const card = question.state.card

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onExit} className="px-2">
          ← <span className="hidden sm:inline">К набору</span>
        </Button>
        <span className="truncate text-sm text-slate-500 dark:text-slate-400">{setName}</span>
        <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">
          {mastered} / {total}
        </span>
      </div>

      <ProgressBar mastered={mastered} total={total} />

      <ErrorText>{error}</ErrorText>

      <Card className="relative mt-5 overflow-hidden p-6">
        {feedback?.correct && (
          <span className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 animate-float-up text-sm font-semibold text-emerald-500">
            {feedback.praise}
          </span>
        )}

        <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {question.type === 'choice' ? 'Выберите перевод' : 'Напишите по-английски'}
        </p>
        <p className="mt-2 text-2xl font-semibold sm:text-3xl">{card.word_ru}</p>

        {question.type === 'choice' ? (
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {question.options.map((opt) => (
              <ChoiceButton
                key={opt}
                option={opt}
                feedback={feedback}
                answer={card.word_en}
                onClick={() => answer(opt)}
              />
            ))}
          </div>
        ) : (
          <form
            className="mt-6 space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (feedback) advance()
              else if (typed.trim()) answer(typed)
            }}
          >
            <Input
              ref={inputRef}
              value={feedback ? feedback.given : typed}
              onChange={(e) => setTyped(e.target.value)}
              readOnly={!!feedback}
              placeholder="Ваш ответ"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck="false"
              className={
                feedback
                  ? feedback.correct
                    ? 'animate-pop ring-2 ring-emerald-500'
                    : 'animate-shake ring-2 ring-rose-500'
                  : ''
              }
            />
            {!feedback && (
              <Button type="submit" disabled={!typed.trim()} className="w-full sm:w-auto">
                Ответить
              </Button>
            )}
          </form>
        )}

        {feedback && !feedback.correct && (
          <div className="mt-5 animate-fade-in space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Правильный ответ:{' '}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {card.word_en}
              </span>
            </p>
            {card.image_path && (
              <img
                src={imageUrl(card.image_path)}
                alt=""
                className="max-h-32 rounded-lg object-contain"
              />
            )}
            {card.context && (
              <p className="text-sm italic text-slate-500 dark:text-slate-400">«{card.context}»</p>
            )}
            <Button onClick={advance} className="w-full sm:w-auto">
              Дальше →
            </Button>
          </div>
        )}
      </Card>

      <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
        Верно: {stats.correct} · с ошибкой: {stats.wrong}
        {toReview > 0 && ` · на повторении: ${toReview}`}
      </p>
    </div>
  )
}

function ChoiceButton({ option, feedback, answer, onClick }) {
  const isAnswer = option === answer
  const isPicked = feedback?.given === option

  let tone =
    'bg-white ring-slate-200 hover:ring-indigo-400 dark:bg-slate-900 dark:ring-slate-700 dark:hover:ring-indigo-500'
  if (feedback) {
    if (isAnswer)
      tone =
        'bg-emerald-50 ring-emerald-500 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 animate-pop'
    else if (isPicked)
      tone =
        'bg-rose-50 ring-rose-500 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 animate-shake'
    else tone = 'bg-white opacity-50 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800'
  }

  return (
    <button
      type="button"
      disabled={!!feedback}
      onClick={onClick}
      className={`rounded-lg px-4 py-3 text-left text-sm font-medium shadow-sm ring-1 transition ${tone}`}
    >
      {option}
    </button>
  )
}

function ProgressBar({ mastered, total }) {
  const pct = total ? (mastered / total) * 100 : 0
  // Чекпоинты — четверти набора, в подписи количество слов.
  const checkpoints = [0.25, 0.5, 0.75, 1].map((p) => ({
    p,
    count: Math.max(1, Math.ceil(total * p)),
  }))

  return (
    <div>
      <div className="relative h-2.5 rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
        {checkpoints.map(({ p, count }) => {
          const reached = mastered >= count
          return (
            <span
              key={p}
              className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition ${
                reached
                  ? 'animate-pop border-emerald-500 bg-emerald-500'
                  : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'
              }`}
              style={{ left: `${p * 100}%` }}
              title={`${count} слов`}
            >
              {reached && (
                <svg viewBox="0 0 20 20" fill="white" className="h-full w-full p-0.5">
                  <path
                    fillRule="evenodd"
                    d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.79a1 1 0 0 1 1.4 0Z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </span>
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
        {checkpoints.map(({ p, count }) => (
          <span key={p}>{count}</span>
        ))}
      </div>
    </div>
  )
}

function FinalScreen({ total, mastered, reviewed, stats, onExit, onRestart, resetting, error }) {
  const accuracy = stats.correct + stats.wrong
    ? Math.round((stats.correct / (stats.correct + stats.wrong)) * 100)
    : 0

  return (
    <div className="mx-auto max-w-md text-center">
      <div className="animate-pop text-6xl">🎉</div>
      <h1 className="mt-4 text-2xl font-semibold">Сессия завершена</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {mastered === total
          ? 'Все слова набора выучены.'
          : 'Прогресс сохранён — можно продолжить позже.'}
      </p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat value={mastered} label="выучено" tone="text-emerald-600 dark:text-emerald-400" />
        <Stat value={reviewed} label="на повторение" tone="text-amber-600 dark:text-amber-400" />
        <Stat value={`${accuracy}%`} label="точность" />
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button onClick={onExit}>К набору</Button>
        <Button variant="secondary" onClick={onRestart} disabled={resetting}>
          {resetting && <Spinner className="h-4 w-4" />} Учить заново
        </Button>
      </div>
      <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
        «Учить заново» обнуляет прогресс всех слов набора.
      </p>
    </div>
  )
}

function Stat({ value, label, tone = '' }) {
  return (
    <Card className="p-4">
      <p className={`text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </Card>
  )
}
