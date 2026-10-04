import { describe, expect, it } from 'vitest'
import { overlaps, placeBadge, textRect, type Rect } from './layout'

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h })

describe('overlaps', () => {
  it('is true for rectangles that share area and false for ones that only touch or are apart', () => {
    expect(overlaps(rect(0, 0, 4, 2), rect(3, 0, 4, 2))).toBe(true)
    expect(overlaps(rect(0, 0, 4, 2), rect(4, 0, 4, 2))).toBe(false)
    expect(overlaps(rect(0, 0, 4, 2), rect(0, 5, 4, 2))).toBe(false)
  })
})

describe('textRect', () => {
  it('is centred on the point, as wide as its glyphs and one size high', () => {
    expect(textRect({ x: 10, y: 20 }, '×2', 2, 0.5)).toEqual(rect(10, 20, 2, 2))
  })
})

describe('placeBadge', () => {
  const badge = { w: 3, h: 1.6 }
  const ball = { x: 20, y: 50 }
  const spots = [
    { dx: 0, dy: -2.6 },
    { dx: 0, dy: 2.6 },
    { dx: 4, dy: 0 },
  ]

  it('stays at the preferred spot when nothing is in the way', () => {
    expect(placeBadge(ball, badge, spots, [])).toEqual({ x: 20, y: 47.4 })
  })

  it('moves to the next spot when the zone label sits where the badge would go', () => {
    expect(placeBadge(ball, badge, spots, [rect(20, 47.4, 3, 1.6)])).toEqual({ x: 20, y: 52.6 })
  })

  it('skips every spot that overlaps any rectangle to avoid, such as the power chip', () => {
    expect(placeBadge(ball, badge, spots, [rect(20, 47.4, 3, 1.6), rect(20, 52.6, 3, 1.6)])).toEqual({ x: 24, y: 50 })
  })

  it('falls back to the preferred spot when none is clear', () => {
    expect(placeBadge(ball, badge, spots, [rect(20, 50, 40, 40)])).toEqual({ x: 20, y: 47.4 })
  })
})
