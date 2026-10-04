import { expect, it } from 'vitest'
import { stageLayers } from './stageLayers'

it('turns the canvas layer and the HUD layer together by the flip angle', () => {
  expect(stageLayers(0)).toEqual({ canvasAngle: 0, hudAngle: 0 })
  expect(stageLayers(180)).toEqual({ canvasAngle: 180, hudAngle: 180 })
  expect(stageLayers(97.5)).toEqual({ canvasAngle: 97.5, hudAngle: 97.5 })
})
