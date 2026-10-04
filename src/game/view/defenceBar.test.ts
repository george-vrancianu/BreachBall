import { describe, expect, it } from 'vitest'
import type { Structure, Tower } from '../../sim/wall'
import type { SimEvent } from '../../sim/step'
import { countDestroyed, defenceBar } from './defenceBar'

const wall = (id: number, owner: 1 | 2): Structure => ({ kind: 'wall', id, owner, hp: 3, a: { x: 0, y: 0 }, b: { x: 8, y: 0 } })
const tower = (id: number, owner: 1 | 2): Structure => ({ kind: 'tower', id, owner, hp: 1, power: 'steal', at: { gx: 0, gy: 0 } })

describe('defenceBar', () => {
  it('counts each player\'s structures, towers included, and fills one segment each', () => {
    const bar = defenceBar([wall(1, 1), tower(2, 1), wall(3, 2)], { 1: 0, 2: 0 }, null)
    expect(bar[1]).toEqual({ count: '2', segments: [true, true] })
    expect(bar[2]).toEqual({ count: '1', segments: [true] })
  })
  it('reads structures, not hit points', () => {
    const hurt = { ...wall(1, 1), hp: 1 }
    expect(defenceBar([hurt], { 1: 0, 2: 0 }, null)[1].segments).toEqual([true])
  })
  it('empties a destroyed structure\'s segment from the outer end, keeping the count down', () => {
    const bar = defenceBar([wall(1, 1)], { 1: 2, 2: 0 }, null)
    expect(bar[1]).toEqual({ count: '1', segments: [true, false, false] })
  })
  it('draws one segment per structure standing when none were destroyed', () => {
    expect(defenceBar([wall(1, 1), wall(2, 1)], { 1: 0, 2: 0 }, null)[1].segments).toEqual([true, true])
  })
  it('shows "?" and no segments for the hidden seat', () => {
    const bar = defenceBar([wall(1, 1), wall(2, 2)], { 1: 0, 2: 0 }, 2)
    expect(bar[2]).toEqual({ count: '?', segments: [] })
    expect(bar[1].count).toBe('1')
  })
  it('an empty side reads 0 with no segments', () => {
    expect(defenceBar([], { 1: 0, 2: 0 }, null)[1]).toEqual({ count: '0', segments: [] })
  })
})

describe('countDestroyed', () => {
  const none = { 1: 0, 2: 0 }
  const at = { x: 0, y: 0 }
  it('counts walls destroyed and Steal towers sprung, by owner', () => {
    const events: SimEvent[] = [{ type: 'wall-destroyed', wall: wall(1, 1), at }, { type: 'steal-triggered', tower: tower(2, 2) as Tower, owner: 2, at }, { type: 'wall-destroyed', wall: wall(3, 1), at }]
    expect(countDestroyed(none, events)).toEqual({ 1: 2, 2: 1 })
  })
  it('does not count a piece the owner takes back, so no empty segment is left', () => {
    const placed = defenceBar([wall(1, 1)], countDestroyed(none, []), null)
    expect(placed[1].segments).toEqual([true])
    const taken = defenceBar([], countDestroyed(none, [{ type: 'refunded', player: 1, count: 1 }]), null)
    expect(taken[1]).toEqual({ count: '0', segments: [] })
  })
  it('leaves an empty segment for a structure destroyed in play', () => {
    const d = countDestroyed(none, [{ type: 'wall-destroyed', wall: wall(1, 1), at }])
    expect(defenceBar([wall(2, 1)], d, null)[1].segments).toEqual([true, false])
  })
})
