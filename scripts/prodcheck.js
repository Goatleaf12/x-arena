// One-off check: does the PUBLIC Pages deployment boot the game?
import { chromium } from 'playwright'

// Public URL: egress goes through the VM proxy. Chrome rejects credentials
// embedded in --proxy-server, so pass them as separate fields.
const _pu = new URL(process.env.https_proxy || process.env.HTTPS_PROXY || 'http://localhost:3128')
const browser = await chromium.launch({
  proxy: {
    server: `${_pu.protocol}//${_pu.hostname}:${_pu.port}`,
    username: decodeURIComponent(_pu.username),
    password: decodeURIComponent(_pu.password)
  },
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-certificate-errors']
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()) })
page.on('requestfailed', (r) => errs.push('reqfail: ' + r.url()))
await page.goto('https://splat-arena.pages.dev/?demo=select', { waitUntil: 'networkidle', timeout: 60000 })
await new Promise((r) => setTimeout(r, 4000))
const boot = await page.evaluate(() => ({
  game: !!window.__game,
  state: window.__game?.state,
  errlog: document.getElementById('errlog')?.textContent || '',
  webgl: !!document.createElement('canvas').getContext('webgl2')
}))
console.log('PROD BOOT:', JSON.stringify(boot))
console.log('ERRORS:', errs.length ? errs.join(' | ').slice(0, 500) : 'none')
await page.screenshot({ path: 'shots/07-prod-select.png', timeout: 120000 })
await browser.close()
