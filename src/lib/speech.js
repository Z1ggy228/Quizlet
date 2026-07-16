/**
 * Озвучка через встроенный в браузер SpeechSynthesis — без внешних сервисов,
 * без ключей и без интернета (голоса стоят в системе).
 */

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null

export const speechSupported = !!synth

/**
 * Список голосов приезжает асинхронно и в разных браузерах по-разному: в Chrome
 * первый вызов getVoices() часто возвращает пустой массив, пока не выстрелит
 * onvoiceschanged. Поэтому ждём, но не бесконечно.
 */
function voices() {
  if (!synth) return Promise.resolve([])
  const ready = synth.getVoices()
  if (ready.length) return Promise.resolve(ready)
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(synth.getVoices()), 1000)
    synth.onvoiceschanged = () => {
      clearTimeout(timer)
      resolve(synth.getVoices())
    }
  })
}

let cached = null

/** Английский голос: сначала родной en-US/en-GB, иначе любой en-*. */
async function englishVoice() {
  if (cached) return cached
  const list = await voices()
  cached =
    list.find((v) => v.lang === 'en-US' && v.localService) ||
    list.find((v) => v.lang === 'en-GB' && v.localService) ||
    list.find((v) => v.lang?.startsWith('en')) ||
    null
  return cached
}

/**
 * Произнести английский текст. Возвращает промис, который резолвится по
 * окончании речи. Ошибки не бросаем: озвучка — приятная мелочь, из-за неё
 * ничего не должно падать.
 */
export async function speak(text, { rate = 0.9 } = {}) {
  if (!synth || !text) return
  try {
    synth.cancel() // иначе фразы копятся в очереди и говорят одна за другой
    const u = new SpeechSynthesisUtterance(text)
    const voice = await englishVoice()
    if (voice) u.voice = voice
    u.lang = voice?.lang || 'en-US'
    u.rate = rate
    await new Promise((resolve) => {
      u.onend = resolve
      u.onerror = resolve
      synth.speak(u)
    })
  } catch {
    /* нет голосов или браузер запретил — молча живём дальше */
  }
}

export function stopSpeaking() {
  try {
    synth?.cancel()
  } catch {
    /* не важно */
  }
}
