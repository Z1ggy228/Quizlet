import { exportEverything } from './db'
import { localDay } from './srs'

/** Скачивание файла без сервера: собираем blob и кликаем по ссылке. */
function download(filename, content, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Отпускаем память, но не раньше, чем браузер заберёт файл.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const COLUMNS = [
  ['folder', 'папка'],
  ['set', 'набор'],
  ['word_en', 'слово'],
  ['word_ru', 'перевод'],
  ['transcription', 'транскрипция'],
  ['part_of_speech', 'часть речи'],
  ['context', 'контекст'],
  ['mastery_level', 'уровень освоения'],
  ['ease_factor', 'лёгкость'],
  ['interval_days', 'интервал, дней'],
  ['repetitions', 'повторений'],
  ['due_date', 'следующий показ'],
  ['times_seen', 'показов'],
  ['times_wrong', 'ошибок'],
  ['image_path', 'файл картинки'],
  ['created_at', 'создана'],
]

/**
 * Экранирование по RFC 4180: кавычки удваиваются, а поле берётся в кавычки,
 * если внутри есть разделитель, кавычка или перенос строки — а переносы у нас
 * есть, в карточках-диалогах.
 */
function cell(value, sep) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return new RegExp(`["\\n\\r${sep}]`).test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Excel по-русски открывает csv, ожидая точку с запятой, и без BOM ломает
 * кириллицу. Поэтому разделитель ; и BOM в начале.
 */
function toCsv(data, sep = ';') {
  const rows = [COLUMNS.map(([, title]) => cell(title, sep)).join(sep)]
  for (const folder of data.folders) {
    for (const set of folder.sets) {
      for (const card of set.cards) {
        const row = { ...card, folder: folder.name, set: set.name }
        rows.push(COLUMNS.map(([key]) => cell(row[key], sep)).join(sep))
      }
    }
  }
  return '﻿' + rows.join('\r\n')
}

export async function exportJson() {
  const data = await exportEverything()
  download(`slova-${localDay()}.json`, JSON.stringify(data, null, 2), 'application/json')
  return countCards(data)
}

export async function exportCsv() {
  const data = await exportEverything()
  download(`slova-${localDay()}.csv`, toCsv(data), 'text/csv;charset=utf-8')
  return countCards(data)
}

function countCards(data) {
  return data.folders.reduce(
    (sum, f) => sum + f.sets.reduce((s, set) => s + set.cards.length, 0),
    0,
  )
}

export { toCsv }
