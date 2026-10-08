import { rules } from '../../config/rules'
import type { PlayerId, Point } from '../../sim/pitch'
import { step, type SimConfig, type SimInput, type SimState } from '../../sim/step'
import type { StructureSpec, TowerPower, Vertex } from '../../sim/wall'

/**
 * A Strategy: a ready-made defence layout the builder can drop in one tap from the build dock. Pieces are authored on Player 1's half
 * (goal at the bottom, y = pitchHeight) and point-reflected for Player 2, so each player sees the same shape from their own end.
 * Order matters: pieces are placed first to last and a piece the builder cannot afford is skipped, so the core of the layout goes first.
 * `core` is how many leading pieces form the essential shape: it must fit one later round's Credits per round and, in Siege, the default Wall points (30) and the tower stock, so a poorer round still drops it.
 */
export type StrategyPiece = { kind: 'wall'; a: Point; b: Point } | { kind: 'tower'; power: TowerPower; at: Vertex }
export type Strategy = { id: string; name: string; core: number; pieces: StrategyPiece[] }

const { unit } = rules.wall
/** One and two wall units along a 45 degree diagonal, per axis. */
const d1 = unit * Math.SQRT1_2
const d2 = 2 * d1
const wall = (ax: number, ay: number, bx: number, by: number): StrategyPiece => ({ kind: 'wall', a: { x: ax, y: ay }, b: { x: bx, y: by } })
const tower = (power: TowerPower, gx: number, gy: number): StrategyPiece => ({ kind: 'tower', power, at: { gx, gy } })

/** A V of two 1-unit diagonals, apex down, its top corners at `(x, y)` and `(x + d2, y)`. */
const vee = (x: number, y: number): StrategyPiece[] => [wall(x, y, x + d1, y + d1), wall(x + d1, y + d1, x + d2, y)]

/**
 * The layouts on offer, each placing whole within the Opening Credits (in Rounds; Siege pays walls in Wall points and towers from its stock) and spending within
 * five of them (with Pallets off), so no Strategy is lean. With Pallets on, a piece inside an Activation ring is skipped: 10 of the 16 (Bulwark, Honeycomb, Bastion, Labyrinth, Chevron, Zigzag, Pinball, Wings, Gauntlet, Spider) lose 1 to 4 pieces and spend 1 to 12 Credits less (Bastion 24 against 36). Grouped by archetype: wall-heavy, then hybrid, then tower-heavy. No layout seals the pitch: every one leaves a path from the Kick-off spot to the goal mouth.
 */
export const STRATEGIES: readonly Strategy[] = [
  // Wall-heavy. Full rows, most of them doubled, with offset gaps (sides, middle, right), so the ball must weave: the goal-side row and a Steal at its seam are the core, one Repulsor up the pitch.
  {
    id: 'bulwark',
    name: 'Bulwark',
    core: 3,
    pieces: [
      wall(4, 88, 20, 88), wall(20, 88, 36, 88), tower('steal', 9, 40), wall(4, 90, 20, 90),
      wall(20, 90, 36, 90), wall(0, 76, 16, 76), wall(24, 76, 40, 76), wall(0, 78, 16, 78),
      wall(24, 78, 40, 78), wall(4, 64, 20, 64), wall(20, 64, 36, 64), wall(4, 66, 20, 66),
      wall(20, 66, 36, 66), wall(0, 70, 16, 70), wall(16, 70, 32, 70), tower('repulsor', 3, 29),
    ],
  },
  // Wall-heavy, the full opening budget: two full-width rows with offset gaps (the core), end caps against the board banks, split rows in front of the goal, extra rows up front, one Repulsor and one Steal.
  {
    id: 'fortress',
    name: 'Fortress',
    core: 4,
    pieces: [
      wall(0, 66, 16, 66), wall(16, 66, 32, 66), wall(8, 80, 24, 80), wall(24, 80, 40, 80),
      wall(0, 79, d1, 79 - d1), wall(40, 79, 40 - d1, 79 - d1), wall(0, 95, d2, 95 - d2), wall(40, 95, 40 - d2, 95 - d2),
      wall(4, 92, 12, 92), wall(28, 92, 36, 92), wall(0, 96, 8, 96), wall(32, 96, 40, 96),
      wall(8, 76, 24, 76), wall(24, 76, 32, 76), wall(0, 60, 16, 60), wall(24, 60, 40, 60),
      wall(16, 85, 24, 85), tower('steal', 9, 44), tower('repulsor', 9, 31),
    ],
  },
  // Wall-heavy. A lattice of short staggered diagonals (Vs in offset rows, edge stubs) that bleeds the ball's speed over many contacts: the first two rows of Vs (y 62 and 69) are the core, then more rows, one Steal and one Repulsor.
  {
    id: 'honeycomb',
    name: 'Honeycomb',
    core: 8,
    pieces: [
      ...vee(2, 62), ...vee(20, 62), ...vee(11, 69), ...vee(28, 69),
      ...vee(2, 76), ...vee(20, 76), ...vee(11, 83), ...vee(28, 83),
      ...vee(2, 90), ...vee(28, 90), wall(0, 69, d1, 69 + d1), wall(40, 62, 40 - d1, 62 + d1),
      wall(0, 83, d1, 83 + d1), wall(40, 76, 40 - d1, 76 + d1), ...vee(28, 55), ...vee(2, 55),
      tower('steal', 9, 45), tower('repulsor', 15, 30),
    ],
  },
  // Wall-heavy. A box with chamfered corners just outside the goal no-build zone, plus a forward screen: the closed box, chamfered at all four corners, is the core; the screen is three rows with alternating gaps
  // (middle, edges, middle) and short stubs ahead of it, then posts at the goal corners and two Repulsors up front.
  {
    id: 'bastion',
    name: 'Bastion',
    core: 8,
    pieces: [
      wall(12, 84 - d2, 28, 84 - d2), wall(12, 84 - d2, 12 - d1, 84 - d1), wall(28, 84 - d2, 28 + d1, 84 - d1), wall(12 - d1, 84 - d1, 12 - d1, 92 - d1),
      wall(28 + d1, 84 - d1, 28 + d1, 92 - d1), wall(12 - d1, 92 - d1, 12, 92), wall(28 + d1, 92 - d1, 28, 92), wall(12, 92, 28, 92),
      wall(0, 68, 16, 68), wall(24, 68, 40, 68), wall(4, 64, 20, 64), wall(20, 64, 36, 64),
      wall(2, 60, 18, 60), wall(22, 60, 38, 60), wall(0, 56, 8, 56), wall(32, 56, 40, 56),
      wall(0, 96, 8, 96), wall(32, 96, 40, 96), tower('repulsor', 5, 28), tower('repulsor', 14, 28),
    ],
  },
  // Wall-heavy. Nine rows in alternating patterns, a gap in the middle and gaps at both edges, built from the goal out: no straight lane at any depth.
  {
    id: 'layers',
    name: 'Layers',
    core: 4,
    pieces: [
      wall(0, 92, 16, 92), wall(24, 92, 40, 92), wall(4, 88, 20, 88), wall(20, 88, 36, 88),
      wall(0, 84, 16, 84), wall(24, 84, 40, 84), wall(4, 80, 20, 80), wall(20, 80, 36, 80),
      wall(0, 76, 16, 76), wall(24, 76, 40, 76), wall(4, 72, 20, 72), wall(20, 72, 36, 72),
      wall(0, 68, 16, 68), wall(24, 68, 40, 68), wall(4, 64, 20, 64), wall(20, 64, 36, 64),
      wall(0, 60, 16, 60), wall(24, 60, 40, 60),
    ],
  },
  // Wall-heavy. Long offset baffles, each leaving one end open and alternating sides, force an S-shaped path before the goal no-build zone (the two goal-side baffles are the core), with a Steal and a Repulsor up front.
  {
    id: 'labyrinth',
    name: 'Labyrinth',
    core: 4,
    pieces: [
      wall(8, 92, 24, 92), wall(24, 92, 40, 92), wall(0, 86, 16, 86), wall(16, 86, 32, 86),
      wall(8, 80, 24, 80), wall(24, 80, 40, 80), wall(0, 74, 16, 74), wall(16, 74, 32, 74),
      wall(8, 68, 24, 68), wall(24, 68, 40, 68), wall(0, 62, 16, 62), wall(16, 62, 32, 62),
      wall(0, 60, 8, 60), wall(32, 56, 40, 56), tower('steal', 18, 29), tower('repulsor', 3, 28),
    ],
  },
  // Hybrid. Three nested arrowheads pointing up the pitch (the first, with its Steal, is the core) and a small one before the goal: shots off their faces glance to the sides; board stubs, goal-line posts and two forward Repulsors.
  {
    id: 'chevron',
    name: 'Chevron',
    core: 3,
    pieces: [
      wall(20, 78, 20 - d2, 78 + d2), wall(20, 78, 20 + d2, 78 + d2), tower('steal', 9, 43), wall(20, 64, 20 - d2, 64 + d2),
      wall(20, 64, 20 + d2, 64 + d2), wall(20, 71, 20 - d2, 71 + d2), wall(20, 71, 20 + d2, 71 + d2), wall(20, 88, 20 - d1, 88 + d1),
      wall(20, 88, 20 + d1, 88 + d1), wall(0, 96, 8, 96), wall(32, 96, 40, 96), wall(0, 62, d1, 62 + d1),
      wall(40, 62, 40 - d1, 62 + d1), wall(0, 72, d1, 72 + d1), wall(40, 72, 40 - d1, 72 + d1), wall(0, 80, d1, 80 + d1),
      wall(40, 80, 40 - d1, 80 + d1), tower('repulsor', 2, 29), tower('repulsor', 17, 29),
    ],
  },
  // Hybrid. Staggered lanes, no straight line to the goal: two rows and a deflector are the core; more rows, board hooks, two Repulsors and a Steal.
  {
    id: 'zigzag',
    name: 'Zigzag',
    core: 3,
    pieces: [
      wall(2, 70, 18, 70), wall(22, 81, 38, 81), wall(8, 92, 8 + d1, 92 - d1), wall(18, 70, 26, 70),
      wall(14, 81, 22, 81), wall(22, 62, 38, 62), wall(14, 62, 22, 62), wall(2, 92, 18, 92),
      wall(18, 92, 26, 92), wall(2, 70, 2 + d1, 70 - d1), wall(2, 92, 2 + d1, 92 - d1), wall(38, 62, 38 - d1, 62 - d1),
      wall(40, 86, 40 - d1, 86 + d1), wall(26, 92, 26 + d1, 92 - d1), wall(38, 81, 38 - d1, 81 - d1), wall(40, 71, 40 - d1, 71 + d1),
      wall(0, 82, d1, 82 + d1), tower('repulsor', 3, 30), tower('repulsor', 13, 29), tower('steal', 9, 44),
    ],
  },
  // Hybrid. A V-funnel (the core, with a Steal) steers the ball into a closed cup, flared at the rim, with a back row, board stubs, two Repulsors and a Steal at the rear.
  {
    id: 'net',
    name: 'Net',
    core: 3,
    pieces: [
      wall(4, 64, 4 + d2, 64 + d2), wall(36, 64, 36 - d2, 64 + d2), tower('steal', 9, 37), wall(4 + d2, 64 + d2, 4 + d2, 72 + d2),
      wall(36 - d2, 64 + d2, 36 - d2, 72 + d2), wall(16, 82, 24, 82), wall(4, 64, 4 + d1, 64 - d1), wall(36, 64, 36 - d1, 64 - d1),
      wall(4 + d2, 72 + d2, 4 + d2 - d1, 72 + d2 + d1), wall(36 - d2, 72 + d2, 36 - d2 + d1, 72 + d2 + d1), wall(4, 92, 20, 92), wall(20, 92, 36, 92),
      wall(0, 78, 8, 78), wall(32, 78, 40, 78), tower('repulsor', 2, 41), tower('repulsor', 17, 41),
      tower('steal', 9, 44),
    ],
  },
  // Hybrid. Diagonal bumpers and a diamond bank shots around two Repulsors (the core is the upper pair and the first Repulsor), with board stubs and a Steal.
  {
    id: 'pinball',
    name: 'Pinball',
    core: 3,
    pieces: [
      wall(2, 62, 2 + d2, 62 + d2), wall(38, 62, 38 - d2, 62 + d2), tower('repulsor', 8, 34), tower('repulsor', 11, 34),
      wall(14, 86, 14 - d2, 86 + d2), wall(26, 86, 26 + d2, 86 + d2), wall(20, 83 - d1, 20 + d1, 83), wall(20 + d1, 83, 20, 83 + d1),
      wall(20, 83 + d1, 20 - d1, 83), wall(20 - d1, 83, 20, 83 - d1), wall(0, 76, d1, 76 + d1), wall(40, 76, 40 - d1, 76 + d1),
      wall(0, 84, d1, 84 + d1), wall(40, 84, 40 - d1, 84 + d1), wall(6, 56, 6 + d2, 56 + d2), wall(34, 56, 34 - d2, 56 + d2),
      wall(16, 92, 24, 92), tower('steal', 9, 36),
    ],
  },
  // Hybrid. Diagonals guard both side boards with a Repulsor holding the open centre (the core), then a second pair, short baffles, a back row, two Steals and a Repulsor.
  {
    id: 'wings',
    name: 'Wings',
    core: 3,
    pieces: [
      wall(2, 60, 2 + d2, 60 + d2), wall(38, 60, 38 - d2, 60 + d2), tower('repulsor', 9, 36), wall(2, 76, 2 + d2, 76 + d2),
      wall(38, 76, 38 - d2, 76 + d2), wall(4, 92, 20, 92), wall(20, 92, 36, 92), wall(12, 60, 12 + d1, 60 + d1),
      wall(28, 60, 28 - d1, 60 + d1), wall(16, 74, 24, 74), wall(16, 85, 24, 85), wall(0, 96, 8, 96),
      wall(32, 96, 40, 96), tower('steal', 6, 40), tower('steal', 13, 40), tower('repulsor', 3, 29),
    ],
  },
  // Hybrid. A walled corridor up the centre invites the shot in, with a Steal at its end (the core), capped at the throat, with Repulsors and short flank posts in the side lanes.
  {
    id: 'gauntlet',
    name: 'Gauntlet',
    core: 5,
    pieces: [
      wall(12, 62, 12, 78), wall(12, 78, 12, 86), wall(28, 62, 28, 78), wall(28, 78, 28, 86),
      tower('steal', 9, 43), wall(12, 86, 12 + d1, 86 + d1), wall(28, 86, 28 - d1, 86 + d1), wall(12, 62, 12 - d1, 62 - d1),
      wall(28, 62, 28 + d1, 62 - d1), wall(16, 92.5, 24, 92.5), tower('repulsor', 3, 40), tower('repulsor', 16, 40),
      wall(0, 92, 8, 92), wall(32, 92, 40, 92), wall(0, 70, 8, 70), wall(32, 70, 40, 70),
      wall(4, 76, 12, 76), wall(28, 76, 36, 76), wall(0, 86, 8, 86), wall(32, 86, 40, 86),
      wall(0, 64, 8, 64), wall(32, 64, 40, 64),
    ],
  },
  // Hybrid. A central hub of radiating diagonals around a Steal (the core is the hub, inner rays and two arms), outer rays and spokes, a back row, two Steals and a Repulsor.
  {
    id: 'spider',
    name: 'Spider',
    core: 7,
    pieces: [
      tower('steal', 9, 37), wall(18, 74, 18 - d1, 74 - d1), wall(20, 74, 20 + d1, 74 - d1), wall(18, 76, 18 - d1, 76 + d1),
      wall(20, 76, 20 + d1, 76 + d1), wall(18, 75, 10, 75), wall(20, 75, 28, 75), wall(18 - d1, 74 - d1, 18 - d2, 74 - d2),
      wall(20 + d1, 74 - d1, 20 + d2, 74 - d2), wall(18 - d1, 76 + d1, 18 - d2, 76 + d2), wall(20 + d1, 76 + d1, 20 + d2, 76 + d2), wall(19, 74, 19, 66),
      wall(19, 76, 19, 84), wall(4, 92, 20, 92), wall(20, 92, 36, 92), wall(0, 96, 8, 96),
      wall(32, 96, 40, 96), tower('steal', 3, 33), tower('steal', 15, 33), tower('repulsor', 4, 29),
    ],
  },
  // Tower-heavy. Two Repulsors on the flanks (the core), a Steal in the middle and a short wall in front of the goal, then a third Repulsor, two more Steals and flank posts.
  {
    id: 'turrets',
    name: 'Turrets',
    core: 2,
    pieces: [
      tower('repulsor', 3, 41), tower('repulsor', 16, 41), tower('steal', 9, 38), wall(16, 92, 24, 92),
      tower('steal', 3, 36), tower('steal', 16, 36), tower('repulsor', 9, 33),
      wall(0, 96, 8, 96), wall(32, 96, 40, 96), wall(12, 84, 28, 84), wall(12, 72, 28, 72), wall(0, 70, 8, 70), wall(32, 70, 40, 70),
    ],
  },
  // Tower-heavy. Repulsors and Steals in a diamond around a hub Repulsor, a fourth Steal off its corner, a row in front of the goal and short flank posts; the core is a Repulsor, a Steal and the middle of that row.
  {
    id: 'crossfire',
    name: 'Crossfire',
    core: 3,
    pieces: [
      tower('repulsor', 4, 37), tower('steal', 9, 33), wall(16, 92, 24, 92),
      tower('repulsor', 15, 37), tower('steal', 9, 42), tower('repulsor', 9, 37), tower('steal', 4, 43),
      wall(8, 92, 16, 92), wall(24, 92, 32, 92), wall(0, 96, 8, 96), wall(32, 96, 40, 96),
      wall(4, 64, 12, 64), wall(28, 64, 36, 64), wall(0, 80, 8, 80), wall(32, 80, 40, 80),
    ],
  },
  // Tower-heavy. Three Repulsors spread across the forward line, backed by a row of short walls: the core is two of the Repulsors; four Steals (two in the gaps, two behind them)
  // make up the budget. The row is four walls, open in the middle.
  {
    id: 'watchtowers',
    name: 'Watchtowers',
    core: 2,
    pieces: [
      tower('repulsor', 3, 32), tower('repulsor', 16, 32), tower('repulsor', 9, 32),
      tower('steal', 6, 35), tower('steal', 13, 35), tower('steal', 6, 39), tower('steal', 13, 39),
      wall(0, 84, 8, 84), wall(10, 84, 18, 84), wall(22, 84, 30, 84), wall(32, 84, 40, 84),
    ],
  },
]

/** A Strategy's pieces as `owner`'s structures: as authored for Player 1, point-reflected through the centre spot for Player 2. */
export function piecesFor(strategy: Strategy, owner: PlayerId): StructureSpec[] {
  const { pitchWidth: W, pitchHeight: H, cellSize } = rules
  const flip = (p: Point): Point => (owner === 1 ? p : { x: W - p.x, y: H - p.y })
  return strategy.pieces.map((p) =>
    p.kind === 'wall'
      ? { kind: 'wall', owner, a: flip(p.a), b: flip(p.b) }
      : { kind: 'tower', owner, power: p.power, at: owner === 1 ? p.at : { gx: W / cellSize - 1 - p.at.gx, gy: H / cellSize - 1 - p.at.gy } },
  )
}

/** What applying a Strategy would do now: the inputs to send (this turn's own pieces cleared and refunded, then each piece that fits), how many pieces land, and the net Credits it spends. */
export type StrategyPlan = { inputs: SimInput[]; placed: number; total: number; cost: number }

/**
 * Plans `strategy` for `builder` by running the sim itself on a copy, so the plan obeys every placing rule and price exactly.
 * Pieces from earlier turns stay (demolishing them would cost Credits); a piece that would cross one is skipped.
 */
export function planStrategy(s: SimState, builder: PlayerId, strategy: Strategy, config: SimConfig): StrategyPlan {
  // No build clock in the dry run, so it can never time the turn out.
  const dry: SimConfig = { ...config, buildTime: 0 }
  const inputs: SimInput[] = []
  let state = s
  const run = (input: SimInput): boolean => {
    const out = step(state, input, dry)
    if (out.events.some((e) => e.type === 'refused')) return false
    state = out.state
    inputs.push(input)
    return true
  }
  for (const id of s.built) if (s.objects.some((o) => o.id === id && o.owner === builder)) run({ demolish: { player: builder, wall: id } })
  const pieces = piecesFor(strategy, builder)
  let placed = 0
  for (const piece of pieces) if (run({ placeWall: piece })) placed++
  return { inputs, placed, total: pieces.length, cost: s.credits[builder] - state.credits[builder] }
}

/** One Strategy card in the build dock's tray: `cost` is the net spend (negative means a refund), `placed`/`total` how much of it fits; nothing fits greys it. */
export type StrategyCard = { id: string; name: string; pieces: StrategyPiece[]; cost: number; placed: number; total: number; disabled: boolean }

export function strategyCards(s: SimState, builder: PlayerId, config: SimConfig): StrategyCard[] {
  return STRATEGIES.map((st) => {
    const p = planStrategy(s, builder, st, config)
    return { id: st.id, name: st.name, pieces: st.pieces, cost: p.cost, placed: p.placed, total: p.total, disabled: p.placed === 0 }
  })
}
