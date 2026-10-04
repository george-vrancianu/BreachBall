import { describe, expect, it } from 'vitest'
import { defaultConfig, initialState } from '../../sim/step'
import { resourceBar } from './resourceBar'

const withCredits = (c1: number, c2: number, config = defaultConfig) => ({ ...initialState(1, config), credits: { 1: c1, 2: c2 } })

describe('resourceBar', () => {
  it('splits evenly when both players hold 0', () => {
    expect(resourceBar(withCredits(0, 0))).toEqual({ 1: { credits: 0, share: 0.5 }, 2: { credits: 0, share: 0.5 } })
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
  it('is hidden in Siege, which has no Credits economy', () => {
    const c = { ...defaultConfig, mode: 'siege' as const }
    expect(resourceBar(withCredits(5, 5, c))).toBeNull()
  })
})
