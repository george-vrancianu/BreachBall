import { expect, it } from 'vitest'
import { stageLayers } from './stageLayers'

it('turns both layers by the stage angle when Tabletop mode is off', () => {
  expect(stageLayers({ tabletop: false, stageAngle: 0, seatAngle: 180 })).toEqual({ canvasAngle: 0, hudAngle: 0 })
  expect(stageLayers({ tabletop: false, stageAngle: 180, seatAngle: 180 })).toEqual({ canvasAngle: 180, hudAngle: 180 })
  expect(stageLayers({ tabletop: false, stageAngle: 97.5, seatAngle: 0 })).toEqual({ canvasAngle: 97.5, hudAngle: 97.5 })
})

it('keeps the canvas layer still and turns only the HUD layer to its seat in Tabletop mode', () => {
  expect(stageLayers({ tabletop: true, stageAngle: 0, seatAngle: 0 })).toEqual({ canvasAngle: 0, hudAngle: 0 })
  expect(stageLayers({ tabletop: true, stageAngle: 0, seatAngle: 180 })).toEqual({ canvasAngle: 0, hudAngle: 180 })
})
