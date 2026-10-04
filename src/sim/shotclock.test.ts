import { describe, expect, it } from 'vitest'
import { defaultConfig as c, step, type SimEvent, type SimInput, type SimState } from './step'
import { playState } from './testkit'

const TICKS = 15 * c.tickHz
const base = (over: Partial<SimState> = {}): SimState => ({ ...playState(), possession: { shooter: 1, shots: 3, inHand: false, live: false }, ball: { pos: { x: 20, y: 80 }, vel: { x: 0, y: 0 }, rolled: 0 }, ...over })
/** Run `n` ticks, giving `input` on the last one, collecting events. */
const run = (s: SimState, n: number, input: SimInput = {}, config = c) => {
  const events: SimEvent[] = []
  for (let i = 0; i < n; i++) {
    const r = step(s, i === n - 1 ? input : {}, config)
    s = r.state
    events.push(...r.events)
  }
  return { state: s, events }
}

describe('shot clock', () => {
  it('lasts 15 s: nothing happens before the last tick', () => {
    const r = run(base(), TICKS - 1)
    expect(r.state.possession.shots).toBe(3)
    expect(r.state.clock.left).toBe(1)
  })
  it('burns one shot on expiry and restarts the clock', () => {
    const r = run(base(), TICKS)
    expect(r.state.possession).toEqual({ shooter: 1, shots: 2, inHand: false, live: false })
    expect(r.state.clock).toEqual({ left: TICKS, expiries: 1 })
    expect(r.events).toContainEqual({ type: 'shot-clock-expired', player: 1 })
    expect(r.state.ball.pos).toEqual({ x: 20, y: 80 })
  })
  it('fires the held aim', () => {
    const aiming = { dir: { x: 0, y: -1 }, tier: 1, power: 0.6 }
    const r = run(base(), TICKS, { aiming }, { ...c, expiry: 'shoot' })
    expect(r.events).toContainEqual({ type: 'shot-fired', player: 1, from: { x: 20, y: 80 }, ...aiming })
    expect(r.state.possession.live).toBe(true)
    expect(r.state.clock.expiries).toBe(0)
  })
  it('burns the shot despite a held aim when expiry is set to burn', () => {
    const aiming = { dir: { x: 0, y: -1 }, tier: 1, power: 0.6 }
    const r = run(base(), TICKS, { aiming }, { ...c, expiry: 'burn' })
    expect(r.events.some((e) => e.type === 'shot-fired')).toBe(false)
    expect(r.state.possession).toEqual({ shooter: 1, shots: 2, inHand: false, live: false })
    expect(r.state.clock.expiries).toBe(1)
  })
  it('burns the shot when the aim was cleared', () => {
    const r = run(base(), TICKS, { aiming: null }, { ...c, expiry: 'shoot' })
    expect(r.events.some((e) => e.type === 'shot-fired')).toBe(false)
    expect(r.state.possession).toEqual({ shooter: 1, shots: 2, inHand: false, live: false })
  })
  it('places an unplaced ball (after a Steal) at the centre of the shooter half, then burns a shot', () => {
    const p = { shooter: 2 as const, shots: 3, inHand: true, live: false }
    const r = run(base({ possession: p }), TICKS)
    expect(r.state.ball.pos).toEqual({ x: 20, y: 27 })
    expect(r.state.possession).toEqual({ shooter: 2, shots: 2, inHand: false, live: false })
  })
  it('gives the opponent a Centre-spot restart on the first expiry when only one shot was left', () => {
    const r = run(base({ possession: { shooter: 1, shots: 1, inHand: false, live: false }, ball: { pos: { x: 20, y: 80 }, vel: { x: 0, y: 0 }, rolled: 0 } }), TICKS)
    expect(r.state.possession).toEqual({ shooter: 2, shots: 3, inHand: false, live: false })
    expect(r.state.ball.pos).toEqual({ x: 20, y: 54 })
  })
  it('gives the opponent a Centre-spot restart on a second consecutive expiry', () => {
    const r = run(base(), 2 * TICKS)
    expect(r.state.possession).toEqual({ shooter: 2, shots: 3, inHand: false, live: false })
    expect(r.state.ball.pos).toEqual({ x: 20, y: 54 })
    expect(r.state.clock).toEqual({ left: TICKS, expiries: 0 })
  })
  it('a fired shot breaks the consecutive streak', () => {
    let s = run(base(), TICKS).state
    s = step(s, { shot: { player: 1, dir: { x: 1, y: 0 }, tier: 0, power: 0.15 } }, c).state
    while (s.possession.live) s = step(s, {}, c).state
    s = run(s, 10).state
    expect(s.clock.expiries).toBe(0)
    expect(s.clock.left).toBe(TICKS - 10)
  })
  it('does not run while the ball is rolling', () => {
    const s = base({ ball: { pos: { x: 20, y: 80 }, vel: { x: 0, y: 5 }, rolled: 0 }, possession: { shooter: 1, shots: 3, inHand: false, live: true } })
    expect(step(s, {}, c).state.clock.left).toBe(TICKS)
  })
})
