import { describe, expect, it } from 'vitest'
import { rules } from '../config/rules'
import { canPlaceBall } from './possession'
import { defaultConfig as c, step, type SimState } from './step'
import { playState, hseg } from './testkit'
import { type Wall } from './wall'

const at = (y: number, x = 20) => ({ x, y })
const base = (ball: { x: number; y: number }, shooter: 1 | 2 = 1, shots = 3): SimState => ({
  ...playState(),
  ball: { pos: ball, vel: { x: 0, y: 0 }, rolled: 0 },
  possession: { shooter, shots, inHand: false, live: false },
})
/** A soft shot along the ball's row, stepped until it rests: still one shot. Returns the last tick and every event. */
const miss = (s: SimState) => {
  let r = step(s, { shot: { player: s.possession.shooter, dir: { x: 1, y: 0 }, tier: 0, power: 0.15 } }, c)
  const events = [...r.events]
  while (r.state.possession.live) (r = step(r.state, {}, c)), events.push(...r.events)
  return { state: r.state, events }
}

describe('possession', () => {
  it('starts with the configured shots', () => {
    expect(playState().possession.shots).toBe(c.shots)
    expect(c.shots).toBe(3)
  })
  it('does nothing until the ball rests', () => {
    const r = step(base(at(80)), { shot: { player: 1, dir: { x: 0, y: -1 }, tier: 1, power: 1 } }, c)
    expect(r.state.ball.vel.y).not.toBe(0)
    expect(r.state.possession).toEqual({ shooter: 1, shots: 3, inHand: false, live: true })
    expect(r.events.some((e) => e.type === 'possession-changed')).toBe(false)
  })
  it('burns a shot when the ball rests on the shooter half', () => {
    expect(miss(base(at(80))).state.possession).toEqual({ shooter: 1, shots: 2, inHand: false, live: false })
  })
  it('switches possession with a fresh counter when the ball rests on the opponent half', () => {
    const s = { ...base(at(30), 1, 2), possession: { shooter: 1 as const, shots: 2, inHand: false, live: true } }
    const r = step(s, {}, c)
    expect(r.state.possession).toEqual({ shooter: 2, shots: 3, inHand: false, live: false })
    expect(r.events).toContainEqual({ type: 'possession-changed', shooter: 2, inHand: false })
    expect(r.state.ball.pos.y).toBeLessThan(54)
  })
  it('gives the opponent a Centre-spot restart with a fresh counter when shots run out', () => {
    const r = miss(base(at(80), 1, 1))
    expect(r.state.possession).toEqual({ shooter: 2, shots: 3, inHand: false, live: false })
    expect(r.state.ball.pos).toEqual({ x: 20, y: 54 })
    expect(r.state.ball.vel).toEqual({ x: 0, y: 0 })
    expect(r.events).toContainEqual({ type: 'possession-changed', shooter: 2, inHand: false })
  })
  it('keeps the shooter and burns a shot when the center is exactly on the halfway line', () => {
    const r = miss(base(at(54)))
    expect(r.state.possession).toMatchObject({ shooter: 1, shots: 2 })
    expect(r.events.some((e) => e.type === 'possession-changed')).toBe(false)
  })
  it('only the shooter may shoot', () => {
    const r = step(base(at(80)), { shot: { player: 2, dir: { x: 0, y: 1 }, tier: 0, power: 0.4 } }, c)
    expect(r.events).toEqual([{ type: 'refused' }])
    expect(r.state.possession.live).toBe(false)
  })
  it('refuses a shot while ball-in-hand is pending', () => {
    const s = { ...base(at(30), 2), possession: { shooter: 2 as const, shots: 3, inHand: true, live: false } }
    expect(step(s, { shot: { player: 2, dir: { x: 0, y: 1 }, tier: 0, power: 0.4 } }, c).events).toEqual([{ type: 'refused' }])
  })
})

describe('ball-in-hand', () => {
  const wall: Wall = { kind: 'wall', owner: 2, ...hseg(10, 20), id: 1, segments: [rules.wallHp] }
  const inHand: SimState = { ...base(at(80), 2), objects: [wall], possession: { shooter: 2, shots: 3, inHand: true, live: false } }
  const place = (p: { x: number; y: number }, player: 1 | 2 = 2) => step(inHand, { placeBall: { player, at: p } }, c)

  it('places the ball on a legal point of the own half and ends ball-in-hand', () => {
    const r = place(at(30, 12))
    expect(r.state.ball.pos).toEqual(at(30, 12))
    expect(r.state.possession).toEqual({ shooter: 2, shots: 3, inHand: false, live: false })
  })
  it('allows the no-build zone', () => {
    expect(canPlaceBall(2, at(5, 20), [], c)).toBe(true)
  })
  it('requires the center strictly on own side', () => {
    expect(canPlaceBall(2, at(54), [], c)).toBe(false)
    expect(canPlaceBall(2, at(60), [], c)).toBe(false)
    expect(canPlaceBall(2, at(53.9), [], c)).toBe(true)
  })
  it('rejects a point overlapping a wall, accepts just clear of it', () => {
    expect(canPlaceBall(2, at(40, 22), [wall], c)).toBe(false) // on the wall (x 20..24 at y 40)
    expect(canPlaceBall(2, at(41.5, 22), [wall], c)).toBe(true)
    expect(canPlaceBall(2, at(40.9, 22), [wall], c)).toBe(false)
  })
  it('rejects points outside the boards', () => {
    expect(canPlaceBall(2, at(30, 0.5), [], c)).toBe(false)
  })
  it('refuses an illegal placement, a wrong player, or placing when not in hand', () => {
    expect(place(at(60)).events).toEqual([{ type: 'refused' }])
    expect(place(at(30), 1).events).toEqual([{ type: 'refused' }])
    expect(step(base(at(80)), { placeBall: { player: 1, at: at(90) } }, c).events).toEqual([{ type: 'refused' }])
  })
})

describe('ball-in-hand and Gaps', () => {
  const gapped: Wall = { kind: 'wall', owner: 2, ...hseg(10, 20, 2), id: 1, segments: [0, 3] }
  it('a ball can be placed in a Gap, but not on the standing segment next to it', () => {
    // The wall runs x 20..36 along y=40; segment 0 (x 20..28) is the Gap.
    expect(canPlaceBall(2, at(40, 24), [gapped], c)).toBe(true)
    expect(canPlaceBall(2, at(40, 32), [gapped], c)).toBe(false)
  })
})
