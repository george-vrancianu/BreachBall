import { describe, expect, it } from 'vitest'
import { coinFlip } from './match'
import { blindSeat } from './mode'
import { defaultConfig as c, initialState, step, type SimState } from './step'
import { playState, roundsMatch } from './testkit'

const mid = { x: 20, y: 54 }
const shotAt = (y: number, vy: number, over: Partial<SimState> = {}): SimState => ({
  ...playState(),
  ball: { pos: { x: 20, y }, vel: { x: 0, y: vy }, rolled: 0 },
  possession: { shooter: 1, shots: 3, inHand: false, live: true },
  ...over,
})
const matchAt = (round: number, score: { 1: number; 2: number }, roundShots = 0) => ({ ...playState().match, round, score, roundShots })

describe('goals', () => {
  it('credits the shooter when the ball centre crosses the opponent goal line', () => {
    const r = step(shotAt(0.5, -60), {}, c)
    expect(roundsMatch(r.state).score).toEqual({ 1: 1, 2: 0 })
    expect(r.events).toContainEqual({ type: 'goal', scorer: 1, at: expect.any(Object) })
  })
  it('credits the opponent for an own goal', () => {
    const r = step(shotAt(107.5, 60), {}, c)
    expect(roundsMatch(r.state).score).toEqual({ 1: 0, 2: 1 })
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'goal', scorer: 2 }))
  })
  it('does not score outside the goal mouth', () => {
    const r = step(shotAt(0.5, -60, { ball: { pos: { x: 3, y: 2 }, vel: { x: 0, y: -60 }, rolled: 0 } }), {}, c)
    expect(roundsMatch(r.state).score).toEqual({ 1: 0, 2: 0 })
  })
  it('hands the conceder a Kick-off, a fresh counter and the next round', () => {
    const r = step(shotAt(0.5, -60), {}, c)
    expect(roundsMatch(r.state).round).toBe(2)
    expect(r.state.possession).toEqual({ shooter: 2, shots: 3, inHand: false, live: false })
    expect(r.state.ball.pos).toEqual({ x: 20, y: 5 })
    expect(r.state.ball.vel).toEqual({ x: 0, y: 0 })
    expect(r.events).toContainEqual({ type: 'round-ended', round: 1, scorer: 1 })
  })
})

describe('shot cap', () => {
  const resting = (round: number, shots: number) => shotAt(80, 0, { match: matchAt(round, { 1: 0, 2: 0 }, shots) })
  it('counts every shot', () => {
    const s = shotAt(80, 0, { match: matchAt(1, { 1: 0, 2: 0 }, 4), possession: { shooter: 1, shots: 3, inHand: false, live: false } })
    expect(roundsMatch(step(s, { shot: { player: 1, dir: { x: 1, y: 0 }, tier: 0, power: 0.15 } }, c).state).roundShots).toBe(5)
  })
  it('ends a scoreless round once the 30th shot has come to rest', () => {
    const r = step(resting(1, 30), {}, c)
    expect(r.state.match).toMatchObject({ round: 2, score: { 1: 0, 2: 0 }, roundShots: 0 })
    expect(r.state.possession).toMatchObject({ shooter: coinFlip(1, 2), inHand: false, live: false })
    expect(r.events).toContainEqual({ type: 'round-ended', round: 1, scorer: null })
  })
  it('counts a shot burned on clock expiry, and the 30th burned shot ends the round', () => {
    const burn = (shots: number) => {
      const s = { ...resting(1, shots), ball: { pos: { x: 20, y: 80 }, vel: { x: 0, y: 0 }, rolled: 0 }, possession: { shooter: 1 as const, shots: 3, inHand: false, live: false }, clock: { left: 1, expiries: 0 } }
      return step(s, {}, c)
    }
    expect(burn(28).state.match).toMatchObject({ round: 1, roundShots: 29 })
    const r = burn(29)
    expect(r.state.match).toMatchObject({ round: 2, roundShots: 0 })
    expect(r.events).toContainEqual({ type: 'round-ended', round: 1, scorer: null })
  })
  it('does not end the round before the 30th shot', () => {
    expect(roundsMatch(step(resting(1, 29), {}, c).state).round).toBe(1)
  })
  it('has no cap in sudden death', () => {
    expect(roundsMatch(step(resting(6, 30), {}, c).state).round).toBe(6)
  })
})

describe('coin flip', () => {
  it('is deterministic per seed and round, and varies', () => {
    expect(coinFlip(7, 3)).toBe(coinFlip(7, 3))
    expect(new Set(Array.from({ length: 20 }, (_, i) => coinFlip(i, 1)))).toEqual(new Set([1, 2]))
  })
  it('decides who kicks off round 1 from the seed', () => {
    expect(playState(5).possession).toMatchObject({ shooter: coinFlip(5, 1), inHand: false })
  })
})

describe('game mode', () => {
  it('defaults to Rounds, and a new match carries that mode with round 1 and a 0-0 score', () => {
    expect(c.mode).toBe('rounds')
    expect(initialState(1, c).match).toMatchObject({ mode: 'rounds', round: 1, score: { 1: 0, 2: 0 }, roundShots: 0, winner: null })
  })
})

describe('match end', () => {
  it('goes on through the configured rounds', () => {
    expect(step(shotAt(0.5, -60, { match: matchAt(4, { 1: 0, 2: 0 }) }), {}, c).state.match.winner).toBeNull()
  })
  it('the leader wins after the last round', () => {
    const r = step(shotAt(0.5, -60, { match: matchAt(5, { 1: 2, 2: 2 }) }), {}, c)
    expect(r.state.match.winner).toBe(1)
    expect(r.events).toContainEqual({ type: 'match-ended', winner: 1 })
  })
  it('a tie after the last round goes to sudden death', () => {
    const r = step(shotAt(0.5, -60, { match: matchAt(5, { 1: 1, 2: 2 }) }), {}, c)
    expect(r.state.match).toMatchObject({ score: { 1: 2, 2: 2 }, round: 6, winner: null })
  })
  it('sudden death ends on the first goal', () => {
    expect(step(shotAt(107.5, 60, { match: matchAt(6, { 1: 2, 2: 2 }) }), {}, c).state.match.winner).toBe(2)
  })
  it('a scoreless last round with a leader ends the match', () => {
    expect(step(shotAt(80, 0, { match: matchAt(5, { 1: 1, 2: 0 }, 30) }), {}, c).state.match.winner).toBe(1)
  })
  it('a finished match no longer steps', () => {
    const s = shotAt(0.5, -60, { match: { ...matchAt(5, { 1: 2, 2: 0 }), winner: 1 } })
    expect(step(s, {}, c).state).toBe(s)
  })
})

describe('blindSeat', () => {
  const siege = initialState(1, { ...c, mode: 'siege' })
  it('is the viewer during a Siege build, builder or not, never in Rounds or in play', () => {
    expect(blindSeat(siege.match, 1)).toBe(1)
    expect(blindSeat(siege.match, 2)).toBe(2)
    expect(blindSeat({ ...siege.match, builder: null }, 1)).toBeUndefined()
    expect(blindSeat(initialState(1).match, 1)).toBeUndefined()
  })
})

describe('blindSeat after the opening build', () => {
  const init = initialState(1, { ...c, mode: 'siege' })
  it('is not blind in a Rearrange turn or while a defence choice is pending', () => {
    const over = { ...init.match, opening: false } as typeof init.match
    expect(blindSeat({ ...over, builder: 1 }, 1)).toBeUndefined()
    expect(blindSeat({ ...over, builder: 1 }, 2)).toBeUndefined()
    expect(blindSeat({ ...over, builder: null, choosing: 1 }, 1)).toBeUndefined()
  })
})
