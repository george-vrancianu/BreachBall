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
    expect(hit.flashes).toEqual([{ wall: 1, dim: false }])
    expect(feedbackFor([destroyed], walls).bursts[0].count).toBeGreaterThan(hit.bursts[0].count)
  })
  it('a Breaker break doubles the particles', () => {
    const broke = { ...(destroyed as object), breaker: true } as never
    expect(feedbackFor([broke], walls).bursts[0].count).toBe(2 * feedbackFor([destroyed], walls).bursts[0].count)
  })
  it('a repaired structure flashes bright', () => {
    expect(feedbackFor([{ type: 'repaired', id: 1, player: 1 }], walls).flashes).toEqual([{ wall: 1, dim: false }])
  })
  it('non-damaging hit flashes dim with no particles', () => {
    const r = feedbackFor([{ type: 'ball-hit-wall', wall: 1, speed: 1, at }], walls)
    expect(r.flashes).toEqual([{ wall: 1, dim: true }])
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
