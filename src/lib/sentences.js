/**
 * Сборка предложений из слов колоды — для режима «Предложения».
 *
 * Чистый модуль без React: правила здесь, словарные данные — в
 * [lexicon.js](lexicon.js). Проверяется прогоном по всей колоде в node, потому
 * что цена ошибки тут не кривая вёрстка, а неправильный русский, который
 * пользователь заучит.
 *
 * Главный принцип: СОМНЕВАЕШЬСЯ — ПРОПУСКАЙ КАРТОЧКУ. Покрыть всю колоду не
 * нужно, нужно не выдать ни одной кривой фразы. Слово идёт в дело, только если
 * обе стороны карточки согласны, что это за часть речи, а падежи берём лишь те,
 * где форма выводится из написания однозначно.
 *
 * Чего здесь сознательно нет:
 *
 * — Винительного падежа для мужского рода и множественного числа. «вижу ключ»,
 *   но «вижу друга»: форма зависит от одушевлённости, а её по карточке не
 *   определить. Дополнением поэтому работают только женский и средний род: у
 *   женского винительный всегда -у/-ю («книгу», «маму» — одушевлённость не
 *   важна), у среднего совпадает с именительным.
 * — Существительных на -ь: «дверь» женского рода, «словарь» мужского, и по
 *   написанию их не различить — правило «-арь мужской» ломается на «соль».
 * — Слов, которых нет в словаре lexicon.js. Без категорий шаблоны выдают
 *   «Цена сухая» и «Я хочу есть машину»: грамматика верна, смысл — нет.
 */

import {
  CLOSED,
  NOT_NOUNS,
  NOT_INNER_VERB,
  VERBS,
  SUBCATS,
  adjClass,
  hasSubcat,
  nounCategory,
  // Расширение указано намеренно: без него node не разрешит импорт, а этот
  // модуль проверяется именно прогоном в node. Vite и с расширением соберёт.
} from './lexicon.js'

// ── Разбор карточки ──────────────────────────────────────────────────────────

const stripParens = (s) => (s || '').replace(/\([^)]*\)/g, ' ')

/** «seldom , rarely» → «seldom», «apple - apples» → «apple», «write (рАйт)» → «write». */
function firstVariant(s) {
  return stripParens(s)
    .split(/[,;]|\s[-–—]\s|\//)[0]
    .replace(/\s+/g, ' ')
    .trim()
}

/** Существительные без счёта: «a water» — ошибка, артикль им не ставим. */
const UNCOUNTABLE = new Set(
  `water milk tea coffee juice bread meat beef pork lamb cheese butter sugar salt flour rice porridge
   oatmeal soup honey food fruit money time work help advice information news homework music weather
   rain snow sand air space nature furniture equipment clothes stuff rubbish paper wood concrete iron
   grass beauty luck fun love sleep pain harm care hair caviar buckwheat`
    .split(/\s+/)
    .filter(Boolean),
)

const IRREGULAR_PLURAL = new Set([
  'children', 'people', 'men', 'women', 'feet', 'teeth', 'mice', 'geese', 'fellas', 'guys', 'relatives',
])
/** Слова на -s, которые не множественное число. */
const SINGULAR_S = new Set([
  'glass', 'class', 'dress', 'grass', 'bus', 'kiss', 'news', 'address', 'business', 'chess', 'boss',
  'less', 'this', 'his', 'yes', 'gas', 'always', 'across', 'christmas', 'ships', 'campus',
])

/** Мужской род с женским окончанием и средний на -я — списком, правил тут нет. */
const MASC_ON_A = new Set(['папа', 'дедушка', 'дядя', 'мужчина', 'юноша', 'судья', 'коллега', 'слуга'])
const NEUT_ON_YA = new Set(['имя', 'время', 'племя', 'знамя', 'пламя', 'семя'])

/** Суффиксы отглагольных и отвлечённых существительных: «решение», «информация». */
const ABSTRACT_SUFFIX = /(ость|ность|ение|ание|ция|сия|изм|ство|тие|знь)$/

/**
 * Часть речи и всё, что нужно шаблонам. Обе стороны карточки должны быть
 * согласны: русская даёт род и падеж, английская — часть речи, число и
 * категорию.
 * @returns {null | {kind:'verb'|'noun'|'adj', ...}}
 */
export function classify(card) {
  const rawEn = (card.word_en || '').trim()
  const rawRu = (card.word_ru || '').trim()
  // Многострочные диалоги и пояснения («С городами используем предлог…») мимо.
  if (!rawEn || !rawRu || rawEn.includes('\n') || rawRu.includes('\n')) return null

  const en = firstVariant(rawEn)
  const ru = firstVariant(rawRu) // регистр сохраняем: «Москва» должна остаться с большой
  const enLower = en.toLowerCase()
  const ruLower = ru.toLowerCase()
  if (!en || !ru) return null
  // Русская сторона обязана быть одним словом: только так предсказуемы род и падеж.
  if (/\s/.test(ru) || !/^[а-яё-]+$/i.test(ru)) return null

  const enWords = en.split(' ')
  if (enWords.length > 3 || enWords.some((w) => !/^[a-z'-]+$/i.test(w))) return null

  // Глагол: русский инфинитив и знакомый английский глагол. Проверяем до
  // служебных слов, потому что «look for» содержит предлог, и до
  // существительных, потому что «дети» тоже кончается на -ти.
  const verb = VERBS[enLower]
  if (/(ться|тись|ть|ти|чь)$/.test(ruLower)) {
    if (!verb || NOT_INNER_VERB.has(enLower) || /^[A-Z]/.test(en)) return null
    return {
      kind: 'verb',
      en: enLower,
      ru: ruLower,
      solo: !!verb.solo,
      act: !!verb.act,
      obj: verb.obj ?? null,
      card,
    }
  }

  // Дальше — только знаменательные слова: «in spring», «have to», «the USA»
  // отсекаются по любому служебному слову внутри.
  if (enWords.some((w) => CLOSED.has(w.toLowerCase()))) return null
  if (NOT_NOUNS.has(enLower)) return null

  const cls = adjClass(enLower)
  const cat0 = nounCategory(enLower)
  // «герой» и «музей» кончаются как прилагательные — спасает то, что в словаре
  // они помечены существительными.
  const looksAdj = /(ый|ий|ой)$/.test(ruLower) && ruLower.length > 3 && !cat0

  if (looksAdj) {
    // Незнакомое прилагательное не берём: не с чем сочетать. «Волосатая крыша»
    // грамматична ровно настолько же, насколько бессмысленна.
    return cls ? { kind: 'adj', en, ru: ruLower, cls, card } : null
  }
  // Знаем как прилагательное, а по-русски не прилагательное — это наречие
  // («cozy» → «уютно»). Существительным его делать нельзя.
  if (cls) return null

  // Существительное: род по русскому окончанию, число — по английскому.
  const plural =
    IRREGULAR_PLURAL.has(enLower) ||
    (/s$/.test(enLower) && !/ss$/.test(enLower) && !SINGULAR_S.has(enLower))
  const ruPlural = /(ы|и)$/.test(ruLower)
  // Число сторон должно совпадать: «Сочи» кончается на -и, но это не «keys»,
  // а «одежда» — не «clothes».
  if (plural !== ruPlural) return null

  let gender = 'p'
  if (!plural) {
    if (MASC_ON_A.has(ruLower)) gender = 'm'
    else if (NEUT_ON_YA.has(ruLower)) gender = 'n'
    else if (/(а|я)$/.test(ruLower)) gender = 'f'
    else if (/(о|е|ё)$/.test(ruLower)) gender = 'n'
    else if (/[бвгджзйклмнпрстфхцчшщ]$/.test(ruLower)) gender = 'm'
    // На -ь род не выводится — пропускаем.
    else return null
  }

  const cat = cat0 ?? (ABSTRACT_SUFFIX.test(ruLower) ? 'abstract' : null)
  if (!cat) return null

  return {
    kind: 'noun',
    en,
    ru,
    number: gender,
    cat,
    // Имя собственное — когда с большой буквы обе стороны («London»/«Лондон»).
    // Одной английской мало: «T-shirt» тоже с большой, и артикль ему нужен.
    // Дни и месяцы — исключение: по-русски они со строчной, но артикля не берут.
    proper: /^[A-Z]/.test(en) && (/^[А-ЯЁ]/.test(ru) || cat === 'time'),
    uncountable: UNCOUNTABLE.has(enLower),
    card,
  }
}

// ── Русская морфология ───────────────────────────────────────────────────────

/** Согласование прилагательного: «большой» → большая / большое / большие. */
export function agreeAdj(adj, form) {
  if (form === 'm') return adj
  const end = adj.slice(-2)
  const stem = adj.slice(0, -2)
  const last = stem.slice(-1)
  const hushing = 'жшчщ'.includes(last)
  const velar = 'кгх'.includes(last)
  const soft = end === 'ий' && !hushing && !velar // «синий», «летний»
  if (form === 'f') return stem + (soft ? 'яя' : 'ая')
  if (form === 'n') return stem + (soft || hushing ? 'ее' : 'ое')
  return stem + (soft || hushing || velar ? 'ие' : 'ые') // множественное
}

/**
 * Винительный падеж — только там, где он однозначен: женский род всегда -у/-ю,
 * средний совпадает с именительным. Мужской и множественное сюда не попадают,
 * их отсекает выбор дополнения (см. objectsFor).
 */
export function accusative(noun) {
  if (noun.number === 'f') {
    if (/я$/.test(noun.ru)) return noun.ru.slice(0, -1) + 'ю'
    if (/а$/.test(noun.ru)) return noun.ru.slice(0, -1) + 'у'
  }
  return noun.ru
}

const POSSESSIVE = {
  my: { m: 'мой', f: 'моя', n: 'моё', p: 'мои' },
  your: { m: 'твой', f: 'твоя', n: 'твоё', p: 'твои' },
}
const NEEDED = { m: 'нужен', f: 'нужна', n: 'нужно', p: 'нужны' }

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// ── Английская сторона ───────────────────────────────────────────────────────

const A_WORDS = new Set(['university', 'uniform', 'user', 'union', 'european', 'one', 'useful', 'usual'])
const AN_WORDS = new Set(['hour', 'honest', 'honour', 'honor'])

function indefinite(phrase) {
  const w = phrase.toLowerCase().split(' ')[0]
  if (A_WORDS.has(w)) return 'a'
  if (AN_WORDS.has(w)) return 'an'
  return /^[aeiou]/.test(w) ? 'an' : 'a'
}

/** Артикль по первому слову: «an apple», но «a university»; «water» — без. */
function article(noun) {
  if (noun.proper || noun.uncountable || noun.number === 'p') return ''
  return indefinite(noun.en)
}

const indef = (noun) => {
  const art = article(noun)
  return art ? `${art} ${noun.en}` : noun.en
}
const def = (noun) => (noun.proper ? noun.en : `the ${noun.en}`)

/** Герундий для запасных вариантов ответа: read → reading, make → making, run → running. */
function gerund(v) {
  if (/[^aeiou]e$/.test(v)) return v.slice(0, -1) + 'ing'
  if (/^[a-z]*[aeiou][bdgklmnprt]$/.test(v) && !/[aeiou]{2}/.test(v)) return v + v.slice(-1) + 'ing'
  return v + 'ing'
}

const isPl = (n) => n.number === 'p'
const heIs = (n) => (isPl(n) ? 'are' : 'is')

// ── Сочетаемость ─────────────────────────────────────────────────────────────

const OWNABLE = ['thing', 'clothing', 'food', 'drink']
/** Всё, что можно показать пальцем, — «Это X». */
const SEEABLE = [...OWNABLE, 'animal', 'place', 'person', 'body', 'time', 'media']
const FINDABLE = [...OWNABLE, 'place', 'animal']
/** К чему вообще можно приставить прилагательное. */
const ATTRIBUTABLE = [...OWNABLE, 'animal', 'place', 'media']

/**
 * К каким существительным лепится прилагательное этого класса. Ровно здесь
 * отсекаются «тяжелый кабинет», «белое сочинение» и «быстрые джинсы»:
 * грамматика у них безупречная, поэтому ловить их можно только смыслом.
 */
const ADJ_TARGETS = {
  goodness: [...ATTRIBUTABLE, 'person'],
  looks: ['person', 'animal', 'thing', 'clothing', 'place', 'media'],
  interest: ['media', 'place', 'person'],
  value: ['thing', 'clothing', 'food', 'place', 'media'],
  newness: ['thing', 'clothing', 'food', 'place', 'media'],
  comfort: ['thing', 'clothing', 'place'],
  safety: ['animal', 'place', 'thing'],
  bigness: ['thing', 'clothing', 'food', 'animal', 'place'],
  dimension: ['thing', 'clothing', 'place', 'animal'],
  weight: ['thing', 'clothing', 'food'],
  colour: ['thing', 'clothing', 'food', 'animal', 'place'],
  temperature: ['thing', 'clothing', 'food', 'drink'],
  wetness: ['thing', 'clothing', 'place'],
  texture: ['thing', 'clothing', 'place'],
  freshness: ['food', 'drink'],
  speed: ['animal', 'person'],
  sound: ['place', 'person', 'animal'],
  hardness: ['media'],
  fame: ['person', 'place', 'media'],
  taste: ['food', 'drink'],
  human: ['person'],
  place: ['place'],
  relative: ['thing', 'place', 'food', 'clothing', 'media'],
}

/** «Очень» ставим только к качественным: «очень английский» и «очень красный» — нелепо. */
const QUALITATIVE_CLASSES = new Set([
  'goodness', 'looks', 'interest', 'value', 'newness', 'comfort', 'safety', 'bigness', 'dimension',
  'weight', 'temperature', 'wetness', 'texture', 'freshness', 'speed', 'sound', 'hardness', 'fame',
  'taste', 'human',
])

const inCats = (noun, cats) => cats.includes(noun.cat)

/**
 * Однокоренные слова в одном предложении: «Он хочет верить веру», «He wants to
 * believe a belief». По-английски ловится четырьмя буквами, по-русски тремя —
 * дальше расходятся окончания.
 */
function sameRoot(a, b) {
  const cut = (s, n) => s.toLowerCase().replace(/[^a-zа-яё]/g, '').slice(0, n)
  return cut(a.en, 4) === cut(b.en, 4) || cut(a.ru, 3) === cut(b.ru, 3)
}

/** «Где твой человек?» — по-английски «your person» звучит нелепо. */
const NO_POSSESSIVE = new Set(['person', 'human', 'people', 'creature'])

/** Подходит ли существительное этому глаголу в дополнение. */
function fitsObject(verb, noun) {
  if (!verb.obj) return false
  // Падеж должен быть однозначен — см. шапку файла.
  if (noun.number !== 'f' && noun.number !== 'n') return false
  if (noun.proper || sameRoot(verb, noun)) return false
  return verb.obj.some((c) => (SUBCATS[c] ? hasSubcat(noun.en, c) : noun.cat === c))
}

// ── Шаблоны ──────────────────────────────────────────────────────────────────
//
// make() возвращает { ru, en, ru2?, en2? }: ru/en — то, что показываем и ждём,
// ru2/en2 — дополнительные написания, которые тоже засчитываем.

const NOUN_FRAMES = [
  {
    id: 'this-is',
    fit: (n) => inCats(n, SEEABLE),
    make: (n) => ({
      ru: `Это ${n.ru}.`,
      en: isPl(n) ? `These are ${n.en}.` : `This is ${indef(n)}.`,
      en2: isPl(n) ? [`They are ${n.en}.`] : [`It is ${indef(n)}.`, `That is ${indef(n)}.`],
    }),
  },
  {
    id: 'where',
    fit: (n) => inCats(n, FINDABLE),
    make: (n) => ({ ru: `Где ${n.ru}?`, en: `Where ${heIs(n)} ${def(n)}?` }),
  },
  {
    id: 'where-your',
    fit: (n) => inCats(n, ['person', 'animal']) && !n.proper && !NO_POSSESSIVE.has(n.en.toLowerCase()),
    make: (n) => ({
      ru: `Где ${POSSESSIVE.your[n.number]} ${n.ru}?`,
      en: `Where ${heIs(n)} your ${n.en}?`,
    }),
  },
  {
    id: 'i-have',
    fit: (n) => inCats(n, [...OWNABLE, 'animal']) && !n.proper,
    make: (n) => ({
      ru: `У меня есть ${n.ru}.`,
      en: `I have ${indef(n)}.`,
      en2: [`I have got ${indef(n)}.`, `I've got ${indef(n)}.`],
    }),
  },
  {
    id: 'do-you-have',
    fit: (n) => inCats(n, [...OWNABLE, 'animal']) && !n.proper,
    make: (n) => ({
      ru: `У тебя есть ${n.ru}?`,
      en: `Do you have ${indef(n)}?`,
      en2: [`Have you got ${indef(n)}?`],
    }),
  },
  {
    id: 'i-need',
    fit: (n) => inCats(n, OWNABLE) && !n.proper,
    make: (n) => ({ ru: `Мне ${NEEDED[n.number]} ${n.ru}.`, en: `I need ${indef(n)}.` }),
  },
  {
    id: 'this-is-my',
    fit: (n) =>
      inCats(n, [...OWNABLE, 'person', 'animal', 'body', 'media']) &&
      !n.proper &&
      !NO_POSSESSIVE.has(n.en.toLowerCase()),
    make: (n) => ({
      ru: `Это ${POSSESSIVE.my[n.number]} ${n.ru}.`,
      en: isPl(n) ? `These are my ${n.en}.` : `This is my ${n.en}.`,
      en2: isPl(n) ? [] : [`It is my ${n.en}.`],
    }),
  },
  {
    id: 'is-this-your',
    fit: (n) => inCats(n, [...OWNABLE, 'animal']) && !n.proper,
    make: (n) => ({
      ru: `Это ${POSSESSIVE.your[n.number]} ${n.ru}?`,
      en: isPl(n) ? `Are these your ${n.en}?` : `Is this your ${n.en}?`,
    }),
  },
  {
    id: 'is-here',
    fit: (n) => inCats(n, ['thing', 'clothing', 'food', 'animal', 'person']) && !n.uncountable,
    make: (n) => ({
      ru: `${cap(n.ru)} здесь.`,
      en: `${cap(def(n))} ${heIs(n)} here.`,
      ru2: [`Здесь ${n.ru}.`],
    }),
  },
  {
    id: 'this-is-not',
    fit: (n) => inCats(n, SEEABLE) && !n.proper,
    make: (n) => ({
      ru: `Это не ${n.ru}.`,
      en: isPl(n) ? `These are not ${n.en}.` : `This is not ${indef(n)}.`,
      en2: isPl(n)
        ? [`These aren't ${n.en}.`]
        : [`This isn't ${indef(n)}.`, `It is not ${indef(n)}.`, `It isn't ${indef(n)}.`],
    }),
  },
]

const VERB_FRAMES = [
  { id: 'i-want', ru: (v) => `Я хочу ${v.ru}.`, en: (v) => `I want to ${v.en}.` },
  {
    id: 'i-dont-want',
    ru: (v) => `Я не хочу ${v.ru}.`,
    en: (v) => `I do not want to ${v.en}.`,
    en2: (v) => [`I don't want to ${v.en}.`],
  },
  { id: 'we-can', ru: (v) => `Мы можем ${v.ru}.`, en: (v) => `We can ${v.en}.` },
  { id: 'can-you', ru: (v) => `Ты можешь ${v.ru}?`, en: (v) => `Can you ${v.en}?` },
  {
    id: 'i-must',
    ru: (v) => `Я должен ${v.ru}.`,
    en: (v) => `I must ${v.en}.`,
    en2: (v) => [`I have to ${v.en}.`],
  },
  { id: 'i-need-to', ru: (v) => `Мне нужно ${v.ru}.`, en: (v) => `I need to ${v.en}.` },
  {
    id: 'i-like',
    ru: (v) => `Я люблю ${v.ru}.`,
    en: (v) => `I like to ${v.en}.`,
    en2: (v) => [`I like ${gerund(v.en)}.`, `I love to ${v.en}.`, `I love ${gerund(v.en)}.`],
  },
  {
    id: 'time-to',
    fit: (v) => v.act, // «Пора идти» — да, «Пора терять» — нет
    ru: (v) => `Пора ${v.ru}.`,
    en: (v) => `It is time to ${v.en}.`,
    en2: (v) => [`It's time to ${v.en}.`],
  },
  { id: 'he-wants', ru: (v) => `Он хочет ${v.ru}.`, en: (v) => `He wants to ${v.en}.` },
  {
    id: 'they-cant',
    ru: (v) => `Они не могут ${v.ru}.`,
    en: (v) => `They cannot ${v.en}.`,
    en2: (v) => [`They can't ${v.en}.`, `They can not ${v.en}.`],
  },
  {
    id: 'i-cant',
    ru: (v) => `Я не могу ${v.ru}.`,
    en: (v) => `I cannot ${v.en}.`,
    en2: (v) => [`I can't ${v.en}.`, `I can not ${v.en}.`],
  },
  {
    id: 'lets',
    fit: (v) => v.act,
    ru: (v) => `Давай ${v.ru}!`,
    en: (v) => `Let's ${v.en}!`,
    en2: (v) => [`Let us ${v.en}!`],
  },
]

const OBJECT_FRAMES = [
  {
    id: 'want-obj',
    ru: (v, n) => `Я хочу ${v.ru} ${accusative(n)}.`,
    en: (v, n) => `I want to ${v.en} ${indef(n)}.`,
    en2: (v, n) => [`I want to ${v.en} ${def(n)}.`],
  },
  {
    id: 'need-obj',
    ru: (v, n) => `Мне нужно ${v.ru} ${accusative(n)}.`,
    en: (v, n) => `I need to ${v.en} ${indef(n)}.`,
    en2: (v, n) => [`I need to ${v.en} ${def(n)}.`],
  },
  {
    id: 'can-you-obj',
    ru: (v, n) => `Ты можешь ${v.ru} ${accusative(n)}?`,
    en: (v, n) => `Can you ${v.en} ${def(n)}?`,
    en2: (v, n) => [`Can you ${v.en} ${indef(n)}?`],
  },
  {
    id: 'dont-want-obj',
    ru: (v, n) => `Я не хочу ${v.ru} ${accusative(n)}.`,
    en: (v, n) => `I do not want to ${v.en} ${indef(n)}.`,
    en2: (v, n) => [`I don't want to ${v.en} ${indef(n)}.`, `I don't want to ${v.en} ${def(n)}.`],
  },
  {
    id: 'he-wants-obj',
    ru: (v, n) => `Он хочет ${v.ru} ${accusative(n)}.`,
    en: (v, n) => `He wants to ${v.en} ${indef(n)}.`,
    en2: (v, n) => [`He wants to ${v.en} ${def(n)}.`],
  },
]

const ADJ_NOUN_FRAMES = [
  {
    id: 'this-is-adj',
    make: (a, n) => {
      const art = n.proper || n.uncountable || isPl(n) ? '' : indefinite(a.en)
      const phrase = art ? `${art} ${a.en} ${n.en}` : `${a.en} ${n.en}`
      return {
        ru: `Это ${agreeAdj(a.ru, n.number)} ${n.ru}.`,
        en: isPl(n) ? `These are ${a.en} ${n.en}.` : `This is ${phrase}.`,
        en2: isPl(n) ? [`They are ${a.en} ${n.en}.`] : [`It is ${phrase}.`],
      }
    },
  },
  {
    id: 'noun-is-adj',
    make: (a, n) => ({
      ru: `${cap(n.ru)} ${agreeAdj(a.ru, n.number)}.`,
      en: `${cap(def(n))} ${heIs(n)} ${a.en}.`,
    }),
  },
  {
    id: 'my-noun-is-adj',
    fit: (a, n) => !n.proper,
    make: (a, n) => ({
      ru: `${cap(POSSESSIVE.my[n.number])} ${n.ru} ${agreeAdj(a.ru, n.number)}.`,
      en: `My ${n.en} ${heIs(n)} ${a.en}.`,
    }),
  },
  {
    id: 'i-have-adj',
    fit: (a, n) => !n.proper && inCats(n, [...OWNABLE, 'animal']),
    make: (a, n) => {
      const art = n.uncountable || isPl(n) ? '' : indefinite(a.en)
      const phrase = art ? `${art} ${a.en} ${n.en}` : `${a.en} ${n.en}`
      return {
        ru: `У меня есть ${agreeAdj(a.ru, n.number)} ${n.ru}.`,
        en: `I have ${phrase}.`,
        en2: [`I've got ${phrase}.`, `I have got ${phrase}.`],
      }
    },
  },
  {
    id: 'very-adj-noun',
    fit: (a) => QUALITATIVE_CLASSES.has(a.cls),
    make: (a, n) => {
      const art = n.proper || n.uncountable || isPl(n) ? '' : 'a'
      const phrase = art ? `${art} very ${a.en} ${n.en}` : `very ${a.en} ${n.en}`
      return {
        ru: `Это очень ${agreeAdj(a.ru, n.number)} ${n.ru}.`,
        en: isPl(n) ? `These are very ${a.en} ${n.en}.` : `This is ${phrase}.`,
      }
    },
  },
]

/** Прилагательное без существительного — только про человека: «Он очень добрый». */
const ADJ_FRAMES = [
  {
    id: 'he-is-very',
    ru: (a) => `Он очень ${a.ru}.`,
    en: (a) => `He is very ${a.en}.`,
    en2: (a) => [`He's very ${a.en}.`],
  },
  {
    id: 'i-am-very',
    ru: (a) => `Я очень ${a.ru}.`,
    en: (a) => `I am very ${a.en}.`,
    en2: (a) => [`I'm very ${a.en}.`],
  },
  {
    id: 'my-friend-is',
    ru: (a) => `Мой друг очень ${a.ru}.`,
    en: (a) => `My friend is very ${a.en}.`,
  },
  { id: 'are-you', ru: (a) => `Ты ${a.ru}?`, en: (a) => `Are you ${a.en}?` },
]

// ── Сборка ───────────────────────────────────────────────────────────────────

function shuffled(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

/** Разбор карточек по частям речи. */
export function pools(cards) {
  const nouns = [], verbs = [], adjs = []
  for (const card of cards) {
    const p = classify(card)
    if (!p) continue
    if (p.kind === 'noun') nouns.push(p)
    else if (p.kind === 'verb') verbs.push(p)
    else adjs.push(p)
  }
  return { nouns, verbs, adjs }
}

const objectsFor = (verb, nouns) => nouns.filter((n) => fitsObject(verb, n))
const nounsForAdj = (adj, nouns) =>
  nouns.filter((n) => inCats(n, ADJ_TARGETS[adj.cls] ?? []) && !sameRoot(adj, n))

function itemFrom(built, frameId, parts) {
  return {
    key: `${frameId}:${parts.map((p) => p.card.id).join('+')}`,
    ru: built.ru,
    en: built.en,
    acceptRu: [built.ru, ...(built.ru2 ?? [])],
    acceptEn: [built.en, ...(built.en2 ?? [])],
    cards: parts.map((p) => p.card),
  }
}

/** Одно предложение вокруг конкретного слова; null — не из чего собрать. */
function sentenceFor(seed, { nouns, adjs }) {
  if (seed.kind === 'noun') {
    const n = seed
    // Иногда добавляем прилагательное — тогда в предложении два слова набора.
    const fitting = adjs.filter((a) => inCats(n, ADJ_TARGETS[a.cls] ?? []) && !sameRoot(a, n))
    if (fitting.length && Math.random() < 0.45) {
      const a = pick(fitting)
      const frames = ADJ_NOUN_FRAMES.filter((f) => !f.fit || f.fit(a, n))
      if (frames.length) {
        const f = pick(frames)
        return itemFrom(f.make(a, n), f.id, [a, n])
      }
    }
    const frames = NOUN_FRAMES.filter((f) => f.fit(n))
    if (!frames.length) return null
    const f = pick(frames)
    return itemFrom(f.make(n), f.id, [n])
  }

  if (seed.kind === 'verb') {
    const v = seed
    const objects = v.obj ? objectsFor(v, nouns) : []
    // Переходный глагол без дополнения — оборванная фраза («I want to get.»),
    // поэтому если дополнения взять неоткуда, а сам по себе глагол не стоит,
    // слово пропускаем.
    const useObject = objects.length && (!v.solo || Math.random() < 0.6)
    if (useObject) {
      const n = pick(objects)
      const f = pick(OBJECT_FRAMES)
      return itemFrom({ ru: f.ru(v, n), en: f.en(v, n), en2: f.en2?.(v, n) }, f.id, [v, n])
    }
    if (!v.solo) return null
    const frames = VERB_FRAMES.filter((f) => !f.fit || f.fit(v))
    if (!frames.length) return null
    const f = pick(frames)
    return itemFrom({ ru: f.ru(v), en: f.en(v), en2: f.en2?.(v) }, f.id, [v])
  }

  const a = seed
  const targets = nounsForAdj(a, nouns)
  const soloOk = a.cls === 'human' // «Он очень усталый» — да, «Он очень красный» — нет
  if (targets.length && !(soloOk && Math.random() < 0.35)) {
    const n = pick(targets)
    const frames = ADJ_NOUN_FRAMES.filter((f) => !f.fit || f.fit(a, n))
    if (frames.length) {
      const f = pick(frames)
      return itemFrom(f.make(a, n), f.id, [a, n])
    }
  }
  if (!soloOk) return null
  const f = pick(ADJ_FRAMES)
  return itemFrom({ ru: f.ru(a), en: f.en(a), en2: f.en2?.(a) }, f.id, [a])
}

/**
 * Собирает предложения из слов набора.
 *
 * Идём по перемешанным словам: для каждого выбираем подходящий шаблон, а
 * недостающие слоты добираем из тех же слов набора — поэтому в предложении не
 * появится ничего, кроме слов колоды и служебных слов уровня «я», «это», «хочу».
 */
export function buildSentences(cards, { count = 20 } = {}) {
  const { nouns, verbs, adjs } = pools(cards)
  const seeds = [...nouns, ...verbs, ...adjs]
  const items = []
  const seen = new Set()

  // Несколько проходов: в наборе из 40 карточек годных слов бывает десяток, и
  // за один проход сессия вышла бы на десять вопросов. Шаблон каждый раз
  // выбирается заново, поэтому второй проход даёт другие предложения; когда
  // проход не добавил ничего нового — комбинации кончились.
  for (let pass = 0; pass < 6 && items.length < count; pass++) {
    const before = items.length
    for (const seed of shuffled(seeds)) {
      if (items.length >= count) break
      const item = sentenceFor(seed, { nouns, adjs })
      if (!item || seen.has(item.ru)) continue
      seen.add(item.ru)
      items.push(item)
    }
    if (items.length === before) break
  }
  return items
}

/** Сколько слов набора вообще годятся в предложения — для экрана выбора режима. */
export function countUsable(cards) {
  const { nouns, verbs, adjs } = pools(cards)
  const usableVerbs = verbs.filter((v) => v.solo || objectsFor(v, nouns).length)
  const usableAdjs = adjs.filter((a) => a.cls === 'human' || nounsForAdj(a, nouns).length)
  return nouns.length + usableVerbs.length + usableAdjs.length
}

// ── Проверка ответа ──────────────────────────────────────────────────────────

const CONTRACTIONS = {
  "i'm": 'i am', "you're": 'you are', "he's": 'he is', "she's": 'she is', "it's": 'it is',
  "we're": 'we are', "they're": 'they are', "that's": 'that is', "there's": 'there is',
  "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not',
  "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "can't": 'can not',
  cannot: 'can not', "won't": 'will not', "wouldn't": 'would not', "shouldn't": 'should not',
  "couldn't": 'could not', "haven't": 'have not', "hasn't": 'has not', "hadn't": 'had not',
  "mustn't": 'must not', "i've": 'i have', "you've": 'you have', "we've": 'we have',
  "they've": 'they have', "i'll": 'i will', "you'll": 'you will', "he'll": 'he will',
  "she'll": 'she will', "we'll": 'we will', "they'll": 'they will', "i'd": 'i would',
  "let's": 'let us',
}

/**
 * Нормализация предложения: регистр, пунктуация, двойные пробелы, ё/е и
 * сокращения. «It's a book!» и «it is a book» — один и тот же ответ.
 */
export function normalizeSentence(s) {
  return (s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.,!?;:"«»()]/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => CONTRACTIONS[w] ?? w)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isCorrectSentence(given, accepted) {
  const g = normalizeSentence(given)
  return !!g && accepted.some((a) => normalizeSentence(a) === g)
}
