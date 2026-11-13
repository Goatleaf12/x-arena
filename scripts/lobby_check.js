// Lobby integration check: game client joins the LIVE lobby worker,
// a second occupant (via curl) appears in the arena with a name tag,
// chat flows both ways, and our position is shared to the server.
// Serves dist/ (must be built first). Run: node scripts/lobby_check.js
import { chromium } from 'playwright'
import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'

const PORT = 8124
const ORIGIN = `http://localhost:${PORT}`
const LOBBY_PORT = 8787
const BASE = `http://localhost:${LOBBY_PORT}`
const SHOTS = new URL('../shots', import.meta.url).pathname
fs.mkdirSync(SHOTS, { recursive: true })

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', 'dist'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'ignore'
})
// Local lobby server (same worker code as the live deploy — wrangler
// dev --local runs the Durable Object in-process on localhost).
// Spawned detached so the whole process group can be killed on exit
// (killing npx alone orphans the wrangler child).
const lobbyServer = spawn('npx', ['--yes', 'wrangler@4.162.0', 'dev', '--local', '--port', String(LOBBY_PORT)], {
  cwd: new URL('../worker', import.meta.url).pathname,
  stdio: 'ignore',
  detached: true,
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 20; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/`)
    if (res.ok) break
  } catch { /* not up yet */ }
  await sleep(500)
}
// wait for the local lobby worker to answer (wrangler cold start is
// slow: npx resolve + miniflare init can take ~30 s)
for (let i = 0; i < 120; i++) {
  try {
    const res = await fetch(`${BASE}/`)
    if (res.ok) break
  } catch { /* not up yet */ }
  await sleep(500)
}

let failures = 0
const fail = (msg) => { failures++; console.log('FAIL:', msg) }
const ok = (msg) => console.log('ok:', msg)
const curl = (args) => execSync(`curl -s -m 20 ${args}`, { encoding: 'utf8' })

let browser
try {
  browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,720',
      '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required', '--no-proxy-server']
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))
  // point the game at the LOCAL lobby worker (?lobby= override)
  await page.goto(ORIGIN + '/?lobby=' + encodeURIComponent(BASE), { waitUntil: 'load' })
  await sleep(1500)

  // name the player, then PLAY (real button click — this is what joins)
  await page.fill('#player-name', 'LuxTest')
  await page.click('#start-btn')
  // headless SwiftShader renders slowly and dt is clamped to 0.05, so
  // game time runs slower than real time: wait for 'playing' properly
  // instead of a fixed sleep (the 2.1 s countdown can take ~10 s real).
  let playing = false
  for (let i = 0; i < 120; i++) {
    await sleep(500)
    playing = await page.evaluate(() => window.__game?.state === 'playing')
    if (playing) break
  }
  if (!playing) fail('game never reached playing state')
  else ok('game reached playing state')
  await sleep(1500) // let a few move ticks + one poll cycle run
  const boot = await page.evaluate(() => ({
    errlog: document.getElementById('errlog')?.textContent || '',
    count: document.getElementById('lobby-count')?.textContent || '',
    chatVisible: !document.getElementById('lobby-chat')?.classList.contains('hidden'),
    state: window.__game?.state,
  }))
  console.log('boot:', JSON.stringify(boot))
  if (boot.errlog) fail('errlog not empty: ' + boot.errlog.slice(0, 200))
  if (!boot.chatVisible) fail('chat panel not visible after join')
  else ok('chat panel mounted after join')
  if (!boot.count.includes('just you')) fail('lobby count unexpected: ' + boot.count)
  else ok('joined lobby (count: just you)')

  // second occupant joins via API and moves + chats
  const join2 = JSON.parse(curl(`-X POST ${BASE}/lobby/join -H 'content-type: application/json' -d '{"name":"Tester","kind":"agent","character":"kiko"}'`))
  const sid2 = join2.sessionId
  if (!sid2) fail('second join failed: ' + JSON.stringify(join2).slice(0, 200))
  else ok('second occupant joined via API')
  curl(`-X POST ${BASE}/lobby/move -H 'content-type: application/json' -d '{"sessionId":"${sid2}","x":5,"z":-7}'`)
  curl(`-X POST ${BASE}/lobby/chat -H 'content-type: application/json' -d '{"sessionId":"${sid2}","text":"halo dari Tester"}'`)
  await sleep(3000) // WS push (or 2s poll) -> game renders occupant + chat

  const after = await page.evaluate(() => {
    const g = window.__game
    const occ = [...(g?.lobbyOccupants?.values() ?? [])]
    return {
      occupants: g?.lobbyOccupants?.size ?? -1,
      occPos: occ.map((o) => [o.group.position.x, o.group.position.z]),
      hasTag: occ.every((o) => !!o.tag),
      count: document.getElementById('lobby-count')?.textContent || '',
      feed: document.querySelector('.lobby-chat-feed')?.textContent || '',
      errlog: document.getElementById('errlog')?.textContent || '',
      gameState: g?.state,
      playerPos: g?.player ? [g.player.pos.x, g.player.pos.z] : null,
      playerAlive: g?.player?.alive,
      lobbyWs: window.__lobby?.ws?.readyState ?? null,
      lobbySession: !!window.__lobby?.sessionId,
    }
  })
  console.log('after:', JSON.stringify(after))
  if (after.occupants !== 1) fail(`expected 1 other occupant, got ${after.occupants}`)
  else ok('other occupant rendered in arena')
  if (after.occPos[0] && (Math.abs(after.occPos[0][0] - 5) > 0.5 || Math.abs(after.occPos[0][1] + 7) > 0.5))
    fail('occupant position wrong: ' + JSON.stringify(after.occPos))
  else ok('occupant at lobby position (5, -7)')
  if (!after.hasTag) fail('name tag missing on occupant')
  else ok('name tag present')
  if (!after.count.includes('2 in lobby')) fail('lobby count not 2: ' + after.count)
  else ok('lobby count shows 2')
  if (!after.feed.includes('halo dari Tester')) fail('incoming chat not in feed')
  else ok('incoming chat visible in feed')
  if (after.errlog) fail('errlog not empty: ' + after.errlog.slice(0, 200))

  // our chat -> server, and our position -> server
  // (panel starts minimized on touch devices: expand first if needed)
  if (!(await page.locator('.lobby-chat-input').isVisible())) {
    await page.click('.lobby-chat-toggle')
    await sleep(300)
  }
  await page.fill('.lobby-chat-input', 'halo Tester, Lux di sini')
  await page.press('.lobby-chat-input', 'Enter')
  await sleep(1500)
  const state = JSON.parse(curl(`${BASE}/lobby/state`))
  const ours = state.chat.find((m) => m.name === 'LuxTest')
  if (!ours || !ours.text.includes('halo Tester')) fail('our chat did not reach server')
  else ok('outgoing chat reached server')
  const me = state.occupants.find((o) => o.name === 'LuxTest')
  console.log('server sees us at:', me ? [me.x, me.z] : null)
  if (!me) fail('server does not see our occupant')
  else if (Math.abs(me.x - 0) > 0.5 || Math.abs(me.z - 25.5) > 0.5) fail(`our server position wrong (expected spawn ~0,25.5, got ${me.x},${me.z})`)
  else ok('our spawn position shared to server (0, 25.5)')

  // move with keyboard, verify the server sees the new position
  // (hold longer than the old 1.2 s: velocity now ramps up smoothly, and
  // headless SwiftShader game-time runs far slower than real time)
  const before = me ? [me.x, me.z] : [0, 0]
  await page.keyboard.down('KeyW')
  await sleep(2500)
  await page.keyboard.up('KeyW')
  await sleep(1500)
  const state2 = JSON.parse(curl(`${BASE}/lobby/state`))
  const me2 = state2.occupants.find((o) => o.name === 'LuxTest')
  console.log('server sees us after W:', me2 ? [me2.x, me2.z] : null)
  if (me2 && Math.hypot(me2.x - before[0], me2.z - before[1]) > 0.3) ok('movement shared to server')
  else fail('movement NOT shared (server pos unchanged)')

  // (no screenshot: page.screenshot hangs on fonts in this headless
  // SwiftShader setup — the DOM/state assertions above cover the room)
  curl(`-X POST ${BASE}/lobby/leave -H 'content-type: application/json' -d '{"sessionId":"${sid2}"}'`)
  await sleep(2500)
  const gone = await page.evaluate(() => window.__game?.lobbyOccupants?.size ?? -1)
  if (gone !== 0) fail(`occupant not removed after leave (size ${gone})`)
  else ok('occupant removed after leave')
} catch (e) {
  fail('exception: ' + (e?.message || e))
} finally {
  try { await browser?.close() } catch { /* ignore */ }
  server.kill()
  try { process.kill(-lobbyServer.pid, 'SIGTERM') } catch { lobbyServer.kill() }
}

console.log(failures === 0 ? '\nLOBBY CHECK PASSED' : `\nLOBBY CHECK FAILED (${failures})`)
process.exit(failures === 0 ? 0 : 1)
