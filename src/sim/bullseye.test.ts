import { describe, expect, it } from 'vitest'
import { rules } from '../config/rules'
import { boostAt, bullseyeEntered, centreSpot, type Point } from './pitch'
import { defaultConfig, initialState, step, type SimConfig, type SimEvent, type SimState } from './step'
import { hseg, place, playState, roundsMatch } from './testkit'

/** No friction, so a ball keeps the speed it is given. */
const c: SimConfig = { ...defaultConfig, halfLife: Infinity }
const centre = centreSpot()
const { radius } = rules.boost.bullseye
const above = (d: number): Point => ({ x: centre.x, y: centre.y - d })
const below = (d: number): Point => ({ x: centre.x, y: centre.y + d })
/** How many ticks of `path` had the ball enter the Bullseye from outside. */
const entries = (path: Point[]) => path.slice(1).filter((p, i) => bullseyeEntered(path[i], p)).length
const paid = (events: SimEvent[]) => events.filter((e) => e.type === 'bullseye-credited')

/** A shot by player 1 in flight: the ball at `pos` moving at `vel` per second. */
const flying = (pos: Point, vel: Point, over: Partial<SimState> = {}): SimState => {
  const s = playState()
  return { ...s, possession: { shooter: 1, shots: 3, inHand: false, live: true }, ball: { pos, vel, rolled: 0 }, ...over }
}
/** Steps until the shot is over (or `max` ticks), collecting events and the ball's position after each tick (`path`, starting with where it began). */
const run = (s: SimState, cfg: SimConfig = c, max = 400) => {
  const events: SimEvent[] = []
  const path = [s.ball.pos]
  let state = s
  for (let i = 0; i < max && state.possession.live; i++) {
    const r = step(state, {}, cfg)
    state = r.state
    events.push(...r.events)
    path.push(state.ball.pos)
  }
  return { state, events, path }
}
const up = { x: 0, y: -60 }
// Some tests below use speeds far above any a shot can reach (maxSpeed is 60); that only forces a long sweep within a single tick.

/** Placements and their bookkeeping from `placed`, to hand to `flying` as overrides. */
const arena = (placed: SimState): Partial<SimState> => ({ objects: placed.objects, nextId: placed.nextId, players: placed.players, credits: placed.credits })
/** A short horizontal wall 8 units above the centre, outside the Centre zone (radius 6), for a shot to bounce off. */
const wallAbove = () => arena(place({ kind: 'wall', owner: 2, ...hseg(8, 23, 2) }).state)

describe('bullseyeEntered', () => {
  it('is true when a segment from outside reaches the circle, even through it', () => {
    expect(bullseyeEntered(below(5), below(1))).toBe(true)
    expect(bullseyeEntered(below(5), above(5))).toBe(true)
    expect(bullseyeEntered(below(5), below(radius))).toBe(true)
  })
  it('is false for a segment that misses, stays short or starts inside', () => {
    expect(bullseyeEntered(below(5), below(radius + 0.1))).toBe(false)
    expect(bullseyeEntered({ x: centre.x + radius + 1, y: centre.y + 5 }, { x: centre.x + radius + 1, y: centre.y - 5 })).toBe(false)
    expect(bullseyeEntered(centre, above(5))).toBe(false)
    expect(bullseyeEntered(below(radius), above(5))).toBe(false)
  })
  it('handles a ball that does not move', () => {
    expect(bullseyeEntered(below(5), below(5))).toBe(false)
  })
})

describe('Bullseye pass-through (Rounds)', () => {
  it('a shot entering from outside earns the shooter the Credits and announces it', () => {
    const s = flying(below(5), up)
    const r = run(s, c, 200).events
    expect(paid(r)).toEqual([{ type: 'bullseye-credited', player: 1, credits: rules.bullseyeCredits }])
  })
  it('credits the shooter, whichever player they are', () => {
    const s = flying(above(3), { x: 0, y: 600 }, { possession: { shooter: 2, shots: 3, inHand: false, live: true } })
    const r = step(s, {}, c)
    expect(r.state.credits).toEqual({ 1: s.credits[1], 2: s.credits[2] + rules.bullseyeCredits })
  })
  it('adds the Credits to what the shooter holds, and only theirs', () => {
    const before = flying(below(3), up).credits
    const r = step(flying(below(3), { x: 0, y: -600 }), {}, c)
    expect(r.state.credits).toEqual({ 1: before[1] + rules.bullseyeCredits, 2: before[2] })
  })
  it('a fast ball cannot skip over it in one tick', () => {
    const r = step(flying(below(6), { x: 0, y: -60 * 20 }), {}, c)
    expect(boostAt(r.state.ball.pos)).toBeNull()
    expect(paid(r.events)).toHaveLength(1)
  })
  it('a ball that grazes past outside earns nothing', () => {
    const s = flying({ x: centre.x + radius + c.ballRadius, y: centre.y + 5 }, up)
    expect(paid(run(s, c, 200).events)).toEqual([])
  })
  it('pays once per shot: a rebound through it again earns nothing more', () => {
    const r = run(flying(below(3), up, wallAbove()))
    expect(r.events.some((e) => e.type === 'ball-hit-wall')).toBe(true)
    // It really went through twice: in, out, bounced off the wall, back in.
    expect(entries(r.path)).toBe(2)
    expect(paid(r.events)).toHaveLength(1)
  })
  it('pays again on the next shot', () => {
    const first = step(flying(below(3), { x: 0, y: -600 }), {}, c)
    const ready: SimState = { ...first.state, possession: { shooter: 1, shots: 2, inHand: false, live: false }, ball: { pos: below(6), vel: { x: 0, y: 0 }, rolled: 0 } }
    const fired = step(ready, { shot: { player: 1, dir: { x: 0, y: -1 }, tier: 0, power: 0.4 } }, c)
    expect(fired.state.bullseyePaid).toBe(false)
    expect(paid(run(fired.state, c, 200).events)).toHaveLength(1)
  })
  it('a ball starting inside it (a Centre-spot restart) and rolling out earns nothing', () => {
    const restart = step({ ...playState(), possession: { shooter: 1, shots: 1, inHand: false, live: false }, ball: { pos: below(4), vel: { x: 0, y: 0 }, rolled: 0 } }, { refund: { player: 1, count: 1 } }, c).state
    expect(restart.ball.pos).toEqual(centre)
    const fired = step(restart, { shot: { player: 2, dir: { x: 0, y: -1 }, tier: 0, power: 0.4 } }, c)
    expect(paid(fired.events)).toEqual([])
    expect(paid(run(fired.state, c, 100).events)).toEqual([])
  })
  it('a ball that rolled out of it and comes back in earns the Credits', () => {
    // Starts on the centre spot, inside the Bullseye, and bounces off the wall back into it.
    const r = run(flying(centre, up, { possession: { shooter: 2, shots: 3, inHand: false, live: true }, ...wallAbove() }))
    expect(r.events.some((e) => e.type === 'ball-hit-wall')).toBe(true)
    expect(entries(r.path)).toBe(1)
    expect(paid(r.events)).toHaveLength(1)
  })
  it('a shot that comes to rest in it earns the Credits and Charges the ball', () => {
    const cfg = defaultConfig
    const r = run(flying(below(3.2), { x: 0, y: -3 }), cfg)
    expect(boostAt(r.state.ball.pos)).toBe('bullseye')
    expect(paid(r.events)).toHaveLength(1)
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'charged', zone: 'bullseye' }))
    expect(r.state.credits[1]).toBe(playState().credits[1] + rules.bullseyeCredits)
    expect(r.state.charge).toEqual({ zone: 'bullseye', factor: rules.boost.bullseye.factor })
  })
  it('a shot starting inside it and coming to rest there earns nothing but still Charges', () => {
    const r = run(flying(below(0.5), { x: 0, y: -1 }), defaultConfig)
    expect(boostAt(r.state.ball.pos)).toBe('bullseye')
    expect(paid(r.events)).toEqual([])
    expect(r.state.charge).toEqual({ zone: 'bullseye', factor: rules.boost.bullseye.factor })
  })
  it('still pays when the shot ends in a goal', () => {
    const r = step(flying(below(10), { x: 0, y: -66 * 60 }), {}, c)
    expect(r.events.some((e) => e.type === 'goal')).toBe(true)
    expect(paid(r.events)).toHaveLength(1)
    // The round ended; the shooter keeps the Credits (and holds the next round's grant if they build first).
    const builds = r.state.match.builder === 1
    expect(r.state.credits[1]).toBe(playState().credits[1] + rules.bullseyeCredits + (builds ? c.credits : 0))
    expect(roundsMatch(r.state).round).toBe(2)
  })
  it('still pays on an own goal', () => {
    const r = step(flying(above(10), { x: 0, y: 66 * 60 }), {}, c)
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'goal', scorer: 2 }))
    expect(paid(r.events)).toEqual([{ type: 'bullseye-credited', player: 1, credits: rules.bullseyeCredits }])
  })
  it('still pays when the shot is stolen in the same tick it enters', () => {
    // A Steal tower just outside the Centre zone (its nearest edge is 8 from the centre); one tick carries the ball across the Bullseye into it.
    const placed = place({ kind: 'tower', owner: 2, power: 'steal', at: { gx: 10, gy: 22 } }).state
    const start = flying({ x: centre.x + 1, y: centre.y + 5 }, { x: 0, y: -900 }, arena(placed))
    const r = step(start, {}, c)
    expect(r.events.some((e) => e.type === 'steal-triggered')).toBe(true)
    expect(paid(r.events)).toHaveLength(1)
    expect(r.state.credits[1]).toBe(placed.credits[1] + rules.bullseyeCredits)
  })
  it('is deterministic: the same state and input give the same result', () => {
    const s = flying(below(3), { x: 0, y: -600 })
    expect(step(s, {}, c)).toEqual(step(s, {}, c))
    const a = run(flying(below(3.2), { x: 0, y: -3 }), defaultConfig)
    const b = run(flying(below(3.2), { x: 0, y: -3 }), defaultConfig)
    expect(a).toEqual(b)
  })
})

describe('Bullseye pass-through (Siege)', () => {
  it('earns nothing: Siege has no Credits economy', () => {
    const cfg: SimConfig = { ...c, mode: 'siege' }
    const base = initialState(1, cfg)
    const s: SimState = { ...base, match: { ...base.match, builder: null }, possession: { shooter: 1, shots: 3, inHand: false, live: true }, ball: { pos: below(3), vel: { x: 0, y: -600 }, rolled: 0 } }
    const r = step(s, {}, cfg)
    expect(paid(r.events)).toEqual([])
    expect(r.state.credits).toEqual(s.credits)
  })
})
