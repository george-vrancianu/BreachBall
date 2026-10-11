import { describe, expect, it } from 'vitest'
import { visual } from '../../config/visual'
import { flashLeft, ghostsOf, ringAlpha } from './palletLook'

describe('Activation ring', () => {
  it('stays bright from tracking through the swing, faint only when idle', () => {
    expect(ringAlpha('track')).toBe(visual.pallet.ring.activeAlpha)
    expect(ringAlpha('swing')).toBe(visual.pallet.ring.activeAlpha)
    expect(ringAlpha('idle')).toBe(visual.pallet.ring.idleAlpha)
  })
})

describe('swing ghosts', () => {
  const { ghostGap, ghostAlpha, ghosts: max } = visual.pallet
  const arm = (phase: 'idle' | 'track' | 'swing', swept: number, dir: 1 | -1 = 1) => ({ phase, angle: 1, dir, swept })
  const of = (a: ReturnType<typeof arm>) => {
    const out: { angle: number; alpha: number }[] = []
    ghostsOf(a, (angle, alpha) => out.push({ angle, alpha }))
    return out
  }

  it('are only there during a swing, and none before the arm has moved', () => {
    expect(of(arm('idle', 1))).toEqual([])
    expect(of(arm('track', 1))).toEqual([])
    expect(of(arm('swing', 0))).toEqual([])
  })

  it('trail behind the arm against its swing direction, faintest (oldest) first', () => {
    for (const dir of [1, -1] as const) {
      const ghosts = of(arm('swing', ghostGap * 3.5, dir))
      expect(ghosts.map((g) => g.angle)).toEqual([1 - dir * 3 * ghostGap, 1 - dir * 2 * ghostGap, 1 - dir * ghostGap])
      expect(ghosts[0].alpha).toBeLessThan(ghosts[2].alpha)
      expect(ghosts[2].alpha).toBe(ghostAlpha)
    }
  })

  it('are capped at visual.pallet.ghosts however far the swing has gone, all still visible', () => {
    const ghosts = of(arm('swing', 100))
    expect(ghosts).toHaveLength(max)
    for (const g of ghosts) expect(g.alpha).toBeGreaterThan(0)
  })
})

describe('swat flash', () => {
  it('runs from 1 at the hit to 0 after flash.ms', () => {
    expect(flashLeft(0)).toBe(1)
    expect(flashLeft(visual.pallet.flash.ms / 2)).toBe(0.5)
    expect(flashLeft(visual.pallet.flash.ms)).toBe(0)
    expect(flashLeft(visual.pallet.flash.ms * 2)).toBe(0)
  })
})
