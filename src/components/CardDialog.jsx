import { useEffect, useRef, useState } from 'react'
import * as db from '../lib/db'
import { imageUrl } from '../lib/supabase'
import { lookupWord } from '../lib/dictionary'
import { downloadImage, imagesConfigured, searchImages, trackDownload } from '../lib/images'
import { Button, ErrorText, Label, Modal, SpeakButton, Spinner, Textarea } from './ui'

const empty = { word_en: '', word_ru: '', context: '', transcription: '', part_of_speech: '' }

/**
 * Слово и перевод — textarea, а не input: у части карточек значения в несколько
 * строк, а input по спецификации вырезает переносы и молча портил бы их при
 * правке. Enter при этом по-прежнему отправляет форму, перенос — Shift+Enter.
 */
function submitOnEnter(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    e.currentTarget.form?.requestSubmit()
  }
}

/**
 * Одна форма на два случая: добавление пачкой (card === null) и правка одной
 * карточки. В режиме добавления форма не закрывается — очищается и ждёт
 * следующее слово, счётчик показывает, сколько добавлено за подход.
 */
export default function CardDialog({ open, onClose, user, set, card, onSaved }) {
  const editing = !!card
  const [form, setForm] = useState(empty)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [keepImage, setKeepImage] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [addedCount, setAddedCount] = useState(0)
  const [justAdded, setJustAdded] = useState('')
  const [lookingUp, setLookingUp] = useState(false)
  const [picker, setPicker] = useState(null) // null | {loading, photos, error}
  const enRef = useRef(null)
  const lookedUp = useRef('')
  // Что в полях транскрипции и части речи: подстановка словаря или ручной ввод.
  const autoFilled = useRef({ transcription: false, part_of_speech: false })

  useEffect(() => {
    if (!open) return
    setForm(
      card
        ? {
            word_en: card.word_en,
            word_ru: card.word_ru,
            context: card.context ?? '',
            transcription: card.transcription ?? '',
            part_of_speech: card.part_of_speech ?? '',
          }
        : empty,
    )
    setFile(null)
    setPreview(card?.image_path ? imageUrl(card.image_path) : null)
    setKeepImage(true)
    setError('')
    setAddedCount(0)
    setJustAdded('')
    setPicker(null)
    lookedUp.current = ''
    // У существующей карточки поля пришли из базы — считаем их своими.
    autoFilled.current = { transcription: false, part_of_speech: false }
  }, [open, card])

  /**
   * Транскрипция и часть речи подтягиваются, когда слово дописано. Молча: если
   * слова нет в словаре или он недоступен, поля просто остаются пустыми и их
   * можно заполнить руками.
   *
   * Помним, что в полях — наша подстановка или ручной ввод. Иначе получается
   * так: набрали слово, словарь заполнил транскрипцию, поменяли слово — а
   * защита «не затирать введённое руками» видит непустое поле и оставляет
   * транскрипцию от предыдущего слова.
   */
  async function autofill(word) {
    const w = word.trim()
    if (!w || w === lookedUp.current) return
    lookedUp.current = w
    setLookingUp(true)
    try {
      const info = await lookupWord(w)
      // Пока ходили в словарь, слово могли переписать: ответ по старому слову
      // приезжает позже и иначе подставился бы к новому.
      if (lookedUp.current !== w) return

      const mine = autoFilled.current
      setForm((f) => ({
        ...f,
        transcription: mine.transcription || !f.transcription ? info?.transcription || '' : f.transcription,
        part_of_speech:
          mine.part_of_speech || !f.part_of_speech ? info?.part_of_speech || '' : f.part_of_speech,
      }))
      autoFilled.current = {
        transcription: !!info?.transcription,
        part_of_speech: !!info?.part_of_speech,
      }
    } finally {
      if (lookedUp.current === w) setLookingUp(false)
    }
  }

  function pickFile(f) {
    if (!f) return
    if (!f.type.startsWith('image/')) {
      setError('Это не картинка.')
      return
    }
    if (f.size > 5 * 1024 * 1024) {
      setError('Файл больше 5 МБ — выберите поменьше.')
      return
    }
    setError('')
    setFile(f)
    setKeepImage(false)
    setPreview(URL.createObjectURL(f))
  }

  function clearImage() {
    setFile(null)
    setPreview(null)
    setKeepImage(false)
  }

  async function openPicker() {
    setPicker({ loading: true, photos: [], error: '' })
    try {
      const photos = await searchImages(form.word_en)
      setPicker({ loading: false, photos, error: '' })
    } catch (e) {
      setPicker({ loading: false, photos: [], error: e.message })
    }
  }

  async function choosePhoto(photo) {
    setPicker((p) => ({ ...p, loading: true }))
    try {
      const f = await downloadImage(photo)
      trackDownload(photo)
      setFile(f)
      setKeepImage(false)
      setPreview(URL.createObjectURL(f))
      setPicker(null)
    } catch (e) {
      setPicker((p) => ({ ...p, loading: false, error: e.message }))
    }
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.word_en.trim() || !form.word_ru.trim()) return
    setBusy(true)
    setError('')
    try {
      let image_path = editing ? (keepImage ? card.image_path : null) : null
      if (file) image_path = await db.uploadCardImage(user.id, file)

      if (editing) {
        // Старый файл убираем только после успешной загрузки нового.
        if (card.image_path && card.image_path !== image_path) {
          await db.removeCardImage(card.image_path)
        }
        await db.updateCard(card.id, {
          word_en: form.word_en.trim(),
          word_ru: form.word_ru.trim(),
          context: form.context.trim() || null,
          transcription: form.transcription.trim() || null,
          part_of_speech: form.part_of_speech.trim() || null,
          image_path,
        })
        onSaved()
        onClose()
      } else {
        const created = await db.createCard(user.id, set.id, { ...form, image_path })
        onSaved(created)
        setAddedCount((n) => n + 1)
        setJustAdded(created.word_en)
        setForm(empty)
        setFile(null)
        setPreview(null)
        lookedUp.current = ''
        enRef.current?.focus()
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Редактировать карточку' : 'Добавить слова'}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-start gap-2">
          <Textarea
            ref={enRef}
            autoFocus
            rows={1}
            value={form.word_en}
            onChange={(e) => setForm({ ...form, word_en: e.target.value })}
            onBlur={(e) => autofill(e.target.value)}
            onKeyDown={submitOnEnter}
            placeholder="Английское слово"
            aria-label="Английское слово"
            required
          />
          <SpeakButton text={form.word_en} className="mt-1" />
        </div>

        <Textarea
          rows={1}
          value={form.word_ru}
          onChange={(e) => setForm({ ...form, word_ru: e.target.value })}
          onKeyDown={submitOnEnter}
          placeholder="Перевод"
          aria-label="Перевод"
          required
        />

        {/* Заполняется само из словаря, но всегда можно поправить руками. */}
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <Textarea
              rows={1}
              value={form.transcription}
              onChange={(e) => {
                autoFilled.current.transcription = false // тронули руками — словарь больше не хозяин
                setForm({ ...form, transcription: e.target.value })
              }}
              onKeyDown={submitOnEnter}
              placeholder="Транскрипция"
              aria-label="Транскрипция"
            />
            {lookingUp && (
              <Spinner className="absolute right-2 top-2.5 h-4 w-4 text-slate-400" />
            )}
          </div>
          <Textarea
            rows={1}
            value={form.part_of_speech}
            onChange={(e) => {
              autoFilled.current.part_of_speech = false
              setForm({ ...form, part_of_speech: e.target.value })
            }}
            onKeyDown={submitOnEnter}
            placeholder="Часть речи"
            aria-label="Часть речи"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="mb-0">Изображение</Label>
            <button
              type="button"
              onClick={openPicker}
              disabled={!form.word_en.trim()}
              className="text-xs font-medium text-indigo-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 dark:text-indigo-400 dark:disabled:text-slate-600"
            >
              Подобрать картинку
            </button>
          </div>
          {preview ? (
            <div className="relative">
              <img
                src={preview}
                alt=""
                className="h-40 w-full rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-800"
              />
              <button
                type="button"
                onClick={clearImage}
                className="absolute right-2 top-2 rounded-lg bg-slate-900/70 px-2 py-1 text-xs text-white hover:bg-slate-900"
              >
                Убрать
              </button>
            </div>
          ) : (
            <label
              className="flex h-24 cursor-pointer items-center justify-center rounded-lg border border-dashed
                border-slate-300 text-sm text-slate-500 transition hover:border-indigo-400 hover:text-indigo-600
                dark:border-slate-700 dark:text-slate-400 dark:hover:border-indigo-600"
            >
              Выбрать файл
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
            </label>
          )}
        </div>

        <Textarea
          rows={2}
          value={form.context}
          onChange={(e) => setForm({ ...form, context: e.target.value })}
          placeholder="Предложение-контекст"
          aria-label="Предложение-контекст"
        />

        <ErrorText>{error}</ErrorText>

        {!editing && addedCount > 0 && (
          <p
            key={addedCount}
            className="animate-pop rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
          >
            Добавлено «{justAdded}». Всего за подход: {addedCount}.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {editing ? 'Отмена' : 'Готово'}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <Spinner className="h-4 w-4" />}
            {editing ? 'Сохранить' : 'Добавить и продолжить'}
          </Button>
        </div>
      </form>

      <ImagePicker
        state={picker}
        word={form.word_en}
        onClose={() => setPicker(null)}
        onPick={choosePhoto}
        onRetry={openPicker}
      />
    </Modal>
  )
}

function ImagePicker({ state, word, onClose, onPick, onRetry }) {
  if (!state) return null
  return (
    <Modal open onClose={onClose} title={`Картинка для «${word.trim()}»`} wide>
      {state.loading ? (
        <div className="flex justify-center py-12 text-slate-400">
          <Spinner className="h-6 w-6" />
        </div>
      ) : state.error ? (
        <div className="space-y-4">
          <ErrorText>{state.error}</ErrorText>
          {!imagesConfigured && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Вставьте свой Access Key в{' '}
              <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">src/lib/images.js</code>{' '}
              — где его взять, написано там же в комментарии. Картинку с диска можно выбрать и без
              ключа.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Закрыть
            </Button>
            {imagesConfigured && <Button onClick={onRetry}>Ещё раз</Button>}
          </div>
        </div>
      ) : state.photos.length === 0 ? (
        <div className="space-y-4">
          <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            По этому слову ничего не нашлось. Попробуйте синоним попроще или выберите файл с диска.
          </p>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Закрыть
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {state.photos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p)}
                className="group overflow-hidden rounded-lg ring-1 ring-slate-200 transition hover:ring-2 hover:ring-indigo-500 dark:ring-slate-700"
                title={`Фото: ${p.author}`}
              >
                <img
                  src={p.thumb}
                  alt={p.alt}
                  loading="lazy"
                  className="h-24 w-full object-cover transition group-hover:scale-105"
                />
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Фотографии с Unsplash. Нажмите на любую — она загрузится в вашу карточку.
          </p>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Отмена
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
