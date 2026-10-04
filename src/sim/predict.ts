import type { Point } from './pitch'
import { step, type SimConfig, type SimInput, type SimState } from './step'

/** How far a prediction may go: up to `maxBounces` hits on a structure or board, and no more than `maxLength` world units of path. */
export type Limit = { maxBounces: number; maxLength: number }

/** The ball's predicted path from its launch position, and the points where it touched a structure or board. */
export type Path = { points: Point[]; contacts: Point[] }

/** Seconds of play a prediction may cover, a safeguard against a ball that never settles. */
const capSeconds = 60

/**
 * Pure: applies `shot` to a copy of `state` through the real `step` and records the ball's positions until `maxBounces`
 * bounces or `maxLength` of path (the last segment cut there), whichever comes first. A goal ends it, and so does the ball
 * coming to rest. A refused shot predicts no movement. `state` is left unchanged.
 */
export function predictPath(state: SimState, shot: NonNullable<SimInput['shot']>, config: SimConfig, { maxBounces, maxLength }: Limit): Path {
  const points: Point[] = [state.ball.pos]
  const contacts: Point[] = []
  let left = maxLength
  /** Extends the path to `p`, cut where the length runs out; whether any length is left. */
  const reach = (p: Point): boolean => {
    const last = points.at(-1)!
    const d = Math.hypot(p.x - last.x, p.y - last.y)
    if (d < left) {
      points.push(p)
      left -= d
      return true
    }
    const t = d ? left / d : 0
    points.push({ x: last.x + (p.x - last.x) * t, y: last.y + (p.y - last.y) * t })
    return false
  }
  let r = step(structuredClone(state), { shot }, config)
  if (!r.events.some((e) => e.type === 'shot-fired')) return { points, contacts }
  for (let tick = 0; tick < capSeconds * config.tickHz; tick++) {
    for (const e of r.events) {
      if (e.type === 'goal') {
        reach(e.at)
        return { points, contacts }
      }
      if (e.type !== 'ball-hit-wall' && e.type !== 'ball-hit-board') continue
      if (!reach(e.at)) return { points, contacts }
      contacts.push(e.at)
      if (contacts.length >= maxBounces) return { points, contacts }
    }
    if (!reach(r.state.ball.pos) || !r.state.possession.live) break
    r = step(r.state, {}, config)
  }
  return { points, contacts }
}
