/**
 * Транскрипция и часть речи из бесплатного словаря dictionaryapi.dev.
 * Ключ не нужен, регистрация не нужна.
 *
 * Словарь — вещь ненадёжная: слова может не быть, сервис может лежать, интернета
 * может не быть. Поэтому наружу отдаём либо данные, либо null, и никогда не
 * бросаем исключение: незаполненные поля пользователь допишет руками.
 */

const API = 'https://api.dictionaryapi.dev/api/v2/entries/en'

const РУССКИЕ_ЧАСТИ_РЕЧИ = {
  noun: 'существительное',
  verb: 'глагол',
  adjective: 'прилагательное',
  adverb: 'наречие',
  pronoun: 'местоимение',
  preposition: 'предлог',
  conjunction: 'союз',
  interjection: 'междометие',
  numeral: 'числительное',
  article: 'артикль',
  determiner: 'определитель',
  exclamation: 'восклицание',
}

/** «(a) mother» → «mother», «write (рАйт)» → «write», «to go» → «go». */
function clean(word) {
  return (word || '')
    .replace(/\([^)]*\)/g, ' ') // транскрипция и артикль в скобках
    .replace(/[.,!?;:"]/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/^to\s+/, '') // «to go» — это про глагол go
    .replace(/\s+/g, ' ')
}

/**
 * Словарь знает только отдельные слова. Проверяем всю строку целиком, а не
 * первое слово: иначе «wake up» получило бы транскрипцию слова «wake», что
 * просто неправда.
 */
function lookupable(cleaned) {
  return !!cleaned && /^[a-z][a-z'’-]*$/.test(cleaned)
}

/**
 * Часть речи по числу толкований, а не по первому попавшемуся: словарь
 * перечисляет noun первым даже у явных глаголов, из-за чего «write» и «get»
 * определялись как существительные. У главной части речи толкований больше.
 */
function dominantPartOfSpeech(entries) {
  const weight = {}
  for (const entry of entries) {
    for (const meaning of entry.meanings ?? []) {
      if (!meaning.partOfSpeech) continue
      weight[meaning.partOfSpeech] =
        (weight[meaning.partOfSpeech] ?? 0) + (meaning.definitions?.length || 1)
    }
  }
  const top = Object.entries(weight).sort((a, b) => b[1] - a[1])[0]
  return top?.[0] ?? null
}

/**
 * @returns {Promise<null | {transcription: string|null, part_of_speech: string|null}>}
 *   null — слова нет в словаре, сервис недоступен или это фраза.
 */
export async function lookupWord(word) {
  const w = clean(word)
  if (!lookupable(w)) return null

  try {
    const res = await fetch(`${API}/${encodeURIComponent(w)}`, {
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null // 404 — слова нет, это норма
    const data = await res.json()
    if (!Array.isArray(data) || !data.length) return null

    // Транскрипция лежит то в phonetic, то в одном из phonetics[].
    const transcription =
      data.find((e) => e.phonetic)?.phonetic ||
      data.flatMap((e) => e.phonetics ?? []).find((p) => p.text)?.text ||
      null

    const pos = dominantPartOfSpeech(data)

    return {
      transcription: transcription || null,
      part_of_speech: pos ? (РУССКИЕ_ЧАСТИ_РЕЧИ[pos] ?? pos) : null,
    }
  } catch {
    // Сеть, таймаут, битый json — для нас всё это одно и то же: данных нет.
    return null
  }
}
