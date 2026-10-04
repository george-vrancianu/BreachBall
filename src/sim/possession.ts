import { rules } from '../config/rules'
import { halfOf, type PlayerId, type Point } from './pitch'
import { insideTower, nearestOnWall } from './near'
import type { SimConfig, SimEvent, SimState } from './step'
import type { Structure } from './wall'

/** `live`: a shot has been fired and the ball has not come to rest yet. */
export type Possession = { shooter: PlayerId; shots: number; inHand: boolean; live: boolean }

/** Who is expected to act: the builder during a build turn, else whoever owes a defence choice, else the shooter. */
export const whoActs = (s: SimState): PlayerId => s.match.builder ?? s.match.choosing ?? s.possession.shooter

export const opponent = (p: PlayerId): PlayerId => (p === 1 ? 2 : 1)

/** Own half strictly (not the line), inside the boards, clear of every wall. The no-build zone does not apply. */
export function canPlaceBall(player: PlayerId, at: Point, objects: Structure[], c: SimConfig): boolean {
  const r = c.ballRadius
  return (
    halfOf(at.y) === player &&
    at.x >= r && at.x <= rules.pitchWidth - r && at.y >= rules.board && at.y <= rules.pitchHeight - rules.board &&
    objects.every((w) => nearestOnWall(w, at).dist > r + rules.wallHalf && !insideTower(w, at))
  )
}

/** A fresh possession for `shooter` with a full set of Move points, and the event announcing it. */
export const handOver = (shooter: PlayerId, inHand: boolean, c: SimConfig): { possession: Possession; events: SimEvent[] } => ({
  possession: { shooter, shots: c.shots, inHand, live: false },
  events: [{ type: 'possession-changed', shooter, inHand }],
})

/** Called once the ball has come to rest after a shot: only its resting half matters. */
export function resolveRest(p: Possession, ballY: number, c: SimConfig): { possession: Possession; events: SimEvent[] } {
  const half = halfOf(ballY)
  const fresh = (shooter: PlayerId, inHand: boolean) => handOver(shooter, inHand, c)
  if (half === opponent(p.shooter)) return fresh(half, false)
  return p.shots > 1 ? { possession: { ...p, shots: p.shots - 1, live: false }, events: [] } : fresh(opponent(p.shooter), true)
}
