import { supabase, CARD_IMAGES_BUCKET } from './supabase'
import { localDay, schedule } from './srs'

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

/**
 * Папка по id — для перехода по прямой ссылке, когда в памяти ничего нет
 * (открыли закладку или нажали F5 внутри набора).
 *
 * maybeSingle, а не single: папки может уже не быть, и это не ошибка, а повод
 * увести на список папок. Чужую RLS всё равно не отдаст.
 */
export async function getFolder(id) {
  const { data, error } = await supabase
    .from('folders')
    .select('id, name, created_at')
    .eq('id', id)
    .maybeSingle()
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

/** Набор по id — тоже для прямых ссылок, см. getFolder. */
export async function getSet(id) {
  const { data, error } = await supabase
    .from('sets')
    .select('id, name, folder_id, position, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
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

const CARD_FIELDS =
  'id, set_id, word_en, word_ru, image_path, context, mastery_level, position, created_at, ' +
  'transcription, part_of_speech, ease_factor, interval_days, repetitions, due_date, times_seen, times_wrong, flagged'

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

export async function createCard(
  userId,
  setId,
  { word_en, word_ru, image_path, context, transcription, part_of_speech },
) {
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
      transcription: transcription?.trim() || null,
      part_of_speech: part_of_speech?.trim() || null,
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
 * Ответ на карточку: разом обновляем и уровень освоения (для сессии), и
 * состояние SM-2 (для расписания повторений), и счётчики показов/ошибок.
 * Возвращаем поля, которые записали, — вызывающий кладёт их в свою копию
 * карточки, иначе следующий расчёт SM-2 пойдёт от устаревших значений.
 */
export async function recordAnswer(card, { mastery, quality, correct }) {
  const srs = schedule(card, quality)
  const patch = {
    ...srs,
    mastery_level: mastery,
    times_seen: (card.times_seen ?? 0) + 1,
    times_wrong: (card.times_wrong ?? 0) + (correct ? 0 : 1),
  }
  // Снимаем ручную пометку, когда слово впервые доведено до конца в этом
  // занятии (было ниже порога — стало выучено). Именно переход, а не «уровень
  // 3 сам по себе»: слово, помеченное уже выученным (чтобы подрилить), Learn
  // не спрашивает, перехода не будет — флаг держится, пока не снимут руками.
  if (mastery >= MASTERED && (card.mastery_level ?? 0) < MASTERED) patch.flagged = false
  const { error } = await supabase.from('cards').update(patch).eq('id', card.id)
  if (error) throw error
  return patch
}

/** Пометить/снять пометку «проблемное слово» вручную. */
export async function setFlag(cardId, flagged) {
  const { error } = await supabase.from('cards').update({ flagged }).eq('id', cardId)
  if (error) throw error
}

/** Ручная правка транскрипции и части речи. */
export async function setWordInfo(cardId, { transcription, part_of_speech }) {
  const { error } = await supabase
    .from('cards')
    .update({ transcription: transcription || null, part_of_speech: part_of_speech || null })
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

// ── Повторение и статистика по всем наборам сразу ────────────────────────────

const MASTERED = 3

/**
 * Сводка по всем словам пользователя.
 *
 * Срок по SM-2 здесь не считается: экран «на повторение» убран, а расписание
 * продолжает жить в самих карточках — его показывает `formatDue` в списке
 * проблемных.
 */
export async function overallStats() {
  // Фильтры вешаются только на то, что вернул select(): у from() их просто нет,
  // и .gte() до select() падает с TypeError.
  const counter = () => supabase.from('cards').select('id', { count: 'exact', head: true })
  const value = async (query) => {
    const { count, error } = await query
    if (error) throw error
    return count ?? 0
  }
  const [total, mastered] = await Promise.all([
    value(counter()),
    value(counter().gte('mastery_level', MASTERED)),
  ])
  // Число проблемных берём из самого списка (problemCards): правило там сложнее
  // «flagged ИЛИ есть ошибки И ≥3 показов», и держать два источника правды,
  // которые могут разойтись, не стоит.
  return { total, mastered, learning: total - mastered }
}

/**
 * Сколько раз слово должно быть показано, чтобы попасть в проблемные.
 * Без порога одна ошибка с одного показа даёт «100% промахов» и вытесняет
 * слова, которые вы правда заваливаете раз за разом.
 */
export const MIN_SEEN_FOR_PROBLEM = 3

/**
 * Проблемные слова: помеченные вручную (`flagged`) плюс те, что заваливаются
 * сами. Сортировка по доле промахов, а не по их числу — абсолютный счётчик
 * кренил список в сторону слов, которые просто чаще гоняли: 5 ошибок из 50
 * (10%) оказывались выше 4 из 5 (80%). Помеченные руками идут первыми.
 *
 * Помеченное слово показывается ВСЕГДА, даже выученное: в этом и смысл ручной
 * пометки — подрилить слово, которое статистика считает известным. Пометка
 * снимается руками или когда слово доведено до конца в занятии (переход в
 * «выучено», см. recordAnswer). А «набравшие ошибки» исключаются при выучивании:
 * счётчик ошибок не убывает, и без этого слово, прогнанное без единой ошибки,
 * висело бы вечно (чистый прогон растит только знаменатель: 4 из 5 → 4 из 8).
 *
 * Порог в 3 показа — только для «набравших ошибки», ручная пометка его минует.
 * Часть условий (порог показов) проверяем на клиенте: в запросе оставляем
 * «flagged ИЛИ (невыучено И есть ошибки)».
 */
export async function problemCards() {
  const rows = await fetchAllPages(() =>
    supabase
      .from('cards')
      .select(CARD_FIELDS)
      .or(`flagged.eq.true,and(mastery_level.lt.${MASTERED},times_wrong.gt.0)`)
      .order('id'),
  )
  return rows
    .filter((c) => c.flagged || (c.mastery_level < MASTERED && c.times_seen >= MIN_SEEN_FOR_PROBLEM))
    .map((c) => ({ ...c, wrong_rate: c.times_seen ? c.times_wrong / c.times_seen : 0 }))
    .sort(
      (a, b) =>
        (b.flagged ? 1 : 0) - (a.flagged ? 1 : 0) || // помеченные руками — вверх
        b.wrong_rate - a.wrong_rate || // затем по доле промахов
        b.times_wrong - a.times_wrong || // при равной доле — где ошибок больше
        a.id.localeCompare(b.id), // и стабильный порядок при полном равенстве
    )
}

// ── Настройки, стрик и дневная цель ──────────────────────────────────────────

export const DEFAULT_DAILY_GOAL = 20

/** Настройки создаются лениво: строки может ещё не быть. */
export async function getSettings(userId) {
  const { data, error } = await supabase
    .from('user_settings')
    .select('user_id, daily_goal')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data ?? { user_id: userId, daily_goal: DEFAULT_DAILY_GOAL }
}

export async function saveDailyGoal(userId, goal) {
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, daily_goal: goal }, { onConflict: 'user_id' })
  if (error) throw error
  // Подтягиваем новую планку к сегодняшнему дню, не добавляя слов: иначе цифра
  // «сегодня» жила бы по старой цели до следующего выученного слова.
  await bumpStudyDay(0).catch(() => {})
}

/** Дни занятий за последний год — из них считается стрик. */
export async function listStudyDays(days = 400) {
  const from = new Date()
  from.setDate(from.getDate() - days)
  const { data, error } = await supabase
    .from('study_days')
    .select('day, words_count, goal')
    .gte('day', localDay(from))
    .order('day', { ascending: false })
  if (error) throw error
  return data
}

/**
 * Отмечаем изученное слово за сегодня. Считает функция в базе: PostgREST не
 * умеет инкремент, а читать-и-писать из браузера — гонка между ответами.
 */
export async function bumpStudyDay(words = 1) {
  const { data, error } = await supabase.rpc('bump_study_day', {
    p_day: localDay(),
    p_words: words,
  })
  if (error) throw error
  return Array.isArray(data) ? data[0] : data
}

// ── Экспорт ──────────────────────────────────────────────────────────────────

/** Полный слепок данных пользователя: папки → наборы → карточки. Без картинок. */
export async function exportEverything() {
  const [folders, sets] = await Promise.all([
    listFolders(),
    fetchAllPages(() =>
      supabase.from('sets').select('id, folder_id, name, position, created_at').order('id'),
    ),
  ])
  const cards = await fetchAllPages(() => supabase.from('cards').select(CARD_FIELDS).order('id'))

  const bySet = new Map()
  for (const c of cards) {
    if (!bySet.has(c.set_id)) bySet.set(c.set_id, [])
    bySet.get(c.set_id).push(c)
  }
  const byFolder = new Map()
  for (const s of sets) {
    if (!byFolder.has(s.folder_id)) byFolder.set(s.folder_id, [])
    byFolder.get(s.folder_id).push(s)
  }
  const sortPos = (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)

  return {
    exported_at: new Date().toISOString(),
    folders: folders.map((f) => ({
      name: f.name,
      created_at: f.created_at,
      sets: (byFolder.get(f.id) ?? []).sort(sortPos).map((s) => ({
        name: s.name,
        position: s.position,
        created_at: s.created_at,
        cards: (bySet.get(s.id) ?? []).sort(sortPos).map(({ id, set_id, ...card }) => card),
      })),
    })),
  }
}
