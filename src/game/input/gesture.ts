import { rules, type Tier } from '../../config/rules'
import { visual } from '../../config/visual'
import type { Point } from '../../sim/pitch'
import type { Aiming } from '../../sim/step'

/** The canvas, in screen px, for the edge-cancel zone. */
export type Size = { w: number; h: number }

/** A press, in screen pixels and ms. `canShoot`: the player is the shooter, the ball is not in hand and no shot is in flight. */
export type Press = { at: Point; now: number; ball: Point; ballRadiusPx: number; canShoot: boolean; size: Size }

/**
 * The aim gesture, a pure state machine over screen-pixel points. `pan` for a press that was not on the ball (or an abandoned aim);
 * `holding` while the pointer stays within the slop of the press, climbing tiers (`held` ms since the press); `aiming` once it has left it, with the tier locked.
 * `centre` is the ball's on-screen centre at the press: the drag is measured from it, so the gauge's rings line up with the finger.
 * Either is cancel-armed while the pointer is in the edge zone (see `cancelArmed`).
 */
export type AimGesture = { phase: 'pan' } | { phase: 'holding' | 'aiming'; press: Point; centre: Point; since: number; at: Point; tier: number; held: number; size: Size }

/** An aim without the Breaker flag: `dir` is the way the ball goes, opposite the drag. */
export type Aim = Omit<Aiming, 'breaker'>

const tierOf = (i: number): Tier => rules.shot.tiers[i]

export function aimPress({ at, now, ball, ballRadiusPx, canShoot, size }: Press): AimGesture {
  const onBall = Math.hypot(at.x - ball.x, at.y - ball.y) <= Math.max(ballRadiusPx, visual.aim.ballHitPx)
  return canShoot && onBall ? { phase: 'holding', press: at, centre: ball, since: now, at, tier: 0, held: 0, size } : { phase: 'pan' }
}

/** The tier climbs while the pointer stays within the slop (each tier at its `holdMs`); the first move past it locks the tier. */
export function aimMove(g: AimGesture, at: Point, now: number): AimGesture {
  if (g.phase === 'pan') return g
  const climbed = g.phase === 'holding' ? { tier: tierAt(now - g.since), held: now - g.since } : {}
  const past = Math.hypot(at.x - g.press.x, at.y - g.press.y) > visual.aim.slopPx
  return { ...g, ...climbed, at, phase: g.phase === 'aiming' || past ? 'aiming' : 'holding' }
}

/** Time passing with the pointer still: the hold climbs. */
export const aimTick = (g: AimGesture, now: number): AimGesture => (g.phase === 'pan' ? g : aimMove(g, g.at, now))

/** The highest tier whose hold `ms` has reached. */
function tierAt(ms: number): number {
  return rules.shot.tiers.reduce((best, t, i) => (t.holdMs <= ms ? i : best), 0)
}

/** How far a hold of `ms` in `tier` has climbed towards the next tier, 0-1; 1 at the top tier. */
function holdProgress(tier: number, ms: number): number {
  const next = rules.shot.tiers[tier + 1]
  if (!next) return 1
  const from = tierOf(tier).holdMs
  return Math.min(1, Math.max(0, (ms - from) / (next.holdMs - from)))
}

/** Within `edgeCancelPx` of any canvas edge: releasing cancels, moving back out re-arms the same shot. */
export function cancelArmed(g: AimGesture): boolean {
  if (g.phase === 'pan') return false
  const e = visual.aim.edgeCancelPx
  const { at, size } = g
  return at.x < e || at.y < e || at.x > size.w - e || at.y > size.h - e
}

/**
 * What the gesture shows: its phase and tier, the tier's control radius in screen px and Ghost config, and the aim once there is one.
 * `cancel` while cancel-armed: the aim is still shown (greyed) though none is held.
 */
export type GestureView = { phase: 'holding' | 'aiming'; tier: number; holdProgress: number; radiusPx: number; ghost: Tier['ghost']; dir?: Point; power?: number; cancel?: true }

export function aimViewOf(g: AimGesture): GestureView | undefined {
  if (g.phase === 'pan') return undefined
  const { radiusPx, ghost } = tierOf(g.tier)
  return { phase: g.phase, tier: g.tier, holdProgress: holdProgress(g.tier, g.held), radiusPx, ghost, ...dragAim(g), ...(cancelArmed(g) && { cancel: true }) }
}

/** What a release does: a pan ends, a release with no aim (within the slop or the edge zone) cancels, anything else fires. */
export type AimResult = { type: 'pan' } | { type: 'cancelled' } | { type: 'shot'; aim: Aim }

export function aimRelease(g: AimGesture): AimResult {
  if (g.phase === 'pan') return { type: 'pan' }
  const aim = aimOf(g)
  return aim ? { type: 'shot', aim } : { type: 'cancelled' }
}

/** The aim held right now: none while panning, holding, back within the slop, or cancel-armed. */
export function aimOf(g: AimGesture): Aim | null {
  return cancelArmed(g) ? null : dragAim(g)
}

/** The aim the drag points at, cancel-armed or not, measured from the ball's centre. */
function dragAim(g: AimGesture): Aim | null {
  if (g.phase !== 'aiming') return null
  const [dx, dy] = [g.centre.x - g.at.x, g.centre.y - g.at.y]
  const d = Math.hypot(dx, dy)
  const { slopPx } = visual.aim
  if (d <= slopPx) return null
  const tier = tierOf(g.tier)
  const t = Math.min(1, (d - slopPx) / (tier.radiusPx - slopPx))
  // Eased: `direct` climbs slowly from the slop edge, `inverted` is the same curve run from the radius in.
  const e = tier.curve === 'direct' ? t : 1 - t
  const [lo, hi] = tier.power
  // Clamped so float drift never leaves the range the sim checks.
  return { dir: { x: dx / d, y: dy / d }, tier: g.tier, power: Math.min(hi, lo + (hi - lo) * e * e) }
}
