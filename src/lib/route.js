/**
 * Адрес страницы: разбор и сборка. Чистые функции без React — проверяются
 * прогоном в node.
 *
 * Адрес складывается из названий, а не из id: `/english-from-scratch/lesson-3/learn`
 * читается, а `/f/8f3c…/s/1a90…` — нет.
 *
 * Английские слова берутся из колонки `slug` (миграция 06): её заполняет
 * приложение, переводя название при сохранении. Пока колонка пустая, адрес
 * собирается транслитерацией — старые ссылки продолжают работать, но выглядят
 * как `angliyskiy-s-nulya`.
 *
 * Обычные пути, а не хеш: `#/...` в ссылке смотрится мусором. Цена — правило
 * rewrite в [vercel.json](../../vercel.json): без него хостинг на `/lesson-3`
 * пойдёт искать такой файл и отдаст 404. В обмен адрес чистый и попадает в
 * историю браузера как обычная страница.
 *
 * Чем ещё платим: id в базе не по адресу, поэтому папку и набор приходится
 * искать перебором по списку (см. App.jsx) — списки короткие, это дешевле
 * лишней колонки в запросах.
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
 * Кусок адреса для папки или набора: сохранённый английский slug, иначе
 * транслитерация названия. Если не осталось и её (одни смайлики или знаки
 * препинания), берём id — ссылка будет некрасивой, но рабочей.
 */
export const entitySlug = (entity) =>
  slugify(entity?.slug) || slugify(entity?.name) || entity?.id || ''

/**
 * @returns {{view:'root'|'stats'|'folder'|'set'|'folderSession',
 *            folderSlug?:string, setSlug?:string, mode?:string}}
 */
export function parseRoute(pathname) {
  const parts = String(pathname || '')
    // Хеш-адреса времён предыдущей версии тоже понимаем: старая закладка
    // #/angliyskiy-s-nulya/lesson-3 откроет то же место, а не корень.
    .replace(/^[^#]*#/, '')
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

export const rootPath = () => '/'
export const statsPath = () => `/${RESERVED.stats}`
export const folderPath = (folder) => `/${entitySlug(folder)}`
export const folderSessionPath = (folder, mode) =>
  `${folderPath(folder)}/${RESERVED.all}/${mode}`
export const setPath = (folder, set, mode = CARDS) =>
  `${folderPath(folder)}/${entitySlug(set)}` + (mode && mode !== CARDS ? `/${mode}` : '')

/** Событие своего перехода: pushState сам по себе popstate не вызывает. */
export const ROUTE_EVENT = 'ziglish:route'

/** Переход: обычный — новой записью в истории, replace — вместо текущей. */
export function go(path, { replace = false } = {}) {
  if (replace) window.history.replaceState(null, '', path)
  else window.history.pushState(null, '', path)
  window.dispatchEvent(new Event(ROUTE_EVENT))
}

/** Текущий адрес: путь, а для старых закладок — то, что осталось в хеше. */
export const currentPath = () => window.location.pathname + window.location.hash
