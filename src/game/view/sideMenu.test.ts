import { expect, it } from 'vitest'
import { defaultConfig } from '../../sim/step'
import { pausesSim, settingRows } from './sideMenu'

it('lists a Rounds match: mode, rounds, Credits per round, Opening Credits, refund rate, On time out', () => {
  expect(settingRows({ ...defaultConfig, mode: 'rounds', rounds: 7, credits: 12, openingCredits: 50, refundRate: 3, expiry: 'burn' })).toEqual([
    { label: 'Mode', value: 'Rounds' },
    { label: 'Rounds', value: '7' },
    { label: 'Credits per round', value: '12 credits' },
    { label: 'Opening Credits', value: '50 credits' },
    { label: 'Refund rate', value: '3 credits' },
    { label: 'On time out', value: 'Burn' },
  ])
})

it('lists a Siege match without rounds or refunds, its Opening amount as Wall points', () => {
  expect(settingRows({ ...defaultConfig, mode: 'siege', credits: 10, openingCredits: 30, expiry: 'shoot' })).toEqual([
    { label: 'Mode', value: 'Siege' },
    { label: 'Wall points', value: '30 pts' },
    { label: 'On time out', value: 'Shoot' },
  ])
})

it('an open menu pauses the sim in hot-seat, never online or when closed', () => {
  expect([pausesSim(true, true), pausesSim(false, true), pausesSim(true, false)]).toEqual([true, false, false])
})
