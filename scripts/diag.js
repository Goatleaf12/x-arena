// One-off diagnostic: is the WebGL canvas actually drawing pixels?
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const PORT = 8124
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', 'dist'], {
  cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore'
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 20; i++) {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/`); if (r.ok) break } catch {}
  await sleep(500)
}

const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-proxy-server']
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto(`http://localhost:${PORT}/?demo=1&char=momo`, { waitUntil: 'networkidle', timeout: 30000 })
await sleep(5000)
const diag = await page.evaluate(() => {
  const g = window.__game
  const c = g.renderer.domElement
  // read back pixels via toDataURL into a 2d canvas and sample
  const img = new Image()
  const url = c.toDataURL('image/png')
  return new Promise((resolve) => {
    img.onload = () => {
      const cv = document.createElement('canvas')
      cv.width = 160; cv.height = 90
      const ctx = cv.getContext('2d')
      ctx.drawImage(img, 0, 0, 160, 90)
      const d = ctx.getImageData(0, 0, 160, 90).data
      let sum = 0, nonBlack = 0
      for (let i = 0; i < d.length; i += 4) {
        const v = d[i] + d[i + 1] + d[i + 2]
        sum += v
        if (v > 30) nonBlack++
      }
      resolve({
        state: g.state,
        calls: g.renderer.info.render.calls,
        triangles: g.renderer.info.render.triangles,
        canvasSize: [c.width, c.height],
        dataUrlLen: url.length,
        avgBrightness: (sum / (d.length / 4) / 3).toFixed(1),
        nonBlackPct: (100 * nonBlack / (d.length / 4)).toFixed(1),
        camPos: g.camera.position.toArray().map((n) => n.toFixed(1)),
        playerPos: [g.player.pos.x.toFixed(1), g.player.pos.z.toFixed(1)]
      })
    }
    img.onerror = () => resolve({ error: 'toDataURL image failed', dataUrlLen: url.length })
    img.src = url
  })
})
console.log(JSON.stringify(diag, null, 2))
await browser.close()
server.kill()
