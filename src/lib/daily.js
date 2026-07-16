import { localDay } from './srs'

const KEY = 'studied.today'

/**
 * Отмечает карточку как изученную сегодня.
 * @returns {boolean} true — слово встретилось сегодня впервые, значит его надо
 *   засчитать в дневную цель.
 *
 * Дневная цель считает разные слова, а не ответы: иначе одно слово, отвеченное
 * трижды за сессию, накручивало бы счётчик втрое. Список уже засчитанных за
 * сегодня id лежит в браузере — на сервере для этого нужна была бы ещё одна
 * таблица, а цена ошибки мала: с другого устройства за тот же день слово может
 * посчитаться повторно.
 */
export function markStudied(cardId) {
  const day = localDay()
  let state
  try {
    state = JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    state = null
  }
  if (!state || state.day !== day) state = { day, ids: [] }
  if (state.ids.includes(cardId)) return false

  state.ids.push(cardId)
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* приватный режим — просто не дедуплицируем */
  }
  return true
}
