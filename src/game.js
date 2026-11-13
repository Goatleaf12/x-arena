import * as THREE from 'three'
import { buildArena, ARENA_RADIUS } from './arena.js'
import { createCharacter, animateCharacter, fireFlash, hitSquash, CHARACTERS } from './characters.js'
import { makeCoinTexture } from './textures.js'
import { Sfx } from './audio.js'

const MATCH_SECONDS = 120
const PLAYER_SPEED = 5.6
const BOT_SPEED = 3.4
const PLAYER_DAMAGE = 34
const BOT_DAMAGE = 7

function lerpAngle(a, b, t) {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas
    this.ui = ui
    this.sfx = new Sfx()
    this.state = 'select' // select | countdown | playing | paused | ended
    this.clock = new THREE.Clock()
    this.elapsed = 0
    this.timeLeft = MATCH_SECONDS
    this.stats = { score: 0, kills: 0, deaths: 0, splat: 0, shots: 0, hits: 0 }
    this.keys = {}
    this.touchMove = { x: 0, y: 0 } // virtual joystick vector, -1..1 (y: down positive)
    this._touchFiring = false
    this._lookTouch = null
    this.camYaw = 0
    this.camPitch = 0.32
    this.fireCd = 0
    this.lastHud = {}
    this._countdownT = 0
    this._countdownStep = -1
    this._respawnMsgT = 0

    // ---- renderer ----
    // preserveDrawingBuffer: true keeps the canvas visible to screenshots / screen capture
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.06
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    // ---- scene ----
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(0xbfe3ff, 55, 130)
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 300)

    // sky dome: vertical gradient
    const skyGeo = new THREE.SphereGeometry(180, 24, 16)
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x3f8cff) },
        mid: { value: new THREE.Color(0x8ecfff) },
        bot: { value: new THREE.Color(0xd8f3ff) }
      },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
        void main(){ float h = normalize(vP).y; vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.65, h)) : mix(bot, mid, smoothstep(-0.08, 0.12, h)); gl_FragColor = vec4(c, 1.0); }`
    })
    this.scene.add(new THREE.Mesh(skyGeo, skyMat))

    // ---- lights ----
    const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x7fae5a, 1.15)
    this.scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xfff2d9, 2.4)
    sun.position.set(38, 55, 22)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -32
    sun.shadow.camera.right = 32
    sun.shadow.camera.top = 32
    sun.shadow.camera.bottom = -32
    sun.shadow.camera.near = 10
    sun.shadow.camera.far = 160
    sun.shadow.bias = -0.0004
    this.scene.add(sun)
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.25))
    // reusable muzzle flash light
    this.flashLight = new THREE.PointLight(0xffd23f, 0, 9, 2)
    this.scene.add(this.flashLight)

    // ---- arena ----
    this.arena = buildArena(this.scene)

    // ---- characters ----
    this.player = null
    this.bots = []
    this.previewChar = null
    this.pedestal = null

    // ---- lobby occupants (other players/agents in the shared room) ----
    this.lobbyOccupants = new Map() // id -> { group, tag, parts }

    // ---- projectiles / particles / splats ----
    this.projectiles = []
    this.projPool = []
    this.particles = []
    this.particlePool = []
    this.splats = []
    this.coins = []

    this._buildPools()
    this._buildCoins()
    this._bindInput()
    this._bindResize()
    this.renderer.setAnimationLoop(() => {
      this._tick()
      this.renderer.render(this.scene, this.camera)
    })
  }

  // ================= pools =================
  _buildPools() {
    const projGeo = new THREE.SphereGeometry(0.17, 12, 10)
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(projGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }))
      m.visible = false
      this.scene.add(m)
      this.projPool.push(m)
    }
    const partGeo = new THREE.IcosahedronGeometry(0.09, 0)
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }))
      m.visible = false
      this.scene.add(m)
      this.particlePool.push(m)
    }
  }

  _buildCoins() {
    const tex = makeCoinTexture()
    const side = new THREE.MeshStandardMaterial({ color: 0xd99a00, roughness: 0.35, metalness: 0.7 })
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.55 })
    const geo = new THREE.CylinderGeometry(0.45, 0.45, 0.09, 24)
    for (let i = 0; i < this.arena.coinSpots.length; i++) {
      const spot = this.arena.coinSpots[i]
      const coin = new THREE.Mesh(geo, [side, face, face])
      coin.rotation.x = Math.PI / 2.4
      coin.position.set(spot.x, 0.95, spot.z)
      coin.castShadow = true
      this.scene.add(coin)
      this.coins.push({ mesh: coin, spot, active: true, timer: 0, phase: i * 1.3 })
    }
  }

  // ================= input =================
  _bindInput() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
      if (e.code === 'KeyM') this.toggleMute()
    })
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false })
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.state === 'playing') {
        if (document.pointerLockElement !== this.canvas) {
          this._lockPointer()
        } else if (e.button === 0) {
          this._tryFire()
        }
        this._dragging = true
      } else if (this.state === 'paused') {
        this.resume()
      }
    })
    window.addEventListener('mouseup', () => { this._dragging = false })
    window.addEventListener('mousemove', (e) => {
      if (this.state !== 'playing') return
      if (document.pointerLockElement === this.canvas) {
        this.camYaw -= e.movementX * 0.0026
        this.camPitch = THREE.MathUtils.clamp(this.camPitch - e.movementY * 0.0022, -0.3, 0.55)
      } else if (this._dragging) {
        this.camYaw -= e.movementX * 0.004
        this.camPitch = THREE.MathUtils.clamp(this.camPitch - e.movementY * 0.003, -0.3, 0.55)
      }
    })
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== this.canvas && this.state === 'playing') {
        this.pause()
      }
    })
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause()
    })
    this._bindTouch()
  }

  // ================= touch controls (virtual joystick + fire button) =================
  // Shown only on touch devices (html.touch); desktop keeps keyboard + mouse.
  _bindTouch() {
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0
    if (!isTouch) return
    document.documentElement.classList.add('touch')
    const joy = document.getElementById('joy-base')
    const knob = document.getElementById('joy-knob')
    const fireBtn = document.getElementById('fire-btn')
    const hint = document.getElementById('hint-bar')
    if (hint) hint.textContent = 'Left stick move • Drag screen to look • 🔥 to splat'
    if (!joy || !knob || !fireBtn) return
    const R = 52 // joystick travel radius, px
    let joyId = null
    const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px, ${dy}px)` }
    joy.addEventListener('pointerdown', (e) => {
      if (this.state !== 'playing') return
      joyId = e.pointerId
      try { joy.setPointerCapture(e.pointerId) } catch { /* ignore */ }
      e.preventDefault()
    })
    joy.addEventListener('pointermove', (e) => {
      if (e.pointerId !== joyId) return
      const r = joy.getBoundingClientRect()
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2
      let dx = e.clientX - cx, dy = e.clientY - cy
      const len = Math.hypot(dx, dy)
      if (len > R) { dx = dx / len * R; dy = dy / len * R }
      setKnob(dx, dy)
      this.touchMove.x = dx / R
      this.touchMove.y = dy / R
    })
    const joyEnd = (e) => {
      if (e.pointerId !== joyId) return
      joyId = null
      setKnob(0, 0)
      this.touchMove.x = 0
      this.touchMove.y = 0
    }
    joy.addEventListener('pointerup', joyEnd)
    joy.addEventListener('pointercancel', joyEnd)
    fireBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      if (this.state !== 'playing') return
      this._touchFiring = true
      this._tryFire()
    })
    const fireEnd = () => { this._touchFiring = false }
    fireBtn.addEventListener('pointerup', fireEnd)
    fireBtn.addEventListener('pointercancel', fireEnd)
    fireBtn.addEventListener('pointerleave', fireEnd)
    // drag-to-look: one finger dragging on the arena turns the camera
    this.canvas.addEventListener('touchstart', (e) => {
      if (this.state !== 'playing') return
      const t = e.changedTouches[0]
      this._lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY }
    }, { passive: true })
    this.canvas.addEventListener('touchmove', (e) => {
      if (!this._lookTouch) return
      for (const t of e.changedTouches) {
        if (t.identifier !== this._lookTouch.id) continue
        this.camYaw -= (t.clientX - this._lookTouch.x) * 0.005
        this.camPitch = THREE.MathUtils.clamp(this.camPitch - (t.clientY - this._lookTouch.y) * 0.004, -0.3, 0.55)
        this._lookTouch.x = t.clientX
        this._lookTouch.y = t.clientY
      }
      e.preventDefault()
    }, { passive: false })
    const lookEnd = (e) => {
      if (!this._lookTouch) return
      for (const t of e.changedTouches) {
        if (t.identifier === this._lookTouch.id) this._lookTouch = null
      }
    }
    this.canvas.addEventListener('touchend', lookEnd)
    this.canvas.addEventListener('touchcancel', lookEnd)
  }

  _bindResize() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(window.innerWidth, window.innerHeight)
    })
  }

  // Pointer lock can reject without a user gesture (e.g. demo auto-start) —
  // never let that throw an unhandled rejection.
  _lockPointer() {
    try {
      const p = this.canvas.requestPointerLock?.()
      if (p && typeof p.catch === 'function') p.catch(() => {})
    } catch { /* pointer lock unavailable */ }
  }

  toggleMute() {
    this.sfx.muted = !this.sfx.muted
    const btn = this.ui.muteBtn
    if (btn) btn.textContent = this.sfx.muted ? '🔇' : '🔊'
  }

  // ================= select preview =================
  showPreview(charId) {
    this._clearPreview()
    const def = CHARACTERS.find((c) => c.id === charId) || CHARACTERS[0]
    const { group } = createCharacter(def)
    // pedestal sits right-of-centre so the fighter peeks out beside the cards
    group.position.set(5.0, 0.28, 11)
    group.rotation.y = Math.PI * 0.85
    this.scene.add(group)
    this.previewChar = group
    // pedestal
    const ped = new THREE.Group()
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.45, 0.28, 28),
      new THREE.MeshStandardMaterial({ color: 0x0b0e1a, roughness: 0.5 })
    )
    base.position.y = 0.14
    base.castShadow = true
    base.receiveShadow = true
    ped.add(base)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.25, 0.05, 8, 40),
      new THREE.MeshStandardMaterial({ color: 0xf5b301, roughness: 0.4, metalness: 0.5 })
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.29
    ped.add(ring)
    ped.position.set(5.0, 0, 11)
    this.scene.add(ped)
    this.pedestal = ped
    this.state = 'select'
  }

  _clearPreview() {
    if (this.previewChar) { this.scene.remove(this.previewChar); this.previewChar = null }
    if (this.pedestal) { this.scene.remove(this.pedestal); this.pedestal = null }
  }

  // ================= lobby occupants =================
  // Render other lobby occupants as chibi characters with name tags.
  // Purely visual: they never fight, collide, or take damage.
  _makeNameTag(text) {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    ctx.font = '800 30px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 6
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'
    ctx.strokeText(text, 128, 32)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(text, 128, 32)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
    sprite.scale.set(2.4, 0.6, 1)
    sprite.position.y = 2.25
    return sprite
  }

  setLobbyOccupants(list) {
    const seen = new Set()
    for (const o of list ?? []) {
      seen.add(o.id)
      let rec = this.lobbyOccupants.get(o.id)
      if (!rec) {
        const def = CHARACTERS.find((c) => c.id === o.character) || CHARACTERS[0]
        const { group, parts } = createCharacter(def)
        const tag = this._makeNameTag(o.label || o.name || 'Guest')
        group.add(tag)
        group.position.set(o.x ?? 0, 0, o.z ?? 0)
        this.scene.add(group)
        rec = { group, tag, parts }
        this.lobbyOccupants.set(o.id, rec)
      }
      rec.group.position.set(o.x ?? 0, 0, o.z ?? 0)
    }
    for (const [id, rec] of [...this.lobbyOccupants]) {
      if (!seen.has(id)) {
        this.scene.remove(rec.group)
        rec.tag.material.map?.dispose()
        rec.tag.material.dispose()
        this.lobbyOccupants.delete(id)
      }
    }
  }

  clearLobbyOccupants() {
    this.setLobbyOccupants([])
  }

  _updateLobbyOccupants(dt) {
    for (const rec of this.lobbyOccupants.values()) {
      animateCharacter(rec.parts, dt, 0)
    }
  }

  // ================= match flow =================
  start(charId) {
    this._clearPreview()
    this.camera.clearViewOffset()
    this.sfx.ensure()
    const playerDef = CHARACTERS.find((c) => c.id === charId) || CHARACTERS[0]
    const botDefs = CHARACTERS.filter((c) => c.id !== playerDef.id)

    // player
    const pc = createCharacter(playerDef)
    pc.group.position.set(this.arena.spawnPoints[0].x, 0, this.arena.spawnPoints[0].z)
    this.scene.add(pc.group)
    this.player = {
      char: pc, pos: pc.group.position, yaw: Math.PI, hp: 100, alive: true,
      respawnT: 0, lastHurt: -10, speed: PLAYER_SPEED, moving: 0
    }
    this.camYaw = Math.PI // face arena centre (-Z from spawn is... spawn (0,17) centre is -Z)
    this.camYaw = 0 // forward -Z toward centre
    this.camPitch = 0.32

    // bots
    this.bots = []
    botDefs.forEach((def, i) => {
      const bc = createCharacter(def)
      const sp = this.arena.spawnPoints[i + 1]
      bc.group.position.set(sp.x, 0, sp.z)
      this.scene.add(bc.group)
      this.bots.push({
        char: bc, pos: bc.group.position, yaw: 0, hp: 100, alive: true, respawnT: 0,
        state: 'wander', target: this._randomPoint(), shootCd: 1 + Math.random(),
        stuckT: 0, lastX: sp.x, lastZ: sp.z, moving: 0, strafeDir: Math.random() < 0.5 ? 1 : -1
      })
    })

    this.stats = { score: 0, kills: 0, deaths: 0, splat: 0, shots: 0, hits: 0 }
    this.timeLeft = MATCH_SECONDS
    this._countdownT = 0
    this._countdownStep = -1
    this.state = 'countdown'
    this.ui.hud.classList.remove('hidden')
    this._updateHud(true)
    this._lockPointer()
  }

  pause() {
    if (this.state !== 'playing') return
    this.state = 'paused'
    this.ui.centerMsg.textContent = 'PAUSED — click to resume'
  }

  resume() {
    if (this.state !== 'paused') return
    this.state = 'playing'
    this.ui.centerMsg.textContent = ''
    this._lockPointer()
  }

  endMatch() {
    this.state = 'ended'
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()
    this.ui.hud.classList.add('hidden')
    this.sfx.win()
    if (this.ui.onEnd) this.ui.onEnd({ ...this.stats, accuracy: this.stats.shots ? Math.round((this.stats.hits / this.stats.shots) * 100) : 0 })
  }

  // ================= combat =================
  _tryFire() {
    if (this.state !== 'playing' || !this.player?.alive || this.fireCd > 0) return
    this.fireCd = 0.26
    this.stats.shots++
    const muzzle = new THREE.Vector3()
    this.player.char.parts.flash.getWorldPosition(muzzle)
    const dir = new THREE.Vector3()
    this.camera.getWorldDirection(dir)
    this._spawnProjectile(muzzle, dir, 30, PLAYER_DAMAGE, 'player', this.player.char.def.accent)
    fireFlash(this.player.char.parts)
    this.flashLight.position.copy(muzzle)
    this.flashLight.intensity = 26
    this.sfx.shoot()
  }

  _botFire(bot) {
    const muzzle = new THREE.Vector3()
    bot.char.parts.flash.getWorldPosition(muzzle)
    const target = this.player.pos.clone()
    target.y += 0.9
    const dir = target.sub(muzzle).normalize()
    // spread (bots miss often — they are cute, not snipers)
    dir.x += (Math.random() - 0.5) * 0.24
    dir.y += (Math.random() - 0.5) * 0.1
    dir.z += (Math.random() - 0.5) * 0.24
    dir.normalize()
    this._spawnProjectile(muzzle, dir, 20, BOT_DAMAGE, 'bot', bot.char.def.accent)
    fireFlash(bot.char.parts)
    this.sfx.enemyShoot()
  }

  _spawnProjectile(pos, dir, speed, damage, owner, color) {
    const m = this.projPool.find((p) => !p.visible)
    if (!m) return
    m.visible = true
    m.material.color.setHex(color)
    m.position.copy(pos)
    m.scale.setScalar(1)
    this.projectiles.push({ mesh: m, vel: dir.clone().multiplyScalar(speed), owner, damage, life: 1.6 })
  }

  _burst(pos, color, n = 12, speed = 4, up = 3) {
    for (let i = 0; i < n; i++) {
      const m = this.particlePool.find((p) => !p.visible)
      if (!m) return
      m.visible = true
      m.material.color.setHex(color)
      m.position.copy(pos)
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * speed
      m.userData.vel = new THREE.Vector3(Math.cos(a) * r, Math.random() * up + 1, Math.sin(a) * r)
      m.userData.life = 0.5 + Math.random() * 0.35
      m.userData.max = m.userData.life
      m.scale.setScalar(0.7 + Math.random() * 0.9)
    }
  }

  _placeSplat(pos, color) {
    let splat = this.splats.find((s) => !s.visible)
    if (!splat) {
      if (this.splats.length >= 40) splat = this.splats.shift()
      else {
        splat = new THREE.Mesh(
          new THREE.CircleGeometry(0.55, 12),
          new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, transparent: true, opacity: 0.8 })
        )
        splat.rotation.x = -Math.PI / 2
        this.scene.add(splat)
        this.splats.push(splat)
      }
    }
    splat.visible = true
    splat.material.color.setHex(color)
    splat.position.set(pos.x, 0.03 + Math.random() * 0.01, pos.z)
    splat.rotation.z = Math.random() * Math.PI
    const s = 0.7 + Math.random() * 0.8
    splat.scale.set(s, s, 1)
  }

  _damageBot(bot, dmg) {
    if (!bot.alive) return
    bot.hp -= dmg
    this.stats.hits++
    hitSquash(bot.char.parts)
    this._burst(bot.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xffffff, 6, 2.5, 2)
    this.ui.flashHitmarker()
    this.sfx.hit()
    if (bot.hp <= 0) this._killBot(bot)
  }

  _killBot(bot) {
    bot.alive = false
    bot.respawnT = 2.5
    bot.char.group.visible = false
    this.stats.kills++
    this.stats.score += 100
    this._burst(bot.pos.clone().add(new THREE.Vector3(0, 1, 0)), bot.char.def.color, 22, 5, 4)
    this._burst(bot.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xffffff, 10, 3, 3)
    this.ui.addKillfeed(`You splatted ${bot.char.def.name}!  +100`)
    this.sfx.splat()
    this._updateHud()
  }

  _damagePlayer(dmg) {
    if (!this.player.alive) return
    this.player.hp -= dmg
    this.player.lastHurt = this.elapsed
    this.ui.flashDamage()
    this.sfx.hurt()
    if (this.player.hp <= 0) {
      this.player.alive = false
      this.player.respawnT = 2.5
      this.player.char.group.visible = false
      this.stats.deaths++
      this._burst(this.player.pos.clone().add(new THREE.Vector3(0, 1, 0)), this.player.char.def.color, 22, 5, 4)
      this.ui.setCenter("SPLATTED!", 1400)
      this.sfx.splat()
      this._updateHud()
    }
  }

  _respawnPlayer() {
    const sp = this.arena.spawnPoints[0]
    this.player.pos.set(sp.x, 0, sp.z)
    this.player.hp = 100
    this.player.alive = true
    this.player.char.group.visible = true
    this.player.char.group.scale.setScalar(0.01)
    this.player.char.group.rotation.y = Math.PI
    this.camYaw = 0
  }

  _respawnBot(bot, i) {
    const sp = this.arena.spawnPoints[(i + 1) % this.arena.spawnPoints.length]
    bot.pos.set(sp.x, 0, sp.z)
    bot.hp = 100
    bot.alive = true
    bot.state = 'wander'
    bot.target = this._randomPoint()
    bot.char.group.visible = true
    bot.char.group.scale.setScalar(0.01)
  }

  _randomPoint() {
    const a = Math.random() * Math.PI * 2
    const r = 4 + Math.random() * 16
    return { x: Math.cos(a) * r, z: Math.sin(a) * r }
  }

  _collide(pos, radius) {
    for (const c of this.arena.colliders) {
      const dx = pos.x - c.x, dz = pos.z - c.z
      const d = Math.hypot(dx, dz)
      const min = c.r + radius
      if (d < min && d > 0.001) {
        pos.x = c.x + (dx / d) * min
        pos.z = c.z + (dz / d) * min
      }
    }
    const rr = Math.hypot(pos.x, pos.z)
    const max = ARENA_RADIUS - 0.7
    if (rr > max) {
      pos.x *= max / rr
      pos.z *= max / rr
    }
  }

  // ================= per-frame =================
  _tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05)
    this.elapsed += dt
    const t = this.elapsed

    // arena ambience always animates
    this.arena.update(dt, t)

    // lobby occupants idle-animate in every state (select included:
    // they hang out in the arena behind the select screen)
    this._updateLobbyOccupants(dt)

    // muzzle light decay
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 160)

    // preview orbit camera (around the pedestal, right-of-centre)
    if (this.state === 'select' && this.previewChar) {
      const a = t * 0.35
      this.camera.position.set(5.0 + Math.sin(a) * 4.6, 2.1 + Math.sin(t * 0.5) * 0.25, 11 + Math.cos(a) * 4.6)
      this.camera.lookAt(5.0, 1.1, 11)
      // shift the whole view right so the fighter is not hidden behind the cards
      this.camera.setViewOffset(
        window.innerWidth, window.innerHeight,
        -Math.min(420, window.innerWidth * 0.33), 0,
        window.innerWidth, window.innerHeight
      )
      animateCharacter(this.previewChar.userData.parts, dt, 0)
      this._updateParticles(dt)
      return
    }

    if (this.state === 'countdown') {
      this._countdownT += dt
      const step = Math.floor(this._countdownT / 0.7)
      if (step !== this._countdownStep) {
        this._countdownStep = step
        if (step < 3) {
          this.ui.setCenter(String(3 - step), 0)
          this.sfx.count()
        } else if (step === 3) {
          this.ui.setCenter('GO!', 700)
          this.sfx.go()
          this.state = 'playing'
          this.ui.centerMsg.textContent = ''
        }
      }
      this._updateCamera(dt)
      this._updateCharactersIdle(dt)
      return
    }

    if (this.state === 'ended') {
      const a = t * 0.12
      this.camera.position.set(Math.sin(a) * 20, 11, Math.cos(a) * 20)
      this.camera.lookAt(0, 0.5, 0)
      this._updateCharactersIdle(dt)
      this._updateParticles(dt)
      this._updateCoins(dt)
      return
    }

    if (this.state !== 'playing' && this.state !== 'paused') return
    if (this.state === 'paused') return

    // ---- timer ----
    this.timeLeft -= dt
    if (this.timeLeft <= 0) {
      this.timeLeft = 0
      this._updateHud()
      this.endMatch()
      return
    }

    // ---- player ----
    this._updatePlayer(dt)
    // ---- bots ----
    this._updateBots(dt)
    // ---- projectiles / particles / coins ----
    this._updateProjectiles(dt)
    this._updateParticles(dt)
    this._updateCoins(dt)
    // ---- camera + hud ----
    this._updateCamera(dt)
    this._updateHud()
    if (this.fireCd > 0) this.fireCd -= dt
  }

  _updateCharactersIdle(dt) {
    if (this.player?.char) animateCharacter(this.player.char.parts, dt, 0)
    for (const b of this.bots) if (b.char) animateCharacter(b.char.parts, dt, 0)
  }

  _updatePlayer(dt) {
    const p = this.player
    if (!p.alive) {
      p.respawnT -= dt
      if (p.respawnT <= 0) this._respawnPlayer()
      return
    }
    // respawn scale-in
    if (p.char.group.scale.x < 1) {
      const s = Math.min(1, p.char.group.scale.x + dt * 3)
      p.char.group.scale.setScalar(s)
    }
    // camera-relative movement
    const fwd = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw))
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x)
    const mv = new THREE.Vector3()
    if (this.keys.KeyW) mv.add(fwd)
    if (this.keys.KeyS) mv.sub(fwd)
    if (this.keys.KeyD) mv.add(right)
    if (this.keys.KeyA) mv.sub(right)
    if (this.keys.ArrowLeft) this.camYaw += 1.9 * dt
    if (this.keys.ArrowRight) this.camYaw -= 1.9 * dt
    if (this.keys.ArrowUp) this.camPitch = THREE.MathUtils.clamp(this.camPitch + 1.2 * dt, -0.3, 0.55)
    if (this.keys.ArrowDown) this.camPitch = THREE.MathUtils.clamp(this.camPitch - 1.2 * dt, -0.3, 0.55)
    // touch joystick (analog): stick up = forward, left/right = strafe
    if (this.touchMove.x || this.touchMove.y) {
      mv.addScaledVector(fwd, -this.touchMove.y)
      mv.addScaledVector(right, this.touchMove.x)
    }
    const moving = mv.lengthSq() > 0.001 ? 1 : 0
    p.moving = moving
    if (moving) {
      mv.normalize()
      p.pos.addScaledVector(mv, p.speed * dt)
      const targetYaw = Math.atan2(mv.x, mv.z)
      p.char.group.rotation.y = lerpAngle(p.char.group.rotation.y, targetYaw, Math.min(1, dt * 12))
    }
    this._collide(p.pos, 0.55)
    // slow regen after 4s without damage
    if (this.elapsed - p.lastHurt > 4 && p.hp < 100) p.hp = Math.min(100, p.hp + 2 * dt)
    // hold-to-fire (mouse drag with pointer lock, or touch fire button)
    if ((this._dragging && document.pointerLockElement === this.canvas) || this._touchFiring) this._tryFire()
    animateCharacter(p.char.parts, dt, moving)
  }

  _updateBots(dt) {
    const pp = this.player.pos
    this.bots.forEach((bot, i) => {
      if (!bot.alive) {
        bot.respawnT -= dt
        if (bot.respawnT <= 0) this._respawnBot(bot, i)
        return
      }
      if (bot.char.group.scale.x < 1) {
        bot.char.group.scale.setScalar(Math.min(1, bot.char.group.scale.x + dt * 3))
      }
      const dx = pp.x - bot.pos.x
      const dz = pp.z - bot.pos.z
      const distP = Math.hypot(dx, dz)
      const playerAlive = this.player.alive
      let moveTarget = null
      let wantShoot = false

      if (playerAlive && distP < 12) {
        bot.state = 'chase'
        if (distP > 9.5) {
          moveTarget = { x: pp.x, z: pp.z }
        } else {
          // strafe around the player
          const px = -dz / distP * bot.strafeDir
          const pz = dx / distP * bot.strafeDir
          moveTarget = { x: bot.pos.x + px * 4, z: bot.pos.z + pz * 4 }
          if (Math.random() < dt * 0.25) bot.strafeDir *= -1
        }
        if (distP < 10) wantShoot = true
      } else {
        bot.state = 'wander'
        if (!bot.target || Math.hypot(bot.target.x - bot.pos.x, bot.target.z - bot.pos.z) < 1.2) {
          bot.target = this._randomPoint()
        }
        moveTarget = bot.target
      }

      // move
      let moving = 0
      if (moveTarget) {
        const mx = moveTarget.x - bot.pos.x
        const mz = moveTarget.z - bot.pos.z
        const md = Math.hypot(mx, mz)
        if (md > 0.2) {
          moving = 1
          bot.pos.x += (mx / md) * BOT_SPEED * dt
          bot.pos.z += (mz / md) * BOT_SPEED * dt
          const faceYaw = wantShoot
            ? Math.atan2(dx, dz)
            : Math.atan2(mx, mz)
          bot.char.group.rotation.y = lerpAngle(bot.char.group.rotation.y, faceYaw, Math.min(1, dt * 8))
        }
      }
      bot.moving = moving
      this._collide(bot.pos, 0.55)

      // stuck detection
      const moved = Math.hypot(bot.pos.x - bot.lastX, bot.pos.z - bot.lastZ)
      if (moving && moved < 0.05) {
        bot.stuckT += dt
        if (bot.stuckT > 1.2) { bot.target = this._randomPoint(); bot.stuckT = 0 }
      } else bot.stuckT = 0
      bot.lastX = bot.pos.x
      bot.lastZ = bot.pos.z

      // shoot
      bot.shootCd -= dt
      if (wantShoot && bot.shootCd <= 0) {
        bot.shootCd = 1.6 + Math.random() * 1.0
        this._botFire(bot)
      }
      animateCharacter(bot.char.parts, dt, moving)
    })
  }

  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i]
      pr.life -= dt
      pr.mesh.position.addScaledVector(pr.vel, dt)
      const p = pr.mesh.position
      let dead = pr.life <= 0

      if (!dead) {
        // ground / wall
        if (p.y < 0.06) { this._placeSplat(p, pr.mesh.material.color.getHex()); dead = true }
        else if (Math.hypot(p.x, p.z) > ARENA_RADIUS + 0.5) dead = true
        // obstacles
        if (!dead) {
          for (const c of this.arena.colliders) {
            if (Math.hypot(p.x - c.x, p.z - c.z) < c.r + 0.15 && p.y < 2.2) {
              this._placeSplat(p, pr.mesh.material.color.getHex())
              this._burst(p, pr.mesh.material.color.getHex(), 5, 2, 1.5)
              dead = true
              break
            }
          }
        }
        // characters
        if (!dead) {
          if (pr.owner === 'player') {
            for (const bot of this.bots) {
              if (!bot.alive) continue
              const bp = bot.pos
              if (Math.hypot(p.x - bp.x, p.z - bp.z) < 0.72 && p.y > 0.25 && p.y < 1.9) {
                this._damageBot(bot, pr.damage)
                this._burst(p, pr.mesh.material.color.getHex(), 8, 3, 2)
                dead = true
                break
              }
            }
          } else if (this.player.alive) {
            const pp = this.player.pos
            if (Math.hypot(p.x - pp.x, p.z - pp.z) < 0.72 && p.y > 0.25 && p.y < 1.9) {
              this._damagePlayer(pr.damage)
              this._burst(p, pr.mesh.material.color.getHex(), 8, 3, 2)
              dead = true
            }
          }
        }
      }

      if (dead) {
        pr.mesh.visible = false
        this.projectiles.splice(i, 1)
      }
    }
  }

  _updateParticles(dt) {
    for (const m of this.particlePool) {
      if (!m.visible) continue
      m.userData.life -= dt
      if (m.userData.life <= 0) { m.visible = false; continue }
      m.userData.vel.y -= 9 * dt
      m.position.addScaledVector(m.userData.vel, dt)
      if (m.position.y < 0.05) { m.position.y = 0.05; m.userData.vel.y *= -0.4 }
      const k = m.userData.life / m.userData.max
      m.scale.setScalar(Math.max(0.05, k))
    }
  }

  _updateCoins(dt) {
    if (this.state !== 'playing' && this.state !== 'ended') return
    for (const coin of this.coins) {
      if (!coin.active) {
        coin.timer -= dt
        if (coin.timer <= 0) {
          const spot = this.arena.coinSpots[Math.floor(Math.random() * this.arena.coinSpots.length)]
          coin.mesh.position.set(spot.x, 0.95, spot.z)
          coin.mesh.visible = true
          coin.active = true
        }
        continue
      }
      coin.mesh.rotation.y += dt * 2.4
      coin.mesh.position.y = 0.95 + Math.sin(this.elapsed * 2 + coin.phase) * 0.16
      if (this.state === 'playing' && this.player.alive) {
        const d = Math.hypot(coin.mesh.position.x - this.player.pos.x, coin.mesh.position.z - this.player.pos.z)
        if (d < 1.4) {
          coin.active = false
          coin.timer = 8
          coin.mesh.visible = false
          this.stats.splat++
          this.stats.score += 25
          this.player.hp = Math.min(100, this.player.hp + 20)
          this._burst(coin.mesh.position, 0xf5b301, 14, 3, 3)
          this.ui.addKillfeed('SPLAT collected!  +25  •  +20 HP')
          this.sfx.coin()
          this._updateHud()
        }
      }
    }
  }

  _updateCamera(dt) {
    if (!this.player) return
    const p = this.player.pos
    const dist = 6.8
    const cx = p.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist
    const cz = p.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist
    const cy = p.y + 1.2 + Math.sin(this.camPitch) * dist + 1.6
    this.camera.position.set(cx, Math.max(0.7, cy), cz)
    const look = new THREE.Vector3(
      p.x - Math.sin(this.camYaw) * 2.5,
      p.y + 1.35,
      p.z - Math.cos(this.camYaw) * 2.5
    )
    this.camera.lookAt(look)
  }

  _updateHud(force = false) {
    const u = this.ui
    const mm = Math.floor(this.timeLeft / 60)
    const ss = Math.floor(this.timeLeft % 60).toString().padStart(2, '0')
    const vals = {
      score: String(this.stats.score),
      kills: `${this.stats.kills} splats • ${this.stats.splat} SPLAT`,
      splat: String(this.stats.splat),
      timer: `${mm}:${ss}`,
      hp: Math.max(0, Math.round(this.player ? this.player.hp : 100))
    }
    if (force || vals.score !== this.lastHud.score) u.score.textContent = vals.score
    if (force || vals.kills !== this.lastHud.kills) u.kills.textContent = vals.kills
    if (force || vals.splat !== this.lastHud.splat) u.splatN.textContent = vals.splat
    if (force || vals.timer !== this.lastHud.timer) {
      u.timer.textContent = vals.timer
      u.timer.classList.toggle('low', this.timeLeft <= 15)
    }
    if (force || vals.hp !== this.lastHud.hp) {
      u.healthFill.style.width = `${vals.hp}%`
      u.healthFill.classList.toggle('hurt', vals.hp <= 35)
      u.healthText.textContent = `HEALTH ${vals.hp}`
    }
    this.lastHud = vals
  }
}
