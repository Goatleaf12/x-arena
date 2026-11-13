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
- **Phase 2:** on-chain leaderboard contract on X Layer testnet (chain 1952), wallet-optional score submission
- **Phase 3:** publish as a DeWEB site on X Layer mainnet via TapeOut (every byte on-chain), demo video, hackathon submission

## License

MIT
