import { expect, it } from 'vitest'
import { physicalEdges } from './physicalEdges'

it('reads each HUD side from the same physical edge while the HUD layer is upright', () => {
  expect(physicalEdges(0)).toEqual({ top: 'top', right: 'right', bottom: 'bottom', left: 'left' })
})

it('swaps every side to the opposite physical edge while the HUD layer is turned 180 degrees', () => {
  expect(physicalEdges(180)).toEqual({ top: 'bottom', right: 'left', bottom: 'top', left: 'right' })
})

it('swaps at the half turn of a whole-stage flip, in either direction, and never before or after', () => {
  expect(physicalEdges(89).top).toBe('top')
  expect(physicalEdges(91).top).toBe('bottom')
  expect(physicalEdges(269).top).toBe('bottom')
  expect(physicalEdges(271).top).toBe('top')
  expect(physicalEdges(360).top).toBe('top')
  expect(physicalEdges(-180).top).toBe('bottom')
})

it('keeps a quarter turn upright: the swap is only past 90 degrees and until 270', () => {
  expect(physicalEdges(90).top).toBe('top')
  expect(physicalEdges(270).top).toBe('top')
})
