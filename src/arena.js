import * as THREE from 'three'
import { makeGrassTexture, makeSandTexture, makeCrateTexture, makeBarrelTexture, makeBannerTexture } from './textures.js'

export const ARENA_RADIUS = 24

function std(color, roughness = 0.8, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02, ...extra })
}

function mesh(geo, mat, x = 0, y = 0, z = 0, cast = true, recv = true) {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.castShadow = cast
  m.receiveShadow = recv
  return m
}

function makePalm() {
  const palm = new THREE.Group()
  const trunkMat = std(0x8a5a2b, 0.9)
  // curved trunk from 4 stacked segments
  let x = 0
  for (let i = 0; i < 4; i++) {
    const seg = mesh(new THREE.CylinderGeometry(0.22 - i * 0.03, 0.28 - i * 0.03, 1.1, 8), trunkMat, x, 0.55 + i * 1.05, 0)
    seg.rotation.z = -0.06 * i
    x += 0.07
    palm.add(seg)
  }
  const topX = x + 0.1
  const topY = 4.5
  // coconuts
  const cocoMat = std(0x6b4423, 0.85)
  for (let i = 0; i < 3; i++) {
    palm.add(mesh(new THREE.SphereGeometry(0.16, 10, 8), cocoMat,
      topX + Math.cos(i * 2.1) * 0.22, topY - 0.15, Math.sin(i * 2.1) * 0.22))
  }
  // fronds: flattened cones drooping outward
  const frondCols = [0x2f9e44, 0x37b24d, 0x2b8a3e]
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    const frond = mesh(
      new THREE.ConeGeometry(0.55, 2.6, 4),
      std(frondCols[i % 3], 0.85, { flatShading: true }),
      topX + Math.cos(a) * 1.05, topY + 0.15, Math.sin(a) * 1.05
    )
    frond.scale.set(1, 1, 0.18)
    frond.rotation.set(Math.sin(a) * 1.15, 0, -Math.cos(a) * 1.15)
    frond.rotation.y = -a
    palm.add(frond)
  }
  return palm
}

export function buildArena(scene) {
  const colliders = []
  const group = new THREE.Group()
  scene.add(group)

  // ---- ground ----
  const grass = mesh(
    new THREE.CircleGeometry(30, 64),
    new THREE.MeshStandardMaterial({ map: makeGrassTexture(), roughness: 0.95 }),
    0, 0, 0, false, true
  )
  grass.rotation.x = -Math.PI / 2
  group.add(grass)
  // sand ring near the wall
  const sand = mesh(
    new THREE.RingGeometry(23.2, 30, 64),
    new THREE.MeshStandardMaterial({ map: makeSandTexture(), roughness: 1 }),
    0, 0.015, 0, false, true
  )
  sand.rotation.x = -Math.PI / 2
  group.add(sand)

  // ---- boundary fence: posts + two rails ----
  const postMat = std(0x0b0e1a, 0.6)
  const railMat = std(0x3b82f6, 0.5, { metalness: 0.25 })
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2
    const x = Math.cos(a) * 25.2, z = Math.sin(a) * 25.2
    group.add(mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.15, 8), postMat, x, 0.57, z))
    group.add(mesh(new THREE.SphereGeometry(0.12, 10, 8), std(0xf5b301, 0.5), x, 1.2, z))
  }
  for (const y of [0.55, 1.05]) {
    const rail = mesh(new THREE.TorusGeometry(25.2, 0.05, 8, 80), railMat, 0, y, 0)
    rail.rotation.x = Math.PI / 2
    group.add(rail)
  }

  // ---- arena banners on the wall ----
  const bannerTex = makeBannerTexture()
  const banners = []
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    const banner = mesh(
      new THREE.PlaneGeometry(7.5, 2.8),
      new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.7, side: THREE.DoubleSide }),
      Math.cos(a) * 24.6, 2.6, Math.sin(a) * 24.6, false, false
    )
    banner.lookAt(0, 2.6, 0)
    group.add(banner)
    banners.push(banner)
    // banner poles
    const px = Math.cos(a - 0.15) * 24.9, pz = Math.sin(a - 0.15) * 24.9
    const qx = Math.cos(a + 0.15) * 24.9, qz = Math.sin(a + 0.15) * 24.9
    group.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 8), postMat, px, 1.7, pz))
    group.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 8), postMat, qx, 1.7, qz))
  }

  // ---- palm trees ----
  const palmSpots = [
    [17, 12, 0.4], [-18, 9, 1.2], [-14, -16, 2.1], [15, -17, 0.9], [20, -3, 1.7], [-20, -2, 2.6]
  ]
  for (const [x, z, rot] of palmSpots) {
    const palm = makePalm()
    palm.position.set(x, 0, z)
    palm.rotation.y = rot
    group.add(palm)
    colliders.push({ x, z, r: 0.7 })
  }

  // ---- crates ----
  const crateTex = makeCrateTexture()
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.85 })
  const crateSpots = [
    [8, 8, 0.3], [-8, 6, 0.9], [6, -12, 0.1], [-6, -6, 1.2],
    [13, 2, 0.6], [-13, 14, 0.2], [2, 18, 1.0], [-2, -18, 0.4]
  ]
  for (const [x, z, rot] of crateSpots) {
    const crate = mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), crateMat, x, 0.75, z)
    crate.rotation.y = rot
    group.add(crate)
    colliders.push({ x, z, r: 1.15 })
  }
  // one stacked pair for height variety
  const stack = mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), crateMat, 10.5, 2.25, -6)
  stack.rotation.y = 0.5
  group.add(stack)

  // ---- barrels ----
  const barrelTex = makeBarrelTexture()
  const barrelMat = new THREE.MeshStandardMaterial({ map: barrelTex, roughness: 0.85 })
  const barrelSpots = [[-4, 12], [12, 12], [-11, -12], [4, -3], [18, 8]]
  for (const [x, z] of barrelSpots) {
    group.add(mesh(new THREE.CylinderGeometry(0.55, 0.6, 1.15, 14), barrelMat, x, 0.58, z))
    colliders.push({ x, z, r: 0.75 })
  }

  // ---- fountain (centre) ----
  const stoneMat = std(0xcfd6e4, 0.85)
  const basin = mesh(new THREE.CylinderGeometry(3.1, 3.3, 0.7, 28), stoneMat, 0, 0.35, 0)
  group.add(basin)
  const rim = mesh(new THREE.TorusGeometry(3.1, 0.16, 10, 40), std(0x9aa5bd, 0.8), 0, 0.72, 0)
  rim.rotation.x = Math.PI / 2
  group.add(rim)
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85
  })
  const water = mesh(new THREE.CircleGeometry(2.85, 28), waterMat, 0, 0.62, 0, false, false)
  water.rotation.x = -Math.PI / 2
  group.add(water)
  const column = mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.6, 12), stoneMat, 0, 1.4, 0)
  group.add(column)
  group.add(mesh(new THREE.SphereGeometry(0.5, 16, 12), std(0xf5b301, 0.45), 0, 2.45, 0))
  colliders.push({ x: 0, z: 0, r: 3.4 })

  // fountain jet particles
  const JET_N = 70
  const jetGeo = new THREE.BufferGeometry()
  const jetPos = new Float32Array(JET_N * 3)
  const jetSeed = []
  for (let i = 0; i < JET_N; i++) {
    jetSeed.push({ a: Math.random() * Math.PI * 2, r: Math.random() * 0.5, s: 0.7 + Math.random() * 0.7, o: Math.random() })
  }
  jetGeo.setAttribute('position', new THREE.BufferAttribute(jetPos, 3))
  const jet = new THREE.Points(jetGeo, new THREE.PointsMaterial({
    color: 0x7dd3fc, size: 0.22, transparent: true, opacity: 0.9, depthWrite: false
  }))
  group.add(jet)

  // ---- paint splats on the ground ----
  const splatCols = [0xff7ab8, 0x3b82f6, 0xf5b301, 0x8b5cf6, 0xff5d6c, 0x34d399]
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2
    const r = 6 + Math.random() * 15
    const splat = mesh(
      new THREE.CircleGeometry(0.5 + Math.random() * 0.9, 12),
      new THREE.MeshStandardMaterial({ color: splatCols[i % splatCols.length], roughness: 0.9, transparent: true, opacity: 0.75 }),
      Math.cos(a) * r, 0.02, Math.sin(a) * r, false, false
    )
    splat.rotation.x = -Math.PI / 2
    splat.rotation.z = Math.random() * Math.PI
    group.add(splat)
  }

  // ---- drifting clouds ----
  const clouds = []
  const cloudMat = std(0xffffff, 1, { transparent: true, opacity: 0.92 })
  for (let i = 0; i < 5; i++) {
    const cloud = new THREE.Group()
    for (let j = 0; j < 3; j++) {
      cloud.add(mesh(new THREE.SphereGeometry(1.6 - j * 0.3, 12, 10),
        cloudMat, j * 1.8 - 1.8, j * 0.3, 0, false, false))
    }
    const a = (i / 5) * Math.PI * 2
    cloud.position.set(Math.cos(a) * 34, 17 + (i % 3) * 2.5, Math.sin(a) * 34)
    cloud.scale.setScalar(1.4 + (i % 2) * 0.5)
    scene.add(cloud)
    clouds.push(cloud)
  }

  const spawnPoints = [
    { x: 0, z: 17 }, { x: -15, z: -9 }, { x: 15, z: -9 }, { x: -16, z: 10 }
  ]
  const coinSpots = [
    { x: 9, z: -2 }, { x: -9, z: -2 }, { x: 0, z: -14 }, { x: -4, z: 14 }, { x: 12, z: 14 }
  ]

  function update(dt, t) {
    // water shimmer
    water.position.y = 0.62 + Math.sin(t * 1.6) * 0.03
    waterMat.opacity = 0.8 + Math.sin(t * 1.6) * 0.06
    // jet particles: rise and fall in a loop
    const pos = jetGeo.attributes.position.array
    for (let i = 0; i < JET_N; i++) {
      const s = jetSeed[i]
      const life = ((t * s.s + s.o) % 1)
      const h = life * 2.6
      const spread = 0.25 + life * 1.1
      pos[i * 3] = Math.cos(s.a) * spread * s.r * 2
      pos[i * 3 + 1] = 2.5 + h
      pos[i * 3 + 2] = Math.sin(s.a) * spread * s.r * 2
    }
    jetGeo.attributes.position.needsUpdate = true
    // banners sway gently
    banners.forEach((b, i) => { b.rotation.z = Math.sin(t * 0.7 + i * 1.7) * 0.02 })
    // clouds drift
    clouds.forEach((c, i) => {
      c.position.x += Math.sin(t * 0.05 + i) * dt * 0.35
      c.position.z += Math.cos(t * 0.04 + i * 2) * dt * 0.3
    })
  }

  return { group, colliders, spawnPoints, coinSpots, update }
}
