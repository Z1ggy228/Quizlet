/**
 * Адрес страницы: разбор и сборка. Чистые функции без React — проверяются
 * прогоном в node.
 *
 * Почему хеш, а не History API: приложение раздаётся статикой с Vercel, и при
 * обычных путях вида /f/abc сервер полез бы искать такой файл и отдал 404.
 * Хеш до сервера не доходит вовсе — SPA остаётся одностраничной без правил
 * переписывания на хостинге.
 *
 * Почему в адресе только id, а не сами объекты: по прямой ссылке в памяти нет
 * ничего, и папку с набором приходится дочитывать из базы (db.getFolder /
 * db.getSet). Зато адрес переживает перезагрузку и ложится в закладки.
 */

/** Режимы занятий, которые живут в адресе: назад из них возвращает к набору. */
export const MODES = ['flash', 'learn', 'listen', 'sentences']

/** Список карточек набора — состояние по умолчанию, отдельного слова в адресе не занимает. */
export const CARDS = 'cards'

/**
 * @returns {{view:'root'|'stats'|'folder'|'set', folderId?:string, setId?:string, mode?:string}}
 */
export function parseRoute(hash) {
  const parts = String(hash || '')
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)

  if (parts[0] === 'stats') return { view: 'stats' }
  if (parts[0] === 'f' && parts[1]) {
    const folderId = decodeURIComponent(parts[1])
    // Занятие по всей папке — такой же адрес, как у режима набора, иначе «назад»
    // из него вело бы не к папке, а куда попало.
    if (parts[2] === 'all' && MODES.includes(parts[3])) {
      return { view: 'folderSession', folderId, mode: parts[3] }
    }
    if (parts[2] === 's' && parts[3]) {
      return {
        view: 'set',
        folderId,
        setId: decodeURIComponent(parts[3]),
        // Неизвестный режим в адресе — не повод падать: показываем карточки.
        mode: MODES.includes(parts[4]) ? parts[4] : CARDS,
      }
    }
    return { view: 'folder', folderId }
  }
  return { view: 'root' }
}

export const rootPath = () => '#/'
export const statsPath = () => '#/stats'
export const folderPath = (folderId) => `#/f/${encodeURIComponent(folderId)}`
export const folderSessionPath = (folderId, mode) => `${folderPath(folderId)}/all/${mode}`
export const setPath = (folderId, setId, mode = CARDS) =>
  `${folderPath(folderId)}/s/${encodeURIComponent(setId)}` + (mode && mode !== CARDS ? `/${mode}` : '')

/** Переход: обычный — новой записью в истории, replace — вместо текущей. */
export function go(path, { replace = false } = {}) {
  if (replace) window.location.replace(path)
  else window.location.hash = path
}
