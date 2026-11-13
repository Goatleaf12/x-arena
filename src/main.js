import { Game } from './game.js'
import { CHARACTERS } from './characters.js'
import { LobbyClient, createChatPanel, occupantDisplay } from './lobby.js'

// ---- SPLAT lobby (live): https://splat-lobby.oagenthq.workers.dev ----
// One shared hangout room (Cloudflare Worker + Durable Object, free tier).
// No wallet, no auth: joining just puts your chibi in the room with a
// name tag, and your arena position is shared so others see you move.
// The game works fully without it — a failed join only means solo play.
// Dev override: ?lobby=http://localhost:8787 (wrangler dev --local).
const LOBBY_URL = new URLSearchParams(location.search).get('lobby')
  || 'https://splat-lobby.oagenthq.workers.dev'
let lobby = null
let lobbyPanel = null
let lobbyMoveTimer = null

function playerName() {
  const input = $('player-name')
  let name = (input?.value || '').trim().slice(0, 32)
  if (!name) {
    name = localStorage.getItem('splat_player_name') || ''
    if (!name) {
      name = 'Guest-' + Math.random().toString(36).slice(2, 6).toUpperCase()
      try { localStorage.setItem('splat_player_name', name) } catch { /* ignore */ }
    }
  } else {
    try { localStorage.setItem('splat_player_name', name) } catch { /* ignore */ }
  }
  return name
}

async function joinLobby(charId) {
  await leaveLobby()
  const countEl = $('lobby-count')
  let client
  try {
    client = new LobbyClient({
      baseUrl: LOBBY_URL,
      onState: (state) => {
        const others = occupantDisplay(state).filter((o) => o.id !== client.me?.id)
        game.setLobbyOccupants(others)
        if (countEl) {
          const n = (state.occupants ?? []).length
          countEl.textContent = n > 1 ? `👥 ${n} in lobby` : '👥 lobby: just you'
        }
      },
      onError: (err) => console.warn('lobby:', err?.message || err),
    })
    await client.join({ name: playerName(), kind: 'human', character: charId })
    client.connect()
    lobby = client
    window.__lobby = client // for automated testing / debugging
    const container = $('lobby-chat')
    if (container) {
      container.classList.remove('hidden')
      lobbyPanel = createChatPanel(container, lobby)
    }
    // share our arena position ~5x/s; LobbyClient throttles to ~10/s
    lobbyMoveTimer = setInterval(() => {
      if (!lobby || game.state !== 'playing' || !game.player?.alive) return
      lobby.move(game.player.pos.x, game.player.pos.z).catch(() => {})
    }, 200)
  } catch (err) {
    console.warn('lobby join failed (playing solo):', err?.message || err)
    if (countEl) countEl.textContent = '👥 lobby offline — solo'
  }
}

async function leaveLobby() {
  if (lobbyMoveTimer) { clearInterval(lobbyMoveTimer); lobbyMoveTimer = null }
  if (lobbyPanel) { try { lobbyPanel.destroy() } catch { /* ignore */ } lobbyPanel = null }
  const container = $('lobby-chat')
  if (container) container.classList.add('hidden')
  if (lobby) {
    const l = lobby
    lobby = null
    game.clearLobbyOccupants()
    const countEl = $('lobby-count')
    if (countEl) countEl.textContent = ''
    await l.leave()
  }
}

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
  splatN: $('hud-splat-n'),
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
    <div class="char-portrait" style="background:radial-gradient(circle at 50% 42%, ${hexCss(c.color)}38, transparent 72%)">
      <img class="char-img" src="./assets/char-${c.id}.png" alt="${c.name} the ${c.tag.toLowerCase()}" draggable="false" />
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
  joinLobby(selected)
})

$('again-btn').addEventListener('click', () => {
  $('end-screen').classList.add('hidden')
  game.start(selected)
  joinLobby(selected)
})

$('change-char-btn').addEventListener('click', () => {
  $('end-screen').classList.add('hidden')
  $('select-screen').classList.remove('hidden')
  game.ui.hud.classList.add('hidden')
  game.showPreview(selected)
})

window.addEventListener('pagehide', () => { leaveLobby() })

// prefill the lobby name input with the saved name (or a fresh Guest- id)
try {
  const saved = localStorage.getItem('splat_player_name')
  if (saved && $('player-name')) $('player-name').value = saved
} catch { /* ignore */ }

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
  lastStats = stats
  leaveLobby() // match over: step out of the shared room (presence expires in 90 s anyway)
  // reset the on-chain submit button for the new match result
  const submitBtn = $('submit-score-btn')
  submitBtn.disabled = false
  submitBtn.textContent = 'Submit score on-chain'
  $('chain-status').textContent = 'Submit this score to the on-chain top 10 (testnet — no real funds). Needs a wallet; the game works fully without one.'
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
    <div class="stat-box"><div class="v">${stats.splat}</div><div class="l">SPLAT</div></div>
    <div class="stat-box"><div class="v">${stats.accuracy}%</div><div class="l">ACCURACY</div></div>`
  $('lb-list').innerHTML = list.map((e, i) =>
    `<li class="${e === entry ? 'me' : ''}"><span>#${i + 1} ${e.name} • ${e.date}</span><span>${e.score} pts • ${e.kills} splats</span></li>`
  ).join('')
  $('end-screen').classList.remove('hidden')
}

// ---- on-chain leaderboard (X Layer testnet 1952, wallet-optional) ----
// Contract: XArenaLeaderboard 0xBE230D902B60216251ccDfC70bCE80b073754ac0
// (address + full ABI in contracts/XArenaLeaderboard.json).
// The game never auto-connects: this only runs when the player clicks
// "Submit score on-chain", and the game is fully playable without a wallet.
const LB_CONTRACT = '0xBE230D902B60216251ccDfC70bCE80b073754ac0'
const LB_SUBMIT_SELECTOR = '0x8358ba08' // submitScore(uint256,uint256)
const XLAYER_TESTNET = {
  chainId: '0x7a0', // 1952
  chainName: 'X Layer Testnet',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: ['https://xlayer-testnet.drpc.org'],
  blockExplorerUrls: ['https://www.okx.com/explorer/xlayer-test']
}
let lastStats = null
const uint256Hex = (n) => BigInt(n).toString(16).padStart(64, '0')

$('submit-score-btn').addEventListener('click', async () => {
  const status = $('chain-status')
  const btn = $('submit-score-btn')
  if (!lastStats) { status.textContent = 'No match score to submit yet — play a match first.'; return }
  if (!window.ethereum) {
    status.textContent = 'No wallet detected in this browser. Install MetaMask (or another EVM wallet) to submit on-chain — your local score is already saved above.'
    return
  }
  btn.disabled = true
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
    const from = accounts[0]
    const chainId = await window.ethereum.request({ method: 'eth_chainId' })
    if (chainId !== XLAYER_TESTNET.chainId) {
      try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: XLAYER_TESTNET.chainId }] })
      } catch (switchErr) {
        if (switchErr?.code === 4902) {
          await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [XLAYER_TESTNET] })
        } else throw switchErr
      }
    }
    status.textContent = 'Waiting for wallet confirmation… (testnet, no real funds)'
    const data = LB_SUBMIT_SELECTOR + uint256Hex(lastStats.score) + uint256Hex(lastStats.kills)
    const txHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [{ from, to: LB_CONTRACT, data }]
    })
    status.textContent = `Submitted on-chain! Tx ${txHash.slice(0, 18)}… — check it on the X Layer testnet explorer.`
    btn.textContent = 'Score submitted ✓'
  } catch (err) {
    console.warn('on-chain submit failed:', err)
    status.textContent = 'Submit cancelled or failed (' + (err?.message || err).toString().slice(0, 120) + '). Your local score is still saved — try again anytime.'
    btn.disabled = false
  }
})

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
