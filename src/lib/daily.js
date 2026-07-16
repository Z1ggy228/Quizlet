import { localDay } from './srs'

const KEY = 'studied.today'

/**
 * Отмечает слово как выученное сегодня.
 * @returns {boolean} true — слово сегодня ещё не засчитывали, надо прибавить
 *   его к дневной цели.
 *
 * В цель идут выученные слова, а не просмотренные: раньше засчитывалась каждая
 * тронутая карточка, и за сессию, где вы довели до конца три слова, счётчик
 * успевал намотать всю рабочую пачку из семи.
 *
 * Список засчитанных за сегодня id лежит в браузере — на сервере для этого
 * нужна была бы ещё одна таблица, а цена ошибки мала: с другого устройства за
 * тот же день слово может посчитаться повторно.
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
