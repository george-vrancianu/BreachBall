import { describe, expect, it } from 'vitest'
import { configFrom, defaultSettings, SLIDERS, sliderDefault, sliderLabel, slidersFor, withMode } from './settings'
import { defaultConfig, initialState } from './step'

describe('settings', () => {
  it('defaults to Siege with the slider defaults', () => {
    expect(defaultSettings).toEqual({ mode: 'siege', shots: 3, rounds: 5, credits: 10, openingCredits: 30, refundRate: 2, expiry: 'shoot' })
    expect(configFrom(defaultSettings)).toEqual({ ...defaultConfig, mode: 'siege', openingCredits: 30 })
  })

  it('on time out defaults to Shoot and the choice reaches the sim', () => {
    expect(configFrom(defaultSettings).expiry).toBe('shoot')
    expect(configFrom({ ...defaultSettings, expiry: 'burn' }).expiry).toBe('burn')
  })

  it('Rounds settings reproduce the default config', () => {
    expect(configFrom(withMode(defaultSettings, 'rounds'))).toEqual(defaultConfig)
  })

  it('shows the rounds slider only in Rounds', () => {
    expect(slidersFor('rounds')).toEqual(['shots', 'rounds', 'credits', 'openingCredits', 'refundRate'])
    expect(slidersFor('siege')).toEqual(['shots', 'openingCredits'])
  })

  it('the Opening Credits slider is Wall points in Siege, default 30, and Credits per round is not shown there', () => {
    expect(sliderLabel('siege', 'openingCredits')).toBe('Wall points')
    expect(sliderLabel('rounds', 'openingCredits')).toBe('Opening Credits')
    expect(sliderLabel('siege', 'credits')).toBe('Credits per round')
    expect(sliderDefault('siege', 'openingCredits')).toBe(30)
    expect(sliderDefault('rounds', 'openingCredits')).toBe(40)
    expect(slidersFor('siege')).not.toContain('credits')
  })

  it('switching mode applies that mode\'s Opening default and keeps the other sliders', () => {
    const custom = { ...defaultSettings, shots: 7, openingCredits: 55 }
    expect(withMode(custom, 'rounds')).toEqual({ ...custom, mode: 'rounds', openingCredits: 40 })
    expect(withMode(custom, 'siege')).toBe(custom)
    expect(withMode(withMode(custom, 'rounds'), 'siege')).toEqual({ ...custom, mode: 'siege', openingCredits: 30 })
  })

  it('a Siege opening build holds exactly the Opening amount, whatever Credits per round says', () => {
    const s = initialState(1, configFrom({ ...defaultSettings, mode: 'siege', credits: 3, openingCredits: 25 }))
    expect(s.credits[s.match.builder!]).toBe(25)
    const d = initialState(1, configFrom(defaultSettings))
    expect(d.credits[d.match.builder!]).toBe(30)
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
    expect(SLIDERS.openingCredits).toMatchObject({ label: 'Opening Credits', siegeLabel: 'Wall points', min: 10, max: 80, def: 40 })
    expect(configFrom({ ...defaultSettings, openingCredits: 500 }).openingCredits).toBe(80)
    expect(configFrom({ ...defaultSettings, openingCredits: 0 }).openingCredits).toBe(10)
  })

  it('values are clamped to the slider range', () => {
    expect(configFrom({ ...defaultSettings, mode: 'rounds', shots: 99, rounds: 0, credits: 10 })).toMatchObject({ shots: SLIDERS.shots.max, rounds: SLIDERS.rounds.min })
  })
})
