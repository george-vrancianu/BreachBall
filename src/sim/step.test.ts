import { describe, expect, it } from 'vitest'
import { defaultConfig, step } from './step'
import { buildState, playState, hseg } from './testkit'

describe('step', () => {
  it('returns new state and an events list without mutating the input', () => {
    const s = playState()
    const { state, events } = step(s, {}, defaultConfig)
    expect(events).toEqual([])
    expect(state).not.toBe(s)
    expect(state.tick).toBe(1)
    expect(s.tick).toBe(0)
  })
  it('starts with an empty object container', () => {
    expect(playState().objects).toEqual([])
  })
  it('adds placed walls to the state, touching end to end but never overlapping', () => {
    const wall = { kind: 'wall', owner: 2, ...hseg(3, 10) } as const
    const next = { kind: 'wall', owner: 2, ...hseg(7, 10) } as const
    let s = step(buildState(2), { placeWall: wall }, defaultConfig).state
    s = step(s, { placeWall: next }, defaultConfig).state
    expect(s.objects).toEqual([
      { ...wall, id: 1, hp: 3 },
      { ...next, id: 2, hp: 3 },
    ])
    const again = step(s, { placeWall: wall }, defaultConfig)
    expect(again.state.objects).toHaveLength(2)
    expect(again.events).toEqual([{ type: 'refused' }])
  })
})

describe('placement and demolition rules', () => {
  it('lets a player wall off their own goal: there is no reachability rule', () => {
    const row = (gx: number) => ({ kind: 'wall', owner: 1, ...hseg(gx, 40) }) as const
    let s = { ...buildState(1), credits: { 1: 20, 2: 20 } }
    for (const gx of [0, 4, 8, 12, 16]) s = step(s, { placeWall: row(gx) }, defaultConfig).state
    expect(s.objects).toHaveLength(5)
  })
  const legal = { kind: 'wall', owner: 1, ...hseg(2, 40) } as const
  const illegal = { ...legal, ...hseg(2, 10) }
  const placed = { ...legal, id: 1, hp: 3 }
  it('places a legal wall and refuses an illegal one', () => {
    expect(step(buildState(1), { placeWall: legal }, defaultConfig).state.objects).toEqual([placed])
    const bad = step(buildState(1), { placeWall: illegal }, defaultConfig)
    expect(bad.state.objects).toEqual([])
    expect(bad.events).toEqual([{ type: 'refused' }])
  })
  it('demolishes own wall for 1 point, no refund', () => {
    const s = { ...buildState(1), objects: [placed] }
    const { state } = step(s, { demolish: { player: 1, wall: 1 } }, defaultConfig)
    expect(state.objects).toEqual([])
    expect(state.credits[1]).toBe(s.credits[1] - 1)
    expect(state.credits[2]).toBe(s.credits[2])
  })
  it('refuses to demolish the opponent wall', () => {
    const s = { ...buildState(1), objects: [placed] }
    const { state, events } = step(s, { demolish: { player: 2, wall: 1 } }, defaultConfig)
    expect(state.objects).toEqual([placed])
    expect(state.credits).toEqual(s.credits)
    expect(events).toEqual([{ type: 'refused' }])
  })
  it('refuses to demolish with no points left, or a missing wall', () => {
    const s = { ...buildState(1), objects: [placed], credits: { 1: 0, 2: 0 } }
    expect(step(s, { demolish: { player: 1, wall: 1 } }, defaultConfig).state.objects).toEqual([placed])
    expect(step(buildState(1), { demolish: { player: 1, wall: 1 } }, defaultConfig).events).toEqual([{ type: 'refused' }])
  })
})
