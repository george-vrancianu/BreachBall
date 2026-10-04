import { describe, expect, it } from 'vitest'
import { rules } from '../../config/rules'
import { minimapOf } from './minimap'

describe('minimapOf', () => {
  it('puts the frame where the camera looks, as fractions of the whole pitch with its nets', () => {
    // The map is 116 units: a view of 58 centred on the middle covers the middle half.
    expect(minimapOf(rules.mapY, 58).frame).toEqual({ top: 0.25, height: 0.5 })
    expect(minimapOf(rules.mapTop + 29, 58).frame).toEqual({ top: 0, height: 0.5 })
  })
  it('tracks the camera: a view further down the pitch sits lower in the thumbnail', () => {
    expect(minimapOf(80, 64).frame.top).toBeGreaterThan(minimapOf(40, 64).frame.top)
  })
  it('shows no fog unless the build is blind', () => {
    expect(minimapOf(54, 64).fog).toBeUndefined()
  })
  it("fogs the opponent's half for a blind seat", () => {
    const half = (rules.halfHeight - rules.mapTop) / rules.mapHeight
    const one = minimapOf(54, 64, 1).fog!
    expect(one.top + one.height).toBeCloseTo(half, 3)
    expect(minimapOf(54, 64, 2).fog!.top).toBeCloseTo(half, 3)
  })
})
