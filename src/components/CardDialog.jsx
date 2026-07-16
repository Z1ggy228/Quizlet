import { useEffect, useRef, useState } from 'react'
import * as db from '../lib/db'
import { imageUrl } from '../lib/supabase'
import { Button, ErrorText, Label, Modal, Spinner, Textarea } from './ui'

const empty = { word_en: '', word_ru: '', context: '' }

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
  const enRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setForm(card ? { word_en: card.word_en, word_ru: card.word_ru, context: card.context ?? '' } : empty)
    setFile(null)
    setPreview(card?.image_path ? imageUrl(card.image_path) : null)
    setKeepImage(true)
    setError('')
    setAddedCount(0)
    setJustAdded('')
  }, [open, card])

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
        <Textarea
          ref={enRef}
          autoFocus
          rows={1}
          value={form.word_en}
          onChange={(e) => setForm({ ...form, word_en: e.target.value })}
          onKeyDown={submitOnEnter}
          placeholder="Английское слово"
          aria-label="Английское слово"
          required
        />

        <Textarea
          rows={1}
          value={form.word_ru}
          onChange={(e) => setForm({ ...form, word_ru: e.target.value })}
          onKeyDown={submitOnEnter}
          placeholder="Перевод"
          aria-label="Перевод"
          required
        />

        <div>
          <Label>Изображение</Label>
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
    </Modal>
  )
}
