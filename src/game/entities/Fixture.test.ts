import { describe, expect, it } from 'vitest'
import type { WallSpec } from '../../sim/wall'
import { crackLines, pieces } from './Fixture'

const spec: WallSpec = { kind: 'wall', owner: 1, a: { x: 10, y: 80 }, b: { x: 26, y: 80 } }
const diagonal: WallSpec = { kind: 'wall', owner: 2, a: { x: 10, y: 20 }, b: { x: 10 + 8 * Math.SQRT1_2, y: 20 + 8 * Math.SQRT1_2 } }

describe('crackLines', () => {
  it('draws one crack per lost hp, deterministically, keeping earlier cracks', () => {
    expect(crackLines(spec, 4, 3)).toEqual([])
    const one = crackLines(spec, 4, 2)
    expect(one).toHaveLength(1)
    expect(crackLines(spec, 4, 2)).toEqual(one)
    const two = crackLines(spec, 4, 1)
    expect(two).toHaveLength(2)
    expect(two[0]).toEqual(one[0])
  })
  it('lands cracks on a diagonal wall, across it', () => {
    const [crack] = crackLines(diagonal, 7, 2)
    expect(crack).toHaveLength(4)
    const [first, last] = [crack[0], crack[3]]
    // The crack runs mostly across the wall: perpendicular to (1, 1) is (-1, 1) (the sign is immaterial: the crack is symmetric).
    expect(Math.sign(last.x - first.x)).toBe(-Math.sign(last.y - first.y))
  })
})

describe('pieces', () => {
  it('cuts a wall into runs one cell long, a diagonal as many as a straight one', () => {
    expect(pieces(spec)).toHaveLength(8)
    expect(pieces(diagonal)).toHaveLength(4)
    expect(pieces(spec)[0]).toEqual({ a: { x: 10, y: 80 }, b: { x: 12, y: 80 } })
  })
  it('gives a tower its four edges', () => {
    expect(pieces({ kind: 'tower', owner: 1, power: 'steal', at: { gx: 5, gy: 40 } })).toHaveLength(4)
  })
})
