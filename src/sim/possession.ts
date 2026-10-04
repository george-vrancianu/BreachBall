import { rules } from '../config/rules'
import { centreSpot, halfOf, type PlayerId, type Point } from './pitch'
import { insideTower, nearestOnWall } from './near'
import type { SimConfig, SimEvent, SimState } from './step'
import type { Structure } from './wall'

/** `live`: a shot has been fired and the ball has not come to rest yet. */
export type Possession = { shooter: PlayerId; shots: number; inHand: boolean; live: boolean }

/** Who is expected to act: the builder during a build turn, else whoever owes a defence choice, else the shooter. */
export const whoActs = (s: SimState): PlayerId => s.match.builder ?? s.match.choosing ?? s.possession.shooter

export const opponent = (p: PlayerId): PlayerId => (p === 1 ? 2 : 1)

/** Own half strictly (not the line), inside the boards, clear of every wall and of every Activation ring (the whole ball, as for a wall). The no-build zone does not apply. */
export function canPlaceBall(player: PlayerId, at: Point, objects: Structure[], c: SimConfig): boolean {
  const r = c.ballRadius
  return (
    halfOf(at.y) === player &&
    at.x >= r && at.x <= rules.pitchWidth - r && at.y >= rules.board && at.y <= rules.pitchHeight - rules.board &&
    objects.every((w) => nearestOnWall(w, at).dist > r + rules.wallHalf && !insideTower(w, at)) &&
    c.pallets.every((p) => Math.hypot(at.x - p.x, at.y - p.y) > r + rules.pallet.ringRadius)
  )
}

/** A fresh possession for `shooter` with a full set of Move points, and the event announcing it. `inHand` is for a Steal only (ADR-0006). */
export const handOver = (shooter: PlayerId, inHand: boolean, c: SimConfig): { possession: Possession; events: SimEvent[] } => ({
  possession: { shooter, shots: c.shots, inHand, live: false },
  events: [{ type: 'possession-changed', shooter, inHand }],
})

/** A Centre-spot restart: the opponent of `loser` gets a fresh possession, and the ball goes fixed on the centre spot (ADR-0006). */
export function centreRestart(loser: PlayerId, c: SimConfig): { possession: Possession; events: SimEvent[]; ball: Point } {
  return { ...handOver(opponent(loser), false, c), ball: centreSpot() }
}

/** Called once the ball has come to rest after a shot: only its resting half matters. `ball` is set when the ball is moved (a Centre-spot restart). */
export function resolveRest(p: Possession, ballY: number, c: SimConfig): { possession: Possession; events: SimEvent[]; ball?: Point } {
  const half = halfOf(ballY)
  if (half === opponent(p.shooter)) return handOver(half, false, c)
  return p.shots > 1 ? { possession: { ...p, shots: p.shots - 1, live: false }, events: [] } : centreRestart(p.shooter, c)
}
