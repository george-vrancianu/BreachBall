import { describe, expect, it } from 'vitest'
import { configFrom, defaultSettings, SLIDERS, sliderDefault, sliderLabel, slidersFor, withMode } from './settings'
import { defaultConfig, initialState } from './step'
import { modeNamed } from './mode'
import { rules } from '../config/rules'

describe('settings', () => {
  it('defaults to Siege with the slider defaults', () => {
    expect(defaultSettings).toEqual({ mode: 'siege', shots: 3, rounds: 5, credits: 10, openingCredits: 30, refundRate: 2, expiry: 'shoot', pallets: true })
    expect(configFrom(defaultSettings)).toEqual({ ...defaultConfig, mode: 'siege', openingCredits: 30, pallets: rules.pallet.spots })
  })

  it('on time out defaults to Shoot and the choice reaches the sim', () => {
    expect(configFrom(defaultSettings).expiry).toBe('shoot')
    expect(configFrom({ ...defaultSettings, expiry: 'burn' }).expiry).toBe('burn')
  })

  it('Rounds settings reproduce the default config, plus the mode\'s Pallets', () => {
    expect(configFrom(withMode(defaultSettings, 'rounds'))).toEqual({ ...defaultConfig, pallets: rules.pallet.spots })
  })

  it('Pallets default on: each mode\'s spots reach the config, and none with the toggle off', () => {
    for (const mode of ['rounds', 'siege'] as const) {
      expect(configFrom({ ...defaultSettings, mode }).pallets).toEqual(modeNamed(mode).pallets)
      expect(modeNamed(mode).pallets).toEqual(rules.pallet.spots)
      expect(configFrom({ ...defaultSettings, mode, pallets: false }).pallets).toEqual([])
    }
  })

  it('a new match in either mode starts with the two default Pallets, and none with the toggle off', () => {
    for (const mode of ['rounds', 'siege'] as const) {
      expect(initialState(1, configFrom({ ...defaultSettings, mode })).pallets.map((p) => p.pivot)).toEqual([{ x: 6, y: 54 }, { x: 34, y: 54 }])
      expect(initialState(1, configFrom({ ...defaultSettings, mode, pallets: false })).pallets).toEqual([])
    }
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
