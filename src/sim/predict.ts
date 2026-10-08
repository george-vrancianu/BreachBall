import type { Point } from './pitch'
import { frozenArmStop } from './pallet'
import { step, type SimConfig, type SimInput, type SimState } from './step'

/** How far a prediction may go: up to `maxBounces` hits on a structure or board, and no more than `maxLength` world units of path. */
export type Limit = { maxBounces: number; maxLength: number }

/** Where a predicted path touched something: `wall` for a structure, `board` for a board, `pallet` for a Pallet's arm (held frozen, ADR-0009). */
export type Contact = { at: Point; kind: 'wall' | 'board' | 'pallet' }

/** The ball's predicted path from its launch position, and where it touched a structure or board. */
export type Path = { points: Point[]; contacts: Contact[] }

/** Seconds of play a prediction may cover, a safeguard against a ball that never settles. */
const capSeconds = 60

/**
 * Pure: applies `shot` to a copy of `state` through the real `step` and records the ball's positions until `maxBounces`
 * bounces or `maxLength` of path (the last segment cut there), whichever comes first. A goal ends it, and so does the ball
 * coming to rest. A refused shot predicts no movement. `state` is left unchanged.
 * Pallets (ADR-0009) are frozen: the real step runs without them, and the path ends at the first contact with an arm held at its current angle
 * (a `pallet` contact), or where it leaves an Activation ring having missed the arm. No tracking and no swing, so the swat itself is not given away.
 */
export function predictPath(state: SimState, shot: NonNullable<SimInput['shot']>, config: SimConfig, { maxBounces, maxLength }: Limit): Path {
  const points: Point[] = [state.ball.pos]
  const contacts: Contact[] = []
  let left = maxLength
  /** Extends the path toward `p`, cut where the length runs out; whether it reached `p`. */
  const extendTo = (to: Point): boolean => {
    const last = points.at(-1)!
    const stop = state.pallets.length ? frozenArmStop(state.pallets, last, to, config) : null
    const p = stop ? { x: last.x + (to.x - last.x) * stop.t, y: last.y + (to.y - last.y) * stop.t } : to
    const d = Math.hypot(p.x - last.x, p.y - last.y)
    if (d <= left) {
      points.push(p)
      left -= d
      if (stop?.arm) contacts.push({ at: p, kind: 'pallet' })
      return !stop
    }
    if (left > 0) points.push({ x: last.x + ((p.x - last.x) * left) / d, y: last.y + ((p.y - last.y) * left) / d })
    left = 0
    return false
  }
  // The real step runs without the Pallets: they are frozen here, not simulated.
  let r = step(structuredClone({ ...state, pallets: [] }), { shot }, config)
  if (!r.events.some((e) => e.type === 'shot-fired')) return { points, contacts }
  for (let tick = 0; tick < capSeconds * config.tickHz; tick++) {
    for (const e of r.events) {
      if (e.type === 'goal') {
        extendTo(e.at)
        return { points, contacts }
      }
      if (e.type !== 'ball-hit-wall' && e.type !== 'ball-hit-board') continue
      if (!extendTo(e.at)) return { points, contacts }
      contacts.push({ at: e.at, kind: e.type === 'ball-hit-wall' ? 'wall' : 'board' })
      if (contacts.length >= maxBounces) return { points, contacts }
    }
    if (!extendTo(r.state.ball.pos) || !r.state.possession.live) break
    r = step(r.state, {}, config)
  }
  return { points, contacts }
}
