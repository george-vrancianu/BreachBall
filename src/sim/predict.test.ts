import { describe, expect, it } from 'vitest'
import { predictPath } from './predict'
import { defaultConfig, step, type SimEvent, type SimInput, type SimState } from './step'
import { place, playState, hseg } from './testkit'
import type { Point } from './pitch'

const c = defaultConfig
const at = (pos: Point, s = playState()): SimState => ({ ...s, possession: { shooter: 1, shots: 3, inHand: false, live: false }, ball: { pos, vel: { x: 0, y: 0 }, rolled: 0 } })
const up: NonNullable<SimInput['shot']> = { player: 1, dir: { x: 0, y: -1 }, tier: 0, power: 0.4 }

/** Steps the shot for real until `stop` says so; returns the state and the events of that tick. */
function stepUntil(s: SimState, shot: SimInput['shot'], stop: (s: SimState, events: SimEvent[]) => boolean) {
  let r = step(s, { shot }, c)
  for (let i = 0; i < 2000 && !stop(r.state, r.events); i++) r = step(r.state, {}, c)
  return r
}
const contactOf = (events: SimEvent[]) => events.find((e) => e.type === 'ball-hit-wall' || e.type === 'ball-hit-board')

describe('predictPath', () => {
  it('stops at the first board contact for { contacts: 1 }', () => {
    const p = predictPath(at({ x: 10, y: 20 }), up, c, { contacts: 1 })
    // Straight up the left of the pitch: the ball (radius 1) meets the end board at y = 0.
    const last = p.points.at(-1)!
    expect(last.x).toBeCloseTo(10)
    expect(last.y).toBeCloseTo(1)
    expect(p.contacts).toHaveLength(1)
    expect(p.points[0]).toEqual({ x: 10, y: 20 })
  })
  it('ends where the stepped shot first touches a structure', () => {
    const walled = place({ kind: 'wall', owner: 2, ...hseg(3, 10) })
    expect(walled.events).toEqual([])
    const s = at({ x: 10, y: 40 }, walled.state)
    const p = predictPath(s, up, c, { contacts: 1 })
    const hit = contactOf(stepUntil(s, up, (_, ev) => !!contactOf(ev)).events)!
    expect(hit.type).toBe('ball-hit-wall')
    expect(p.points.at(-1)).toEqual(hit.at)
    expect(p.contacts).toEqual([hit.at])
  })

  it('counts N contacts, bouncing off boards', () => {
    const s = at({ x: 10, y: 20 })
    const p = predictPath(s, { ...up, dir: { x: -0.6, y: -0.8 }, tier: 1, power: 1 }, c, { contacts: 2 })
    // Off the left board (x = 0), then the end board (y = 0), less the ball's radius.
    expect(p.contacts).toHaveLength(2)
    expect(p.contacts[0].x).toBeCloseTo(1)
    expect(p.contacts[1].y).toBeCloseTo(1)
    expect(p.points.at(-1)).toEqual(p.contacts[1])
  })

  it('ends where the stepped ball comes to rest for "rest"', () => {
    const s = at({ x: 30, y: 60 })
    const p = predictPath(s, { ...up, dir: { x: 0.6, y: -0.8 } }, c, 'rest')
    const rest = stepUntil(s, { ...up, dir: { x: 0.6, y: -0.8 } }, (st) => !st.possession.live).state.ball.pos
    expect(p.points.at(-1)).toEqual(rest)
    expect(p.contacts.length).toBeGreaterThan(0)
  })

  it('leaves the input state unchanged', () => {
    const s = at({ x: 10, y: 20 })
    const before = structuredClone(s)
    predictPath(s, up, c, 'rest')
    expect(s).toEqual(before)
  })

  it('predicts no movement for a refused shot', () => {
    const p = predictPath(at({ x: 10, y: 20 }), { ...up, player: 2 }, c, 'rest')
    expect(p).toEqual({ points: [{ x: 10, y: 20 }], contacts: [] })
  })
})
