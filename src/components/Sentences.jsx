import { useEffect, useMemo, useRef, useState } from 'react'
import * as db from '../lib/db'
import { markStudied } from '../lib/daily'
import { buildSentences, isCorrectSentence } from '../lib/sentences'
import { nextPraise } from '../lib/praise'
import { playCorrect, playFinish, playWrong } from '../lib/sound'
import {
  Button,
  Card,
  IconArrowLeft,
  IconArrowRight,
  Modal,
  OptionGroup,
  SpeakButton,
  Textarea,
  useSetting,
} from './ui'

/** Сколько предложений в одной сессии. */
const SESSION = 20

/**
 * Режим «Предложения»: показываем фразу на одном языке, вы набираете её на
 * другом. Фразы собираются на лету из слов самого набора — см.
 * [sentences.js](../lib/sentences.js).
 *
 * Прогресс слов этот режим не трогает: в предложении несколько слов, и по
 * одному ответу нельзя сказать, какое из них вы знаете, а на каком споткнулись
 * (можно знать все слова и завалить грамматику, и наоборот). В дневную цель
 * переведённое предложение идёт — иначе занятие выглядело бы пропущенным днём.
 */
export default function Sentences({ cards, setName, onExit }) {
  const [dir, setDir] = useSetting('sentences.direction', 'ru2en') // ru2en | en2ru
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [round, setRound] = useState(0) // «Ещё раз» пересобирает предложения
  const [pos, setPos] = useState(0)
  const [typed, setTyped] = useState('')
  const [feedback, setFeedback] = useState(null) // {correct, given, praise}
  const [stats, setStats] = useState({ correct: 0, wrong: 0 })
  const inputRef = useRef(null)

  // Пересобираем не при каждом рендере, иначе вопрос менялся бы от любого клика.
  const queue = useMemo(() => buildSentences(cards, { count: SESSION }), [cards, round])
  const item = queue[pos]

  useEffect(() => {
    if (!feedback) inputRef.current?.focus()
  }, [pos, feedback])

  if (!queue.length) {
    return (
      <div className="mx-auto max-w-md text-center">
        <div className="text-5xl">🧩</div>
        <h1 className="mt-4 text-xl font-semibold">Из этих слов предложения не собрать</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Режим строит фразы из существительных, глаголов и прилагательных набора. Здесь их не
          хватает — бывает у наборов из фраз, чисел и грамматических пометок.
        </p>
        <Button variant="secondary" onClick={onExit} className="mt-6">
          К набору
        </Button>
      </div>
    )
  }

  if (pos >= queue.length) {
    return (
      <FinalScreen
        stats={stats}
        onExit={onExit}
        onRestart={() => {
          setRound((r) => r + 1)
          setPos(0)
          setStats({ correct: 0, wrong: 0 })
          setFeedback(null)
          setTyped('')
        }}
      />
    )
  }

  const toEn = dir === 'ru2en'
  const prompt = toEn ? item.ru : item.en
  const accepted = toEn ? item.acceptEn : item.acceptRu
  const answer = toEn ? item.en : item.ru

  /** Засчитываем предложение в дневную цель — по одному слову за штуку. */
  function countToday() {
    if (markStudied(`s:${item.key}`)) db.bumpStudyDay(1).catch(() => {})
  }

  function check(e) {
    e?.preventDefault()
    if (feedback) return next()
    if (!typed.trim()) return

    const correct = isCorrectSentence(typed, accepted)
    if (correct) {
      playCorrect()
      countToday()
    } else {
      playWrong()
    }
    setStats((s) => ({ correct: s.correct + (correct ? 1 : 0), wrong: s.wrong + (correct ? 0 : 1) }))
    setFeedback({ correct, given: typed, praise: nextPraise() })
  }

  /**
   * «Всё равно засчитать»: у предложения переводов больше, чем шаблон способен
   * перечислить («I must go» и «I gotta go»), и спорить с собой в одиночном
   * тренажёре смысла нет.
   */
  function acceptAnyway() {
    setStats((s) => ({ correct: s.correct + 1, wrong: Math.max(0, s.wrong - 1) }))
    setFeedback((f) => ({ ...f, correct: true, forced: true }))
    countToday()
  }

  function next() {
    setFeedback(null)
    setTyped('')
    setPos((p) => p + 1)
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={onExit} className="px-2">
          <IconArrowLeft /> <span className="hidden sm:inline">К набору</span>
        </Button>
        <span className="min-w-0 truncate text-sm text-slate-500 dark:text-slate-400">
          {setName} · {pos + 1} / {queue.length}
        </span>
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

      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600 transition-all duration-500"
          style={{ width: `${(pos / queue.length) * 100}%` }}
        />
      </div>

      <Card className="relative overflow-hidden p-6">
        {feedback?.correct && (
          <span className="pointer-events-none absolute inset-x-0 top-6 z-10 animate-float-up text-center font-display text-3xl text-emerald-500 drop-shadow-[0_2px_8px_rgba(255,255,255,0.9)] dark:drop-shadow-[0_2px_8px_rgba(2,6,23,0.9)] sm:text-4xl">
            {feedback.praise}
          </span>
        )}

        <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {toEn ? 'Переведите на английский' : 'Переведите на русский'}
        </p>
        <p className="mt-2 flex items-start gap-2 font-display text-2xl font-semibold sm:text-3xl">
          <span className="min-w-0 flex-1">{prompt}</span>
          {!toEn && <SpeakButton text={item.en} className="mt-1" />}
        </p>

        <form onSubmit={check} className="mt-6 space-y-3">
          {/* textarea, а не input: длинную фразу удобнее видеть целиком, а Enter
              всё равно отправляет ответ. */}
          <Textarea
            ref={inputRef}
            rows={2}
            value={feedback ? feedback.given : typed}
            onChange={(e) => setTyped(e.target.value)}
            readOnly={!!feedback}
            placeholder={toEn ? 'Your answer' : 'Ваш ответ'}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) check(e)
            }}
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

        {feedback && (
          <div className="mt-5 animate-fade-in space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              {feedback.correct ? 'Ответ:' : 'Правильный ответ:'}
              <span className="font-display font-semibold text-emerald-600 dark:text-emerald-400">
                {answer}
              </span>
              {toEn && <SpeakButton text={item.en} size="sm" />}
            </div>

            {/* Слова набора, вокруг которых собрано предложение. */}
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Слова набора: {item.cards.map((c) => c.word_en).join(', ')}
            </p>

            <div className="flex flex-wrap gap-2">
              <Button onClick={next} className="w-full sm:w-auto">
                Дальше <IconArrowRight />
              </Button>
              {!feedback.correct && (
                <Button variant="secondary" onClick={acceptAnyway} className="w-full sm:w-auto">
                  Всё равно засчитать
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>

      <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
        Верно: {stats.correct} · с ошибкой: {stats.wrong}
      </p>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Настройки предложений">
        <div className="space-y-4">
          <OptionGroup
            label="Направление перевода"
            value={dir}
            onChange={setDir}
            options={[
              { value: 'ru2en', label: 'С русского', hint: 'Видите русское — пишете английское' },
              { value: 'en2ru', label: 'С английского', hint: 'Видите английское — пишете русское' },
            ]}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Настройка запоминается и применится сразу. Предложения собираются из слов этого набора:
            незнакомых слов в них не появится, но и набор из одних фраз или чисел режиму не подойдёт.
          </p>
          <div className="flex justify-end">
            <Button onClick={() => setSettingsOpen(false)}>Готово</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function FinalScreen({ stats, onExit, onRestart }) {
  const total = stats.correct + stats.wrong
  const accuracy = total ? Math.round((stats.correct / total) * 100) : 0

  useEffect(() => {
    playFinish()
  }, [])

  return (
    <div className="mx-auto max-w-md text-center">
      <div className="animate-pop text-6xl">📝</div>
      <h1 className="mt-4 text-2xl font-semibold">Предложения пройдены</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Верно {stats.correct} из {total} — точность {accuracy}%.
      </p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button onClick={onRestart}>Ещё раз</Button>
        <Button variant="secondary" onClick={onExit}>
          К набору
        </Button>
      </div>
      <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
        «Ещё раз» соберёт новые предложения из тех же слов.
      </p>
    </div>
  )
}
