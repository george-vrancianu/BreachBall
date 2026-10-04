import { describe, expect, it } from 'vitest'
import { rules } from '../config/rules'
import { defaultConfig, step, type SimEvent, type SimState } from './step'
import { healthOf, buildState, funded, place, roundsMatch } from './testkit'
import type { PlayerId } from './pitch'
import type { TowerSpec } from './wall'

const steal = (owner: PlayerId = 1): TowerSpec => ({ kind: 'tower', owner, power: 'steal', at: { gx: 10, gy: owner === 1 ? 40 : 14 } })
// P1's tower spans x 20..22, y 80..82. The ball rolls in from the left at 30 u/s, shot by `shooter`.
const shot = (s: SimState, shooter: PlayerId, y = 81): SimState => ({
  ...s,
  ball: { ...s.ball, pos: { x: 15, y }, vel: { x: 30, y: 0 } },
  possession: { shooter, shots: 2, inHand: false, live: true },
})
const run = (s: SimState, ticks: number) => {
  const events: SimEvent[] = []
  for (let i = 0; i < ticks; i++) {
    const r = step(s, {}, defaultConfig)
    s = r.state
    events.push(...r.events)
  }
  return { s, events }
}
const types = (e: SimEvent[]) => e.map((x) => x.type)

describe('steal placement', () => {
  it('spends its price in Credits and is refused when unaffordable', () => {
    const b = buildState(1)
    const r = step(b, { placeWall: steal() }, defaultConfig)
    expect(r.state.objects).toHaveLength(1)
    expect(r.state.credits[1]).toBe(b.credits[1] - rules.towerCost.steal)
    const x = step(funded(b, 1, rules.towerCost.steal - 1), { placeWall: steal() }, defaultConfig)
    expect(x.state.objects).toHaveLength(0)
    expect(x.events).toEqual([{ type: 'refused' }])
  })
  it('has 1 hit point', () => expect(healthOf(place(steal()).state.objects[0])).toBe(1))
})

describe('steal trigger', () => {
  it("stops the opponent's ball and hands the owner a fresh ball-in-hand, consuming the tower", () => {
    const { s, events } = run(shot(place(steal()).state, 2), 30)
    expect(types(events)).toContain('steal-triggered')
    expect(types(events)).not.toContain('goal')
    expect(s.objects).toHaveLength(0)
    expect(s.ball.vel).toEqual({ x: 0, y: 0 })
    expect(s.ball.pos.x).toBeLessThan(20)
    expect(s.possession).toEqual({ shooter: 1, shots: defaultConfig.shots, inHand: true, live: false })
    expect(events).toContainEqual({ type: 'possession-changed', shooter: 1, inHand: true })
    expect(s.clock.expiries).toBe(0)
  })
  it('keeps ball-in-hand: the owner can place the ball where they like (ADR-0006)', () => {
    const { s } = run(shot(place(steal()).state, 2), 30)
    const r = step(s, { placeBall: { player: 1, at: { x: 12, y: 90 } } }, defaultConfig)
    expect(r.state.ball.pos).toEqual({ x: 12, y: 90 })
    expect(r.state.possession.inHand).toBe(false)
  })
  it('a steal on the 30th shot ends the round scoreless', () => {
    const s = shot(place(steal()).state, 2)
    const { events, s: after } = run({ ...s, match: { ...roundsMatch(s), roundShots: defaultConfig.shotCap } }, 30)
    expect(events).toContainEqual({ type: 'round-ended', round: 1, scorer: null })
    expect(roundsMatch(after).round).toBe(2)
  })
  it('triggers for either owner', () => {
    const { s, events } = run(shot(place(steal(2)).state, 1, 29), 30)
    expect(types(events)).toContain('steal-triggered')
    expect(s.possession.shooter).toBe(2)
  })
})

describe('steal owner immunity', () => {
  it("is a plain wall for its owner's ball", () => {
    const { s, events } = run(shot(place(steal()).state, 1), 30)
    expect(types(events)).not.toContain('steal-triggered')
    expect(s.objects).toHaveLength(1)
    expect(s.ball.vel.x).toBeLessThan(0)
    expect(s.possession.shooter).toBe(1)
  })
})

describe('steal vs breaker', () => {
  it('a breaker ball destroys it without triggering', () => {
    const { s, events } = run({ ...shot(place(steal()).state, 2), breaker: true }, 30)
    expect(types(events)).toContain('wall-destroyed')
    expect(types(events)).not.toContain('steal-triggered')
    expect(s.objects).toHaveLength(0)
    expect(s.possession.shooter).toBe(2)
  })
})
