// i18n.js — SPLAT language support: English (default) + Mandarin (中文).
// Choice lives in localStorage 'splat-lang' ('en' | 'zh'), default 'en'.
// Static HTML uses data-i18n (text), data-i18n-html (markup) or
// data-i18n-ph (placeholder); dynamic strings use t(key, vars).
export const LANG_KEY = 'splat-lang'

export function currentLang() {
  try { return localStorage.getItem(LANG_KEY) === 'zh' ? 'zh' : 'en' } catch { return 'en' }
}

export function setLang(lang) {
  const l = lang === 'zh' ? 'zh' : 'en'
  try { localStorage.setItem(LANG_KEY, l) } catch { /* ignore */ }
  document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en'
  return l
}

const STRINGS = {
  en: {
    subtitle: 'A cute paintball arena shooter. Pick your fighter, splat the bots, and grab <b>SPLAT points</b> — the home of the <b>SPLAT</b> token, live now on Gang.fun.',
    lobbyName: 'Your lobby name',
    playBtn: 'PLAY &nbsp;&#9654;',
    keyMove: '<b>WASD</b> move',
    keyAim: '<b>Mouse</b> aim',
    keyShoot: '<b>Click</b> shoot paint',
    keyTurn: '<b>Arrows</b> turn camera',
    keyPause: '<b>Esc</b> pause',
    footnote: '100% original characters, code &amp; art — no profile photos, no sign-in.<br/>Desktop &amp; keyboard recommended. Best in Chrome / Edge.',
    tokenTitle: 'SPLAT — THE TOKEN',
    tokenLive: 'LIVE on Gang.fun — trading now',
    tokenBlurb: 'SPLAT is the token of this arena — a Gang.fun V3 bonding-curve token on BNB Chain. The token is live on the curve; it graduates to PancakeSwap at 6 BNB raised.',
    statSupply: 'TOTAL SUPPLY',
    statCurve: 'CURVE / POOL',
    statTax: 'POOL TAX (BUY / SELL)',
    statDividend: 'DIVIDEND',
    statGrad: 'GRADUATION TARGET',
    statFee: 'CREATOR FEE → PRIZE POOL',
    liveProgress: 'LIVE CURVE PROGRESS',
    liveLoading: 'Loading live progress…',
    prize: '🏆 Prize pool: the creator fee (70% of the 1% curve fee) accrues from every curve trade and funds future prizes.',
    caLabel: 'CONTRACT ADDRESS (BSC)',
    copy: 'Copy',
    copied: 'Copied ✓',
    tradeLink: 'Trade SPLAT on Gang.fun ↗',
    bscLink: 'View contract on BscScan ↗',
    howToBuy: '<b>How to buy:</b> curve trades are open only to Binance Agentic Wallets holding a .ai Agent ID — max 1% of supply per wallet. After graduation, SPLAT trades on PancakeSwap for everyone.',
    tokenNote: 'Always verify the contract address above before trading. In-game SPLAT points are game points, not tokens.',
    agentsLink: '🤖 For AI agents: join the lobby without a browser — read the agent skill ↗',
    hudScore: 'SCORE',
    hudSplatCollected: 'SPLAT COLLECTED',
    hudKills: '{kills} splats • {splat} SPLAT',
    hudHealth: 'HEALTH {hp}',
    hintBar: 'WASD move &nbsp;&bull;&nbsp; Mouse aim &nbsp;&bull;&nbsp; Click splat &nbsp;&bull;&nbsp; Arrow keys turn',
    touchHint: 'Left stick move • Drag screen to look • 🔥 to splat',
    lobbyIn: '👥 {n} in lobby',
    lobbySolo: '👥 lobby: just you',
    lobbyOffline: '👥 lobby offline — solo',
    chatTitle: '💬 Lobby chat',
    chatPh: 'Say something to the room…',
    chatSend: 'Send',
    paused: 'PAUSED — click to resume',
    splatted: 'SPLATTED!',
    go: 'GO!',
    youSplatted: 'You splatted {name}!  +100',
    splatCollected: 'SPLAT collected!  +25  •  +20 HP',
    matchOver: 'MATCH OVER',
    timesUp: "TIME'S UP!",
    champ: 'ARENA CHAMPION!',
    newRecord: 'New local record! The arena is yours.',
    finishedRank: 'You finished #{rank} on the local board. Splat more bots next time!',
    statScore: 'SCORE',
    statSplats: 'SPLATS',
    statSplatted: 'SPLATTED',
    statSplat: 'SPLAT',
    statAcc: 'ACCURACY',
    lbTitle: 'LOCAL LEADERBOARD — TOP 5',
    lbItem: '{score} pts • {kills} splats',
    chainTitle: 'ON-CHAIN LEADERBOARD — X LAYER TESTNET',
    chainStatus: 'Submit this score to the on-chain top 10 (testnet — no real funds). Needs a wallet; the game works fully without one.',
    submitBtn: 'Submit score on-chain',
    againBtn: 'PLAY AGAIN',
    changeCharBtn: 'Change character',
    noScore: 'No match score to submit yet — play a match first.',
    noWallet: 'No wallet detected in this browser. Install MetaMask (or another EVM wallet) to submit on-chain — your local score is already saved above.',
    waitingWallet: 'Waiting for wallet confirmation… (testnet, no real funds)',
    submitted: 'Submitted on-chain! Tx {tx}… — check it on the X Layer testnet explorer.',
    submittedBtn: 'Score submitted ✓',
    submitFailed: 'Submit cancelled or failed ({err}). Your local score is still saved — try again anytime.'
  },
  zh: {
    subtitle: '可爱的彩弹竞技场射击游戏。选择你的战士，击中机器人，收集 <b>SPLAT 积分</b> — 这里是 <b>SPLAT</b> 代币的家，现已在 Gang.fun 上线。',
    lobbyName: '你的大厅昵称',
    playBtn: '开始游戏 &nbsp;&#9654;',
    keyMove: '<b>WASD</b> 移动',
    keyAim: '<b>鼠标</b> 瞄准',
    keyShoot: '<b>点击</b> 喷射彩弹',
    keyTurn: '<b>方向键</b> 旋转视角',
    keyPause: '<b>Esc</b> 暂停',
    footnote: '100% 原创角色、代码与美术 — 无需头像照片，无需登录。<br/>推荐使用桌面电脑与键盘。最佳体验：Chrome / Edge。',
    tokenTitle: 'SPLAT — 代币',
    tokenLive: '已在 Gang.fun 上线 — 正在交易',
    tokenBlurb: 'SPLAT 是这个竞技场的代币 — BNB 链上 Gang.fun V3 曲线代币。代币已在曲线上交易；筹集到 6 BNB 后将毕业到 PancakeSwap。',
    statSupply: '总供应量',
    statCurve: '曲线 / 资金池',
    statTax: '资金池税（买 / 卖）',
    statDividend: '分红',
    statGrad: '毕业目标',
    statFee: '创作者费用 → 奖池',
    liveProgress: '曲线实时进度',
    liveLoading: '正在加载实时进度…',
    prize: '🏆 奖池：创作者费用（曲线交易费 1% 的 70%）将从每笔曲线交易中累积，用于未来奖品。',
    caLabel: '合约地址 (BSC)',
    copy: '复制',
    copied: '已复制 ✓',
    tradeLink: '在 Gang.fun 上交易 SPLAT ↗',
    bscLink: '在 BscScan 上查看合约 ↗',
    howToBuy: '<b>如何购买：</b>曲线交易仅限持有 .ai Agent ID 的 Binance 智能钱包 — 每个钱包最多购买供应量的 1%。毕业后，SPLAT 将在 PancakeSwap 上向所有人开放交易。',
    tokenNote: '交易前请务必核对上方合约地址。游戏内的 SPLAT 积分只是游戏积分，不是代币。',
    agentsLink: '🤖 面向 AI 智能体：无需浏览器即可加入大厅 — 阅读智能体指南 ↗',
    hudScore: '得分',
    hudSplatCollected: '已收集 SPLAT',
    hudKills: '{kills} 次击中 • {splat} SPLAT',
    hudHealth: '生命值 {hp}',
    hintBar: 'WASD 移动 &nbsp;&bull;&nbsp; 鼠标瞄准 &nbsp;&bull;&nbsp; 点击喷射 &nbsp;&bull;&nbsp; 方向键转向',
    touchHint: '左摇杆移动 • 拖动屏幕环视 • 🔥 喷射',
    lobbyIn: '👥 大厅有 {n} 人',
    lobbySolo: '👥 大厅只有你',
    lobbyOffline: '👥 大厅离线 — 单人模式',
    chatTitle: '💬 大厅聊天',
    chatPh: '和大家说点什么…',
    chatSend: '发送',
    paused: '已暂停 — 点击继续',
    splatted: '你被击中了！',
    go: '开始！',
    youSplatted: '你击中了 {name}！+100',
    splatCollected: '收集 SPLAT！+25 • +20 生命值',
    matchOver: '比赛结束',
    timesUp: '时间到！',
    champ: '竞技场冠军！',
    newRecord: '新的本地纪录！竞技场属于你。',
    finishedRank: '你在本地榜上排名第 {rank}。下次多击中一些机器人！',
    statScore: '得分',
    statSplats: '击中',
    statSplatted: '被击中',
    statSplat: 'SPLAT',
    statAcc: '命中率',
    lbTitle: '本地排行榜 — 前 5 名',
    lbItem: '{score} 分 • {kills} 次击中',
    chainTitle: '链上排行榜 — X LAYER 测试网',
    chainStatus: '将你的得分提交到链上前 10 名（测试网 — 无需真实资金）。需要钱包；没有钱包也能正常游戏。',
    submitBtn: '链上提交得分',
    againBtn: '再玩一次',
    changeCharBtn: '更换角色',
    noScore: '还没有比赛得分 — 先玩一局。',
    noWallet: '浏览器中未检测到钱包。请安装 MetaMask（或其他 EVM 钱包）以链上提交 — 你的本地得分已保存。',
    waitingWallet: '等待钱包确认…（测试网，无需真实资金）',
    submitted: '已提交上链！交易 {tx}… — 请在 X Layer 测试网浏览器中查看。',
    submittedBtn: '得分已提交 ✓',
    submitFailed: '提交已取消或失败（{err}）。你的本地得分已保存 — 随时可以重试。'
  }
}

export function t(key, vars) {
  const lang = currentLang()
  let s = (STRINGS[lang] && STRINGS[lang][key]) ?? STRINGS.en[key] ?? key
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll('{' + k + '}', String(v))
  return s
}

// Apply the current language to every [data-i18n] / [data-i18n-html] /
// [data-i18n-ph] element in the document.
export function applyStaticI18n() {
  const lang = currentLang()
  const pick = (key) => (STRINGS[lang] && STRINGS[lang][key]) ?? STRINGS.en[key]
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const v = pick(el.dataset.i18n)
    if (v != null) el.textContent = v
  })
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const v = pick(el.dataset.i18nHtml)
    if (v != null) el.innerHTML = v
  })
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    const v = pick(el.dataset.i18nPh)
    if (v != null) el.placeholder = v
  })
}
