import { describe, expect, it } from 'vitest'
import { configFrom, defaultSettings, SLIDERS, slidersFor } from './settings'
import { defaultConfig, initialState } from './step'

describe('settings', () => {
  it('defaults to Siege with the slider defaults', () => {
    expect(defaultSettings).toEqual({ mode: 'siege', shots: 3, rounds: 5, credits: 10, openingCredits: 40, refundRate: 2, expiry: 'shoot' })
    expect(configFrom(defaultSettings)).toEqual({ ...defaultConfig, mode: 'siege' })
  })

  it('on time out defaults to Shoot and the choice reaches the sim', () => {
    expect(configFrom(defaultSettings).expiry).toBe('shoot')
    expect(configFrom({ ...defaultSettings, expiry: 'burn' }).expiry).toBe('burn')
  })

  it('Rounds settings reproduce the default config', () => {
    expect(configFrom({ ...defaultSettings, mode: 'rounds' })).toEqual(defaultConfig)
  })

  it('shows the rounds slider only in Rounds', () => {
    expect(slidersFor('rounds')).toEqual(['shots', 'rounds', 'credits', 'openingCredits', 'refundRate'])
    expect(slidersFor('siege')).toEqual(['shots', 'credits'])
  })

  it('chosen values reach the sim', () => {
    const config = configFrom({ ...defaultSettings, mode: 'rounds', shots: 5, rounds: 3, credits: 7, openingCredits: 55, refundRate: 4 })
    const s = initialState(1, config)
    expect(s.possession.shots).toBe(5)
    expect(s.credits[s.match.builder!]).toBe(55)
    expect(config.rounds).toBe(3)
    expect(config.refundRate).toBe(4)
  })

  it('a chosen mode reaches the sim', () => {
    expect(initialState(1, configFrom({ ...defaultSettings, mode: 'siege' })).match.mode).toBe('siege')
  })

  it('Opening Credits is a 10-80 slider that clamps and reaches the config', () => {
    expect(SLIDERS.openingCredits).toMatchObject({ label: 'Opening Credits', min: 10, max: 80, def: 40 })
    expect(configFrom({ ...defaultSettings, openingCredits: 500 }).openingCredits).toBe(80)
    expect(configFrom({ ...defaultSettings, openingCredits: 0 }).openingCredits).toBe(10)
  })

  it('values are clamped to the slider range', () => {
    expect(configFrom({ ...defaultSettings, mode: 'rounds', shots: 99, rounds: 0, credits: 10 })).toMatchObject({ shots: SLIDERS.shots.max, rounds: SLIDERS.rounds.min })
  })
})
