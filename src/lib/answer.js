/**
 * Мягкая проверка ответа в Learn и в режиме на слух. Чистые функции без React —
 * поэтому их можно прогнать тестами в node.
 *
 * Что прощаем: регистр, лишние пробелы, ведущий артикль, пунктуацию, содержимое
 * скобок (транскрипция и необязательный артикль), а также разделитель между
 * формами слова — тире, пробел или запятая. Последнее и есть частая боль:
 * карточки-пары записаны в колоде вразнобой («apple - apples», «monkey monkeys»,
 * «fox, foxes»), и ответ должен засчитываться независимо от того, чем разделены
 * формы у вас и в базе.
 */

/** Скобки в термине — это транскрипция или необязательный артикль: «write (рАйт)», «(a) mother». */
const withoutParens = (s) => (s || '').replace(/\([^)]*\)/g, ' ')

export function normalize(s) {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/^(to|a|an|the)\s+/, '')
    .replace(/[.,!?;:"'`’]/g, '')
    .replace(/[-–—−]/g, ' ') // дефис и тире — как пробел: «monkey - monkeys» === «monkey monkeys»
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Все написания, которые засчитываем за верные: сам термин, он же без скобок и
 * каждая его форма по отдельности.
 *
 * Формы разделяем по «/», «,» и тире, ОКРУЖЁННОМУ пробелами («apple - apples» →
 * «apple» или «apples»). Дефис без пробелов не трогаем — это часть слова, иначе
 * «twenty-first» распалось бы на «twenty» и приняло полуответ.
 */
export function answerVariants(expected) {
  const out = new Set()
  const add = (s) => {
    const n = normalize(s)
    if (n) out.add(n)
  }
  add(expected)
  add(withoutParens(expected))
  for (const part of (expected || '').split(/\s[-–—]\s|[/,]/)) {
    add(part)
    add(withoutParens(part))
  }
  return out
}

export function isCorrectAnswer(given, expected) {
  const g = normalize(given)
  return !!g && answerVariants(expected).has(g)
}

/**
 * Термин, который реально набрать руками. Диалоги в несколько строк и длинные
 * фразы спрашиваем только выбором: напечатать их без опечатки нельзя, слово
 * навсегда осталось бы невыученным и сессия не закончилась бы.
 */
export function isTypable(word) {
  return !word.includes('\n') && normalize(withoutParens(word)).length <= 24
}
