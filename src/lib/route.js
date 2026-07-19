/**
 * Адрес страницы: разбор и сборка. Чистые функции без React — проверяются
 * прогоном в node.
 *
 * Адрес складывается из названий, а не из id: `#/angliyskiy-s-nulya/lesson-3/learn`
 * читается, а `#/f/8f3c…/s/1a90…` — нет. Кириллица в адресе браузером кодируется
 * в %D0%BB%D0%B8… и превращает ссылку в кашу, поэтому названия транслитерируются.
 *
 * Чем платим: id в базе не по названию, поэтому папку и набор приходится искать
 * перебором по списку (см. App.jsx) — списки короткие, это дешевле некрасивого
 * адреса. И переименование меняет ссылку: старая закладка уведёт на список папок.
 *
 * Почему хеш, а не History API: приложение раздаётся статикой с Vercel, и при
 * обычных путях вида /lesson-3 сервер полез бы искать такой файл и отдал 404.
 * Хеш до сервера не доходит вовсе.
 */

/** Режимы занятий, которые живут в адресе: назад из них возвращает к набору. */
export const MODES = ['flash', 'learn', 'listen', 'sentences']

/** Список карточек набора — состояние по умолчанию, отдельного слова в адресе не занимает. */
export const CARDS = 'cards'

/**
 * Занятые слова: `#/stats` — статистика, `#/<папка>/all/<режим>` — занятие по
 * всей папке. Набор или папка с таким названием по ссылке недоступны — цена
 * читаемого адреса, зато в приложении они открываются как обычно.
 */
export const RESERVED = { stats: 'stats', all: 'all' }

const CYRILLIC = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
}

/** «Английский с нуля» → «angliyskiy-s-nulya», «Lesson 1-2» → «lesson-1-2». */
export function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .split('')
    .map((ch) => (ch in CYRILLIC ? CYRILLIC[ch] : ch))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Кусок адреса для папки или набора. Если от названия ничего не осталось
 * (одни смайлики или знаки препинания), берём id — ссылка будет некрасивой,
 * но рабочей.
 */
export const entitySlug = (entity) => slugify(entity?.name) || entity?.id || ''

/**
 * @returns {{view:'root'|'stats'|'folder'|'set'|'folderSession',
 *            folderSlug?:string, setSlug?:string, mode?:string}}
 */
export function parseRoute(hash) {
  const parts = String(hash || '')
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent)

  if (!parts.length) return { view: 'root' }
  if (parts[0] === RESERVED.stats) return { view: 'stats' }

  const folderSlug = parts[0]
  if (parts[1] === RESERVED.all && MODES.includes(parts[2])) {
    return { view: 'folderSession', folderSlug, mode: parts[2] }
  }
  if (parts[1]) {
    return {
      view: 'set',
      folderSlug,
      setSlug: parts[1],
      // Неизвестный режим в адресе — не повод падать: показываем карточки.
      mode: MODES.includes(parts[2]) ? parts[2] : CARDS,
    }
  }
  return { view: 'folder', folderSlug }
}

export const rootPath = () => '#/'
export const statsPath = () => `#/${RESERVED.stats}`
export const folderPath = (folder) => `#/${entitySlug(folder)}`
export const folderSessionPath = (folder, mode) =>
  `${folderPath(folder)}/${RESERVED.all}/${mode}`
export const setPath = (folder, set, mode = CARDS) =>
  `${folderPath(folder)}/${entitySlug(set)}` + (mode && mode !== CARDS ? `/${mode}` : '')

/** Переход: обычный — новой записью в истории, replace — вместо текущей. */
export function go(path, { replace = false } = {}) {
  if (replace) window.location.replace(path)
  else window.location.hash = path
}
