import { expect, it } from 'vitest'
import { defaultConfig } from '../../sim/step'
import { pausesSim, settingRows } from './sideMenu'

it('lists a Rounds match: mode, rounds, Credits per round, refund rate, On time out', () => {
  expect(settingRows({ ...defaultConfig, mode: 'rounds', rounds: 7, credits: 12, refundRate: 3, expiry: 'burn' })).toEqual([
    { label: 'Mode', value: 'Rounds' },
    { label: 'Rounds', value: '7' },
    { label: 'Credits per round', value: '12' },
    { label: 'Refund rate', value: '3' },
    { label: 'On time out', value: 'Burn' },
  ])
})

it('lists a Siege match without rounds or refunds, its Credits as Wall points', () => {
  expect(settingRows({ ...defaultConfig, mode: 'siege', credits: 10, expiry: 'shoot' }).map((r) => r.label)).toEqual(['Mode', 'Wall points', 'On time out'])
})

it('an open menu pauses the sim in hot-seat, never online or when closed', () => {
  const hotSeat = () => true
  const onlineP1 = (p: 1 | 2) => p === 1
  expect([pausesSim(true, hotSeat), pausesSim(false, hotSeat), pausesSim(true, onlineP1)]).toEqual([true, false, false])
})
