import { describe, expect, it } from 'vitest'
import { defaultConfig, initialState } from '../../sim/step'
import { countBullseyes, resourceBar } from './resourceBar'

const withCredits = (c1: number, c2: number, config = defaultConfig) => ({ ...initialState(1, config), credits: { 1: c1, 2: c2 } })

describe('resourceBar', () => {
  it('splits evenly when both players hold 0', () => {
    expect(resourceBar(withCredits(0, 0))).toEqual({ 1: { credits: 0, share: 0.5, bullseyes: 0 }, 2: { credits: 0, share: 0.5, bullseyes: 0 } })
  })
  it('gives each player their share of the Credits both hold', () => {
    const bar = resourceBar(withCredits(6, 2))!
    expect([bar[1].share, bar[2].share]).toEqual([0.75, 0.25])
    expect([bar[1].credits, bar[2].credits]).toEqual([6, 2])
  })
  it('gives one player the whole bar when the other holds 0', () => {
    const bar = resourceBar(withCredits(0, 4))!
    expect([bar[1].share, bar[2].share]).toEqual([0, 1])
  })
  it("carries each player's Bullseye Credits so far, for the digit's flash", () => {
    const bar = resourceBar(withCredits(4, 2), { 1: 0, 2: 3 })!
    expect([bar[1].bullseyes, bar[2].bullseyes]).toEqual([0, 3])
  })
  it('is hidden in Siege, which has no Credits economy', () => {
    const c = { ...defaultConfig, mode: 'siege' as const }
    expect(resourceBar(withCredits(5, 5, c))).toBeNull()
  })
})

describe('countBullseyes', () => {
  it('adds one per Bullseye Credit to the player who earned it, ignoring other events', () => {
    const next = countBullseyes({ 1: 1, 2: 0 }, [{ type: 'bullseye-credited', player: 2, credits: 2 }, { type: 'ball-stopped' } as never, { type: 'bullseye-credited', player: 1, credits: 2 }])
    expect(next).toEqual({ 1: 2, 2: 1 })
  })
})
