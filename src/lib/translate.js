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

async function viaGoogle(text) {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t&q=' +
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

async function viaMyMemory(text) {
  const url =
    'https://api.mymemory.translated.net/get?langpair=en|ru&q=' + encodeURIComponent(text)
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
  if (!res.ok) return null
  const data = await res.json()
  const out = data?.responseData?.translatedText?.trim()
  return out || null
}

/**
 * @returns {Promise<string|null>} перевод или null, если не вышло.
 */
export async function translateToRu(word) {
  const text = clean(word)
  if (!text || text.length > MAX_LEN) return null

  for (const source of [viaGoogle, viaMyMemory]) {
    try {
      const out = await source(text)
      // Сервис вернул то же самое слово — значит перевести не смог.
      if (out && out.toLowerCase() !== text.toLowerCase()) return out
    } catch {
      // Сеть, таймаут, битый ответ — пробуем следующий источник.
    }
  }
  return null
}
