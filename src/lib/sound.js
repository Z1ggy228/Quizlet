/**
 * Звуки ответов. Синтезируем через Web Audio — ни файлов, ни сети, ни задержки
 * на загрузку. Все три звука короткие и мягкие: приложение звучит, а не пищит.
 *
 * Громкость намеренно небольшая, атака и затухание плавные — щелчки в динамике
 * берутся именно от резкого старта и обрыва.
 */

const SETTING_KEY = 'sound.on'

let ctx = null

function audio() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  // Браузер держит контекст усыплённым, пока пользователь не тронет страницу.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

export const soundSupported =
  typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext)

export function soundEnabled() {
  try {
    return localStorage.getItem(SETTING_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setSoundEnabled(on) {
  try {
    localStorage.setItem(SETTING_KEY, on ? 'on' : 'off')
  } catch {
    /* приватный режим — переживём */
  }
}

/**
 * Одна нота: синус с мягким колоколом громкости.
 * @param at — смещение от «сейчас» в секундах, чтобы собирать аккорды.
 */
function tone(ac, { freq, at = 0, duration = 0.12, volume = 0.12, type = 'sine' }) {
  const t0 = ac.currentTime + at
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)

  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.015) // атака
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration) // затухание

  osc.connect(gain).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

function play(notes) {
  if (!soundEnabled()) return
  const ac = audio()
  if (!ac) return
  try {
    notes.forEach((n) => tone(ac, n))
  } catch {
    /* звук — приятная мелочь, из-за неё ничего падать не должно */
  }
}

/** Нажали на вариант: короткий мягкий тик, почти незаметный. */
export function playClick() {
  play([{ freq: 660, duration: 0.05, volume: 0.05, type: 'triangle' }])
}

/** Верный ответ: светлое трезвучие вверх (до-ми-соль). */
export function playCorrect() {
  play([
    { freq: 523.25, at: 0, duration: 0.14, volume: 0.1 },
    { freq: 659.25, at: 0.075, duration: 0.14, volume: 0.1 },
    { freq: 783.99, at: 0.15, duration: 0.26, volume: 0.12 },
  ])
}

/** Ошибка: две низкие ноты вниз. Не резкий зуммер — просто «не туда». */
export function playWrong() {
  play([
    { freq: 233.08, at: 0, duration: 0.16, volume: 0.09, type: 'sine' },
    { freq: 185, at: 0.1, duration: 0.28, volume: 0.09, type: 'sine' },
  ])
}

/** Все слова выучены — маленький фанфар на финальном экране. */
export function playFinish() {
  play([
    { freq: 523.25, at: 0, duration: 0.12, volume: 0.09 },
    { freq: 659.25, at: 0.09, duration: 0.12, volume: 0.09 },
    { freq: 783.99, at: 0.18, duration: 0.12, volume: 0.09 },
    { freq: 1046.5, at: 0.27, duration: 0.4, volume: 0.11 },
  ])
}
