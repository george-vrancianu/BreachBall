import { describe, expect, it } from 'vitest'
import { rules } from '../../config/rules'
import type { PlayerId } from '../../sim/pitch'
import { opponent } from '../../sim/possession'
import { defaultConfig as c, step, type SimState } from '../../sim/step'
import { buildState, playState } from '../../sim/testkit'
import { subterfugeCircle } from './subterfugeCircle'

const mine = () => true
const circle = (s: SimState, viewer: PlayerId, v: { blocked?: boolean; mine?(p: PlayerId): boolean } = {}) => subterfugeCircle(s, viewer, { mine, ...v })!

describe('subterfugeCircle', () => {
  it('offers the Jam with its price and when it lands, then locked placeholders', () => {
    const s = playState()
    const m = circle(s, s.possession.shooter)
    expect(m.items[0]).toEqual({ item: 'jam', label: `Jam · ${rules.jamCost}`, when: 'next possession', disabled: false })
    expect(m.items.slice(1).every((i) => i.soon && i.disabled)).toBe(true)
  })
  it('is available to the shooter in play and the builder in a build turn', () => {
    const s = playState()
    expect(circle(s, s.possession.shooter).available).toBe(true)
    expect(circle(buildState(2), 2).available).toBe(true)
  })
  it('opens greyed out for the player whose turn it is not, a blocked view or another device\'s seat', () => {
    const s = playState()
    expect(circle(s, opponent(s.possession.shooter)).available).toBe(false)
    expect(circle(buildState(1), 2).available).toBe(false)
    expect(circle(s, s.possession.shooter, { blocked: true }).available).toBe(false)
    expect(circle(s, s.possession.shooter, { mine: () => false }).available).toBe(false)
  })
  it('greys the Jam without the Credits for it', () => {
    const s = playState()
    const p = s.possession.shooter
    expect(circle({ ...s, credits: { ...s.credits, [p]: rules.jamCost - 1 } }, p).items[0].disabled).toBe(true)
  })
  it('greys the whole circle once this turn\'s Subterfuge is bought, and lists the queued Jam for both viewers', () => {
    const s = playState()
    const p = s.possession.shooter
    const after = step(s, { subterfuge: { player: p, item: 'jam' } }, c).state
    const queued = [{ item: 'jam', by: p, against: opponent(p) }]
    expect(circle(after, p)).toMatchObject({ available: false, queued })
    expect(circle(after, opponent(p)).queued).toEqual(queued)
  })
  it('is absent in Siege', () => {
    const s = playState()
    const siege = { ...s, match: { mode: 'siege' as const, seed: 1, winner: null, builder: null, choosing: null, opening: false } }
    expect(subterfugeCircle(siege, 1, { mine })).toBeUndefined()
  })
})
