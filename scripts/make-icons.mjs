#!/usr/bin/env node
/**
 * Генерирует иконки Ziglish из одной SVG-монограммы.
 *   node scripts/make-icons.mjs
 *
 * Кладёт в public/: favicon.svg (векторный, для вкладок), PNG-фавиконы,
 * apple-touch-icon (iOS «на экран Домой») и icon-192/512 для manifest (Android).
 * PNG нужны потому, что iOS не берёт SVG для apple-touch-icon, а Android для
 * иконок манифеста хочет растр.
 */
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
mkdirSync(pub, { recursive: true })

// Буква Z — толстая ломаная с круглыми стыками, шрифт не нужен. Она сидит в
// центре (безопасная зона для maskable-иконок Android), фон заливает весь
// квадрат, поэтому обрезка краёв маской съест только фон.
const Z = `<polyline points="168,172 344,172 168,340 344,340" fill="none"
    stroke="#ffffff" stroke-width="62" stroke-linecap="round" stroke-linejoin="round"/>`

const gradient = `<defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>`

// Квадратная версия без скруглений — из неё растрируем PNG (платформа сама
// скруглит apple-touch/manifest, а maskable требует непрозрачные углы).
const square = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  ${gradient}
  <rect width="512" height="512" fill="url(#g)"/>
  ${Z}
</svg>`

// Скруглённая версия — только как favicon.svg, в браузерной вкладке смотрится
// как аккуратный бейдж.
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  ${gradient}
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  ${Z}
</svg>`

writeFileSync(join(pub, 'favicon.svg'), rounded)

const png = [
  ['favicon-32.png', 32],
  ['favicon-16.png', 16],
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
]
const src = Buffer.from(square)
for (const [name, size] of png) {
  await sharp(src).resize(size, size).png().toFile(join(pub, name))
  console.log('  ' + name.padEnd(22) + size + '×' + size)
}
console.log('favicon.svg + ' + png.length + ' PNG готовы в public/')
