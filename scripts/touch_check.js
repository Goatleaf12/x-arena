// Touch-controls check: virtual joystick + fire button on mobile, hidden on desktop.
// Serves dist/ (must be built first). Run: node scripts/touch_check.js
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const PORT = 8125
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
const ok = (msg) => console.log('ok:', msg)

let browser
try {
  browser = await chromium.launch({
    args: [
      '--no-sandbox', '--disable-dev-shm-usage',
      '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-proxy-server'
    ]
  })

  // --- 1. desktop: no touch class, controls hidden ---
  const desk = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await desk.goto(`${ORIGIN}/?demo=select`, { waitUntil: 'networkidle', timeout: 30000 })
  await sleep(2500)
  const d = await desk.evaluate(() => ({
    touchClass: document.documentElement.classList.contains('touch'),
    controlsVisible: getComputedStyle(document.getElementById('touch-controls')).display !== 'none'
  }))
  console.log('desktop:', JSON.stringify(d))
  if (d.touchClass) fail('desktop got html.touch class')
  if (d.controlsVisible) fail('touch controls visible on desktop')
  else ok('touch controls hidden on desktop')
  await desk.close()

  // --- 2. mobile: touch class + controls visible on select screen ---
  const mob = await browser.newPage({ viewport: { width: 720, height: 1280 }, isMobile: true, hasTouch: true })
  const errors = []
  let gangReqFails = 0
  let failedResourceLogs = 0
  // "Failed to load resource" console lines carry no URL; reconcile by
  // count against gang.fun request failures (1:1). Any surplus is real.
  mob.on('console', (m) => {
    if (m.type() !== 'error') return
    if (m.text().startsWith('Failed to load resource')) { failedResourceLogs++; return }
    errors.push('console: ' + m.text())
  })
  mob.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  // gang.fun live feed fails in this VM's Chromium (egress proxy); the
  // page degrades gracefully, real browsers reach it (CORS *).
  mob.on('requestfailed', (r) => {
    if (r.url().startsWith('https://gang.fun/api/market')) { gangReqFails++; return }
    errors.push('reqfail: ' + r.url())
  })
  await mob.goto(`${ORIGIN}/?demo=select`, { waitUntil: 'networkidle', timeout: 30000 })
  await sleep(3000)
  const m = await mob.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('touch-controls'))
    return {
      touchClass: document.documentElement.classList.contains('touch'),
      controlsDisplay: cs.display,
      hint: document.getElementById('hint-bar').textContent
    }
  })
  console.log('mobile select:', JSON.stringify(m))
  if (!m.touchClass) fail('mobile missing html.touch class')
  if (m.controlsDisplay === 'none') fail('touch controls hidden on mobile')
  else ok('touch controls visible on mobile')
  // NOTE: size is 0 here because the HUD is hidden on the select screen —
  // real layout is asserted once the match starts (step 3).
  await mob.screenshot({ path: `${SHOTS}/08-mobile-select.png` })

  // --- 3. start a match, drag the joystick up, player must move ---
  await mob.goto(`${ORIGIN}/?demo=1&char=momo`, { waitUntil: 'networkidle', timeout: 30000 })
  // generous timeout: game-time runs at ~0.03 s per real second under this
  // VM's SwiftShader, so the 2.1 s countdown alone needs ~70 s real.
  await mob.waitForFunction(() => window.__game.state === 'playing', undefined, { timeout: 240000 })
  await sleep(800)
  const layout = await mob.evaluate(() => {
    const joy = document.getElementById('joy-base').getBoundingClientRect()
    const fire = document.getElementById('fire-btn').getBoundingClientRect()
    return { joyW: joy.width, fireW: fire.width }
  })
  console.log('mobile playing layout:', JSON.stringify(layout))
  if (layout.joyW <= 0 || layout.fireW <= 0) fail('joystick or fire button has no size during play')
  else ok('joystick + fire button laid out during play')
  const joyBox = await mob.evaluate(() => {
    const r = document.getElementById('joy-base').getBoundingClientRect()
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
  })
  const before = await mob.evaluate(() => ({ pos: [window.__game.player.pos.x, window.__game.player.pos.z] }))
  await mob.mouse.move(joyBox.cx, joyBox.cy)
  await mob.mouse.down()
  for (let i = 1; i <= 8; i++) {
    await mob.mouse.move(joyBox.cx, joyBox.cy - i * 5, { steps: 1 })
    await sleep(60)
  }
  await sleep(1500)
  const during = await mob.evaluate(() => ({
    pos: [window.__game.player.pos.x, window.__game.player.pos.z],
    touchMove: { ...window.__game.touchMove }
  }))
  await mob.mouse.up()
  await sleep(300)
  const after = await mob.evaluate(() => ({ touchMove: { ...window.__game.touchMove } }))
  console.log('joystick:', JSON.stringify({ before, during, after }))
  const movedDist = Math.hypot(during.pos[0] - before.pos[0], during.pos[1] - before.pos[1])
  if (movedDist < 0.5) fail('player did not move with joystick (dist ' + movedDist.toFixed(2) + ')')
  else ok('joystick moves the player (dist ' + movedDist.toFixed(2) + ')')
  if (Math.abs(during.touchMove.y) < 0.3) fail('touchMove.y too small while dragging: ' + JSON.stringify(during.touchMove))
  if (after.touchMove.x !== 0 || after.touchMove.y !== 0) fail('joystick did not reset on release')
  else ok('joystick resets on release')

  // --- 4. tap the fire button, a shot must register ---
  const shotsBefore = await mob.evaluate(() => window.__game.stats.shots)
  await mob.touchscreen.tap(660, 1090) // fire button area (right-bottom); fallback below if missed
  await sleep(400)
  let shotsAfter = await mob.evaluate(() => window.__game.stats.shots)
  if (shotsAfter <= shotsBefore) {
    // tap coordinates may miss on some viewports — tap the element centre instead
    const fb = await mob.evaluate(() => {
      const r = document.getElementById('fire-btn').getBoundingClientRect()
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
    })
    await mob.touchscreen.tap(fb.cx, fb.cy)
    await sleep(400)
    shotsAfter = await mob.evaluate(() => window.__game.stats.shots)
  }
  console.log('fire:', JSON.stringify({ shotsBefore, shotsAfter }))
  if (shotsAfter <= shotsBefore) fail('fire button did not register a shot')
  else ok('fire button shoots')

  // --- 5. drag-to-look via CDP touch events, camera must turn ---
  const yawBefore = await mob.evaluate(() => window.__game.camYaw)
  const cdp = await mob.context().newCDPSession(mob)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 500, y: 400, id: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 400, y: 400, id: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(300)
  const yawAfter = await mob.evaluate(() => window.__game.camYaw)
  console.log('look-drag:', JSON.stringify({ yawBefore, yawAfter }))
  if (Math.abs(yawAfter - yawBefore) < 0.05) fail('drag-to-look did not turn the camera')
  else ok('drag-to-look turns the camera')
  await mob.screenshot({ path: `${SHOTS}/09-mobile-playing.png`, timeout: 60000 })

  if (failedResourceLogs > gangReqFails) errors.push(`console: ${failedResourceLogs - gangReqFails} unexplained "Failed to load resource" error(s)`)
  if (errors.length) { console.log('PAGE ERRORS:'); errors.forEach((e) => console.log(' -', e.slice(0, 300))); failures += errors.length }
} catch (e) {
  console.log('TEST CRASH:', e.message)
  failures++
} finally {
  if (browser) await browser.close()
  server.kill()
}

console.log(failures === 0 ? '\nTOUCH CHECK PASSED' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
