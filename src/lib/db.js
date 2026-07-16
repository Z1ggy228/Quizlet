import { supabase, CARD_IMAGES_BUCKET } from './supabase'

// Все запросы дополнительно фильтруются политиками RLS на стороне Supabase,
// user_id проставляется явно, потому что он NOT NULL и участвует в проверке.

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
  const { data, error } = await supabase
    .from('sets')
    .select('id, name, folder_id, created_at')
    .eq('folder_id', folderId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function createSet(userId, folderId, name) {
  const { data, error } = await supabase
    .from('sets')
    .insert({ user_id: userId, folder_id: folderId, name })
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

/** Количество карточек в каждом наборе папки: { [setId]: count } */
export async function countCardsBySet(setIds) {
  if (!setIds.length) return {}
  const { data, error } = await supabase.from('cards').select('set_id').in('set_id', setIds)
  if (error) throw error
  return data.reduce((acc, row) => {
    acc[row.set_id] = (acc[row.set_id] || 0) + 1
    return acc
  }, {})
}

// ── Карточки ─────────────────────────────────────────────────────────────────

export async function listCards(setId) {
  const { data, error } = await supabase
    .from('cards')
    .select('id, set_id, word_en, word_ru, image_path, context, mastery_level, created_at')
    .eq('set_id', setId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function createCard(userId, setId, { word_en, word_ru, image_path, context }) {
  const { data, error } = await supabase
    .from('cards')
    .insert({
      user_id: userId,
      set_id: setId,
      word_en: word_en.trim(),
      word_ru: word_ru.trim(),
      image_path: image_path || null,
      context: context?.trim() || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

/** Пакетная вставка — для импорта из Quizlet. */
export async function createCardsBulk(userId, setId, pairs) {
  const rows = pairs.map((p) => ({
    user_id: userId,
    set_id: setId,
    word_en: p.word_en,
    word_ru: p.word_ru,
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

/** Сброс прогресса всего набора — «учить заново». */
export async function resetMastery(setId) {
  const { error } = await supabase
    .from('cards')
    .update({ mastery_level: 0 })
    .eq('set_id', setId)
  if (error) throw error
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
