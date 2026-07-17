/**
 * Интервальное повторение по SM-2 (алгоритм SuperMemo 2, Пётр Возняк).
 *
 * Состояние карточки: ease_factor (лёгкость), interval_days (текущий интервал),
 * repetitions (сколько раз подряд вспомнили), due_date (когда показать снова).
 *
 * Классическая формула:
 *   верный ответ  → 1-й раз интервал 1 день, 2-й раз 6 дней, дальше × ease_factor
 *   ошибка        → счётчик повторений обнуляется, интервал снова 1 день
 *   ease_factor   → EF + (0.1 − (5−q)(0.08 + (5−q)·0.02)), но не ниже 1.3
 */

export const DEFAULT_EASE = 2.5
const MIN_EASE = 1.3
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Оценка ответа по шкале SM-2 (0–5). У нас ответ бинарный, поэтому переводим:
 * набрал руками — задача труднее теста, значит и оценка выше.
 */
export function qualityOf({ correct, type }) {
  if (!correct) return 2 // ниже 3 — SM-2 считает это провалом
  return type === 'input' ? 5 : 4
}

/** Новое состояние карточки после ответа. now передаём явно — так это тестируемо. */
export function schedule(card, quality, now = new Date()) {
  let ease = Number(card.ease_factor) || DEFAULT_EASE
  let interval = Number(card.interval_days) || 0
  let reps = Number(card.repetitions) || 0

  if (quality >= 3) {
    if (reps === 0) interval = 1
    else if (reps === 1) interval = 6
    else interval = Math.round(interval * ease)
    reps += 1
  } else {
    reps = 0
    interval = 1
  }

  ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  if (ease < MIN_EASE) ease = MIN_EASE

  return {
    ease_factor: Math.round(ease * 100) / 100,
    interval_days: interval,
    repetitions: reps,
    due_date: new Date(now.getTime() + interval * DAY_MS).toISOString(),
  }
}

/** Срок повторения наступил? */
export function isDue(card, now = new Date()) {
  return !card.due_date || new Date(card.due_date) <= now
}

/** «завтра», «через 3 дня» — для подписи под карточкой. */
export function formatDue(card, now = new Date()) {
  if (isDue(card, now)) return 'сейчас'
  const days = Math.ceil((new Date(card.due_date) - now) / DAY_MS)
  if (days === 1) return 'завтра'
  if (days < 30) return `через ${days} дн.`
  const months = Math.round(days / 30)
  return `через ${months} мес.`
}

/**
 * Длина стрика по дням занятий (строки study_days: {day, words_count, goal}).
 *
 * День засчитывается, только если в этот день выполнена дневная цель — иначе
 * одно слово перед сном держало бы стрик вечно. Планка берётся из самого дня:
 * поэтому смена цели не переписывает прошлое.
 *
 * Сегодняшний пропуск стрик не рвёт: день ещё не кончился, поэтому отсчёт
 * ведём от вчера. Пропуск двух дней подряд обнуляет.
 */
export function streakFrom(days, today = new Date()) {
  const set = new Set(
    days.filter((d) => (d.words_count ?? 0) >= (d.goal || 1)).map((d) => d.day),
  )
  if (!set.size) return 0

  const cursor = new Date(today)
  if (!set.has(localDay(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
    if (!set.has(localDay(cursor))) return 0
  }

  let streak = 0
  while (set.has(localDay(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

/** Локальная дата в формате YYYY-MM-DD — день считаем по часам пользователя. */
export function localDay(date = new Date()) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return d.toISOString().slice(0, 10)
}
