# X Arena

**Live demo:** https://x-arena.pages.dev/
**GitHub:** https://github.com/Goatleaf12/x-arena

A cute cartoon 3D arena shooter in the browser — pick your fighter, splat the bots,
and collect OKB coins inside an arena built on **X Layer**.

Built for the **X Layer TapeOut Accelerate** hackathon (100,000 USDT pool).
100% original characters, code and art. No profile photos, no sign-in, no wallet needed to play.

## Play

- **WASD** — move
- **Mouse** — aim (click the game to capture the mouse)
- **Click** — shoot paint
- **Arrow keys** — turn the camera (also works without mouse capture)
- **M** — mute / unmute
- **Esc** — pause

Match length: 2 minutes. Splat a bot = **+100 points**. OKB coin = **+25 points, +20 HP**.
Top 5 scores are kept in a local leaderboard (browser localStorage).

## On-chain leaderboard (X Layer testnet)

Scores can also be submitted to a smart contract on **X Layer testnet (chain 1952)** —
fully optional, no wallet needed to play.

- Contract: `0xBE230D902B60216251ccDfC70bCE80b073754ac0` (`contracts/XArenaLeaderboard.sol`)
- Deploy tx: `0x7f75f168ff873d83c5936eab0dd8b1207c0ef6cea73887fbea10390ca37e7d57`
- Address + ABI: `contracts/XArenaLeaderboard.json`
- End screen → **"Submit score on-chain"** (connects the player's own wallet, switches to
  testnet 1952, sends `submitScore(score, kills)`). First on-chain entry is a deploy
  smoke test (100 pts, 3 splats, from the deployer).
- Read the top 10: `cast call 0xBE230D902B60216251ccDfC70bCE80b073754ac0 "getTop10()((address,uint256,uint256,uint256)[10],uint256)" --rpc-url https://xlayer-testnet.drpc.org`

## Characters

| Fighter | Style |
| --- | --- |
| **Momo** | Bouncy pink bunny |
| **Bibo** | Chill purple bear with an afro |
| **Kiko** | Sneaky teal cat |
| **Pipi** | Sunny yellow chick |

## Run locally

```bash
npm install
npm run build   # outputs fully self-contained static files in dist/
npm run preview # serves dist/ on http://localhost:4173
```

## Tech

- Three.js (vendored via npm, bundled by Vite — **no CDN, no external fetches**)
- All textures are generated on canvas at runtime; all models are built from primitives
- Static site only — no server, no backend

## Roadmap

- **Phase 1 (done):** playable prototype — arena, 4 characters, bot AI, scoring, OKB pickups, local leaderboard
- **Phase 2 (done):** on-chain leaderboard contract on X Layer testnet (chain 1952), wallet-optional score submission — contract `0xBE230D902B60216251ccDfC70bCE80b073754ac0`
- **Phase 3:** publish as a DeWEB site on X Layer mainnet via TapeOut (every byte on-chain), demo video, hackathon submission

## License

MIT
