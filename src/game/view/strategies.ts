import { rules } from '../../config/rules'
import type { PlayerId, Point } from '../../sim/pitch'
import { step, type SimConfig, type SimInput, type SimState } from '../../sim/step'
import type { StructureSpec, TowerPower, Vertex } from '../../sim/wall'

/**
 * A Strategy: a ready-made defence layout the builder can drop in one tap from the build dock. Pieces are authored on Player 1's half
 * (goal at the bottom, y = pitchHeight) and point-reflected for Player 2, so each player sees the same shape from their own end.
 * Order matters: pieces are placed first to last and a piece the builder cannot afford is skipped, so the core of the layout goes first.
 */
export type StrategyPiece = { kind: 'wall'; a: Point; b: Point } | { kind: 'tower'; power: TowerPower; at: Vertex }
export type Strategy = { id: string; name: string; pieces: StrategyPiece[] }

const { unit } = rules.wall
/** One and two wall units along a 45 degree diagonal, per axis. */
const d1 = unit * Math.SQRT1_2
const d2 = 2 * d1
const wall = (ax: number, ay: number, bx: number, by: number): StrategyPiece => ({ kind: 'wall', a: { x: ax, y: ay }, b: { x: bx, y: by } })
const tower = (power: TowerPower, gx: number, gy: number): StrategyPiece => ({ kind: 'tower', power, at: { gx, gy } })

/** The layouts on offer, each about one opening budget (10 Credits in Rounds; Siege pays walls in wall points and towers from its stock). */
export const STRATEGIES: readonly Strategy[] = [
  // A straight line across the front of the goal, with a Steal behind the seam.
  { id: 'bulwark', name: 'Bulwark', pieces: [wall(4, 88, 20, 88), wall(20, 88, 36, 88), tower('steal', 9, 40)] },
  // An arrowhead pointing up the pitch: shots off its faces glance to the sides.
  { id: 'chevron', name: 'Chevron', pieces: [wall(20, 78, 20 - d2, 78 + d2), wall(20, 78, 20 + d2, 78 + d2), tower('steal', 9, 43)] },
  // Two Repulsors on the flanks, a Steal in the middle and a short wall in front of the goal.
  { id: 'turrets', name: 'Turrets', pieces: [tower('repulsor', 4, 41), tower('repulsor', 15, 41), tower('steal', 9, 38), wall(16, 92, 24, 92)] },
  // Staggered lanes: no straight line to the goal.
  { id: 'zigzag', name: 'Zigzag', pieces: [wall(2, 70, 18, 70), wall(22, 81, 38, 81), wall(8, 92, 8 + d1, 92 - d1)] },
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
