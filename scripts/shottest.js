// Headless visual + functional test for X Arena.
// Serves dist/ (must be built first), drives Playwright's stock Chromium
// (SwiftShader WebGL) — the VM's custom Chromium build cannot do CLI screenshots.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const PORT = 8123
const ORIGIN = `http://localhost:${PORT}`
const SHOTS = new URL('../shots', import.meta.url).pathname
fs.mkdirSync(SHOTS, { recursive: true })

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', 'dist'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'ignore'
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// wait until the static server answers on 127.0.0.1
for (let i = 0; i < 20; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/`)
    if (res.ok) break
  } catch { /* not up yet */ }
  await sleep(500)
}

let failures = 0
const fail = (msg) => { failures++; console.log('FAIL:', msg) }
const ok = (msg) => console.log('ok:', msg)

let browser
try {
  browser = await chromium.launch({
    args: [
      '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,720',
      '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required', '--no-proxy-server'
    ]
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('requestfailed', (r) => errors.push('reqfail: ' + r.url()))

  // --- 1. select screen ---
  await page.goto(`${ORIGIN}/?demo=select`, { waitUntil: 'networkidle', timeout: 30000 })
  await sleep(3500)
  const boot = await page.evaluate(() => ({
    game: !!window.__game,
    state: window.__game?.state,
    errlog: document.getElementById('errlog')?.textContent || '',
    webgl: (() => { try { const c = document.createElement('canvas'); return !!c.getContext('webgl2') } catch { return false } })()
  }))
  console.log('boot:', JSON.stringify(boot))
  if (!boot.game) fail('game object missing')
  if (!boot.webgl) fail('WebGL2 unavailable in headless browser')
  if (boot.errlog) fail('errlog: ' + boot.errlog.slice(0, 300))
  await page.screenshot({ timeout: 120000, path: `${SHOTS}/01-select.png` })

  // --- 2. start a match via demo mode ---
  await page.goto(`${ORIGIN}/?demo=1&char=momo`, { waitUntil: 'networkidle', timeout: 30000 })
  // countdown advances in game-time (dt clamped); under SwiftShader frames are
  // slow, so wait for the state instead of a fixed sleep
  await page.waitForFunction(() => window.__game.state === 'playing', undefined, { timeout: 90000 })
  await sleep(1000)
  const mid = await page.evaluate(() => {
    const g = window.__game
    return {
      state: g.state,
      playerAlive: g.player?.alive,
      bots: g.bots.length,
      botsAlive: g.bots.filter((b) => b.alive).length,
      coins: g.coins.filter((c) => c.active).length,
      score: g.stats.score,
      pos: g.player ? [g.player.pos.x.toFixed(1), g.player.pos.z.toFixed(1)] : null,
      errlog: document.getElementById('errlog')?.textContent || ''
    }
  })
  console.log('mid-match:', JSON.stringify(mid))
  if (mid.state !== 'playing') fail('expected state=playing, got ' + mid.state)
  if (mid.bots !== 3) fail('expected 3 bots, got ' + mid.bots)
  if (mid.errlog) fail('errlog: ' + mid.errlog.slice(0, 300))
  await page.screenshot({ timeout: 120000, path: `${SHOTS}/02-game-start.png` })

  // --- 3. move with W + turn with arrow key ---
  const before = mid.pos
  await page.keyboard.down('w')
  await sleep(1500)
  await page.keyboard.up('w')
  await page.keyboard.down('ArrowRight')
  await sleep(700)
  await page.keyboard.up('ArrowRight')
  const moved = await page.evaluate(() => {
    const g = window.__game
    return { pos: [g.player.pos.x.toFixed(1), g.player.pos.z.toFixed(1)], camYaw: g.camYaw.toFixed(2) }
  })
  console.log('moved:', JSON.stringify({ before, after: moved }))
  if (before[0] === moved.pos[0] && before[1] === moved.pos[1]) fail('player did not move with W')
  else ok('WASD movement works')
  await page.screenshot({ timeout: 120000, path: `${SHOTS}/03-moved.png` })

  // --- 4. shoot (direct call exercises the firing path) ---
  const shot = await page.evaluate(() => {
    const g = window.__game
    const before = g.stats.shots
    g._tryFire()
    return { before, after: g.stats.shots, projectiles: g.projectiles.length }
  })
  console.log('shot:', JSON.stringify(shot))
  if (shot.after <= shot.before) fail('firing did not register a shot')
  else ok('shooting works')
  await sleep(400)
  await page.screenshot({ timeout: 120000, path: `${SHOTS}/04-shot.png` })

  // --- 5. let bots act for a while ---
  await sleep(6000)
  const late = await page.evaluate(() => {
    const g = window.__game
    return {
      state: g.state, score: g.stats.score, kills: g.stats.kills,
      playerHp: Math.round(g.player.hp), botsHp: g.bots.map((b) => Math.round(b.hp)),
      projectiles: g.projectiles.length, timeLeft: Math.round(g.timeLeft),
      errlog: document.getElementById('errlog')?.textContent || ''
    }
  })
  console.log('late:', JSON.stringify(late))
  if (late.errlog) fail('errlog: ' + late.errlog.slice(0, 300))
  await page.screenshot({ timeout: 120000, path: `${SHOTS}/05-late.png` })

  // --- 6. end screen (force timer) ---
  await page.evaluate(() => { const g = window.__game; g.timeLeft = 0.5 })
  await page.waitForFunction(() => window.__game.state === 'ended', undefined, { timeout: 90000 })
  await sleep(1000)
  const end = await page.evaluate(() => ({
    state: window.__game.state,
    endVisible: !document.getElementById('end-screen').classList.contains('hidden'),
    lbItems: document.querySelectorAll('#lb-list li').length,
    errlog: document.getElementById('errlog')?.textContent || ''
  }))
  console.log('end:', JSON.stringify(end))
  if (end.state !== 'ended') fail('expected state=ended, got ' + end.state)
  if (!end.endVisible) fail('end screen not visible')
  if (end.lbItems < 1) fail('leaderboard empty')
  await page.screenshot({ timeout: 120000, path: `${SHOTS}/06-end.png` })

  if (errors.length) { console.log('PAGE ERRORS:'); errors.forEach((e) => console.log(' -', e.slice(0, 300))); failures += errors.length }
} catch (e) {
  console.log('TEST CRASH:', e.message)
  failures++
} finally {
  if (browser) await browser.close()
  server.kill()
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
