import { describe, expect, it } from 'vitest'
import { rules } from '../config/rules'
import { canPlayBuild, defaultConfig as c, initialState, playCost, step, type SimInput, type SimState } from './step'
import { funded, hseg, playState, roundsMatch } from './testkit'
import type { WallSpec } from './wall'

const run = (s: SimState, ...inputs: SimInput[]) => inputs.reduce((st, i) => step(st, i, c).state, s)
/** Rounds play with player 1 holding the ball, placed and at rest, before the round's first shot. */
const before = (): SimState => {
  const s = playState()
  return { ...s, possession: { shooter: 1, shots: c.shots, inHand: false, live: false }, ball: { ...s.ball, pos: { x: 20, y: 80 } } }
}
const wall = (owner: 1 | 2, units = 1): WallSpec => ({ kind: 'wall', owner, ...hseg(10, owner === 1 ? 40 : 10, units) })
const shot: SimInput = { shot: { player: 1, dir: { x: 0, y: -1 }, tier: 0, power: 0.2 } }

describe('in-play build (Rounds)', () => {
  it('the shooter may build before the round\'s first shot, at the in-play price', () => {
    const s = before()
    expect(canPlayBuild(s, 1)).toBe(true)
    const after = run(s, { placeWall: wall(1, 2) })
    expect(after.objects).toHaveLength(1)
    expect(s.credits[1] - after.credits[1]).toBe(2 * rules.playBuild.wallUnitCost)
    expect(playCost(wall(1, 2))).toBe(6)
    expect(playCost({ kind: 'tower', owner: 1, power: 'repulsor', at: { gx: 9, gy: 40 } })).toBe(rules.playBuild.towerCost.repulsor)
  })

  it('works with the ball still in hand', () => {
    const s = { ...before(), possession: { shooter: 1 as const, shots: c.shots, inHand: true, live: false } }
    expect(run(s, { placeWall: wall(1) }).objects).toHaveLength(1)
  })

  it('a piece built in play is final: it is not in `built`, so it can be neither moved nor demolished', () => {
    const after = run(before(), { placeWall: wall(1) })
    const id = after.objects[0]!.id
    expect(after.built).not.toContain(id)
    const moved = step(after, { moveStructure: { player: 1, id, a: { x: 4, y: 90 }, b: { x: 12, y: 90 } } }, c)
    expect(moved.events.some((e) => e.type === 'refused')).toBe(true)
    const demolished = step(after, { demolish: { player: 1, wall: id } }, c)
    expect(demolished.events.some((e) => e.type === 'refused')).toBe(true)
    expect(demolished.state.objects).toHaveLength(1)
  })

  it('is refused for the other player, after the round\'s first shot, mid-shot, or without the Credits', () => {
    const s = before()
    expect(step(s, { placeWall: wall(2) }, c).events.some((e) => e.type === 'refused')).toBe(true)
    const fired = step(s, shot, c).state
    expect(canPlayBuild(fired, 1)).toBe(false)
    expect(roundsMatch(fired).roundShots).toBe(1)
    const broke = funded(s, 1, rules.playBuild.wallUnitCost - 1)
    expect(step(broke, { placeWall: wall(1) }, c).events.some((e) => e.type === 'refused')).toBe(true)
  })

  it('is refused on an illegal spot (the opponent\'s half)', () => {
    const s = before()
    expect(step(s, { placeWall: { ...wall(2), owner: 1 } }, c).events.some((e) => e.type === 'refused')).toBe(true)
  })

  it('never happens in Siege', () => {
    const siege = { ...c, mode: 'siege' as const }
    const s0 = initialState(1, siege)
    const s: SimState = { ...s0, match: { mode: 'siege', seed: 1, winner: null, builder: null, choosing: null, opening: false }, possession: { shooter: 1, shots: 3, inHand: false, live: false }, credits: { 1: 10, 2: 10 } }
    expect(canPlayBuild(s, 1)).toBe(false)
    expect(step(s, { placeWall: wall(1) }, siege).events.some((e) => e.type === 'refused')).toBe(true)
  })
})
