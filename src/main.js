import { Game } from './game.js'
import { CHARACTERS } from './characters.js'

// ---- error trap: surface runtime errors into the DOM for headless testing ----
window.addEventListener('error', (e) => {
  const el = document.getElementById('errlog')
  if (el) el.textContent += `[ERROR] ${e.message} @ ${e.filename}:${e.lineno}\n`
})
window.addEventListener('unhandledrejection', (e) => {
  const el = document.getElementById('errlog')
  if (el) el.textContent += `[REJECTION] ${e.reason}\n`
})

const $ = (id) => document.getElementById(id)
const canvas = $('game-canvas')

const ui = {
  hud: $('hud'),
  score: $('hud-score'),
  kills: $('hud-kills'),
  okbN: $('hud-okb-n'),
  timer: $('hud-timer'),
  healthFill: $('hud-health-fill'),
  healthText: $('hud-health-text'),
  killfeed: $('killfeed'),
  hitmarker: $('hitmarker'),
  centerMsg: $('center-msg'),
  vignette: $('damage-vignette'),
  muteBtn: $('mute-btn'),
  flashHitmarker() {
    this.hitmarker.classList.remove('show')
    void this.hitmarker.offsetWidth
    this.hitmarker.classList.add('show')
  },
  flashDamage() {
    this.vignette.classList.remove('show')
    void this.vignette.offsetWidth
    this.vignette.classList.add('show')
  },
  addKillfeed(text) {
    const div = document.createElement('div')
    div.textContent = text
    this.killfeed.prepend(div)
    while (this.killfeed.children.length > 4) this.killfeed.lastChild.remove()
    setTimeout(() => div.remove(), 4200)
  },
  setCenter(text, ms = 0) {
    this.centerMsg.textContent = text
    if (ms > 0) setTimeout(() => { if (this.centerMsg.textContent === text) this.centerMsg.textContent = '' }, ms)
  },
  onEnd: null
}

const game = new Game(canvas, ui)
window.__game = game // for automated testing

// ---- character select cards ----
let selected = CHARACTERS[0].id
const cardsEl = $('char-cards')
function hexCss(n) { return '#' + n.toString(16).padStart(6, '0') }

CHARACTERS.forEach((c) => {
  const card = document.createElement('div')
  card.className = 'char-card' + (c.id === selected ? ' selected' : '')
  card.dataset.id = c.id
  card.innerHTML = `
    <div class="char-dot" style="background:${hexCss(c.color)}">
      <span style="font-size:34px;font-weight:900;color:#fff;text-shadow:0 2px 6px rgba(0,0,0,.35)">${c.name[0]}</span>
    </div>
    <h3>${c.name}</h3>
    <p>${c.desc}</p>
    <span class="tag">${c.tag}</span>`
  card.addEventListener('click', () => {
    selected = c.id
    document.querySelectorAll('.char-card').forEach((el) => el.classList.toggle('selected', el.dataset.id === c.id))
    game.showPreview(c.id)
    game.sfx.ensure()
  })
  cardsEl.appendChild(card)
})

game.showPreview(selected)

$('start-btn').addEventListener('click', () => {
  $('select-screen').classList.add('hidden')
  game.start(selected)
})

$('again-btn').addEventListener('click', () => {
  $('end-screen').classList.add('hidden')
  game.start(selected)
})

$('change-char-btn').addEventListener('click', () => {
  $('end-screen').classList.add('hidden')
  $('select-screen').classList.remove('hidden')
  game.ui.hud.classList.add('hidden')
  game.showPreview(selected)
})

$('mute-btn').addEventListener('click', () => game.toggleMute())

// ---- leaderboard (localStorage) ----
const LB_KEY = 'xarena_leaderboard_v1'
function loadLb() {
  try { return JSON.parse(localStorage.getItem(LB_KEY) || '[]') } catch { return [] }
}
function saveLb(list) {
  try { localStorage.setItem(LB_KEY, JSON.stringify(list.slice(0, 5))) } catch { /* ignore */ }
}

ui.onEnd = (stats) => {
  const list = loadLb()
  const entry = {
    name: CHARACTERS.find((c) => c.id === selected)?.name || 'Player',
    score: stats.score, kills: stats.kills, date: new Date().toLocaleDateString()
  }
  list.push(entry)
  list.sort((a, b) => b.score - a.score)
  saveLb(list)
  const rank = list.indexOf(entry) + 1

  $('end-title').textContent = stats.score >= 300 ? 'ARENA CHAMPION!' : "TIME'S UP!"
  $('end-subtitle').textContent = rank === 1
    ? 'New local record! The arena is yours.'
    : `You finished #${rank} on the local board. Splat more bots next time!`
  $('end-stats').innerHTML = `
    <div class="stat-box"><div class="v">${stats.score}</div><div class="l">SCORE</div></div>
    <div class="stat-box"><div class="v">${stats.kills}</div><div class="l">SPLATS</div></div>
    <div class="stat-box"><div class="v">${stats.deaths}</div><div class="l">SPLATTED</div></div>
    <div class="stat-box"><div class="v">${stats.okb}</div><div class="l">OKB</div></div>
    <div class="stat-box"><div class="v">${stats.accuracy}%</div><div class="l">ACCURACY</div></div>`
  $('lb-list').innerHTML = list.map((e, i) =>
    `<li class="${e === entry ? 'me' : ''}"><span>#${i + 1} ${e.name} • ${e.date}</span><span>${e.score} pts • ${e.kills} splats</span></li>`
  ).join('')
  $('end-screen').classList.remove('hidden')
}

// ---- demo / test mode: ?demo=1 auto-starts a match (used by automated tests) ----
const params = new URLSearchParams(location.search)
if (params.get('demo') === '1') {
  const pick = params.get('char') || selected
  setTimeout(() => {
    $('select-screen').classList.add('hidden')
    game.start(pick)
  }, 400)
}
if (params.get('demo') === 'select') {
  // stay on the select screen, preview visible
}
