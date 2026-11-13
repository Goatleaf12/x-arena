// Render each X Arena fighter to a self-hosted PNG for the character cards.
// Serves the project with Vite dev (resolves 'three' + src imports), loads the
// dev-only snapshot.html in Playwright (SwiftShader WebGL), and writes
// public/assets/char-<id>.png. Run: node scripts/snapshot_chars.js
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const PORT = 5199
const ROOT = new URL('..', import.meta.url).pathname
const OUT = new URL('../public/assets', import.meta.url).pathname
fs.mkdirSync(OUT, { recursive: true })

const vite = spawn('./node_modules/.bin/vite', ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: ROOT,
  stdio: 'ignore'
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 30; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/snapshot.html`)
    if (res.ok) break
  } catch { /* not up yet */ }
  await sleep(500)
}

let failures = 0
let browser
try {
  browser = await chromium.launch({
    args: [
      '--no-sandbox', '--disable-dev-shm-usage', '--window-size=640,640',
      '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-proxy-server'
    ]
  })
  const page = await browser.newPage({ viewport: { width: 640, height: 640 } })
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  await page.goto(`http://127.0.0.1:${PORT}/snapshot.html`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForFunction(() => window.__snapshotsReady === true, undefined, { timeout: 30000 })
  const shots = await page.evaluate(() => window.__snapshots)
  for (const [id, dataUrl] of Object.entries(shots)) {
    const b64 = dataUrl.split(',')[1]
    const buf = Buffer.from(b64, 'base64')
    // sanity: real PNG magic + non-trivial size
    if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || buf.length < 5000) {
      console.log('FAIL: bad PNG for', id, 'bytes:', buf.length)
      failures++
      continue
    }
    fs.writeFileSync(`${OUT}/char-${id}.png`, buf)
    console.log('ok:', `char-${id}.png`, (buf.length / 1024).toFixed(1) + ' KB')
  }
  if (errors.length) { console.log('PAGE ERRORS:'); errors.forEach((e) => console.log(' -', e.slice(0, 200))); failures += errors.length }
} catch (e) {
  console.log('SNAPSHOT CRASH:', e.message)
  failures++
} finally {
  if (browser) await browser.close()
  vite.kill()
}

console.log(failures === 0 ? '\nSNAPSHOTS OK' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
