import { describe, expect, it } from 'vitest'
import { MODES } from '../../sim/settings'
import { UNITS } from './units'

describe('UNITS', () => {
  it('names the balance in every mode', () => {
    expect(Object.keys(UNITS).sort()).toEqual(MODES.map((m) => m.mode).sort())
    for (const { mode } of MODES) expect(UNITS[mode]).toEqual({ short: expect.any(String), chip: expect.any(String) })
  })
  it('keeps the text of the former records', () => {
    expect(UNITS.rounds).toEqual({ short: 'credits', chip: 'CR' })
    expect(UNITS.siege).toEqual({ short: 'pts', chip: 'PTS' })
  })
})
