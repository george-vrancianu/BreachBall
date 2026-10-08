import { expect, it } from 'vitest'
import { inset, safeAreaVars, safeInsets } from './safeInsets'

it('reads each HUD side from the same physical edge while the HUD layer is upright', () => {
  expect(safeInsets(0)).toEqual({ top: 'top', right: 'right', bottom: 'bottom', left: 'left' })
})

it('swaps every side to the opposite physical edge while the HUD layer is turned 180 degrees', () => {
  expect(safeInsets(180)).toEqual({ top: 'bottom', right: 'left', bottom: 'top', left: 'right' })
})

it('swaps at the half turn of a whole-stage flip, in either direction, and never before or after', () => {
  expect(safeInsets(89).top).toBe('top')
  expect(safeInsets(91).top).toBe('bottom')
  expect(safeInsets(269).top).toBe('bottom')
  expect(safeInsets(271).top).toBe('top')
  expect(safeInsets(360).top).toBe('top')
  expect(safeInsets(-180).top).toBe('bottom')
})

it('maps the sides to the CSS variables the HUD layer sets, from the device\'s safe-area insets', () => {
  expect(safeAreaVars(0)).toEqual({ '--safe-top': 'env(safe-area-inset-top, 0px)', '--safe-right': 'env(safe-area-inset-right, 0px)', '--safe-bottom': 'env(safe-area-inset-bottom, 0px)', '--safe-left': 'env(safe-area-inset-left, 0px)' })
  expect(safeAreaVars(180)).toEqual({ '--safe-top': 'env(safe-area-inset-bottom, 0px)', '--safe-right': 'env(safe-area-inset-left, 0px)', '--safe-bottom': 'env(safe-area-inset-top, 0px)', '--safe-left': 'env(safe-area-inset-right, 0px)' })
})

it('refers to a side\'s variable, 0 outside a HUD layer', () => {
  expect(inset('top')).toBe('var(--safe-top, 0px)')
})
