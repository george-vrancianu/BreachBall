import { expect, it } from 'vitest'
import { farEdge, safeAreaVars, safeInline, safeInset } from './safeArea'

it("maps the HUD layer's sides to the CSS variables, from the device's safe-area insets of the edge each is on", () => {
  expect(safeAreaVars(0)).toEqual({ '--safe-top': 'env(safe-area-inset-top, 0px)', '--safe-right': 'env(safe-area-inset-right, 0px)', '--safe-bottom': 'env(safe-area-inset-bottom, 0px)', '--safe-left': 'env(safe-area-inset-left, 0px)' })
  expect(safeAreaVars(180)).toEqual({ '--safe-top': 'env(safe-area-inset-bottom, 0px)', '--safe-right': 'env(safe-area-inset-left, 0px)', '--safe-bottom': 'env(safe-area-inset-top, 0px)', '--safe-left': 'env(safe-area-inset-right, 0px)' })
})

it("refers to a side's variable, 0 outside a HUD layer", () => {
  expect(safeInset('top')).toBe('var(--safe-top, 0px)')
})

it("puts a far-edge offset in from the layer's top, or its bottom when flipped, measured from the safe area", () => {
  expect(farEdge(false, 28)).toEqual({ top: 'calc(var(--safe-top, 0px) + 28px)' })
  expect(farEdge(true, 28)).toEqual({ bottom: 'calc(var(--safe-bottom, 0px) + 28px)' })
})

it("pads left and right by the larger of a gap and the side's inset", () => {
  expect(safeInline(8)).toEqual({ paddingLeft: 'max(8px, var(--safe-left, 0px))', paddingRight: 'max(8px, var(--safe-right, 0px))' })
})
