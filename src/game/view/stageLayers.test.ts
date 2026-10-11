import { expect, it } from 'vitest'
import { safeAngle, stageLayers } from './stageLayers'

it('turns both layers by the stage angle when Tabletop mode is off', () => {
  expect(stageLayers({ tabletop: false, stageAngle: 0, seatAngle: 180 })).toEqual({ canvasAngle: 0, hudAngle: 0 })
  expect(stageLayers({ tabletop: false, stageAngle: 180, seatAngle: 180 })).toEqual({ canvasAngle: 180, hudAngle: 180 })
  expect(stageLayers({ tabletop: false, stageAngle: 97.5, seatAngle: 0 })).toEqual({ canvasAngle: 97.5, hudAngle: 97.5 })
})

it('keeps the canvas layer still and turns only the HUD layer to its seat in Tabletop mode', () => {
  expect(stageLayers({ tabletop: true, stageAngle: 0, seatAngle: 0 })).toEqual({ canvasAngle: 0, hudAngle: 0 })
  expect(stageLayers({ tabletop: true, stageAngle: 0, seatAngle: 180 })).toEqual({ canvasAngle: 0, hudAngle: 180 })
})

it('reads the safe-area edges from the HUD layer own turn in Tabletop mode', () => {
  expect(safeAngle({ tabletop: true, hudAngle: 97.5, flipped: false })).toBe(97.5)
  expect(safeAngle({ tabletop: true, hudAngle: 180, flipped: true })).toBe(180)
})

it('reads them from the settled layout when Tabletop mode is off, whatever the angle mid-flip', () => {
  expect(safeAngle({ tabletop: false, hudAngle: 97.5, flipped: false })).toBe(0)
  expect(safeAngle({ tabletop: false, hudAngle: 97.5, flipped: true })).toBe(180)
})
