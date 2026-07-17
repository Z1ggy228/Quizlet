import { useEffect, useRef, useState } from 'react'
import * as db from '../lib/db'
import { qualityOf } from '../lib/srs'
import { markStudied } from '../lib/daily'
import { speak, speechSupported, stopSpeaking } from '../lib/speech'
import { imageUrl } from '../lib/supabase'
import {
  Button,
  Card,
  ErrorText,
  Input,
  Modal,
  OptionGroup,
  SpeakButton,
  WordInfo,
  useSetting,
} from './ui'
import { shuffle } from './Learn'
import { isCorrectAnswer } from '../lib/answer'
import { nextPraise } from '../lib/praise'
import { playCorrect, playWrong } from '../lib/sound'

const MASTERED = 3

/**
 * Режим на слух: приложение произносит английское слово, поле пустое.
 * Переключателем выбирается, что писать — само слово или его перевод.
 *
 * Слова, которые не набрать без опечатки (диалоги, длинные фразы), из режима
 * исключены: услышать их можно, а напечатать — нет.
 */
export default function Listening({ cards, setName, onMastery, onExit }) {
  const [mode, setMode] = useSetting('listening.answer', 'en') // 'en' | 'ru'
  const [settingsOpen, setSettingsOpen] = useState(false)

  const playable = cards.filter((c) => !/\n/.test(c.word_en) && c.word_en.length <= 32)
  const [queue, setQueue] = useState(() => shuffle(playable))
  const [pos, setPos] = useState(0)
  const [typed, setTyped] = useState('')
  const [feedback, setFeedback] = useState(null) // {correct, given, praise}
  const [stats, setStats] = useState({ correct: 0, wrong: 0 })
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const card = queue[pos]

  // Новое слово сразу проговариваем — иначе непонятно, что делать.
  useEffect(() => {
    if (card) speak(card.word_en)
    return () => stopSpeaking()
  }, [card?.id])

  useEffect(() => {
    if (!feedback) inputRef.current?.focus()
  }, [pos, feedback])

  if (!speechSupported) {
    return (
      <Empty
        onExit={onExit}
        title="Браузер не умеет озвучивать текст"
        hint="Режим на слух работает на встроенном синтезе речи. Откройте приложение в Chrome, Edge или Safari."
      />
    )
  }
  if (!playable.length) {
    return (
      <Empty
        onExit={onExit}
        title="Нечего слушать"
        hint="В этом наборе только длинные фразы и диалоги — их можно услышать, но не набрать без опечатки."
      />
    )
  }

  if (pos >= queue.length) {
    const total = stats.correct + stats.wrong
    return (
      <div className="mx-auto max-w-md text-center">
        <div className="animate-pop text-6xl">🎧</div>
        <h1 className="mt-4 text-2xl font-semibold">Аудирование пройдено</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Услышано верно {stats.correct} из {total}.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            onClick={() => {
              setQueue(shuffle(playable))
              setPos(0)
              setStats({ correct: 0, wrong: 0 })
              setFeedback(null)
              setTyped('')
            }}
          >
            Ещё раз
          </Button>
          <Button variant="secondary" onClick={onExit}>
            К набору
          </Button>
        </div>
      </div>
    )
  }

  const expected = mode === 'en' ? card.word_en : card.word_ru

  function check(e) {
    e.preventDefault()
    if (feedback) {
      next()
      return
    }
    if (!typed.trim()) return

    const correct = isCorrectAnswer(typed, expected)
    const mastery = correct ? Math.min(MASTERED, (card.mastery_level ?? 0) + 1) : 0

    if (correct) playCorrect()
    else playWrong()

    // Ответ на слух — такая же проверка памяти, как в Learn, поэтому он тоже
    // двигает расписание повторений и дневную цель.
    db.recordAnswer(card, { mastery, quality: qualityOf({ correct, type: 'input' }), correct })
      .then((patch) => {
        setQueue((q) => q.map((c) => (c.id === card.id ? { ...c, ...patch } : c)))
      })
      .catch((err) => setError('Прогресс не сохранился: ' + err.message))
    // Как и в Learn: цель считает выученные слова, а не показанные.
    if (mastery >= MASTERED && (card.mastery_level ?? 0) < MASTERED && markStudied(card.id)) {
      db.bumpStudyDay(1).catch(() => {})
    }
    onMastery?.(card.id, mastery)

    setStats((s) => ({
      correct: s.correct + (correct ? 1 : 0),
      wrong: s.wrong + (correct ? 0 : 1),
    }))
    setFeedback({
      correct,
      given: typed,
      praise: nextPraise(),
    })
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
          ← <span className="hidden sm:inline">К набору</span>
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

      <ErrorText>{error}</ErrorText>

      <Card className="relative overflow-hidden p-6 text-center">
        {feedback?.correct && (
          <span className="pointer-events-none absolute inset-x-0 top-6 z-10 animate-float-up text-center font-display text-3xl text-emerald-500 drop-shadow-[0_2px_8px_rgba(255,255,255,0.9)] dark:drop-shadow-[0_2px_8px_rgba(2,6,23,0.9)] sm:text-4xl">
            {feedback.praise}
          </span>
        )}

        <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {mode === 'en' ? 'Запишите, что услышали' : 'Запишите перевод того, что услышали'}
        </p>

        <button
          type="button"
          onClick={() => speak(card.word_en)}
          className="mx-auto my-6 grid h-24 w-24 place-items-center rounded-full bg-indigo-600 text-white shadow-lg transition hover:bg-indigo-500 active:scale-95"
          aria-label="Прослушать ещё раз"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-10 w-10">
            <path d="M10.5 3.75a.75.75 0 0 0-1.24-.57L5.9 6.25H3.5A1.5 1.5 0 0 0 2 7.75v4.5a1.5 1.5 0 0 0 1.5 1.5h2.4l3.36 3.07a.75.75 0 0 0 1.24-.57V3.75Z" />
            <path d="M13.28 6.22a.75.75 0 0 1 1.06 0 5.35 5.35 0 0 1 0 7.56.75.75 0 1 1-1.06-1.06 3.85 3.85 0 0 0 0-5.44.75.75 0 0 1 0-1.06Zm2.47-2.47a.75.75 0 0 1 1.06 0 8.85 8.85 0 0 1 0 12.5.75.75 0 1 1-1.06-1.06 7.35 7.35 0 0 0 0-10.38.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>
        <p className="-mt-3 mb-4 text-xs text-slate-400 dark:text-slate-500">
          Нажмите, чтобы прослушать ещё раз
        </p>

        <form onSubmit={check} className="space-y-3">
          <Input
            ref={inputRef}
            value={feedback ? feedback.given : typed}
            onChange={(e) => setTyped(e.target.value)}
            readOnly={!!feedback}
            placeholder={mode === 'en' ? 'Английское слово' : 'Перевод'}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
            className={`text-center ${
              feedback
                ? feedback.correct
                  ? 'animate-pop ring-2 ring-emerald-500'
                  : 'animate-shake ring-2 ring-rose-500'
                : ''
            }`}
          />
          {!feedback && (
            <Button type="submit" disabled={!typed.trim()} className="w-full sm:w-auto">
              Ответить
            </Button>
          )}
        </form>

        {feedback && (
          <div className="mt-5 animate-fade-in space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="whitespace-pre-line font-display text-xl font-semibold text-emerald-600 dark:text-emerald-400">
                {card.word_en}
              </span>
              <SpeakButton text={card.word_en} size="sm" />
            </div>
            <WordInfo card={card} />
            <p className="text-sm text-slate-500 dark:text-slate-400">{card.word_ru}</p>
            {card.image_path && (
              <img
                src={imageUrl(card.image_path)}
                alt=""
                className="mx-auto max-h-32 rounded-lg object-contain"
              />
            )}
            <Button onClick={next} className="w-full sm:w-auto">
              Дальше →
            </Button>
          </div>
        )}
      </Card>

      <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
        Верно: {stats.correct} · с ошибкой: {stats.wrong}
      </p>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Настройки аудирования">
        <div className="space-y-4">
          <OptionGroup
            label="Что записывать"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'en', label: 'Само слово', hint: 'Услышали — записали по-английски' },
              { value: 'ru', label: 'Перевод', hint: 'Услышали — записали по-русски' },
            ]}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Настройка запоминается и применится со следующего слова.
          </p>
          <div className="flex justify-end">
            <Button onClick={() => setSettingsOpen(false)}>Готово</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function Empty({ title, hint, onExit }) {
  return (
    <div className="mx-auto max-w-md text-center">
      <div className="text-5xl">🔇</div>
      <h1 className="mt-4 text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{hint}</p>
      <Button variant="secondary" onClick={onExit} className="mt-6">
        К набору
      </Button>
    </div>
  )
}
