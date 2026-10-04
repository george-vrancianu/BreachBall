import { describe, expect, it } from 'vitest'
import { cellToWorld, goalCrossed, halfOf, worldToCell } from './pitch'

describe('halfOf', () => {
  it('is player 2 above the halfway line, player 1 below', () => {
    expect(halfOf(10)).toBe(2)
    expect(halfOf(100)).toBe(1)
  })
  it('is neither exactly on the line', () => {
    expect(halfOf(54)).toBeNull()
  })
})

describe('cells', () => {
  it('cell (0,0) is centred at world (1,1)', () => {
    expect(cellToWorld({ cx: 0, cy: 0 })).toEqual({ x: 1, y: 1 })
  })
  it('last cell is centred at (39,107)', () => {
    expect(cellToWorld({ cx: 19, cy: 53 })).toEqual({ x: 39, y: 107 })
  })
  it('world points map to their containing cell', () => {
    expect(worldToCell({ x: 0, y: 0 })).toEqual({ cx: 0, cy: 0 })
    expect(worldToCell({ x: 3.9, y: 5 })).toEqual({ cx: 1, cy: 2 })
    expect(worldToCell({ x: 39, y: 107 })).toEqual({ cx: 19, cy: 53 })
  })
})

describe('goalCrossed', () => {
  it('reports the goal whose line the segment crosses inside the mouth', () => {
    expect(goalCrossed({ x: 20, y: 2 }, { x: 20, y: -1 })).toBe(2)
    expect(goalCrossed({ x: 18, y: 106 }, { x: 22, y: 110 })).toBe(1)
  })
  it('ignores crossings outside the mouth', () => {
    expect(goalCrossed({ x: 5, y: 2 }, { x: 5, y: -1 })).toBeNull()
    expect(goalCrossed({ x: 0, y: 1 }, { x: 10, y: -1 })).toBeNull()
  })
  it('ignores segments that stay on the pitch side', () => {
    expect(goalCrossed({ x: 20, y: 5 }, { x: 20, y: 1 })).toBeNull()
  })
})
