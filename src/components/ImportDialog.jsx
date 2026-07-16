import { useMemo, useState } from 'react'
import * as db from '../lib/db'
import { Button, ErrorText, Input, Label, Modal, Spinner, Textarea } from './ui'

// Разделители удобнее показывать как escape-последовательности: \t и \n
// иначе их не набрать в обычном текстовом поле.
const PRESETS = {
  term: [
    { label: 'Таб', value: '\\t' },
    { label: 'Запятая', value: ',' },
    { label: 'Тире', value: ' - ' },
  ],
  card: [
    { label: 'Новая строка', value: '\\n' },
    { label: 'Точка с запятой', value: ';' },
    { label: 'Две новых строки', value: '\\n\\n' },
  ],
}

function unescape(s) {
  return s.replace(/\\t/g, '\t').replace(/\\n/g, '\n').replace(/\\r/g, '\r')
}

export function parseImport(text, termSepRaw, cardSepRaw) {
  const termSep = unescape(termSepRaw)
  const cardSep = unescape(cardSepRaw)
  if (!termSep || !cardSep) return { rows: [], skipped: 0 }

  let skipped = 0
  const rows = []
  for (const chunk of text.split(cardSep)) {
    const line = chunk.trim()
    if (!line) continue
    const i = line.indexOf(termSep)
    if (i === -1) {
      skipped++
      continue
    }
    // Quizlet ставит термин слева, перевод справа: en → ru.
    const word_en = line.slice(0, i).trim()
    const word_ru = line.slice(i + termSep.length).trim()
    if (!word_en || !word_ru) {
      skipped++
      continue
    }
    rows.push({ word_en, word_ru })
  }
  return { rows, skipped }
}

export default function ImportDialog({ open, onClose, user, set, onImported }) {
  const [text, setText] = useState('')
  const [termSep, setTermSep] = useState('\\t')
  const [cardSep, setCardSep] = useState('\\n')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const { rows, skipped } = useMemo(
    () => parseImport(text, termSep, cardSep),
    [text, termSep, cardSep],
  )

  async function submit() {
    setBusy(true)
    setError('')
    try {
      const created = await db.createCardsBulk(user.id, set.id, rows)
      onImported(created)
      setText('')
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Импортировать слова" wide>
      <div className="space-y-4">
        <div>
          <Label>Текст из Quizlet (Экспорт → скопировать)</Label>
          <Textarea
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'platypus\tутконос\nbackyard\tзадний двор'}
            className="font-mono text-xs"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SepField
            label="Между словом и переводом"
            value={termSep}
            onChange={setTermSep}
            presets={PRESETS.term}
          />
          <SepField
            label="Между карточками"
            value={cardSep}
            onChange={setCardSep}
            presets={PRESETS.card}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <Label className="mb-0">Превью</Label>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              распознано: {rows.length}
              {skipped > 0 && ` · пропущено: ${skipped}`}
            </span>
          </div>
          <div className="max-h-56 overflow-y-auto rounded-lg ring-1 ring-inset ring-slate-200 dark:ring-slate-800">
            {rows.length === 0 ? (
              <p className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">
                Вставьте текст — здесь появятся карточки.
              </p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {rows.slice(0, 50).map((r, i) => (
                    <tr
                      key={i}
                      className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                    >
                      <td className="w-1/2 px-3 py-1.5 font-medium">{r.word_en}</td>
                      <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{r.word_ru}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {rows.length > 50 && (
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              Показаны первые 50, добавятся все {rows.length}.
            </p>
          )}
        </div>

        <ErrorText>{error}</ErrorText>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button disabled={busy || rows.length === 0} onClick={submit}>
            {busy && <Spinner className="h-4 w-4" />} Добавить {rows.length || ''}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function SepField({ label, value, onChange, presets }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onChange(p.value)}
            className={`rounded-md px-2 py-1 text-xs ring-1 ring-inset transition ${
              value === p.value
                ? 'bg-indigo-50 text-indigo-700 ring-indigo-300 dark:bg-indigo-950 dark:text-indigo-300 dark:ring-indigo-800'
                : 'text-slate-500 ring-slate-200 hover:bg-slate-50 dark:text-slate-400 dark:ring-slate-700 dark:hover:bg-slate-800'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}
