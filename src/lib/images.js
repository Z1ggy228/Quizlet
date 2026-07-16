// ─────────────────────────────────────────────────────────────────────────────
//  ПОДБОР КАРТИНОК — ВСТАВЬТЕ СВОЙ КЛЮЧ ЗДЕСЬ
//
//  Где взять: https://unsplash.com/oauth/applications → «New Application»
//  (согласиться с условиями) → в карточке приложения скопировать «Access Key».
//  Регистрация бесплатная, демо-режим даёт 50 запросов в час — для подбора
//  картинок к словам этого с запасом.
//
//  Ключ Access Key публичный и рассчитан на использование во фронтенде.
//  Secret Key сюда вставлять НЕЛЬЗЯ.
//  Оставьте строку как есть — кнопка «Подобрать картинку» просто скажет, что
//  ключ не задан, остальное приложение работает как обычно.
// ─────────────────────────────────────────────────────────────────────────────

export const UNSPLASH_ACCESS_KEY = 'wyPZxQvZahIYrEpducFyt7ys89dMfOSZyqNQ93w3LUY'

const API = 'https://api.unsplash.com'

export const imagesConfigured =
  UNSPLASH_ACCESS_KEY.length > 20 && !UNSPLASH_ACCESS_KEY.startsWith('ВСТАВЬТЕ')

/** Понятный текст вместо кода ошибки. */
class ImageError extends Error {}

/**
 * Поиск картинок по английскому слову.
 * @returns {Promise<Array<{id, thumb, full, alt, author, authorLink, downloadLocation}>>}
 *   Пустой массив — ничего не нашлось (это не ошибка).
 */
export async function searchImages(query) {
  if (!imagesConfigured) throw new ImageError('Ключ Unsplash не задан — см. src/lib/images.js')

  const q = (query || '').replace(/\([^)]*\)/g, ' ').trim()
  if (!q) throw new ImageError('Сначала введите английское слово.')

  let res
  try {
    res = await fetch(
      `${API}/search/photos?query=${encodeURIComponent(q)}&per_page=8&content_filter=high&orientation=landscape`,
      {
        headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
        signal: AbortSignal.timeout(10000),
      },
    )
  } catch {
    throw new ImageError('Не удалось связаться с Unsplash. Проверьте интернет.')
  }

  if (res.status === 401) throw new ImageError('Unsplash не принял ключ. Проверьте Access Key.')
  if (res.status === 403) throw new ImageError('Исчерпан лимит запросов Unsplash — попробуйте позже.')
  if (!res.ok) throw new ImageError(`Unsplash ответил ошибкой ${res.status}.`)

  const data = await res.json()
  return (data.results || []).map((p) => ({
    id: p.id,
    thumb: p.urls.small,
    full: p.urls.regular,
    alt: p.alt_description || q,
    author: p.user?.name || 'Unsplash',
    authorLink: p.user?.links?.html,
    downloadLocation: p.links?.download_location,
  }))
}

/**
 * Качаем выбранную картинку и отдаём File — дальше он грузится в бакет тем же
 * путём, что и файл с диска.
 */
export async function downloadImage(photo) {
  let res
  try {
    res = await fetch(photo.full, { signal: AbortSignal.timeout(20000) })
  } catch {
    throw new ImageError('Не удалось скачать картинку.')
  }
  if (!res.ok) throw new ImageError('Не удалось скачать картинку.')

  const blob = await res.blob()
  const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
  return new File([blob], `unsplash-${photo.id}.${ext}`, { type: blob.type })
}

/**
 * Правила Unsplash требуют отметить факт скачивания. Ошибку глушим: это
 * формальность, из-за которой пользователь не должен остаться без картинки.
 */
export function trackDownload(photo) {
  if (!photo?.downloadLocation || !imagesConfigured) return
  fetch(photo.downloadLocation, {
    headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
  }).catch(() => {})
}
