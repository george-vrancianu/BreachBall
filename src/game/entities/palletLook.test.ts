import { describe, expect, it } from 'vitest'
import { visual } from '../../config/visual'
import { flashLeft, ghostsOf, palleted, ringAlpha } from './palletLook'

const V = visual.pallet

describe('Activation ring', () => {
  it('brightens only while the Pallet tracks', () => {
    expect(ringAlpha('track')).toBe(V.ring.trackAlpha)
    expect(ringAlpha('idle')).toBe(V.ring.idleAlpha)
    expect(ringAlpha('swing')).toBe(V.ring.idleAlpha)
    expect(V.ring.trackAlpha).toBeGreaterThan(V.ring.idleAlpha)
  })
})

describe('swing ghosts', () => {
  const arm = (phase: 'idle' | 'track' | 'swing', swept: number, dir: 1 | -1 = 1) => ({ phase, angle: 1, dir, swept })

  it('are only there during a swing, and none before the arm has moved', () => {
    expect(ghostsOf(arm('idle', 1))).toEqual([])
    expect(ghostsOf(arm('track', 1))).toEqual([])
    expect(ghostsOf(arm('swing', 0))).toEqual([])
  })

  it('trail behind the arm against its swing direction, faintest (oldest) first', () => {
    for (const dir of [1, -1] as const) {
      const ghosts = ghostsOf(arm('swing', V.ghostGap * 3.5, dir))
      expect(ghosts).toHaveLength(3)
      expect(ghosts.map((g) => g.angle)).toEqual([1 - dir * 3 * V.ghostGap, 1 - dir * 2 * V.ghostGap, 1 - dir * V.ghostGap])
      expect(ghosts[0].alpha).toBeLessThan(ghosts[2].alpha)
      expect(ghosts[2].alpha).toBe(V.ghostAlpha)
    }
  })

  it('are capped at visual.pallet.ghosts however far the swing has gone, all still visible', () => {
    const ghosts = ghostsOf(arm('swing', 100))
    expect(ghosts).toHaveLength(V.ghosts)
    for (const g of ghosts) expect(g.alpha).toBeGreaterThan(0)
  })
})

describe('swat flash', () => {
  it('runs from 1 at the hit to 0 after flash.ms', () => {
    expect(flashLeft(0)).toBe(1)
    expect(flashLeft(V.flash.ms / 2)).toBe(0.5)
    expect(flashLeft(V.flash.ms)).toBe(0)
    expect(flashLeft(V.flash.ms * 2)).toBe(0)
  })
})

describe('Palleted look', () => {
  it('is on while pierces are left and off when they run out', () => {
    expect(palleted(2)).toBe(true)
    expect(palleted(1)).toBe(true)
    expect(palleted(0)).toBe(false)
  })
})
