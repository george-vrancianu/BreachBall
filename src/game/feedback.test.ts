import { describe, expect, it } from 'vitest'
import { visual } from '../config/visual'
import { feedbackFor, tierBuzz, vibration } from './feedback'

describe('vibration', () => {
  it('pulses longer for a stronger shot', () => {
    expect(vibration({ type: 'shot-fired', player: 1, from: { x: 0, y: 0 }, dir: { x: 0, y: -1 }, tier: 1, power: 1 }) as number).toBeGreaterThan(vibration({ type: 'shot-fired', player: 1, from: { x: 0, y: 0 }, dir: { x: 0, y: -1 }, tier: 0, power: 0.2 }) as number)
  })
  it('double pulse on goal, silent otherwise', () => {
    expect(vibration({ type: 'goal', scorer: 1, at: { x: 0, y: 0 } })).toHaveLength(3)
    expect(vibration({ type: 'refused' })).toBeUndefined()
  })
  it('a short buzz on a refund', () => {
    expect(vibration({ type: 'refunded', player: 1, count: 2 })).toBeGreaterThan(0)
  })
})

describe('feedbackFor', () => {
  const walls = [{ id: 1, owner: 2 as const }]
  const at = { x: 1, y: 1 }
  const destroyed = { type: 'wall-destroyed', wall: { id: 1, owner: 2, hp: 0 }, at } as never
  it('damaging hit flashes bright and emits particles; destruction emits more', () => {
    const hit = feedbackFor([{ type: 'ball-hit-wall', wall: 1, speed: 9, at }, { type: 'wall-cracked', id: 1, hp: 2, at }], walls)
    expect(hit.flashes).toEqual([{ wall: 1, dim: false, segment: undefined, at }])
    // The tracer's bounce is the one spark burst of a ball hit, in the owner's colour.
    expect(hit.bursts).toEqual([])
    expect(hit.hitColors.get(1)).toBe(visual.player.colors[2])
  })
  it('a Splash crack with no ball hit sprays its own sparks', () => {
    expect(feedbackFor([{ type: 'wall-cracked', id: 1, hp: 2, segment: 0, at }], walls).bursts).toHaveLength(1)
  })
  it('a segment break is a break, with a shake; a Breaker break shakes harder; a crack never shakes', () => {
    const broken = { type: 'segment-broken', id: 1, segment: 1, wall: { id: 1, owner: 2 }, at } as never
    const last = { type: 'wall-destroyed', wall: { id: 1, owner: 2 }, segment: 0, at } as never
    const breaker = { type: 'wall-destroyed', wall: { id: 1, owner: 2 }, segment: 0, breaker: true, at } as never
    expect(feedbackFor([broken], walls).breaks).toEqual([{ id: 1, segment: 1, at, breaker: false }])
    expect(feedbackFor([last], walls).breaks).toEqual([{ id: 1, segment: 0, at, breaker: false }])
    expect(feedbackFor([broken], walls).shakes).toEqual([visual.wall.break.shake])
    expect(feedbackFor([breaker], walls).shakes).toEqual([visual.wall.break.breakerShake])
    expect(visual.wall.break.breakerShake).toBeGreaterThan(visual.wall.break.shake)
    expect(feedbackFor([{ type: 'wall-cracked', id: 1, hp: 2, segment: 0, at }], walls).shakes).toEqual([])
  })
  it('several breaks in one tick give a single shake, at the largest amplitude', () => {
    const broken = (segment: number) => ({ type: 'segment-broken', id: 1, segment, wall: { id: 1, owner: 2 }, at }) as never
    const breaker = { type: 'wall-destroyed', wall: { id: 1, owner: 2 }, segment: 0, breaker: true, at } as never
    expect(feedbackFor([broken(0), broken(1), broken(2)], walls).shakes).toEqual([visual.wall.break.shake])
    const mixed = feedbackFor([broken(0), breaker, broken(1)], walls)
    expect(mixed.breaks).toHaveLength(3)
    expect(mixed.shakes).toEqual([visual.wall.break.breakerShake])
  })
  it('a repaired structure flashes bright', () => {
    expect(feedbackFor([{ type: 'repaired', id: 1, player: 1 }], walls).flashes).toEqual([{ wall: 1, dim: false }])
  })
  it('non-damaging hit flashes dim with no particles', () => {
    const r = feedbackFor([{ type: 'ball-hit-wall', wall: 1, speed: 1, at }], walls)
    expect(r.flashes).toEqual([{ wall: 1, dim: true, at }])
    expect(r.bursts).toEqual([])
  })
  it('a shot shakes in proportion to power, none below 30%', () => {
    expect(feedbackFor([{ type: 'shot-fired', player: 1, from: { x: 0, y: 0 }, dir: { x: 0, y: -1 }, tier: 0, power: 0.2 }], []).shakes).toEqual([])
    expect(feedbackFor([{ type: 'shot-fired', player: 1, from: { x: 0, y: 0 }, dir: { x: 0, y: -1 }, tier: 1, power: 1 }], []).shakes).toEqual([4])
  })
})

describe('tierBuzz', () => {
  const holding = (tier: number) => ({ phase: 'holding' as const, tier })
  it('buzzes once when the hold reaches a higher tier', () => {
    expect(tierBuzz(holding(0), holding(1))).toBe(visual.aim.vibration.tier)
    expect(tierBuzz(holding(1), holding(1))).toBeUndefined()
  })
  it('does not buzz on starting a hold, on dragging, or on letting go', () => {
    expect(tierBuzz(undefined, holding(0))).toBeUndefined()
    expect(tierBuzz(holding(1), { phase: 'aiming', tier: 1 })).toBeUndefined()
    expect(tierBuzz(holding(1), undefined)).toBeUndefined()
  })
})
