import { describe, expect, it } from 'vitest'
import type { Structure } from '../../sim/wall'
import { defenceBar, growSlots } from './defenceBar'

const wall = (id: number, owner: 1 | 2): Structure => ({ kind: 'wall', id, owner, hp: 3, a: { x: 0, y: 0 }, b: { x: 8, y: 0 } })
const tower = (id: number, owner: 1 | 2): Structure => ({ kind: 'tower', id, owner, hp: 1, power: 'steal', at: { gx: 0, gy: 0 } })

describe('defenceBar', () => {
  it('counts each player\'s structures, towers included, and fills one segment each', () => {
    const bar = defenceBar([wall(1, 1), tower(2, 1), wall(3, 2)], { 1: 2, 2: 1 }, null)
    expect(bar[1]).toEqual({ count: '2', segments: [true, true] })
    expect(bar[2]).toEqual({ count: '1', segments: [true] })
  })
  it('reads structures, not hit points', () => {
    const hurt = { ...wall(1, 1), hp: 1 }
    expect(defenceBar([hurt], { 1: 1, 2: 0 }, null)[1].segments).toEqual([true])
  })
  it('empties a destroyed structure\'s segment from the outer end, keeping the count down', () => {
    const bar = defenceBar([wall(1, 1)], { 1: 3, 2: 0 }, null)
    expect(bar[1]).toEqual({ count: '1', segments: [true, false, false] })
  })
  it('never has fewer segments than structures standing', () => {
    expect(defenceBar([wall(1, 1), wall(2, 1)], { 1: 0, 2: 0 }, null)[1].segments).toEqual([true, true])
  })
  it('shows "?" and no segments for the hidden seat', () => {
    const bar = defenceBar([wall(1, 1), wall(2, 2)], { 1: 1, 2: 1 }, 2)
    expect(bar[2]).toEqual({ count: '?', segments: [] })
    expect(bar[1].count).toBe('1')
  })
  it('an empty side reads 0 with no segments', () => {
    expect(defenceBar([], { 1: 0, 2: 0 }, null)[1]).toEqual({ count: '0', segments: [] })
  })
})

describe('growSlots', () => {
  it('keeps the most structures each player has stood so a destroyed one leaves an empty segment', () => {
    const a = growSlots({ 1: 0, 2: 0 }, [wall(1, 1), wall(2, 1), wall(3, 2)])
    expect(a).toEqual({ 1: 2, 2: 1 })
    expect(growSlots(a, [wall(1, 1)])).toEqual({ 1: 2, 2: 1 })
    expect(growSlots(a, [wall(1, 1), wall(2, 1), wall(4, 1)])[1]).toBe(3)
  })
})
