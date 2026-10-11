# BreachBall

A two-player, turn-based pitch game for the browser. Each player builds walls and towers in their half, then shoots the ball pool-style (press, drag back, release) to break through and score in the opponent's goal. Runs on phones, tablets and desktops, and installs as a PWA.

## Playing

- **Play**: hot-seat, two players on one device. Tabletop mode suits a device lying flat between them.
- **Online**: peer-to-peer over WebRTC. The host shares a connection code, the guest sends a reply code back; no server needed.
- **Game modes**: **Rounds** (a set number of rounds, decided by score) or **Siege** (build once, play on; a goal earns a Defence turn).

## Getting started

Requires Node.js.

```sh
npm install
npm run dev     # start the Vite dev server
npm test        # run the Vitest suite
npm run build   # type-check and build to dist/
```

## Project layout

| Path | What lives there |
|---|---|
| `src/sim/` | The pure, deterministic simulation: `step(state, input, config)` returns the new state and that tick's events. No DOM, fixed 60 Hz tick. |
| `src/game/` | The canvas renderer (`Game` and its entity tree), input handling, the hot-seat `LocalDriver`, and the view models for the HUD. |
| `src/net/` | Online play: WebRTC peer connection and delay lockstep (only inputs are sent; the sim's determinism does the rest). |
| `src/ui/` | The React HUD, screens and overlays. |
| `src/config/` | Shared configuration. |
| `public/` | PWA manifest and icons (`scripts/icons.mjs` regenerates the PNGs from `icon.svg`). |

## Docs

- [`specs.md`](specs.md): the game's spec, architecture and tuning values.
- [`GLOSSARY.md`](GLOSSARY.md): the domain language (Shot, Tier, Ghost, Splash, Pallets, …). Use these terms in code, issues and PRs.
- [`docs/adr/`](docs/adr/): architecture decision records.
- [`docs/agents/`](docs/agents/): conventions for coding agents (issue tracker, triage labels, domain docs).

Issues are tracked in [GitHub Issues](https://github.com/george-vrancianu/BreachBall/issues).
