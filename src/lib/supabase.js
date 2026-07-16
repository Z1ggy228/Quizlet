import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
//  НАСТРОЙКА SUPABASE — ВСТАВЬТЕ СВОИ ЗНАЧЕНИЯ ЗДЕСЬ
//
//  Где их взять: панель Supabase → ваш проект → Settings → API
//    SUPABASE_URL      = поле "Project URL"      (вида https://xxxxxxxx.supabase.co)
//    SUPABASE_ANON_KEY = ключ "anon / public"    (длинная строка, начинается с "eyJ...")
//
//  anon-ключ публичный, его безопасно держать во фронтенде: доступ к данным
//  ограничен политиками RLS из файла supabase/migration.sql.
//  НИКОГДА не вставляйте сюда service_role-ключ.
// ─────────────────────────────────────────────────────────────────────────────

export const SUPABASE_URL = 'https://lgbrqqgrhrstmwhpngrh.supabase.co'
export const SUPABASE_ANON_KEY = 'sb_publishable_VIzL7bwhumRM2ucx-1LxqA_CMGh1NXP'

// Имя бакета для картинок карточек (создаётся миграцией).
export const CARD_IMAGES_BUCKET = 'card-images'

export const isSupabaseConfigured =
  SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY.length > 20

export const supabase = createClient(
  isSupabaseConfigured ? SUPABASE_URL : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? SUPABASE_ANON_KEY : 'placeholder-anon-key',
)

/** Публичная ссылка на картинку карточки по пути из cards.image_path. */
export function imageUrl(path) {
  if (!path) return null
  return supabase.storage.from(CARD_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl
}
