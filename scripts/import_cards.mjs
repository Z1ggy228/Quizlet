#!/usr/bin/env node
/**
 * Разовый импорт выгрузки из Quizlet в вашу базу Supabase.
 *
 *   npm run import              — импорт data/cards_export.json
 *   npm run import -- --dry-run — только разобрать файл и показать план, база не трогается
 *   npm run import -- путь.json — другой файл
 *
 * Ключи берутся из src/lib/supabase.js — тех же, что использует приложение.
 * Данные закрыты политиками RLS, поэтому скрипт входит в ваш аккаунт по email и
 * паролю: их нужно ввести в консоли (или передать через переменные окружения
 * SUPABASE_EMAIL и SUPABASE_PASSWORD). Пароль никуда не сохраняется.
 *
 * Импорт идемпотентный: папка ищется по имени, набор — по имени внутри папки,
 * карточка — по позиции внутри набора. Повторный запуск дублей не создаёт и
 * ничего не удаляет.
 */
import { createClient } from '@supabase/supabase-js'
import { createInterface } from 'node:readline/promises'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { stdin, stdout } from 'node:process'

import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from '../src/lib/supabase.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const jsonPath = resolve(root, args.find((a) => !a.startsWith('--')) ?? 'data/cards_export.json')

const BATCH = 500

function log(...a) {
  console.log(...a)
}

/** Разбор и проверка файла: наружу отдаём уже с проставленными позициями. */
function parseExport(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  if (!raw.folder?.trim()) throw new Error('В файле нет имени папки (поле folder)')
  if (!Array.isArray(raw.sets) || !raw.sets.length) throw new Error('В файле нет наборов (поле sets)')

  const sets = raw.sets.map((set, si) => {
    if (!set.name?.trim()) throw new Error(`Набор #${si + 1}: пустое имя`)
    if (!Array.isArray(set.cards) || !set.cards.length)
      throw new Error(`Набор «${set.name}»: нет карточек`)

    return {
      name: set.name.trim(),
      position: si + 1,
      cards: set.cards.map((card, ci) => {
        // trim, но без схлопывания переносов внутри: многострочные значения
        // («1) подарок \n 2) настоящее») и диалоги должны дойти как есть.
        const word_en = card.term?.trim()
        const word_ru = card.definition?.trim()
        if (!word_en || !word_ru)
          throw new Error(`Набор «${set.name}», карточка #${ci + 1}: пустой term или definition`)
        return { word_en, word_ru, position: ci + 1 }
      }),
    }
  })

  return { folder: raw.folder.trim(), sets }
}

async function ask(question, { silent = false } = {}) {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true })
  if (silent) {
    // Гасим эхо, чтобы пароль не остался в консоли.
    const onData = () => rl.output.write('\x1B[2K\x1B[200D' + question)
    rl.input.on('data', onData)
    try {
      const answer = await rl.question(question)
      rl.output.write('\n')
      return answer
    } finally {
      rl.input.off('data', onData)
      rl.close()
    }
  }
  try {
    return await rl.question(question)
  } finally {
    rl.close()
  }
}

async function signIn() {
  const email = process.env.SUPABASE_EMAIL || (await ask('Email вашего аккаунта: '))
  const password = process.env.SUPABASE_PASSWORD || (await ask('Пароль: ', { silent: true }))

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error) throw new Error(`Не удалось войти: ${error.message}`)
  return { supabase, user: data.user }
}

/** Ищем по имени, создаём только если не нашли. */
async function findOrCreateFolder(supabase, userId, name) {
  const { data: found, error } = await supabase
    .from('folders')
    .select('id, name')
    .eq('user_id', userId)
    .eq('name', name)
    .limit(1)
  if (error) throw error
  if (found.length) return { row: found[0], created: false }

  const { data, error: insErr } = await supabase
    .from('folders')
    .insert({ user_id: userId, name })
    .select()
    .single()
  if (insErr) throw insErr
  return { row: data, created: true }
}

async function findOrCreateSet(supabase, userId, folderId, name, position) {
  const { data: found, error } = await supabase
    .from('sets')
    .select('id, name, position')
    .eq('folder_id', folderId)
    .eq('name', name)
    .limit(1)
  if (error) throw error
  if (found.length) return { row: found[0], created: false }

  const { data, error: insErr } = await supabase
    .from('sets')
    .insert({ user_id: userId, folder_id: folderId, name, position })
    .select()
    .single()
  if (insErr) throw insErr
  return { row: data, created: true }
}

/**
 * Вставляем только те карточки, чьих позиций в наборе ещё нет.
 * Позиция, а не пара term+definition: внутри набора встречаются законные дубли
 * («look after» дважды), и по тексту они бы схлопнулись в одну карточку.
 */
async function importSetCards(supabase, userId, setId, cards) {
  const { data: existing, error } = await supabase
    .from('cards')
    .select('position')
    .eq('set_id', setId)
  if (error) throw error

  const taken = new Set(existing.map((c) => c.position))
  const missing = cards.filter((c) => !taken.has(c.position))
  if (!missing.length) return 0

  for (let i = 0; i < missing.length; i += BATCH) {
    const rows = missing.slice(i, i + BATCH).map((c) => ({
      user_id: userId,
      set_id: setId,
      word_en: c.word_en,
      word_ru: c.word_ru,
      position: c.position,
    }))
    const { error: insErr } = await supabase.from('cards').insert(rows)
    if (insErr) throw insErr
  }
  return missing.length
}

async function countCards(supabase, setIds) {
  let total = 0
  for (let i = 0; i < setIds.length; i += 50) {
    const { count, error } = await supabase
      .from('cards')
      .select('id', { count: 'exact', head: true })
      .in('set_id', setIds.slice(i, i + 50))
    if (error) throw error
    total += count
  }
  return total
}

async function main() {
  const { folder, sets } = parseExport(jsonPath)
  const totalCards = sets.reduce((a, s) => a + s.cards.length, 0)
  const first = sets[0]

  log(`Файл : ${jsonPath}`)
  log(`Папка: «${folder}»`)
  log(`Разобрано: ${sets.length} наборов, ${totalCards} карточек`)
  log(
    `Первый набор «${first.name}»: ${first.cards.length} карточек, ` +
      `от «${first.cards[0].word_en}» до «${first.cards.at(-1).word_en}»`,
  )
  const multiline = sets.flatMap((s) => s.cards).filter((c) => /\n/.test(c.word_en + c.word_ru))
  log(`Многострочных карточек: ${multiline.length} (переносы сохраняются)`)

  if (dryRun) {
    log('\n--dry-run: база не тронута.')
    return
  }
  if (!isSupabaseConfigured) {
    throw new Error('В src/lib/supabase.js не заданы SUPABASE_URL и SUPABASE_ANON_KEY')
  }

  log('')
  const { supabase, user } = await signIn()
  log(`Вход выполнен: ${user.email}\n`)

  const folderRes = await findOrCreateFolder(supabase, user.id, folder)
  log(`Папка «${folder}»: ${folderRes.created ? 'создана' : 'уже есть, дополняем'}`)

  let setsCreated = 0
  let cardsInserted = 0
  for (const set of sets) {
    const setRes = await findOrCreateSet(supabase, user.id, folderRes.row.id, set.name, set.position)
    if (setRes.created) setsCreated++
    const added = await importSetCards(supabase, user.id, setRes.row.id, set.cards)
    cardsInserted += added
    log(
      `  ${String(set.position).padStart(2)}. ${set.name.padEnd(14)} ` +
        `${setRes.created ? 'новый набор' : 'существует '} · карточек добавлено: ${added} из ${set.cards.length}`,
    )
  }

  // Сверяем не по своим счётчикам, а тем, что реально лежит в базе.
  const { data: dbSets, error: setsErr } = await supabase
    .from('sets')
    .select('id')
    .eq('folder_id', folderRes.row.id)
  if (setsErr) throw setsErr
  const dbCards = await countCards(supabase, dbSets.map((s) => s.id))

  log(`\nДобавлено за этот запуск: наборов ${setsCreated}, карточек ${cardsInserted}`)
  log(`Сейчас в папке «${folder}»: наборов ${dbSets.length}, карточек ${dbCards}`)

  const ok = dbSets.length === sets.length && dbCards === totalCards
  log(ok ? 'Проверка пройдена: содержимое папки совпадает с файлом.' : 'ВНИМАНИЕ: числа не сходятся с файлом.')
  if (!ok) process.exitCode = 1
}

main().catch((e) => {
  console.error('\nОшибка:', e.message)
  process.exitCode = 1
})
