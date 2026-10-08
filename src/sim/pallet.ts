import { rules } from '../config/rules'
import { rollBall, type Ball } from './ball'
import { seedHash } from './match'
import type { PlayerId, Point } from './pitch'
import type { SimConfig, SimEvent } from './step'
import type { Structure } from './wall'

const P = rules.pallet
const TAU = Math.PI * 2

/** A neutral rotating arm (ADR-0009). Plain data: it holds no reference to the ball. */
export type Pallet = {
  id: number
  pivot: Point
  /** Radians in [-π, π). */
  angle: number
  /** Radians per second over the last tick (or substep). */
  omega: number
  phase: 'idle' | 'track' | 'swing'
  /** Swing direction. */
  dir: 1 | -1
  /** Angle swung so far, and the angle this swing must cover. */
  swept: number
  sweepNeed: number
  /** Ticks until it may track again. */
  cooldown: number
}

/** A Pallet's pivot spot on the map. */
export type PalletSpot = Point

/** Whether something lies within `clearance` of an Activation ring at any of `spots`: the one no-build rule. `dist` measures it from a spot (a point, a wall's centreline, a tower's cell). */
export const inActivationRing = (spots: readonly PalletSpot[], dist: (spot: PalletSpot) => number, clearance = 0): boolean => spots.some((s) => dist(s) <= P.ringRadius + clearance)

/** Seeded, deterministic: a Pallet's starting angle in [-π, π). */
export const startAngle = (seed: number, index: number): number => (seedHash(seed, index + 1) / 2 ** 32) * TAU - Math.PI

export const initialPallets = (spots: readonly PalletSpot[], seed: number): Pallet[] =>
  spots.map((pivot, id) => ({ id, pivot, angle: startAngle(seed, id), omega: 0, phase: 'idle', dir: 1, swept: 0, sweepNeed: 0, cooldown: 0 }))

type Body = { pos: Point; vel: Point }

const distToPivot = (p: Pallet, at: Point) => Math.hypot(at.x - p.pivot.x, at.y - p.pivot.y)
/** How close the ball's centre must come for a Pallet to notice it. */
const ringReach = (c: SimConfig) => P.ringRadius + c.ballRadius

const wrap = (a: number) => {
  a = (a + Math.PI) % TAU
  if (a < 0) a += TAU
  return a - Math.PI
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Seconds until the ball (moving straight) is within `d` of `p`, null if never. */
function timeToReach(p: Point, b: Body, d: number): number | null {
  const [rx, ry] = [b.pos.x - p.x, b.pos.y - p.y]
  const rr = rx * rx + ry * ry
  const rv = rx * b.vel.x + ry * b.vel.y
  const vv = b.vel.x * b.vel.x + b.vel.y * b.vel.y
  if (rr <= d * d) return 0
  if (vv < 1e-6) return null
  const disc = rv * rv - vv * (rr - d * d)
  if (disc >= 0) {
    const t = (-rv - Math.sqrt(disc)) / vv
    if (t >= 0) return t
  }
  return null
}

function closestApproach(p: Point, b: Body): { t: number; d: number } | null {
  const [rx, ry] = [b.pos.x - p.x, b.pos.y - p.y]
  const vv = b.vel.x * b.vel.x + b.vel.y * b.vel.y
  if (vv < 1e-6) return null
  const t = -(rx * b.vel.x + ry * b.vel.y) / vv
  if (t < 0) return null
  return { t, d: Math.hypot(rx + b.vel.x * t, ry + b.vel.y * t) }
}

/** When and at what arm angle the arm can meet the ball, by linear prediction; null if the ball slips past out of reach. */
function planHit(p: Point, b: Body, r: number): { t: number; angle: number } | null {
  const reach = Math.min(P.length, P.ringRadius)
  let t = timeToReach(p, b, reach * P.sweetSpot)
  if (t === null) {
    const ca = closestApproach(p, b)
    if (!ca || ca.d > reach + P.tipRadius + r) return null
    t = ca.t
  }
  return { t, angle: Math.atan2(b.pos.y + b.vel.y * t - p.y, b.pos.x + b.vel.x * t - p.x) }
}

/** Swing against the ball's orbit: head-on. */
const chooseDir = (p: Point, b: Body): 1 | -1 => ((b.pos.x - p.x) * b.vel.y - (b.pos.y - p.y) * b.vel.x > 0 ? -1 : 1)

/**
 * Advances one Pallet by `h` seconds; `ball` is the ball it may track (null when none is near). With none, a track drops to idle and a swing
 * runs on to its end, so a fast ball leaving the band never cuts a swing short. The cooldown is set here and counted down by `rollWithPallets`, per tick.
 */
function updatePallet(p: Pallet, c: SimConfig, h: number, ball: Body | null): Pallet {
  const half = (P.swingArc * Math.PI) / 360
  let { angle, phase, dir, swept, sweepNeed, cooldown } = p
  const prev = angle
  const dist = ball ? distToPivot(p, ball.pos) : Infinity
  if (phase === 'track' && (!ball || dist > ringReach(c) + P.trackSlack)) phase = 'idle'
  else if (phase === 'idle') {
    angle += P.idleSpin * h
    if (ball && cooldown <= 0 && dist < ringReach(c)) {
      phase = 'track'
      dir = chooseDir(p.pivot, ball)
    }
  }
  if (phase === 'track' && ball) {
    const plan = planHit(p.pivot, ball, c.ballRadius)
    if (plan) {
      const maxStep = P.aimRate * h
      angle += clamp(wrap(plan.angle - dir * half - angle), -maxStep, maxStep)
      // Time for the swing to travel from cocked to contact.
      if (plan.t <= half / P.swingSpeed) {
        phase = 'swing'
        swept = 0
        sweepNeed = Math.max(half * 2, wrap(plan.angle - angle) * dir + half)
      }
    } else angle += P.idleSpin * h // the ball will slip past out of reach
  }
  if (phase === 'swing') {
    const turn = P.swingSpeed * h
    angle += dir * turn
    swept += turn
    if (swept >= sweepNeed) {
      phase = 'idle'
      cooldown = P.cooldownTicks
    }
  }
  angle = wrap(angle)
  return { ...p, angle, omega: wrap(angle - prev) / h, phase, dir, swept, sweepNeed, cooldown }
}

/** The arm's tapered capsule seen from `at`: its nearest axis point, the radius there, and the vector and distance from that point to `at`. */
function nearestOnArm(p: Pallet, at: Point) {
  const L = P.length
  const [ux, uy] = [Math.cos(p.angle), Math.sin(p.angle)]
  const t = clamp((at.x - p.pivot.x) * ux + (at.y - p.pivot.y) * uy, 0, L)
  const [cx, cy] = [p.pivot.x + ux * t, p.pivot.y + uy * t]
  const pr = P.rootRadius + (P.tipRadius - P.rootRadius) * (t / L)
  const [dx, dy] = [at.x - cx, at.y - cy]
  return { ux, uy, cx, cy, pr, dx, dy, d: Math.hypot(dx, dy) }
}

/** Tapered capsule against the ball, with the arm's surface velocity (ω×r); a contact faster than `hitSpeed` (relative, arm included) is a swat that clamps the exit speed; a slower one is a plain bounce. */
function collide(p: Pallet, b: Body, c: SimConfig): { ball: Body; hit?: { speed: number; at: Point } } {
  const near = nearestOnArm(p, b.pos)
  const { ux, uy, cx, cy, pr } = near
  let { dx, dy, d } = near
  if (d >= pr + c.ballRadius) return { ball: b }
  if (d < 1e-6) [dx, dy, d] = [-uy * p.dir, ux * p.dir, 1]
  const [nx, ny] = [dx / d, dy / d]
  const pen = pr + c.ballRadius - d
  const pos = { x: b.pos.x + nx * pen, y: b.pos.y + ny * pen }
  const [qx, qy] = [cx + nx * pr - p.pivot.x, cy + ny * pr - p.pivot.y]
  const [vpx, vpy] = [-p.omega * qy, p.omega * qx]
  const vn = (b.vel.x - vpx) * nx + (b.vel.y - vpy) * ny
  if (vn >= 0) return { ball: { pos, vel: b.vel } }
  const kick = (1 + P.restitution) * vn
  let vel = { x: b.vel.x - kick * nx, y: b.vel.y - kick * ny }
  if (-vn <= P.hitSpeed) return { ball: { pos, vel } }
  const speed = Math.hypot(vel.x, vel.y)
  const out = clamp(speed, P.exitSpeed[0] * c.maxSpeed, P.exitSpeed[1] * c.maxSpeed)
  vel = speed > 1e-9 ? { x: (vel.x / speed) * out, y: (vel.y / speed) * out } : { x: nx * out, y: ny * out }
  return { ball: { pos, vel }, hit: { speed: out, at: { x: pos.x - nx * c.ballRadius, y: pos.y - ny * c.ballRadius } } }
}

/**
 * One tick of ball motion with the Pallets moving. Only while the shot is live and the ball is near a Pallet is the tick split into substeps
 * (pallets advance, the ball rolls, each arm collides); otherwise it is one plain `rollBall`, bit-identical to a map without Pallets.
 */
export function rollWithPallets(
  ball: Ball,
  objects: Structure[],
  pallets: Pallet[],
  c: SimConfig,
  { live, breaker, shooter }: { live: boolean; breaker: boolean; shooter: PlayerId },
): { ball: Ball; objects: Structure[]; pallets: Pallet[]; events: SimEvent[]; breaker: boolean } {
  const dt = 1 / c.tickHz
  const near = live && pallets.some((p) => distToPivot(p, ball.pos) <= ringReach(c) + Math.hypot(ball.vel.x, ball.vel.y) / c.tickHz + P.trackSlack)
  // Cooldown counts whole ticks.
  pallets = pallets.map((p) => ({ ...p, cooldown: Math.max(0, p.cooldown - 1) }))
  if (!near) {
    pallets = pallets.map((p) => updatePallet(p, c, dt, null))
    return { ...rollBall(ball, objects, c, breaker, shooter), pallets }
  }
  const h = dt / P.substeps
  const events: SimEvent[] = []
  const hit = new Set<number>()
  for (let i = 0; i < P.substeps; i++) {
    pallets = pallets.map((p) => updatePallet(p, c, h, ball))
    const r = rollBall(ball, objects, c, breaker, shooter, h)
    ;({ ball, objects, breaker } = r)
    events.push(...r.events)
    // A Steal stops the ball: no more collisions or rolling this tick, so the arm cannot kick a dead ball.
    if (r.events.some((e) => e.type === 'steal-triggered')) break
    for (const p of pallets) {
      const contact = collide(p, ball, c)
      ball = { ...ball, ...contact.ball }
      if (contact.hit && !hit.has(p.id)) {
        hit.add(p.id)
        events.push({ type: 'pallet-hit', pallet: p.id, ...contact.hit })
      }
    }
  }
  return { ball, objects, pallets, events, breaker }
}

/**
 * For the Ghost (ADR-0009): where a ball centre moving straight from `from` to `to` first meets a Pallet's arm, held as it is, or leaves its Activation ring
 * without having touched it; null when neither happens on this stretch. `t` is how far along (0-1), `arm` whether it was the arm (else the ring).
 * Only the stretch inside a ring is searched, at least as finely as the sim's substeps and never coarser than the arm is thick, then bisected. Cheap but not allocation-free (a point per sample); it runs only for balls with Pallets on the map.
 */
export function frozenArmStop(pallets: readonly Pallet[], from: Point, to: Point, c: SimConfig): { t: number; arm: boolean } | null {
  const [vx, vy] = [to.x - from.x, to.y - from.y]
  const vv = vx * vx + vy * vy
  const reach = ringReach(c)
  let best = Infinity
  let arm = false
  const clear = (p: Pallet, t: number) => {
    const n = nearestOnArm(p, { x: from.x + vx * t, y: from.y + vy * t })
    return n.d - n.pr - c.ballRadius
  }
  for (const p of pallets) {
    // The stretch of the segment within the ring: t in [t0, t1].
    const [rx, ry] = [from.x - p.pivot.x, from.y - p.pivot.y]
    const disc = ((rx * vx + ry * vy) / vv) ** 2 - (rx * rx + ry * ry - reach * reach) / vv
    if (vv < 1e-12 || disc < 0) continue
    const mid = -(rx * vx + ry * vy) / vv
    const [t0, t1] = [Math.max(0, mid - Math.sqrt(disc)), Math.min(1, mid + Math.sqrt(disc))]
    if (t0 > t1) continue
    let [lo, hi] = [-1, -1]
    const n = Math.max(P.substeps, Math.ceil((Math.sqrt(vv) * (t1 - t0)) / (P.tipRadius + c.ballRadius)))
    for (let i = 0; i <= n; i++) {
      const t = t0 + ((t1 - t0) * i) / n
      if (clear(p, t) < 0) {
        hi = t
        break
      }
      lo = t
    }
    if (hi >= 0) {
      if (lo >= 0) for (let i = 0; i < 12; i++) [lo, hi] = clear(p, (lo + hi) / 2) < 0 ? [lo, (lo + hi) / 2] : [(lo + hi) / 2, hi]
      if (hi < best) [best, arm] = [hi, true]
    } else if (mid + Math.sqrt(disc) < 1 && t1 < best) [best, arm] = [t1, false]
  }
  return best === Infinity ? null : { t: best, arm }
}
