import { describe, expect, it } from 'vitest'
import { rules } from '../config/rules'
import { coinFlip } from './match'
import { opponent } from './possession'
import { defaultConfig, initialState, step, type SimConfig, type SimState } from './step'
import { playState, roundsMatch } from './testkit'

const siege: SimConfig = { ...defaultConfig, mode: 'siege' }
const seats = [1, 2] as const
/** Where `kicker` kicks off: the centre line, `kickoffGap` out from their own goal line. */
const spot = (kicker: 1 | 2) => ({ x: rules.pitchWidth / 2, y: kicker === 1 ? rules.pitchHeight - rules.kickoffGap : rules.kickoffGap })
const seedFor = (kicker: 1 | 2) => [1, 2, 3, 4, 5, 6, 7, 8].find((seed) => coinFlip(seed, 1) === kicker)!
const goal = (scorer: 1 | 2, s: SimState): SimState => ({
  ...s,
  ball: { pos: { x: 20, y: scorer === 1 ? 0.5 : rules.pitchHeight - 0.5 }, vel: { x: 0, y: scorer === 1 ? -60 : 60 }, rolled: 0 },
  possession: { shooter: scorer, shots: 1, inHand: false, live: true },
})

describe('Kick-off', () => {
  it('sits kickoffGap out from the kicker own goal line on the centre line', () => {
    expect(rules.kickoffGap).toBe(5)
    expect(spot(1)).toEqual({ x: 20, y: 103 })
    expect(spot(2)).toEqual({ x: 20, y: 5 })
  })
  it.each(seats)('starts the match for seat %i with the ball fixed at their spot, no placement', (kicker) => {
    for (const config of [defaultConfig, siege]) {
      const s = initialState(seedFor(kicker), config)
      expect(s.possession).toEqual({ shooter: kicker, shots: config.shots, inHand: false, live: false })
      expect(s.ball.pos).toEqual(spot(kicker))
    }
  })
  it.each(seats)('follows a Rounds goal by seat %i: the conceder kicks off', (scorer) => {
    const r = step(goal(scorer, playState()), {}, defaultConfig)
    const conceder = opponent(scorer)
    expect(r.state.possession).toEqual({ shooter: conceder, shots: defaultConfig.shots, inHand: false, live: false })
    expect(r.state.ball.pos).toEqual(spot(conceder))
    expect(r.state.ball.vel).toEqual({ x: 0, y: 0 })
  })
  it.each(seats)('follows a Siege goal by seat %i: the defence turn first, then the conceder kicks off', (scorer) => {
    const conceder = opponent(scorer)
    const base = initialState(1, siege)
    const playing: SimState = { ...base, match: { ...base.match, builder: null, opening: false } as SimState['match'], objects: [{ kind: 'wall', owner: 1, a: { x: 4, y: 80 }, b: { x: 12, y: 80 }, id: 1, hp: 3 }, { kind: 'wall', owner: 2, a: { x: 4, y: 30 }, b: { x: 12, y: 30 }, id: 2, hp: 3 }], nextId: 3 }
    const scored = step(goal(scorer, playing), {}, siege).state
    expect(scored.match).toMatchObject({ choosing: scorer })
    expect(scored.possession).toMatchObject({ shooter: conceder, inHand: false })
    const after = step(scored, { defence: { player: scorer, choice: 'repair' } }, siege).state
    expect(after.possession).toEqual({ shooter: conceder, shots: siege.shots, inHand: false, live: false })
    expect(after.ball.pos).toEqual(spot(conceder))
  })
  it.each(seats)('starts a new Rounds round after a scoreless shot cap with seat %i kicking (coin flip)', (kicker) => {
    const seed = [1, 2, 3, 4, 5, 6, 7, 8].find((n) => coinFlip(n, 2) === kicker)!
    const s = playState(seed)
    const resting: SimState = { ...s, match: { ...roundsMatch(s), roundShots: defaultConfig.shotCap }, ball: { pos: { x: 20, y: 80 }, vel: { x: 0, y: 0 }, rolled: 0 }, possession: { shooter: 1, shots: 3, inHand: false, live: true } }
    const r = step(resting, {}, defaultConfig)
    expect(roundsMatch(r.state).round).toBe(2)
    expect(r.state.possession).toEqual({ shooter: kicker, shots: defaultConfig.shots, inHand: false, live: false })
    expect(r.state.ball.pos).toEqual(spot(kicker))
  })
  it('cannot be placed', () => {
    const s = initialState(1, defaultConfig)
    const r = step({ ...s, match: { ...s.match, builder: null } }, { placeBall: { player: s.possession.shooter, at: { x: 20, y: s.possession.shooter === 1 ? 80 : 28 } } }, defaultConfig)
    expect(r.events).toContainEqual({ type: 'refused' })
    expect(r.state.ball.pos).toEqual(spot(s.possession.shooter))
  })
})
