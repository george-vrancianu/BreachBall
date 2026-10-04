import { describe, expect, it } from 'vitest'
import { decimalLayout } from './label'

describe('decimalLayout', () => {
  it('leaves a label without a point as one run', () => {
    expect(decimalLayout('×2', () => 10, 2, 1)).toBeUndefined()
  })

  it('splits "×1.5" around a disc with a gap each side, centred on the label', () => {
    // 7 px for "×1" and 5 px for "5"; a 2 px radius disc with 1 px gaps: 7 + 1 + 4 + 1 + 5 = 18 wide.
    const l = decimalLayout('×1.5', (t) => (t === '×1' ? 7 : 5), 2, 1)!
    expect(l).toEqual({ left: { text: '×1', x: -9 }, dot: { x: -9 + 7 + 1 + 2, r: 2 }, right: { text: '5', x: -9 + 7 + 1 + 4 + 1 } })
  })
})
