import { describe, expect, it } from 'vitest'
import { rules } from '../../config/rules'
import { buildState, playState } from '../../sim/testkit'
import type { SimState } from '../../sim/step'
import { offenceCircle } from './offenceCircle'

const hotSeat = () => true
const shooterOf = (s: SimState) => s.possession.shooter
const ready = (): SimState => ({ ...playState(), possession: { ...playState().possession, inHand: false } })
const other = (p: 1 | 2) => (p === 1 ? 2 : 1)

describe('offenceCircle', () => {
  it('offers the Breaker at its Credit price during the shooter\'s possession', () => {
    const s = ready()
    const m = offenceCircle(s, shooterOf(s), { armed: false, mine: hotSeat })
    expect(m.available).toBe(true)
    expect(m.items[0]).toEqual({ item: 'breaker', label: `Breaker · ${rules.breakerCost}`, disabled: false, pressed: false })
  })
  it('lists a locked item as soon', () => {
    const s = ready()
    expect(offenceCircle(s, shooterOf(s), { armed: false, mine: hotSeat }).items.slice(1)).toEqual([expect.objectContaining({ disabled: true, soon: true })])
  })
  it('marks the circle and the item armed', () => {
    const s = ready()
    const m = offenceCircle(s, shooterOf(s), { armed: true, mine: hotSeat })
    expect(m.armed).toBe(true)
    expect(m.items[0]!.pressed).toBe(true)
  })
  it('greys the Breaker when the shooter cannot afford it', () => {
    const s = ready()
    const p = shooterOf(s)
    const m = offenceCircle({ ...s, credits: { ...s.credits, [p]: rules.breakerCost - 1 } }, p, { armed: false, mine: hotSeat })
    expect(m.available).toBe(true)
    expect(m.items[0]!.disabled).toBe(true)
  })
  it('is greyed for the viewer who is not shooting, and for a build turn', () => {
    const s = ready()
    expect(offenceCircle(s, other(shooterOf(s)), { armed: false, mine: hotSeat })).toMatchObject({ available: false, armed: false, items: [{ disabled: true }, { disabled: true }] })
    expect(offenceCircle(buildState(1), 1, { armed: true, mine: hotSeat })).toMatchObject({ available: false, armed: true })
  })
  it('is greyed while blocked, or when the shooter\'s seat is another device\'s', () => {
    const s = ready()
    const p = shooterOf(s)
    expect(offenceCircle(s, p, { armed: false, blocked: true, mine: hotSeat }).available).toBe(false)
    expect(offenceCircle(s, p, { armed: false, mine: (q) => q !== p }).available).toBe(false)
  })
  it('is greyed while the ball is in hand', () => {
    const s = { ...playState(), possession: { ...playState().possession, inHand: true } }
    const m = offenceCircle(s, shooterOf(s), { armed: false, mine: hotSeat })
    expect(m.items[0]!.disabled).toBe(true)
  })
  it('counts the stock in Siege, where there are no Credits to pay', () => {
    const s = ready()
    const siege: SimState = { ...s, match: { mode: 'siege', seed: 1, winner: null, builder: null, choosing: null, opening: false } }
    expect(offenceCircle(siege, shooterOf(s), { armed: false, mine: hotSeat }).items[0]!.label).toBe('Breaker · 3 left')
  })
})
