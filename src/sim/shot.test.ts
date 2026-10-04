import { describe, expect, it } from 'vitest'
import { rules } from '../config/rules'
import type { Structure, Wall } from './wall'
import { defaultConfig, step, type SimConfig, type SimInput, type SimState } from './step'
import { emptied, hseg, playState } from './testkit'

/** No friction, so the velocity after one tick is the launch velocity. */
const c: SimConfig = { ...defaultConfig, halfLife: Infinity }
const ready = (over: Partial<SimState['possession']> = {}): SimState => ({ ...playState(), possession: { shooter: 1, shots: 3, inHand: false, live: false, ...over }, ball: { pos: { x: 20, y: 80 }, vel: { x: 0, y: 0 }, rolled: 0 } })
const shoot = (s: SimState, shot: SimInput['shot']) => step(s, { shot }, c)
const up = { x: 0.6, y: -0.8 }

describe('shot', () => {
  it('launches the ball at dir * power * maxSpeed', () => {
    const r = shoot(ready(), { player: 1, dir: up, tier: 1, power: 0.5 })
    // 0.5 of 60 is 30: (0.6, -0.8) * 30.
    expect(r.state.ball.vel.x).toBeCloseTo(18)
    expect(r.state.ball.vel.y).toBeCloseTo(-24)
    expect(r.state.possession.live).toBe(true)
  })

  it('accepts both ends of a tier\'s range', () => {
    expect(shoot(ready(), { player: 1, dir: up, tier: 1, power: 0.5 }).state.possession.live).toBe(true)
    expect(shoot(ready(), { player: 1, dir: up, tier: 1, power: 1 }).state.possession.live).toBe(true)
  })

  it('announces the shot with where it left from', () => {
    const r = shoot(ready(), { player: 1, dir: up, tier: 0, power: 0.4, breaker: true })
    expect(r.events).toContainEqual({ type: 'shot-fired', player: 1, from: { x: 20, y: 80 }, dir: up, tier: 0, power: 0.4, breaker: true })
  })

  describe('is refused, leaving the ball still', () => {
    const refused = (s: SimState, shot: SimInput['shot']) => {
      const r = shoot(s, shot)
      expect(r.events).toEqual([{ type: 'refused' }])
      expect(r.state.ball.vel).toEqual({ x: 0, y: 0 })
      expect(r.state.possession.live).toBe(false)
    }
    it('when it is not the shooter\'s turn', () => refused(ready(), { player: 2, dir: up, tier: 0, power: 0.4 }))
    it('while the ball is in hand', () => refused(ready({ inHand: true }), { player: 1, dir: up, tier: 0, power: 0.4 }))
    it('with a shot in flight', () => {
      const r = shoot(ready({ live: true }), { player: 1, dir: up, tier: 0, power: 0.4 })
      expect(r.events).toEqual([{ type: 'refused' }])
    })
    it('for an unknown tier', () => refused(ready(), { player: 1, dir: up, tier: 7, power: 0.5 }))
    // Touch is [0.15, 0.45], Power [0.5, 1].
    it('with a power below its tier\'s range', () => refused(ready(), { player: 1, dir: up, tier: 0, power: 0.1 }))
    it('with a power above its tier\'s range', () => refused(ready(), { player: 1, dir: up, tier: 0, power: 0.9 }))
    it('with a Touch power on the Power tier', () => refused(ready(), { player: 1, dir: up, tier: 1, power: 0.3 }))
    it('with a Touch power as strong as the weakest Power shot', () => refused(ready(), { player: 1, dir: up, tier: 0, power: 0.5 }))
    it('with Breaker armed and none left', () => refused(emptied(ready(), 1, 'breaker'), { player: 1, dir: up, tier: 0, power: 0.4, breaker: true }))
  })
})

describe('Splash', () => {
  const wall = (id: number, owner: 1 | 2, gy: number, gx = 8): Wall => ({ kind: 'wall', owner, ...hseg(gx, gy), id, hp: rules.wallHp })
  const right = { x: 1, y: 0 }
  // Ball at (20, 79.5) under walls running x 16..24: gy 37, 38, 39 are 5.5, 3.5 and 1.5 away; gy 34 is 11.5 away.
  const near = (objects: Structure[], pos = { x: 20, y: 79.5 }): SimState => ({ ...ready(), objects, nextId: 99, ball: { pos, vel: { x: 0, y: 0 }, rolled: 0 } })
  const hpAfter = (s: SimState, shot: SimInput['shot']) => {
    const r = shoot(s, shot)
    return s.objects.map((w) => [w.id, r.state.objects.find((o) => o.id === w.id)?.hp ?? 0])
  }

  it('a full Power shot hits enemy structures in range: 1 hp above 0.4 pressure, 2 above 0.8; out of range is untouched', () => {
    // Full power: radius 10, pressures 0.45, 0.65, 0.85, and nothing at 11.5.
    expect(hpAfter(near([wall(1, 2, 37), wall(2, 2, 38), wall(3, 2, 39), wall(4, 2, 34)]), { player: 1, dir: right, tier: 1, power: 1 })).toEqual([[1, 2], [2, 2], [3, 1], [4, 3]])
  })
  it('a full Power shot costs own structures 1 hp only above 0.8 pressure', () => {
    expect(hpAfter(near([wall(1, 1, 37), wall(2, 1, 38), wall(3, 1, 39)]), { player: 1, dir: right, tier: 1, power: 1 })).toEqual([[1, 3], [2, 3], [3, 2]])
  })
  it('reaches across the halfway line', () => {
    // From (20, 55.5) on P1's half, an enemy wall at y 52 is 3.5 away: pressure 0.65.
    expect(hpAfter(near([wall(1, 2, 26)], { x: 20, y: 55.5 }), { player: 1, dir: right, tier: 1, power: 1 })).toEqual([[1, 2]])
  })
  it('is rescaled within the tier: a 0.75 Power shot is a half-power Splash', () => {
    // Half power: radius 6, so the wall 1.5 away feels 0.375 and loses nothing (unscaled 0.75 would cost it 1).
    expect(hpAfter(near([wall(1, 2, 39)]), { player: 1, dir: right, tier: 1, power: 0.75 })).toEqual([[1, 3]])
  })
  it('does not happen on a Touch shot', () => {
    expect(hpAfter(near([wall(1, 2, 39)]), { player: 1, dir: right, tier: 0, power: 0.4 })).toEqual([[1, 3]])
  })
  it('reports its damage with the wall events', () => {
    const r = shoot(near([wall(1, 2, 39, 8)].map((w) => ({ ...w, hp: 2 }))), { player: 1, dir: right, tier: 1, power: 1 })
    expect(r.events).toContainEqual({ type: 'wall-cracked', id: 1, hp: 1, at: { x: 20, y: 78 } })
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'wall-destroyed', at: { x: 20, y: 78 } }))
  })
  it('leaves the ball\'s launch velocity alone', () => {
    const r = shoot(near([wall(1, 2, 37), wall(2, 1, 39)]), { player: 1, dir: right, tier: 1, power: 1 })
    expect(r.state.ball.vel.x).toBeCloseTo(60)
    expect(r.state.ball.vel.y).toBeCloseTo(0)
  })
  it('still happens on a Breaker shot, which stays armed and spends its stock', () => {
    const s = near([wall(1, 2, 39)])
    const r = shoot(s, { player: 1, dir: right, tier: 1, power: 1, breaker: true })
    expect(r.state.objects.find((o) => o.id === 1)?.hp).toBe(1)
    expect(r.state.breaker).toBe(true)
    expect(r.state.players[1].inventory.breaker).toBe(s.players[1].inventory.breaker - 1)
  })
})
