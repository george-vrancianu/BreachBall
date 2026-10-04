import { describe, expect, it } from 'vitest'
import { rules } from '../config/rules'
import { visual } from '../config/visual'
import { centreSpot } from '../sim/pitch'
import { zoneLabels } from './boost'

describe('zoneLabels', () => {
  const labels = zoneLabels()

  it('has one label per zone with its factor as text', () => {
    expect(labels.map((l) => [l.zone, l.text])).toEqual([
      ['ring', '×1.5'],
      ['bullseye', '×2'],
    ])
  })

  it('sits below the centre spot, inside its own zone', () => {
    const c = centreSpot()
    for (const { zone, at } of labels) {
      expect(at.x).toBe(c.x)
      expect(at.y - c.y).toBeGreaterThan(0)
      expect(at.y - c.y).toBeLessThan(rules.boost[zone].radius)
    }
  })

  it('has a box as tall as its font size, wide enough for its text', () => {
    for (const { size, rect, text } of zoneLabels()) {
      expect(rect.h).toBe(size)
      expect(rect.w).toBeGreaterThan(size * visual.text.glyphEm * (text.length - 1))
    }
  })
})
