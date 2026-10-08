import { describe, expect, it } from 'vitest'
import { predictPath } from './predict'
import { defaultConfig, step, type SimEvent, type SimInput, type SimState } from './step'
import { initialPallets } from './pallet'
import { rules } from '../config/rules'
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
/** No bounce cap and no length cap: the whole path to rest. */
const unlimited = { maxBounces: Infinity, maxLength: Infinity }
const lengthOf = (ps: Point[]) => ps.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - ps[i].x, p.y - ps[i].y), 0)

describe('predictPath', () => {
  it('stops at the first board bounce for maxBounces 1', () => {
    const p = predictPath(at({ x: 10, y: 20 }), up, c, { maxBounces: 1, maxLength: Infinity })
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
    const p = predictPath(s, up, c, { maxBounces: 1, maxLength: Infinity })
    const hit = contactOf(stepUntil(s, up, (_, ev) => !!contactOf(ev)).events)!
    expect(hit.type).toBe('ball-hit-wall')
    expect(p.points.at(-1)).toEqual(hit.at)
    expect(p.contacts).toEqual([{ at: hit.at, kind: 'wall' }])
  })

  it('counts maxBounces bounces off boards', () => {
    const s = at({ x: 10, y: 20 })
    const p = predictPath(s, { ...up, dir: { x: -0.6, y: -0.8 }, tier: 1, power: 1 }, c, { maxBounces: 2, maxLength: Infinity })
    // Off the left board (x = 0), then the end board (y = 0), less the ball's radius.
    expect(p.contacts).toHaveLength(2)
    expect(p.contacts.map((b) => b.kind)).toEqual(['board', 'board'])
    expect(p.contacts[0].at.x).toBeCloseTo(1)
    expect(p.contacts[1].at.y).toBeCloseTo(1)
    expect(p.points.at(-1)).toEqual(p.contacts[1].at)
  })

  it('ends early where the stepped ball comes to rest, before its caps', () => {
    const s = at({ x: 30, y: 60 })
    const p = predictPath(s, { ...up, dir: { x: 0.6, y: -0.8 } }, c, { maxBounces: 10, maxLength: 1000 })
    const rest = stepUntil(s, { ...up, dir: { x: 0.6, y: -0.8 } }, (st) => !st.possession.live).state.ball.pos
    expect(p.points.at(-1)).toEqual(rest)
    expect(p.contacts.length).toBeGreaterThan(0)
  })

  it('stops at maxLength, cutting the last segment', () => {
    const p = predictPath(at({ x: 10, y: 20 }), up, c, { maxBounces: 1, maxLength: 5 })
    // 5 of the 19 units straight up to the end board.
    expect(p.points.at(-1)!.x).toBeCloseTo(10)
    expect(p.points.at(-1)!.y).toBeCloseTo(15)
    expect(lengthOf(p.points)).toBeCloseTo(5)
    expect(p.contacts).toEqual([])
  })
  it('stops at maxLength after a bounce, before the bounce cap', () => {
    // Off the left board 15 units along, then 2 more units toward the end board.
    const p = predictPath(at({ x: 10, y: 20 }), { ...up, dir: { x: -0.6, y: -0.8 }, tier: 1, power: 1 }, c, { maxBounces: 3, maxLength: 17 })
    expect(p.contacts).toHaveLength(1)
    expect(lengthOf(p.points)).toBeCloseTo(17)
  })
  it('counts a bounce that lands exactly at maxLength', () => {
    const full = predictPath(at({ x: 10, y: 20 }), up, c, { maxBounces: 1, maxLength: Infinity })
    const p = predictPath(at({ x: 10, y: 20 }), up, c, { maxBounces: 3, maxLength: lengthOf(full.points) })
    expect(p.contacts).toEqual(full.contacts)
    expect(p.points.at(-1)!.y).toBeCloseTo(full.contacts[0].at.y)
  })
  it('ends at the goal, before its caps', () => {
    const s = at({ x: 20, y: 10 })
    const shot = { ...up, tier: 1, power: 1 }
    const goal = stepUntil(s, shot, (_, ev) => ev.some((e) => e.type === 'goal')).events.find((e) => e.type === 'goal')!
    const p = predictPath(s, shot, c, { maxBounces: 3, maxLength: 1000 })
    expect(p.points.at(-1)).toEqual(goal.at)
    expect(p.contacts).toEqual([])
  })

  it('leaves the input state unchanged', () => {
    const s = at({ x: 10, y: 20 })
    const before = structuredClone(s)
    predictPath(s, up, c, unlimited)
    expect(s).toEqual(before)
  })

  it('predicts no movement for a refused shot', () => {
    const p = predictPath(at({ x: 10, y: 20 }), { ...up, player: 2 }, c, unlimited)
    expect(p).toEqual({ points: [{ x: 10, y: 20 }], contacts: [] })
  })
})

describe('predictPath with Pallets (frozen arm, ADR-0009)', () => {
  const pivot: Point = { x: 10, y: 30 }
  const pc = { ...c, pallets: [pivot] }
  const fast: NonNullable<SimInput['shot']> = { ...up, tier: 1, power: 1 }
  /** A shot from (x, 60) up the pitch with the Pallet's arm frozen at `angle`. */
  const withArm = (x: number, angle: number, extra: Partial<SimState['pallets'][number]> = {}): SimState => {
    const s = at({ x, y: 60 })
    return { ...s, pallets: [{ ...s.pallets[0] ?? initialPallets([pivot], 1)[0], angle, ...extra }] }
  }
  const up_ = -Math.PI / 2

  it('ends at its first contact with the frozen arm, with a pallet contact there', () => {
    // The arm points up the line of fire; the ball meets its root first: pivot + root radius + ball radius from below.
    const p = predictPath(withArm(10, up_), fast, pc, unlimited)
    expect(p.contacts).toHaveLength(1)
    expect(p.contacts[0].kind).toBe('pallet')
    expect(p.contacts[0].at.x).toBeCloseTo(10)
    expect(p.contacts[0].at.y).toBeCloseTo(pivot.y + rules.pallet.rootRadius + c.ballRadius, 1)
    expect(p.points.at(-1)).toEqual(p.contacts[0].at)
  })
  it('meets an arm lying across the path at its tapered radius', () => {
    // Arm along +x from the pivot; a ball up x = 11.5 hits it at 1.5 from the pivot, radius between root and tip.
    const p = predictPath(withArm(11.5, 0), fast, pc, unlimited)
    const r = rules.pallet.rootRadius + (rules.pallet.tipRadius - rules.pallet.rootRadius) * (1.5 / rules.pallet.length)
    expect(p.contacts.map((k) => k.kind)).toEqual(['pallet'])
    expect(p.contacts[0].at.y).toBeCloseTo(pivot.y + r + c.ballRadius, 1)
  })
  it('ends where the path leaves the Activation ring when it never touches the arm', () => {
    // Up x = 14, clear of the arm (length 2.5): inside the ring while |y - 30| <= sqrt((5 + 1)² - 4²).
    const p = predictPath(withArm(14, up_), fast, pc, unlimited)
    expect(p.contacts).toEqual([])
    expect(p.points.at(-1)!.x).toBeCloseTo(14)
    expect(p.points.at(-1)!.y).toBeCloseTo(pivot.y - Math.sqrt((rules.pallet.ringRadius + c.ballRadius) ** 2 - 16), 2)
  })
  it('ignores the arm: tracking, swinging and spin do not change the prediction', () => {
    const rest = predictPath(withArm(10, up_), fast, pc, unlimited)
    const busy = predictPath(withArm(10, up_, { phase: 'swing', omega: 20, dir: -1, swept: 1, sweepNeed: 3 }), fast, pc, unlimited)
    expect(busy).toEqual(rest)
  })
  it('follows the arm as it spins: the same shot meets it at one angle and clears it at another', () => {
    expect(predictPath(withArm(12, 0), fast, pc, unlimited).contacts.map((k) => k.kind)).toEqual(['pallet'])
    expect(predictPath(withArm(12, up_), fast, pc, unlimited).contacts).toEqual([])
  })
  it('still caps by reach before the ring and by bounces outside it', () => {
    const short = predictPath(withArm(10, up_), fast, pc, { maxBounces: 3, maxLength: 5 })
    expect(lengthOf(short.points)).toBeCloseTo(5)
    expect(short.contacts).toEqual([])
    // Away from the ring, a Pallet changes nothing.
    const s = at({ x: 30, y: 60 })
    const plain = predictPath(s, { ...fast, dir: { x: 0.6, y: -0.8 } }, c, { maxBounces: 2, maxLength: Infinity })
    const far = predictPath({ ...s, pallets: initialPallets([pivot], 1) }, { ...fast, dir: { x: 0.6, y: -0.8 } }, pc, { maxBounces: 2, maxLength: Infinity })
    expect(far).toEqual(plain)
  })
  it('leaves the Pallets of the input state unchanged', () => {
    const s = withArm(10, up_)
    const before = structuredClone(s)
    predictPath(s, fast, pc, unlimited)
    expect(s).toEqual(before)
  })
})
