import { useEffect, useRef, useState } from 'react'
import * as db from '../lib/db'
import { imageUrl } from '../lib/supabase'
import { Button, Card, ErrorText, Input, Modal, OptionGroup, Spinner, useSetting } from './ui'

const MASTERED = 3 // столько правильных ответов подряд — и слово считается выученным

/**
 * Сколько слов тренажёр держит в работе одновременно.
 *
 * Без этого ограничения на большом наборе прогресс стоит намертво: выбирая
 * случайно из полутора тысяч слов, одно и то же слово почти невозможно встретить
 * три раза подряд, а без этого оно не выучится. Поэтому берём небольшую пачку,
 * доводим её до конца и подтягиваем следующие слова.
 */
const ACTIVE_BATCH = 7

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

/** Скобки в термине — это транскрипция или необязательный артикль: «write (рАйт)», «(a) mother». */
const withoutParens = (s) => s.replace(/\([^)]*\)/g, ' ')

/**
 * Что засчитываем за верный ответ. Кроме самого термина принимаем его без
 * скобок, а «cat / kitty» и «country, countryside» — по любому из вариантов.
 */
function answerVariants(expected) {
  const out = new Set()
  const add = (s) => {
    const n = normalize(s)
    if (n) out.add(n)
  }
  add(expected)
  add(withoutParens(expected))
  for (const part of expected.split(/[/,]/)) {
    add(part)
    add(withoutParens(part))
  }
  return out
}

function isCorrectAnswer(given, expected) {
  const g = normalize(given)
  return !!g && answerVariants(expected).has(g)
}

/**
 * Термин, который реально набрать руками. Диалоги в несколько строк и длинные
 * фразы спрашиваем только выбором: напечатать их без опечатки нельзя, слово
 * навсегда осталось бы невыученным и сессия не закончилась бы.
 */
function isTypable(word) {
  return !word.includes('\n') && normalize(withoutParens(word)).length <= 24
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

function buildQuestion(states, allCards, lastId, questionMode) {
  const pool = states.filter((s) => s.mastery < MASTERED)
  if (!pool.length) return null

  // Работаем пачкой: пока эти слова не выучены, следующие не подключаем.
  const active = pool.slice(0, ACTIVE_BATCH)
  // Не спрашиваем то же слово два раза подряд, пока есть выбор.
  const candidates = active.length > 1 ? active.filter((s) => s.id !== lastId) : active
  const st = pickWeighted(candidates.length ? candidates : active)

  // Новые слова — выбором из вариантов, освоенные — ручным вводом.
  let type
  if (questionMode === 'choice') type = 'choice'
  else if (questionMode === 'input') type = 'input'
  else if (st.mastery === 0) type = 'choice'
  else if (st.mastery === 1) type = Math.random() < 0.5 ? 'choice' : 'input'
  else type = 'input'
  if (allCards.length < 2) type = 'input'
  if (type === 'input' && !isTypable(st.card.word_en)) type = 'choice'

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
  const [questionMode, setQuestionMode] = useSetting('learn.questions', 'mix') // mix | choice | input
  const [settingsOpen, setSettingsOpen] = useState(false)

  const nextStatesRef = useRef(states)
  const lastIdRef = useRef(null)
  const timerRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    const q = buildQuestion(states, cards, null, questionMode)
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
    const q = buildQuestion(s, cards, lastIdRef.current, questionMode)
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
      // По id, а не по set_id: в сессии по всей папке карточки из разных наборов.
      await db.resetMasteryForCards(cards.map((c) => c.id))
      const fresh = states.map((s) => ({ ...s, mastery: 0, wrong: 0, errored: false }))
      fresh.forEach((s) => onMastery?.(s.id, 0))
      nextStatesRef.current = fresh
      lastIdRef.current = null
      setStates(fresh)
      setStats({ correct: 0, wrong: 0 })
      setFeedback(null)
      setTyped('')
      setFinished(false)
      setQuestion(buildQuestion(fresh, cards, null, questionMode))
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
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={onExit} className="px-2">
          ← <span className="hidden sm:inline">К набору</span>
        </Button>
        <span className="min-w-0 truncate text-sm text-slate-500 dark:text-slate-400">{setName}</span>
        <Button
          variant="ghost"
          onClick={() => setSettingsOpen(true)}
          className="shrink-0 px-2"
          title="Настройки"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path
              fillRule="evenodd"
              d="M8.34 1.804A1 1 0 0 1 9.32 1h1.36a1 1 0 0 1 .98.804l.295 1.473c.497.144.971.342 1.416.587l1.25-.834a1 1 0 0 1 1.262.125l.962.962a1 1 0 0 1 .125 1.262l-.834 1.25c.245.445.443.919.587 1.416l1.473.294a1 1 0 0 1 .804.98v1.361a1 1 0 0 1-.804.98l-1.473.295a6.95 6.95 0 0 1-.587 1.416l.834 1.25a1 1 0 0 1-.125 1.262l-.962.962a1 1 0 0 1-1.262.125l-1.25-.834c-.445.245-.919.443-1.416.587l-.294 1.473a1 1 0 0 1-.98.804H9.32a1 1 0 0 1-.98-.804l-.295-1.473a6.95 6.95 0 0 1-1.416-.587l-1.25.834a1 1 0 0 1-1.262-.125l-.962-.962a1 1 0 0 1-.125-1.262l.834-1.25a6.95 6.95 0 0 1-.587-1.416l-1.473-.294A1 1 0 0 1 1 10.68V9.32a1 1 0 0 1 .804-.98l1.473-.295c.144-.497.342-.971.587-1.416l-.834-1.25a1 1 0 0 1 .125-1.262l.962-.962A1 1 0 0 1 5.38 3.03l1.25.834a6.95 6.95 0 0 1 1.416-.587l.294-1.473ZM13 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
              clipRule="evenodd"
            />
          </svg>
        </Button>
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
        <p className="mt-2 whitespace-pre-line text-2xl font-semibold sm:text-3xl">{card.word_ru}</p>

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
              <span className="whitespace-pre-line font-semibold text-emerald-600 dark:text-emerald-400">
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

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Настройки Learn">
        <div className="space-y-4">
          <OptionGroup
            label="Тип вопросов"
            value={questionMode}
            onChange={setQuestionMode}
            options={[
              { value: 'mix', label: 'Чередовать', hint: 'Новые слова тестом, знакомые вводом' },
              { value: 'choice', label: 'Только тест', hint: 'Выбор из четырёх вариантов' },
              { value: 'input', label: 'Только ввод', hint: 'Печатать слово целиком' },
            ]}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Новый тип применится со следующего вопроса, настройка запоминается. Длинные фразы и
            диалоги всё равно спрашиваются тестом — их не набрать без опечатки.
          </p>
          <div className="flex justify-end">
            <Button onClick={() => setSettingsOpen(false)}>Готово</Button>
          </div>
        </div>
      </Modal>
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
      className={`whitespace-pre-line rounded-lg px-4 py-3 text-left text-sm font-medium shadow-sm ring-1 transition ${tone}`}
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
    count: Math.max(1, Math.round(total * p)),
  }))

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          Выучено {mastered} из {total}
        </span>
        <span className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
          {Math.round(pct)}%
        </span>
      </div>

      <div className="relative h-5 rounded-full bg-slate-200 shadow-inner dark:bg-slate-800">
        <div
          className="h-full min-w-[1.25rem] rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 shadow-[0_0_12px_rgba(16,185,129,0.5)] transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
        {checkpoints.map(({ p, count }) => {
          const reached = mastered >= count
          return (
            <span
              key={p}
              className={`absolute top-1/2 grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 transition ${
                reached
                  ? 'animate-pop border-emerald-600 bg-emerald-500 text-white'
                  : 'border-slate-300 bg-white text-transparent dark:border-slate-600 dark:bg-slate-900'
              }`}
              style={{ left: `${p * 100}%` }}
              title={`${count} слов`}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.79a1 1 0 0 1 1.4 0Z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
          )
        })}
      </div>

      {/* Подписи позиционируем так же, как отметки, иначе они разъезжаются. */}
      <div className="relative mt-2 h-4">
        {checkpoints.map(({ p, count }) => (
          <span
            key={p}
            className={`absolute text-[11px] tabular-nums ${
              mastered >= count
                ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                : 'text-slate-400 dark:text-slate-500'
            }`}
            style={{
              left: `${p * 100}%`,
              transform: p === 1 ? 'translateX(-100%)' : 'translateX(-50%)',
            }}
          >
            {count}
          </span>
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
          ? 'Все слова выучены.'
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
        «Учить заново» обнуляет прогресс всех слов этой сессии.
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
