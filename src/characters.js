import * as THREE from 'three'

export const CHARACTERS = [
  {
    id: 'momo', name: 'Momo', tag: 'BOUNCY BUNNY', tagZh: '弹跳兔',
    color: 0xff9ec7, belly: 0xffe3ef, accent: 0xff5d8f, earColor: 0xff7ab8,
    desc: 'Bouncy bunny with the biggest ears in the arena. Hoppy, happy, hard to hit.',
    descZh: '竞技场里耳朵最大的弹跳兔。蹦蹦跳跳、快快乐乐，很难击中。'
  },
  {
    id: 'bibo', name: 'Bibo', tag: 'AFRO BEAR', tagZh: '爆炸头熊',
    color: 0x9b7ede, belly: 0xd9ccff, accent: 0x6d28d9, earColor: 0x7c5cd6,
    desc: 'Chill purple bear with a perfect afro. Slow to anger, quick on the trigger.',
    descZh: '淡定的紫色熊，顶着完美爆炸头。不易动怒，出手却很快。'
  },
  {
    id: 'kiko', name: 'Kiko', tag: 'SNEAKY CAT', tagZh: '狡猾猫',
    color: 0x4fd1c5, belly: 0xd2f7f2, accent: 0x0e7490, earColor: 0x2bb3a6,
    desc: 'Sneaky teal cat who always lands on her feet — usually behind you.',
    descZh: '狡猾的青色猫，总能稳稳落地 — 通常就在你身后。'
  },
  {
    id: 'pipi', name: 'Pipi', tag: 'SUNNY CHICK', tagZh: '阳光小鸡',
    color: 0xffd23f, belly: 0xfff3b0, accent: 0xf59e0b, earColor: 0xffb703,
    desc: 'Sunny little chick with a big beak and bigger confidence. Cheep shot!',
    descZh: '阳光小鸡，大嘴巴，自信满满。啾啾一击！'
  }
]

function std(color, roughness = 0.6, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02, ...extra })
}

function sphere(r, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 22), mat)
  m.position.set(x, y, z)
  m.scale.set(sx, sy, sz)
  m.castShadow = true
  return m
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  m.castShadow = true
  return m
}

/** Build one cute chibi fighter from primitives. Faces +Z (forward). */
export function createCharacter(def) {
  const g = new THREE.Group()
  const mats = []
  const bodyMat = std(def.color, 0.62)
  const bellyMat = std(def.belly, 0.7)
  const accentMat = std(def.accent, 0.5)
  const whiteMat = std(0xffffff, 0.35)
  const blackMat = std(0x1f2430, 0.3)
  const blushMat = std(0xff8fab, 0.7)
  mats.push(bodyMat, bellyMat, accentMat)

  // ---- body (rounded torso) ----
  const body = sphere(0.5, bodyMat, 0, 0.52, 0, 1.02, 0.92, 0.9)
  g.add(body)
  // belly patch
  const belly = sphere(0.34, bellyMat, 0, 0.5, 0.26, 1, 1.05, 0.55)
  g.add(belly)

  // ---- feet ----
  const footL = sphere(0.16, accentMat, -0.2, 0.09, 0.06, 1, 0.55, 1.35)
  const footR = sphere(0.16, accentMat, 0.2, 0.09, 0.06, 1, 0.55, 1.35)
  g.add(footL, footR)

  // ---- arms ----
  const armL = new THREE.Group()
  armL.position.set(-0.5, 0.72, 0)
  armL.add(sphere(0.13, bodyMat, 0, -0.08, 0.02))
  g.add(armL)
  const armR = new THREE.Group()
  armR.position.set(0.5, 0.72, 0)
  armR.add(sphere(0.13, bodyMat, 0, -0.08, 0.02))
  g.add(armR)

  // ---- head ----
  const head = new THREE.Group()
  head.position.set(0, 1.06, 0)
  const skull = sphere(0.42, bodyMat, 0, 0, 0)
  head.add(skull)

  // eyes (white + pupil), placed proud of the face so they read clearly
  const eyeL = new THREE.Group()
  eyeL.position.set(-0.155, 0.06, 0.35)
  eyeL.add(sphere(0.088, whiteMat, 0, 0, 0))
  eyeL.add(sphere(0.045, blackMat, 0, 0.01, 0.055))
  // tiny eye shine
  eyeL.add(sphere(0.016, whiteMat, 0.02, 0.03, 0.09))
  const eyeR = new THREE.Group()
  eyeR.position.set(0.155, 0.06, 0.35)
  eyeR.add(sphere(0.088, whiteMat, 0, 0, 0))
  eyeR.add(sphere(0.045, blackMat, 0, 0.01, 0.055))
  eyeR.add(sphere(0.016, whiteMat, 0.02, 0.03, 0.09))
  head.add(eyeL, eyeR)

  // blush cheeks
  head.add(sphere(0.062, blushMat, -0.28, -0.06, 0.3, 1, 0.65, 0.4))
  head.add(sphere(0.062, blushMat, 0.28, -0.06, 0.3, 1, 0.65, 0.4))

  // smile — bottom arc of a torus, facing forward
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.085, 0.014, 8, 20, 2.44),
    blackMat
  )
  smile.position.set(0, -0.1, 0.375)
  smile.rotation.z = Math.PI * 1.15
  head.add(smile)

  // ---- per-character accessories ----
  if (def.id === 'momo') {
    // long bunny ears, tilted outward, pink inner
    for (const side of [-1, 1]) {
      const ear = new THREE.Group()
      ear.position.set(side * 0.2, 0.36, 0)
      ear.rotation.z = side * -0.28
      ear.add(sphere(0.1, bodyMat, 0, 0.16, 0, 1, 2.1, 0.7))
      ear.add(sphere(0.055, std(def.earColor, 0.7), 0, 0.15, 0.06, 1, 1.9, 0.4))
      head.add(ear)
    }
  } else if (def.id === 'bibo') {
    // round bear ears
    for (const side of [-1, 1]) {
      head.add(sphere(0.12, bodyMat, side * 0.3, 0.32, 0))
      head.add(sphere(0.06, std(def.earColor, 0.7), side * 0.3, 0.32, 0.09))
    }
    // afro puffs
    const afroMat = std(0x5b21b6, 0.85)
    const puffs = [
      [0, 0.42, 0], [-0.2, 0.36, 0.06], [0.2, 0.36, 0.06],
      [-0.12, 0.4, -0.14], [0.12, 0.4, -0.14], [0, 0.38, -0.2], [-0.24, 0.28, -0.08], [0.24, 0.28, -0.08]
    ]
    for (const [x, y, z] of puffs) head.add(sphere(0.11, afroMat, x, y, z))
  } else if (def.id === 'kiko') {
    // triangle cat ears with pink inner
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.26, 4), bodyMat)
      ear.position.set(side * 0.26, 0.4, 0)
      ear.rotation.z = side * -0.22
      ear.rotation.y = Math.PI / 4
      ear.castShadow = true
      head.add(ear)
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.15, 4), std(0xff8fab, 0.7))
      inner.position.set(side * 0.26, 0.37, 0.05)
      inner.rotation.z = side * -0.22
      inner.rotation.y = Math.PI / 4
      head.add(inner)
    }
    // whiskers
    const whiskerMat = std(0xffffff, 0.4)
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 6), whiskerMat)
        w.position.set(side * 0.38, -0.02 + i * 0.07, 0.3)
        w.rotation.z = side * (Math.PI / 2 - 0.25 + i * 0.25)
        w.rotation.y = side * 0.5
        head.add(w)
      }
    }
  } else if (def.id === 'pipi') {
    // beak
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.16, 12), std(0xff9f1c, 0.5))
    beak.position.set(0, -0.06, 0.42)
    beak.rotation.x = Math.PI / 2
    beak.castShadow = true
    head.add(beak)
    // head tuft
    for (let i = -1; i <= 1; i++) {
      const tuft = sphere(0.06, std(def.accent, 0.7), i * 0.07, 0.44, 0)
      tuft.rotation.z = i * -0.3
      head.add(tuft)
    }
    // tiny wings on the body sides
    for (const side of [-1, 1]) {
      const wing = sphere(0.16, bodyMat, side * 0.48, 0.55, -0.05, 0.45, 1.1, 1)
      g.add(wing)
    }
  }
  g.add(head)

  // ---- blaster (held in right hand, points forward) ----
  const blaster = new THREE.Group()
  blaster.position.set(0.1, -0.14, 0.22)
  const gunBody = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.36, 16), accentMat)
  gunBody.rotation.x = Math.PI / 2
  gunBody.castShadow = true
  blaster.add(gunBody)
  const tank = sphere(0.085, whiteMat, 0, 0.11, -0.06)
  blaster.add(tank)
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.16, 12), std(0x2b2f3a, 0.4, { metalness: 0.5 }))
  nozzle.rotation.x = Math.PI / 2
  nozzle.position.set(0, 0, 0.25)
  blaster.add(nozzle)
  const grip = box(0.07, 0.16, 0.07, std(0x2b2f3a, 0.6), 0, -0.12, -0.08)
  grip.rotation.x = 0.3
  blaster.add(grip)
  // muzzle flash (hidden unless firing)
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0 })
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), flashMat)
  flash.position.set(0, 0, 0.38)
  blaster.add(flash)
  armR.add(blaster)
  // aim the right arm forward so the blaster points ahead
  armR.rotation.x = -Math.PI / 2 + 0.25

  g.traverse((o) => { if (o.isMesh) o.castShadow = true })

  const parts = {
    body, head, armL, armR, blaster, flash, flashMat,
    footL, footR, eyeL, eyeR,
    mats, bodyMat, accentMat,
    walkPhase: Math.random() * 6,
    recoil: 0, flashT: 0, hitT: 0, blinkT: 2 + Math.random() * 2
  }
  g.userData.parts = parts
  return { group: g, parts, def }
}

/** Walk / idle animation. `moving` 0..1, dt seconds. */
export function animateCharacter(parts, dt, moving) {
  // `moving` is now a 0..1 speed fraction (bots still pass 0/1): walk
  // speed, bob and lean all scale with it, so a half-tilt stick walks
  // instead of sprinting, and stops ease out instead of freezing.
  const amt = Math.min(1, Math.max(0, moving))
  parts.walkPhase += dt * (2.2 + amt * 8.8)
  const ph = parts.walkPhase
  const bob = amt > 0.05 ? Math.abs(Math.sin(ph)) * 0.07 * amt : Math.sin(ph * 0.5) * 0.015
  parts.body.position.y = 0.52 + bob
  parts.head.position.y = 1.06 + bob * 1.2
  parts.footL.position.y = 0.09 + (amt > 0.05 ? Math.max(0, Math.sin(ph)) * 0.14 * amt : 0)
  parts.footR.position.y = 0.09 + (amt > 0.05 ? Math.max(0, -Math.sin(ph)) * 0.14 * amt : 0)
  parts.armL.rotation.x = amt > 0.05 ? Math.sin(ph) * 0.5 * amt : Math.sin(ph * 0.5) * 0.08
  // forward lean while running + head counter-tilt so the eyes stay level
  parts.body.rotation.x = amt * 0.09
  parts.head.rotation.x = -amt * 0.04
  // recoil spring
  parts.recoil = Math.max(0, parts.recoil - dt * 6)
  parts.blaster.position.z = 0.22 - parts.recoil * 0.14
  // muzzle flash decay
  parts.flashT = Math.max(0, parts.flashT - dt * 8)
  parts.flashMat.opacity = parts.flashT
  // hit squash decay
  parts.hitT = Math.max(0, parts.hitT - dt * 4)
  // blink
  parts.blinkT -= dt
  if (parts.blinkT < 0) parts.blinkT = 2.2 + Math.random() * 2.4
  const blink = parts.blinkT < 0.12 ? 0.12 : 1
  parts.eyeL.scale.y = blink
  parts.eyeR.scale.y = blink
}

export function fireFlash(parts) {
  parts.recoil = 1
  parts.flashT = 1
}

export function hitSquash(parts) {
  parts.hitT = 1
}
