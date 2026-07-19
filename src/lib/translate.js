/**
 * Автоперевод английского слова на русский. Без ключей и регистрации.
 *
 * Основной источник — открытый endpoint Google Translate: он заметно точнее
 * бесплатных альтернатив (platypus → «утконос», а не «UTKONOS»; present →
 * «подарок», а не «есть»). Endpoint неофициальный и однажды может замолчать,
 * поэтому запасным идёт MyMemory.
 *
 * Как и словарь, наружу отдаём либо перевод, либо null: не перевелось — поле
 * просто остаётся пустым, и его заполняют руками.
 */

const MAX_LEN = 200

/** «write (рАйт)» → «write», «(a) mother» → «mother». */
function clean(word) {
  return (word || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function viaGoogle(text, from, to) {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=` +
    encodeURIComponent(text)
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
  if (!res.ok) return null
  const data = await res.json()
  // Ответ — вложенные массивы: [[[перевод, оригинал, ...], ...], ...]
  const parts = data?.[0]
  if (!Array.isArray(parts)) return null
  const out = parts
    .map((p) => p?.[0])
    .filter(Boolean)
    .join('')
    .trim()
  return out || null
}

async function viaMyMemory(text, from, to) {
  const url =
    `https://api.mymemory.translated.net/get?langpair=${from}|${to}&q=` + encodeURIComponent(text)
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
  if (!res.ok) return null
  const data = await res.json()
  const out = data?.responseData?.translatedText?.trim()
  return out || null
}

/**
 * @returns {Promise<string|null>} перевод или null, если не вышло.
 */
async function translate(word, from, to) {
  const text = clean(word)
  if (!text || text.length > MAX_LEN) return null

  for (const source of [viaGoogle, viaMyMemory]) {
    try {
      const out = await source(text, from, to)
      // Сервис вернул то же самое слово — значит перевести не смог.
      if (out && out.toLowerCase() !== text.toLowerCase()) return out
    } catch {
      // Сеть, таймаут, битый ответ — пробуем следующий источник.
    }
  }
  return null
}

/** Английское слово карточки → русский перевод. */
export const translateToRu = (word) => translate(word, 'en', 'ru')

/** Русское название папки или набора → английское, из него делается адрес. */
export const translateToEn = (name) => translate(name, 'ru', 'en')
