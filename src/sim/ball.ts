import { rules } from '../config/rules'
import { type PlayerId, type Point } from './pitch'
import type { SimConfig, SimEvent } from './step'
import { damageSegment, segmentAt, standingPieces, type Segment, type Structure } from './wall'

export type Ball = { pos: Point; vel: Point; /** Distance travelled, drives the rolling dot. */ rolled: number }

const seg = (x1: number, y1: number, x2: number, y2: number): Segment => ({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 } })
const NET = rules.netDepth + rules.board
/** Side boards, end boards with a goal-mouth gap, and the net box behind each goal. */
const boards: Segment[] = [
  seg(0, 0, 0, rules.pitchHeight),
  seg(rules.pitchWidth, 0, rules.pitchWidth, rules.pitchHeight),
  ...[0, rules.pitchHeight].flatMap((y) => {
    const back = y + (y === 0 ? -NET : NET)
    return [seg(0, y, rules.goalLeft, y), seg(rules.goalRight, y, rules.pitchWidth, y), seg(rules.goalLeft, y, rules.goalLeft, back), seg(rules.goalRight, y, rules.goalRight, back), seg(rules.goalLeft, back, rules.goalRight, back)]
  }),
]

/** Earliest contact (fraction t of displacement d, surface normal) of a circle of radius r moving from p by d against a zero-thickness segment. */
function sweep(p: Point, d: Point, { a, b }: Segment, r: number): { t: number; n: Point } | null {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const [ux, uy] = [(b.x - a.x) / len, (b.y - a.y) / len]
  let best: { t: number; n: Point } | null = null
  const s0 = (p.x - a.x) * -uy + (p.y - a.y) * ux
  const ds = d.x * -uy + d.y * ux
  const side = s0 < 0 ? -1 : 1
  if (ds * side < 0) {
    const t = Math.max(0, (side * r - s0) / ds)
    const u = (p.x + d.x * t - a.x) * ux + (p.y + d.y * t - a.y) * uy
    if (t <= 1 && u >= 0 && u <= len) best = { t, n: { x: -uy * side, y: ux * side } }
  }
  for (const e of [a, b]) {
    const [qx, qy] = [p.x - e.x, p.y - e.y]
    const A = d.x * d.x + d.y * d.y
    const B = qx * d.x + qy * d.y
    const disc = B * B - A * (qx * qx + qy * qy - r * r)
    if (B >= 0 || disc < 0) continue
    const t = Math.max(0, (-B - Math.sqrt(disc)) / A)
    if (t <= 1 && (!best || t < best.t)) {
      const [hx, hy] = [qx + d.x * t, qy + d.y * t]
      best = { t, n: { x: hx / Math.hypot(hx, hy), y: hy / Math.hypot(hx, hy) } }
    }
  }
  return best
}

/** One tick of ball motion: friction, then swept movement with bounces; walls hit hard enough lose hp. */
/** With `breaker`, the first structure touched is destroyed outright and the ball keeps its speed. */
export function rollBall(ball: Ball, objects: Structure[], c: SimConfig, breaker = false, shooter: PlayerId = 1): { ball: Ball; objects: Structure[]; events: SimEvent[]; breaker: boolean } {
  const dt = 1 / c.tickHz
  const decay = 0.5 ** (dt / c.halfLife)
  let { pos, vel, rolled } = ball
  vel = { x: vel.x * decay, y: vel.y * decay }
  if (Math.hypot(vel.x, vel.y) < c.restSpeed) vel = { x: 0, y: 0 }
  const events: SimEvent[] = []
  let left = 1
  // The cap only matters when wedged in a corner; the rest of that tick's motion is dropped.
  for (let i = 0; i < 8 && left > 0 && (vel.x || vel.y); i++) {
    const d = { x: vel.x * dt * left, y: vel.y * dt * left }
    let best: { t: number; n: Point; wall?: Structure; segment?: number } | null = null
    // A placed wall offers only its standing segments, so the ball passes through a Gap.
    const candidates: [Segment, Structure?, number?][] = [...boards.map((s): [Segment] => [s]), ...objects.flatMap((w) => standingPieces(w).map(({ seg, index }): [Segment, Structure, number?] => [seg, w, index]))]
    for (const [s, wall, segment] of candidates) {
      const h = sweep(pos, d, s, c.ballRadius)
      if (h && (!best || h.t < best.t)) best = { ...h, wall, segment }
    }
    const len = Math.hypot(d.x, d.y)
    if (!best) {
      pos = { x: pos.x + d.x, y: pos.y + d.y }
      rolled += len
      break
    }
    pos = { x: pos.x + d.x * best.t, y: pos.y + d.y * best.t }
    rolled += len * best.t
    left *= 1 - best.t
    const speed = Math.hypot(vel.x, vel.y)
    if (!best.wall) events.push({ type: 'ball-hit-board', speed, at: pos })
    else {
      events.push({ type: 'ball-hit-wall', wall: best.wall.id, speed, at: pos })
      if (breaker) {
        breaker = false
        // A tower goes whole; a wall loses the segment it touched, and goes only with its last.
        if (best.wall.kind === 'tower') {
          const gone = { ...best.wall, hp: 0 }
          objects = objects.filter((w) => w.id !== gone.id)
          events.push({ type: 'wall-destroyed', wall: gone, at: pos, breaker: true })
        } else {
          const r = damageSegment(objects, best.wall.id, best.segment ?? segmentAt(best.wall, pos), pos, rules.wallHp)
          objects = r.objects
          events.push(...r.events.map((e) => (e.type === 'wall-destroyed' ? { ...e, breaker: true as const } : e)))
        }
        continue
      }
      if (best.wall.kind === 'tower' && best.wall.power === 'steal' && best.wall.owner !== shooter) {
        const tower = { ...best.wall, hp: 0 }
        objects = objects.filter((w) => w.id !== tower.id)
        events.push({ type: 'steal-triggered', tower, owner: tower.owner, at: pos })
        vel = { x: 0, y: 0 }
        break
      }
      if (speed > c.damageFraction * c.maxSpeed) {
        const r = damageSegment(objects, best.wall.id, best.segment ?? 0, pos)
        objects = r.objects
        events.push(...r.events)
        // A destroyed Repulsor still fires below, so it skips the pass-through.
        if ((r.events[0].type === 'wall-destroyed' || r.events[0].type === 'segment-broken') && !(best.wall.kind === 'tower' && best.wall.power === 'repulsor')) {
          vel = { x: vel.x * c.destroyedSpeedFactor, y: vel.y * c.destroyedSpeedFactor }
          continue
        }
      }
    }
    const k = (1 + c.restitution) * (vel.x * best.n.x + vel.y * best.n.y)
    vel = { x: vel.x - k * best.n.x, y: vel.y - k * best.n.y }
    const t = best.wall
    if (t?.kind === 'tower' && t.power === 'repulsor' && !t.spent) {
      const v = Math.hypot(vel.x, vel.y)
      vel = { x: (vel.x / v) * c.maxSpeed, y: (vel.y / v) * c.maxSpeed }
      objects = objects.map((o) => (o.id === t.id ? { ...o, spent: true } : o))
      events.push({ type: 'repulsor-fired', tower: t.id, at: pos })
    }
  }
  return { ball: { pos, vel, rolled }, objects, events, breaker }
}
