import { supabase, CARD_IMAGES_BUCKET } from './supabase'

// Все запросы дополнительно фильтруются политиками RLS на стороне Supabase,
// user_id проставляется явно, потому что он NOT NULL и участвует в проверке.

// PostgREST отдаёт максимум 1000 строк за запрос, а в папке карточек бывает
// больше — читаем страницами, пока страница не окажется неполной.
const PAGE = 1000

async function fetchAllPages(build) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...data)
    if (data.length < PAGE) return rows
  }
}

/** Следующая позиция в списке: max(position) + 1. */
async function nextPosition(table, column, parentId) {
  const { data, error } = await supabase
    .from(table)
    .select('position')
    .eq(column, parentId)
    .order('position', { ascending: false })
    .limit(1)
  if (error) throw error
  return (data[0]?.position ?? 0) + 1
}

// ── Папки ────────────────────────────────────────────────────────────────────

export async function listFolders() {
  const { data, error } = await supabase
    .from('folders')
    .select('id, name, created_at')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function createFolder(userId, name) {
  const { data, error } = await supabase
    .from('folders')
    .insert({ user_id: userId, name })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function renameFolder(id, name) {
  const { error } = await supabase.from('folders').update({ name }).eq('id', id)
  if (error) throw error
}

export async function deleteFolder(id) {
  const { error } = await supabase.from('folders').delete().eq('id', id)
  if (error) throw error
}

// ── Наборы ───────────────────────────────────────────────────────────────────

export async function listSets(folderId) {
  return fetchAllPages(() =>
    supabase
      .from('sets')
      .select('id, name, folder_id, position, created_at')
      .eq('folder_id', folderId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true }),
  )
}

export async function createSet(userId, folderId, name) {
  const position = await nextPosition('sets', 'folder_id', folderId)
  const { data, error } = await supabase
    .from('sets')
    .insert({ user_id: userId, folder_id: folderId, name, position })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function renameSet(id, name) {
  const { error } = await supabase.from('sets').update({ name }).eq('id', id)
  if (error) throw error
}

export async function deleteSet(id) {
  const { error } = await supabase.from('sets').delete().eq('id', id)
  if (error) throw error
}

/**
 * Сколько в каждом наборе карточек и сколько из них выучено:
 * { [setId]: { total, mastered } }
 *
 * Сортировка по id, а не по set_id: страницы режутся через limit/offset, и при
 * неуникальном ключе сортировки Postgres не обязан отдавать одинаковые строки
 * при равных значениях — на границе страниц карточки задваивались бы и терялись,
 * а счётчик врал бы на несколько слов.
 */
export async function statsBySet(setIds) {
  if (!setIds.length) return {}
  const rows = await fetchAllPages(() =>
    supabase.from('cards').select('set_id, mastery_level').in('set_id', setIds).order('id'),
  )
  return rows.reduce((acc, row) => {
    const s = (acc[row.set_id] ??= { total: 0, mastered: 0 })
    s.total++
    if (row.mastery_level >= 3) s.mastered++
    return acc
  }, {})
}

// ── Карточки ─────────────────────────────────────────────────────────────────

const CARD_FIELDS = 'id, set_id, word_en, word_ru, image_path, context, mastery_level, position, created_at'

export async function listCards(setId) {
  return fetchAllPages(() =>
    supabase
      .from('cards')
      .select(CARD_FIELDS)
      .eq('set_id', setId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true }),
  )
}

/**
 * Все карточки папки одним списком — для режима «Учить всю папку».
 * Порядок: наборы по своей позиции, внутри набора карточки по своей.
 * Ничего не создаём в базе, это сборка на лету для одной сессии.
 */
export async function listFolderCards(folderId) {
  const sets = await listSets(folderId)
  if (!sets.length) return []

  const rows = await fetchAllPages(() =>
    supabase
      .from('cards')
      .select(CARD_FIELDS)
      .in(
        'set_id',
        sets.map((s) => s.id),
      )
      // Ключ сортировки обязан быть уникальным, иначе постраничное чтение
      // теряет карточки на границе страниц; id — подстраховка на случай
      // одинаковых position.
      .order('set_id')
      .order('position', { ascending: true })
      .order('id'),
  )

  const setOrder = new Map(sets.map((s, i) => [s.id, i]))
  return rows.sort(
    (a, b) => setOrder.get(a.set_id) - setOrder.get(b.set_id) || a.position - b.position,
  )
}

export async function createCard(userId, setId, { word_en, word_ru, image_path, context }) {
  const position = await nextPosition('cards', 'set_id', setId)
  const { data, error } = await supabase
    .from('cards')
    .insert({
      user_id: userId,
      set_id: setId,
      word_en: word_en.trim(),
      word_ru: word_ru.trim(),
      image_path: image_path || null,
      context: context?.trim() || null,
      position,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

/** Пакетная вставка — для импорта из Quizlet. */
export async function createCardsBulk(userId, setId, pairs) {
  const base = await nextPosition('cards', 'set_id', setId)
  const rows = pairs.map((p, i) => ({
    user_id: userId,
    set_id: setId,
    word_en: p.word_en,
    word_ru: p.word_ru,
    position: base + i,
  }))
  const { data, error } = await supabase.from('cards').insert(rows).select()
  if (error) throw error
  return data
}

export async function updateCard(id, patch) {
  const { error } = await supabase.from('cards').update(patch).eq('id', id)
  if (error) throw error
}

export async function setMastery(cardId, level) {
  const { error } = await supabase
    .from('cards')
    .update({ mastery_level: level })
    .eq('id', cardId)
  if (error) throw error
}

/**
 * Сброс прогресса конкретных карточек — «учить заново».
 * Работает и для одного набора, и для сессии по всей папке; id режем на пачки,
 * потому что список id уезжает в строку запроса.
 */
export async function resetMasteryForCards(cardIds) {
  for (let i = 0; i < cardIds.length; i += 200) {
    const { error } = await supabase
      .from('cards')
      .update({ mastery_level: 0 })
      .in('id', cardIds.slice(i, i + 200))
    if (error) throw error
  }
}

export async function deleteCard(card) {
  if (card.image_path) {
    // Ошибку удаления файла глушим: карточка важнее осиротевшей картинки.
    await supabase.storage.from(CARD_IMAGES_BUCKET).remove([card.image_path])
  }
  const { error } = await supabase.from('cards').delete().eq('id', card.id)
  if (error) throw error
}

// ── Картинки ─────────────────────────────────────────────────────────────────

/**
 * Кладём файл в card-images под префиксом user_id — политики storage разрешают
 * писать только в свою «папку», первый сегмент пути сверяется с auth.uid().
 */
export async function uploadCardImage(userId, file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${userId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(CARD_IMAGES_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false })
  if (error) throw error
  return path
}

export async function removeCardImage(path) {
  if (!path) return
  await supabase.storage.from(CARD_IMAGES_BUCKET).remove([path])
}
