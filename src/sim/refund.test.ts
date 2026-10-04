import { describe, expect, it } from 'vitest'
import { opponent } from './possession'
import { defaultConfig as c, initialState, step } from './step'
import { playState, roundsMatch } from './testkit'
import type { SimConfig, SimState } from './step'

/** Play with the ball placed: the shooter may shoot (or refund). */
const ready = (): SimState => {
  const s = playState()
  return { ...s, possession: { ...s.possession, inHand: false } }
}

describe('refund', () => {
  it('trades the shooter\'s unspent Move points for Credits at the refund rate', () => {
    const s = ready()
    const p = s.possession.shooter
    const r = step(s, { refund: { player: p, count: 2 } }, c)
    expect(r.state.possession.shots).toBe(1)
    expect(r.state.credits[p]).toBe(s.credits[p] + 4)
    expect(r.state.possession.shooter).toBe(p)
    expect(r.events).toContainEqual({ type: 'refunded', player: p, count: 2 })
  })
  it('refunding the last Move point gives the opponent a Centre-spot restart with a fresh counter', () => {
    const s = ready()
    const p = s.possession.shooter
    const r = step(s, { refund: { player: p, count: 3 } }, c)
    expect(r.state.possession).toEqual({ shooter: opponent(p), shots: c.shots, inHand: false, live: false })
    expect(r.events).toContainEqual({ type: 'possession-changed', shooter: opponent(p), inHand: false })
    expect(r.state.ball.pos).toEqual({ x: 20, y: 54 })
    expect(r.state.credits[p]).toBe(s.credits[p] + 6)
    expect(r.state.clock).toEqual({ left: c.shotClock * c.tickHz, expiries: 0 })
  })
  it('a full refund on the tick the shot clock runs out leaves the opponent a fresh clock and no burned shot', () => {
    const s = { ...ready(), clock: { left: 1, expiries: 0 } }
    const p = s.possession.shooter
    const r = step(s, { refund: { player: p, count: 3 } }, c)
    expect(r.state.possession).toEqual({ shooter: opponent(p), shots: c.shots, inHand: false, live: false })
    expect(r.state.clock).toEqual({ left: c.shotClock * c.tickHz, expiries: 0 })
    expect(roundsMatch(r.state).roundShots).toBe(roundsMatch(s).roundShots)
    expect(r.events.some((e) => e.type === 'shot-clock-expired')).toBe(false)
  })
  it('a shot in the same input as a full refund is refused', () => {
    const s = ready()
    const p = s.possession.shooter
    const r = step(s, { refund: { player: p, count: 3 }, shot: { player: p, dir: { x: 1, y: 0 }, tier: 0, power: 0.15 } }, c)
    expect(r.events).toContainEqual({ type: 'refused' })
    expect(r.events.some((e) => e.type === 'shot-fired')).toBe(false)
    expect(r.state.possession).toEqual({ shooter: opponent(p), shots: c.shots, inHand: false, live: false })
  })
  it('works in sudden death', () => {
    const s = ready()
    const p = s.possession.shooter
    const tied = { ...s, match: { ...roundsMatch(s), round: c.rounds + 1, score: { 1: 2, 2: 2 } } }
    const r = step(tied, { refund: { player: p, count: 1 } }, c)
    expect(r.state.credits[p]).toBe(s.credits[p] + 2)
  })
  it('never counts toward the round\'s shot cap', () => {
    const s = ready()
    const r = step(s, { refund: { player: s.possession.shooter, count: 3 } }, c)
    expect(roundsMatch(r.state).roundShots).toBe(roundsMatch(s).roundShots)
  })

  const base = ready()
  const siegeConfig = { ...c, mode: 'siege' as const }
  const siege = initialState(1, siegeConfig)
  const shooter = base.possession.shooter
  const refusals: [string, SimState, { player: 1 | 2; count: number }, SimConfig?][] = [
    ['from anyone but the shooter', base, { player: opponent(shooter), count: 1 }],
    ['with a shot in flight', { ...base, possession: { ...base.possession, live: true }, ball: { ...base.ball, vel: { x: 0, y: -30 } } }, { player: shooter, count: 1 }],
    ['during ball-in-hand placement', { ...base, possession: { ...base.possession, inHand: true } }, { player: shooter, count: 1 }],
    ['during a build turn', { ...base, match: { ...base.match, builder: shooter } }, { player: shooter, count: 1 }],
    ['while a defence choice is owed', { ...base, match: { ...base.match, choosing: opponent(shooter) } }, { player: shooter, count: 1 }],
    ['for more Move points than are left', base, { player: shooter, count: 4 }],
    ['for none', base, { player: shooter, count: 0 }],
    ['for a fraction of a Move point', base, { player: shooter, count: 1.5 }],
    ['in Siege', { ...siege, match: { ...siege.match, builder: null }, possession: base.possession }, { player: shooter, count: 1 }, siegeConfig],
  ]
  it.each(refusals)('is refused %s', (_, s, refund, config = c) => {
    const r = step(s, { refund }, config)
    expect(r.events).toContainEqual({ type: 'refused' })
    expect(r.state.credits).toEqual(s.credits)
    expect(r.state.possession.shots).toBe(s.possession.shots)
  })
})
