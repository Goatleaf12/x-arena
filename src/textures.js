import * as THREE from 'three'

function canvasTexture(size, draw, repeat = 1) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  draw(ctx, size)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat, repeat)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function seededRandom(seed) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/** Bright cheerful grass with mow stripes, speckles and a painted centre emblem. */
export function makeGrassTexture() {
  return canvasTexture(1024, (ctx, s) => {
    ctx.fillStyle = '#69c24f'
    ctx.fillRect(0, 0, s, s)
    // mow stripes
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,60,0,0.05)'
      ctx.fillRect(0, (i * s) / 16, s, s / 16)
    }
    // speckles
    const rnd = seededRandom(42)
    for (let i = 0; i < 9000; i++) {
      const g = 150 + Math.floor(rnd() * 70)
      ctx.fillStyle = `rgba(${40 + rnd() * 40},${g},${40 + rnd() * 30},0.35)`
      ctx.fillRect(rnd() * s, rnd() * s, 2.5, 2.5)
    }
    // centre emblem: double gold ring (clean — no dark X, it read as a shadow artefact)
    const cx = s / 2, cy = s / 2
    ctx.strokeStyle = '#f5b301'
    ctx.lineWidth = 16
    ctx.beginPath(); ctx.arc(cx, cy, 150, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = 'rgba(245,179,1,0.55)'
    ctx.lineWidth = 8
    ctx.beginPath(); ctx.arc(cx, cy, 178, 0, Math.PI * 2); ctx.stroke()
    // faint paint splashes near the emblem
    const cols = ['#ff7ab8', '#3b82f6', '#f5b301', '#8b5cf6', '#ff5d6c']
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, r = 210 + rnd() * 120
      ctx.fillStyle = cols[i % cols.length]
      ctx.globalAlpha = 0.5
      ctx.beginPath()
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 6 + rnd() * 14, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }, 1)
}

/** Warm sand path ring texture. */
export function makeSandTexture() {
  return canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = '#f2d492'
    ctx.fillRect(0, 0, s, s)
    const rnd = seededRandom(7)
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = `rgba(${170 + rnd() * 60},${130 + rnd() * 50},${70 + rnd() * 40},0.4)`
      ctx.fillRect(rnd() * s, rnd() * s, 3, 3)
    }
  }, 6)
}

/** Wooden crate: planks + frame + stencilled X. */
export function makeCrateTexture() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#c98f4e'
    ctx.fillRect(0, 0, s, s)
    ctx.fillStyle = '#b57a38'
    for (let y = 0; y < s; y += 42) ctx.fillRect(0, y, s, 5)
    ctx.fillStyle = 'rgba(0,0,0,0.08)'
    for (let x = 0; x < s; x += 42) ctx.fillRect(x, 0, 5, s)
    ctx.strokeStyle = '#7c4f1d'
    ctx.lineWidth = 14
    ctx.strokeRect(7, 7, s - 14, s - 14)
    ctx.strokeStyle = '#0b0e1a'
    ctx.lineWidth = 16
    ctx.lineCap = 'round'
    const c = s / 2, k = 34
    ctx.beginPath(); ctx.moveTo(c - k, c - k); ctx.lineTo(c + k, c + k); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(c + k, c - k); ctx.lineTo(c - k, c + k); ctx.stroke()
  })
}

/** Barrel: vertical staves + metal bands. */
export function makeBarrelTexture() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#a86a2e'
    ctx.fillRect(0, 0, s, s)
    for (let x = 0; x < s; x += 32) {
      ctx.fillStyle = x % 64 ? '#9a5f27' : '#b57a38'
      ctx.fillRect(x, 0, 32, s)
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.fillRect(x, 0, 2, s)
    }
    ctx.fillStyle = '#3a3f52'
    ctx.fillRect(0, 26, s, 16)
    ctx.fillRect(0, s - 42, s, 16)
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.fillRect(0, 26, s, 4)
    ctx.fillRect(0, s - 42, s, 4)
  })
}

/** Arena wall banner: navy gradient, splat mark + ARENA, gold underline. */
export function makeBannerTexture() {
  const c = document.createElement('canvas')
  c.width = 1024; c.height = 384
  const ctx = c.getContext('2d')
  const grad = ctx.createLinearGradient(0, 0, 1024, 384)
  grad.addColorStop(0, '#0b0e1a')
  grad.addColorStop(0.55, '#1b2450')
  grad.addColorStop(1, '#0b0e1a')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 1024, 384)
  // diagonal accent lines
  ctx.strokeStyle = 'rgba(59,130,246,0.35)'
  ctx.lineWidth = 10
  for (let i = -2; i < 8; i++) {
    ctx.beginPath(); ctx.moveTo(i * 180, 384); ctx.lineTo(i * 180 + 220, 0); ctx.stroke()
  }
  ctx.fillStyle = '#f5b301'
  ctx.font = '900 150px system-ui, Arial, sans-serif'
  ctx.textAlign = 'center'
  // pink paint-splat blob where the X used to be
  ctx.fillStyle = '#ff5d8f'
  ctx.beginPath(); ctx.arc(150, 200, 62, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(108, 158, 26, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(196, 160, 20, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(196, 244, 24, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(112, 246, 16, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = '900 118px system-ui, Arial, sans-serif'
  ctx.fillText('ARENA', 590, 232)
  ctx.fillStyle = '#9db4ff'
  ctx.font = '700 44px system-ui, Arial, sans-serif'
  ctx.fillText('P L A Y  •  S P L A T  •  W I N', 512, 320)
  ctx.fillStyle = '#f5b301'
  ctx.fillRect(212, 268, 600, 8)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** Gold SPLAT coin face. */
export function makeCoinTexture() {
  return canvasTexture(256, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 10, s / 2, s / 2, s / 2)
    g.addColorStop(0, '#ffe98a')
    g.addColorStop(0.6, '#f5b301')
    g.addColorStop(1, '#c78d00')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
    ctx.strokeStyle = '#8a6400'
    ctx.lineWidth = 10
    ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 14, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = '#0b0e1a'
    ctx.font = '900 44px system-ui, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('SPLAT', s / 2, s / 2 + 4)
  })
}

/** Soft round shadow blob (used under characters when needed). */
export function makeBlobShadowTexture() {
  return canvasTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2)
    g.addColorStop(0, 'rgba(0,0,0,0.35)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  })
}
