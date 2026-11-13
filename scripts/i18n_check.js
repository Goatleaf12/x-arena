// i18n smoke test — verifies the EN/中文 toggle translates the select
// screen + token section, persists across reload, and toggles back.
// Serves dist/ (must be built first). Run: node scripts/i18n_check.js
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const PORT = 8124
const ORIGIN = `http://localhost:${PORT}`
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', 'dist'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'ignore'
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 20; i++) {
  try { const res = await fetch(`http://127.0.0.1:${PORT}/`); if (res.ok) break } catch { /* not up yet */ }
  await sleep(500)
}

let failures = 0
const fail = (msg) => { failures++; console.log('FAIL:', msg) }
const ok = (msg) => console.log('ok:', msg)
const has = (txt, needle) => (txt || '').includes(needle)

let browser
try {
  browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,720',
      '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required', '--no-proxy-server']
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const errors = []
  let gangReqFails = 0
  let failedResourceLogs = 0
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    if (m.text().startsWith('Failed to load resource')) { failedResourceLogs++; return }
    errors.push('console: ' + m.text())
  })
  page.on('requestfailed', (r) => {
    if (r.url().startsWith('https://gang.fun/api/market')) { gangReqFails++; return }
    errors.push('reqfail: ' + r.url())
  })

  await page.goto(`${ORIGIN}/?demo=select`, { waitUntil: 'networkidle', timeout: 30000 })
  await sleep(2000)
  const read = () => page.evaluate(() => ({
    lang: document.documentElement.lang,
    toggle: document.getElementById('lang-toggle')?.textContent || '',
    subtitle: document.querySelector('.subtitle')?.textContent || '',
    tokenTitle: document.querySelector('.token-card h2')?.textContent || '',
    tokenLive: document.querySelector('[data-i18n="tokenLive"]')?.textContent || '',
    howToBuy: document.querySelector('.how-to-buy')?.textContent || '',
    charCard: document.querySelector('.char-card p')?.textContent || '',
    playBtn: document.getElementById('start-btn')?.textContent || '',
    liveStats: document.getElementById('live-stats')?.textContent || '',
    stored: localStorage.getItem('splat-lang')
  }))

  // 1. default = English
  let s = await read()
  if (s.lang !== 'en') fail('default html lang should be en, got ' + s.lang)
  if (!has(s.subtitle, 'SPLAT points')) fail('EN subtitle missing SPLAT points: ' + s.subtitle)
  if (s.tokenTitle !== 'SPLAT — THE TOKEN') fail('EN token title wrong: ' + s.tokenTitle)
  if (!has(s.toggle, '中文')) fail('EN toggle should offer 中文, got ' + s.toggle)
  else ok('default English renders')

  // 2. switch to Mandarin
  await page.click('#lang-toggle')
  await sleep(600)
  s = await read()
  if (s.lang !== 'zh-CN') fail('html lang should be zh-CN after toggle, got ' + s.lang)
  if (!has(s.subtitle, 'SPLAT 积分')) fail('ZH subtitle missing SPLAT 积分: ' + s.subtitle)
  if (s.tokenTitle !== 'SPLAT — 代币') fail('ZH token title wrong: ' + s.tokenTitle)
  if (!has(s.tokenLive, '正在交易')) fail('ZH token live wrong: ' + s.tokenLive)
  if (!has(s.howToBuy, '如何购买')) fail('ZH how-to-buy wrong: ' + s.howToBuy)
  if (!has(s.charCard, '弹跳兔') && !has(s.charCard, '耳朵最大')) fail('ZH char card not translated: ' + s.charCard)
  if (!has(s.playBtn, '开始游戏')) fail('ZH play button wrong: ' + s.playBtn)
  if (!has(s.toggle, 'EN')) fail('ZH toggle should offer EN, got ' + s.toggle)
  if (s.stored !== 'zh') fail('localStorage should hold zh, got ' + s.stored)
  else ok('Mandarin renders (subtitle, token, how-to-buy, char card, play button)')

  // 3. persists across reload
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(1500)
  s = await read()
  if (s.lang !== 'zh-CN' || s.tokenTitle !== 'SPLAT — 代币') fail('language did not persist across reload')
  else ok('language persists across reload')

  // 4. toggle back to English
  await page.click('#lang-toggle')
  await sleep(600)
  s = await read()
  if (s.lang !== 'en' || s.tokenTitle !== 'SPLAT — THE TOKEN') fail('toggle back to English failed')
  if (!has(s.subtitle, 'SPLAT points')) fail('EN subtitle not restored')
  else ok('toggles back to English')

  if (failedResourceLogs > gangReqFails) errors.push(`console: ${failedResourceLogs - gangReqFails} unexplained "Failed to load resource" error(s)`)
  if (errors.length) { console.log('PAGE ERRORS:'); errors.forEach((e) => console.log(' -', e.slice(0, 300))); failures += errors.length }
} catch (e) {
  console.log('TEST CRASH:', e.message)
  failures++
} finally {
  if (browser) await browser.close()
  server.kill()
}
console.log(failures === 0 ? '\nALL I18N CHECKS PASSED' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
