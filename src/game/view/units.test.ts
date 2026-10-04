import { describe, expect, it } from 'vitest'
import { MODES } from '../../sim/settings'
import { UNITS } from './units'

describe('UNITS', () => {
  it('names the balance in every mode', () => {
    expect(Object.keys(UNITS).sort()).toEqual(MODES.map((m) => m.mode).sort())
    for (const { mode } of MODES) expect(UNITS[mode]).toEqual({ menu: expect.any(String), chip: expect.any(String) })
  })
  it('Rounds says credits/CR, Siege pts/PTS', () => {
    expect(UNITS.rounds).toEqual({ menu: 'credits', chip: 'CR' })
    expect(UNITS.siege).toEqual({ menu: 'pts', chip: 'PTS' })
  })
})
