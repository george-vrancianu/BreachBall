import { describe, expect, it } from 'vitest'
import { defaultConfig, step, type SimInput, type SimState } from './step'
import { canArm } from './possession'
import { emptied, hseg, place, playState } from './testkit'
import type { WallSpec } from './wall'

const c = defaultConfig
const run = (s: SimState, input: SimInput = {}) => step(s, input, c)
const shooter = (s: SimState) => s.possession.shooter
const ready = (s = playState()): SimState => ({ ...s, possession: { ...s.possession, inHand: false } })
const fire = (s: SimState, breaker: boolean, power = 0.4) => run(s, { shot: { player: shooter(s), dir: { x: 1, y: 0 }, tier: 0, power, breaker } })
/** Ball on the shooter's half, so a straight wall can sit in its path. */
const wall = (owner: 1 | 2, gy: number): WallSpec => ({ kind: 'wall', owner, ...hseg(9, gy) })
const flying = (s: SimState, vy: number, y = 60): SimState => ({ ...s, breaker: true, possession: { ...s.possession, live: true }, ball: { pos: { x: 20, y }, vel: { x: 0, y: vy }, rolled: 0 } })

describe('breaker', () => {
  it('consumes one on fire, hit or miss', () => {
    const s = ready()
    const r = fire(s, true)
    expect(r.state.players[shooter(s)].inventory.breaker).toBe(2)
    expect(r.state.breaker).toBe(true)
  })
  it('an unarmed shot keeps the count', () => {
    const s = ready()
    const r = fire(s, false)
    expect(r.state.players[shooter(s)].inventory.breaker).toBe(3)
    expect(r.state.breaker).toBe(false)
  })
  it('is refused with none left', () => {
    const s = ready()
    const p = shooter(s)
    const r = fire(emptied(s, p, 'breaker'), true)
    expect(r.events).toEqual([{ type: 'refused' }])
    expect(r.state.possession.live).toBe(false)
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
    expect(t.objects.map((w) => w.hp)).toEqual([3])
  })
  it('clears when the shot comes to rest', () => {
    let t = flying(playState(), 0)
    t = run(t).state
    expect(t.breaker).toBe(false)
  })
  it('can be armed only by the shooter in their own play phase with some left', () => {
    const s = ready()
    const p = shooter(s)
    expect(canArm(s, p)).toBe(true)
    expect(canArm(s, p === 1 ? 2 : 1)).toBe(false)
    expect(canArm({ ...s, match: { ...s.match, builder: p } }, p)).toBe(false)
    expect(canArm({ ...s, possession: { ...s.possession, live: true } }, p)).toBe(false)
    expect(canArm({ ...s, possession: { ...s.possession, inHand: true } }, p)).toBe(false)
    expect(canArm(emptied(s, p, 'breaker'), p)).toBe(false)
  })
})
