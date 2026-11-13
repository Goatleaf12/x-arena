// Mobile check: select screen at phone width (720px) — the character images
// must be clearly visible in the cards. Serves dist/, screenshots select
// screen + asserts all 4 card images loaded (naturalWidth > 0, no 404s).
// Run: node scripts/mobile_check.js
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const PORT = 8124
const ORIGIN = `http://localhost:${PORT}`
const SHOTS = new URL('../shots', import.meta.url).pathname
fs.mkdirSync(SHOTS, { recursive: true })

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', 'dist'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'ignore'
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 20; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/`)
    if (res.ok) break
  } catch { /* not up yet */ }
  await sleep(500)
}

let failures = 0
const fail = (msg) => { failures++; console.log('FAIL:', msg) }
let browser
try {
  browser = await chromium.launch({
    args: [
      '--no-sandbox', '--disable-dev-shm-usage', '--window-size=720,1280',
      '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-proxy-server'
    ]
  })
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, isMobile: true, hasTouch: true })
  const errors = []
  let gangReqFails = 0
  let failedResourceLogs = 0
  // "Failed to load resource" console lines carry no URL; reconcile by
  // count against gang.fun request failures (1:1). Any surplus is real.
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    if (m.text().startsWith('Failed to load resource')) { failedResourceLogs++; return }
    errors.push('console: ' + m.text())
  })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  // Ignore the gang.fun live-feed failure: this VM's Chromium cannot reach
  // external https via the egress proxy (see shottest.js). The page degrades
  // gracefully; real browsers reach it (CORS *, verified 2026-11-14).
  page.on('requestfailed', (r) => {
    if (r.url().startsWith('https://gang.fun/api/market')) { gangReqFails++; return }
    errors.push('reqfail: ' + r.url())
  })

  await page.goto(`${ORIGIN}/?demo=select`, { waitUntil: 'networkidle', timeout: 30000 })
  await sleep(3500)
  const check = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('.char-card img.char-img')]
    return {
      cards: document.querySelectorAll('.char-card').length,
      imgs: imgs.map((img) => ({
        src: img.getAttribute('src'),
        loaded: img.complete && img.naturalWidth > 0,
        w: img.naturalWidth, h: img.naturalHeight,
        visible: img.getBoundingClientRect().width > 50
      })),
      errlog: document.getElementById('errlog')?.textContent || ''
    }
  })
  console.log('mobile select:', JSON.stringify(check, null, 1))
  if (check.cards !== 4) fail('expected 4 cards, got ' + check.cards)
  if (check.imgs.length !== 4) fail('expected 4 card images, got ' + check.imgs.length)
  for (const im of check.imgs) {
    if (!im.loaded) fail('image not loaded: ' + im.src)
    if (!im.visible) fail('image not visible (too small/hidden): ' + im.src)
  }
  if (check.errlog) fail('errlog: ' + check.errlog.slice(0, 200))
  await page.screenshot({ timeout: 120000, path: `${SHOTS}/08-mobile-select.png` })
  console.log('screenshot: shots/08-mobile-select.png')
  if (failedResourceLogs > gangReqFails) errors.push(`console: ${failedResourceLogs - gangReqFails} unexplained "Failed to load resource" error(s)`)
  if (errors.length) { console.log('PAGE ERRORS:'); errors.forEach((e) => console.log(' -', e.slice(0, 200))); failures += errors.length }
} catch (e) {
  console.log('MOBILE CHECK CRASH:', e.message)
  failures++
} finally {
  if (browser) await browser.close()
  server.kill()
}

console.log(failures === 0 ? '\nMOBILE CHECK PASSED' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
