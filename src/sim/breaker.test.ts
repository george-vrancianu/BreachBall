import { describe, expect, it } from 'vitest'
import { rules } from '../config/rules'
import { canArm, defaultConfig, step, type SimInput, type SimState } from './step'
import { healthOf, emptied, hseg, place, playState } from './testkit'
import type { Wall, WallSpec } from './wall'

const c = defaultConfig
const run = (s: SimState, input: SimInput = {}) => step(s, input, c)
const shooter = (s: SimState) => s.possession.shooter
const ready = (s = playState()): SimState => ({ ...s, possession: { ...s.possession, inHand: false } })
const fire = (s: SimState, breaker: boolean, power = 0.4) => run(s, { shot: { player: shooter(s), dir: { x: 1, y: 0 }, tier: 0, power, breaker } })
/** Ball on the shooter's half, so a straight wall can sit in its path. */
const wall = (owner: 1 | 2, gy: number): WallSpec => ({ kind: 'wall', owner, ...hseg(9, gy) })
const flying = (s: SimState, vy: number, y = 60): SimState => ({ ...s, breaker: true, possession: { ...s.possession, live: true }, ball: { pos: { x: 20, y }, vel: { x: 0, y: vy }, rolled: 0 } })

const credits = (s: SimState, p: 1 | 2, n: number): SimState => ({ ...s, credits: { ...s.credits, [p]: n } })
/** Siege has no Credits economy, so its Breaker still draws on the 3-each stock. */
const siege = (s: SimState): SimState => ({ ...s, match: { mode: 'siege', seed: 1, winner: null, builder: null, choosing: null, opening: false } })

describe('breaker', () => {
  it('charges its price in Credits when an armed shot fires, hit or miss', () => {
    const s = ready()
    const r = fire(s, true)
    expect(r.state.credits[shooter(s)]).toBe(s.credits[shooter(s)] - rules.breakerCost)
    expect(r.state.players[shooter(s)].inventory.breaker).toBe(3)
    expect(r.state.breaker).toBe(true)
  })
  it('charges nothing on an unarmed shot', () => {
    const s = ready()
    const r = fire(s, false)
    expect(r.state.credits).toEqual(s.credits)
    expect(r.state.breaker).toBe(false)
  })
  it('charges nothing while no shot fires: arming and disarming are the input layer\'s, only the shot pays', () => {
    const s = ready()
    expect(canArm(s, shooter(s))).toBe(true)
    // Asking whether it can be armed changes nothing, and a tick with no shot costs nothing.
    expect(run(s).state.credits).toEqual(s.credits)
  })
  it('is refused when the shooter cannot afford it', () => {
    const s = credits(ready(), shooter(ready()), rules.breakerCost - 1)
    const r = fire(s, true)
    expect(r.events).toEqual([{ type: 'refused' }])
    expect(r.state.possession.live).toBe(false)
    expect(r.state.credits).toEqual(s.credits)
  })
  it('can spend the last Credits it is worth', () => {
    const s = credits(ready(), shooter(ready()), rules.breakerCost)
    expect(fire(s, true).state.credits[shooter(s)]).toBe(0)
  })
  it('ignores the stock in Rounds', () => {
    const s = ready()
    expect(canArm(emptied(s, shooter(s), 'breaker'), shooter(s))).toBe(true)
  })
  it('keeps the stock in Siege: one consumed, no Credits charged', () => {
    const s = siege(ready())
    const r = fire(s, true)
    expect(r.state.players[shooter(s)].inventory.breaker).toBe(2)
    expect(r.state.credits).toEqual(s.credits)
    expect(fire(emptied(s, shooter(s), 'breaker'), true).events).toEqual([{ type: 'refused' }])
  })
  it('destroys the first structure it touches at full speed, whoever owns it', () => {
    for (const owner of [1, 2] as const) {
      const s = flying(place(wall(owner, owner === 1 ? 32 : 22)).state, -40, 70)
      const before = Math.hypot(s.ball.vel.x, s.ball.vel.y)
      let t = s
      const events = []
      for (let i = 0; i < 90 && t.objects.length; i++) {
        const r = run(t)
        t = r.state
        events.push(...r.events)
      }
      expect(t.objects).toEqual([])
      expect(events.find((e) => e.type === 'wall-destroyed')).toMatchObject({ breaker: true })
      expect(t.ball.vel.y).toBeLessThan(0)
      expect(Math.abs(t.ball.vel.y)).toBeGreaterThan(before * 0.4)
      expect(t.breaker).toBe(false)
    }
  })
  it('only the first structure breaks; the next one is hit normally', () => {
    const s = place(wall(2, 16), place(wall(2, 22)).state).state
    let t = flying(s, -40)
    for (let i = 0; i < 300 && t.breaker; i++) t = run(t).state
    expect(t.objects.map((w) => healthOf(w))).toEqual([3])
  })
  it('clears when the shot comes to rest', () => {
    let t = flying(playState(), 0)
    t = run(t).state
    expect(t.breaker).toBe(false)
  })
  it('can be armed only by the shooter in their own play phase with enough Credits', () => {
    const s = ready()
    const p = shooter(s)
    expect(canArm(s, p)).toBe(true)
    expect(canArm(s, p === 1 ? 2 : 1)).toBe(false)
    expect(canArm({ ...s, match: { ...s.match, builder: p } }, p)).toBe(false)
    expect(canArm({ ...s, possession: { ...s.possession, live: true } }, p)).toBe(false)
    expect(canArm({ ...s, possession: { ...s.possession, inHand: true } }, p)).toBe(false)
    expect(canArm(credits(s, p, rules.breakerCost - 1), p)).toBe(false)
  })
})

describe('breaker on a wall segment', () => {
  const two = (): SimState => ({ ...playState(), objects: [{ kind: 'wall', owner: 2, ...hseg(5, 30, 2), id: 1, segments: [3, 3] } as Wall], nextId: 2 })
  it('breaks the segment it touches, not the whole wall, then carries on', () => {
    let t = flying({ ...two(), ball: { ...two().ball, pos: { x: 22, y: 70 } } }, -40, 70)
    t = { ...t, ball: { ...t.ball, pos: { x: 22, y: 70 } } }
    const events = []
    for (let i = 0; i < 60 && t.breaker; i++) {
      const r = run(t)
      t = r.state
      events.push(...r.events)
    }
    expect((t.objects[0] as Wall).segments).toEqual([3, 0])
    expect(events.find((e) => e.type === 'segment-broken')).toBeDefined()
    expect(events.some((e) => e.type === 'wall-destroyed')).toBe(false)
    expect(t.ball.vel.y).toBeLessThan(0)
  })
  it('on a last standing segment it destroys the wall with breaker: true', () => {
    let t = flying({ ...two(), objects: [{ kind: 'wall', owner: 2, ...hseg(5, 30, 2), id: 1, segments: [0, 3] } as Wall] }, -40, 70)
    t = { ...t, ball: { ...t.ball, pos: { x: 22, y: 70 } } }
    const events = []
    for (let i = 0; i < 60 && t.breaker; i++) {
      const r = run(t)
      t = r.state
      events.push(...r.events)
    }
    expect(t.objects).toEqual([])
    expect(events.find((e) => e.type === 'wall-destroyed')).toMatchObject({ breaker: true, segment: 1 })
  })
})
