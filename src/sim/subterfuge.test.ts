import { describe, expect, it } from 'vitest'
import { rules } from '../config/rules'
import { firstBuilder } from './match'
import type { PlayerId } from './pitch'
import { opponent } from './possession'
import { canSubterfuge, defaultConfig as c, step } from './step'
import { buildState, playState } from './testkit'
import type { SimState } from './step'

/** Play with the ball placed: the shooter may shoot, refund or Subterfuge. */
const ready = (): SimState => {
  const s = playState()
  return { ...s, possession: { ...s.possession, inHand: false } }
}

const jam = (player: PlayerId) => ({ subterfuge: { player, item: 'jam' as const } })

describe('Subterfuge: Jam', () => {
  it('charges the Jam price in Credits and queues it against the opponent', () => {
    const s = ready()
    const p = s.possession.shooter
    const r = step(s, jam(p), c)
    expect(r.state.credits[p]).toBe(s.credits[p] - rules.jamCost)
    expect(r.state.subterfuge.queued[opponent(p)]).toBe('jam')
    expect(r.state.subterfuge.queued[p]).toBeNull()
    expect(r.events).toContainEqual({ type: 'subterfuge-queued', player: p, item: 'jam' })
  })
  it('does not touch the caster\'s own Move points or the possession', () => {
    const s = ready()
    const r = step(s, jam(s.possession.shooter), c)
    expect(r.state.possession).toEqual(s.possession)
  })
  it('works while the shooter still has the ball in hand', () => {
    const s = playState()
    const r = step(s, jam(s.possession.shooter), c)
    expect(r.state.subterfuge.queued[opponent(s.possession.shooter)]).toBe('jam')
  })
  it('starts the opponent\'s next possession with one Move point fewer, and only that one', () => {
    const s = ready()
    const p = s.possession.shooter
    const cast = step(s, jam(p), c).state
    const handed = step(cast, { refund: { player: p, count: s.possession.shots } }, c)
    expect(handed.state.possession).toEqual({ shooter: opponent(p), shots: c.shots - 1, inHand: false, live: false })
    expect(handed.state.subterfuge.queued[opponent(p)]).toBeNull()
    expect(handed.events).toContainEqual({ type: 'subterfuge-landed', player: opponent(p), item: 'jam' })
    // The opponent hands back with a refund: the caster's next possession is whole again.
    const placed = { ...handed.state, possession: { ...handed.state.possession, inHand: false } }
    const back = step(placed, { refund: { player: opponent(p), count: c.shots - 1 } }, c)
    expect(back.state.possession).toEqual({ shooter: p, shots: c.shots, inHand: false, live: false })
    expect(back.events.some((e) => e.type === 'subterfuge-landed')).toBe(false)
  })
  it('stays queued while the caster keeps the ball, however many shots pass', () => {
    const s = ready()
    const p = s.possession.shooter
    const cast = step(s, jam(p), c).state
    const refunded = step(cast, { refund: { player: p, count: 1 } }, c).state
    expect(refunded.subterfuge.queued[opponent(p)]).toBe('jam')
    expect(refunded.possession.shots).toBe(c.shots - 1)
  })
  describe('cast in the last build turn', () => {
    // The last builder (not the first) ends the build phase; the possession is already set for the round.
    const last = opponent(firstBuilder(buildState(1).match.seed, 1))
    const castThenEnd = (shooter: PlayerId) => {
      const s = buildState(last)
      const cast = step({ ...s, possession: { ...s.possession, shooter } }, jam(last), c).state
      expect(cast.subterfuge.queued[opponent(last)]).toBe('jam')
      expect(cast.possession.shots).toBe(c.shots)
      const done = step(cast, { done: last }, c)
      expect(done.state.match.builder).toBeNull()
      return done.state
    }
    it('lands when play begins on the opponent\'s possession', () => {
      const after = castThenEnd(opponent(last))
      expect(after.possession.shots).toBe(c.shots - 1)
      expect(after.subterfuge.queued[opponent(last)]).toBeNull()
    })
    it('stays queued when play begins on the caster\'s own possession', () => {
      const after = castThenEnd(last)
      expect(after.possession.shots).toBe(c.shots)
      expect(after.subterfuge.queued[opponent(last)]).toBe('jam')
    })
  })
  it('carries through a goal and the next round\'s build turns, landing on the conceder\'s possession', () => {
    const s = ready()
    const scorer: PlayerId = 1
    const cast = step({ ...s, possession: { ...s.possession, shooter: scorer } }, jam(scorer), c).state
    // The scorer shoots a goal (the ball crosses the opponent's goal line).
    const shooting: SimState = { ...cast, ball: { pos: { x: 20, y: 0.5 }, vel: { x: 0, y: -60 }, rolled: 0 }, possession: { shooter: scorer, shots: c.shots, inHand: false, live: true } }
    let r = step(shooting, {}, c)
    expect(r.events).toContainEqual({ type: 'round-ended', round: 1, scorer })
    expect(r.state.subterfuge.queued[opponent(scorer)]).toBe('jam')
    // Both builders finish their turns; play begins on the conceder's possession.
    for (let i = 0; i < 2 && r.state.match.builder; i++) r = step(r.state, { done: r.state.match.builder }, c)
    expect(r.state.match.builder).toBeNull()
    expect(r.state.possession.shooter).toBe(opponent(scorer))
    expect(r.state.possession.shots).toBe(c.shots - 1)
    expect(r.state.subterfuge.queued).toEqual({ 1: null, 2: null })
    expect(r.events).toContainEqual({ type: 'subterfuge-landed', player: opponent(scorer), item: 'jam' })
  })
  it('never takes the last Move point', () => {
    const one = { ...c, shots: 1 }
    const s = ready()
    const p = s.possession.shooter
    const cast = step({ ...s, possession: { ...s.possession, shots: 1 } }, jam(p), one).state
    const handed = step(cast, { refund: { player: p, count: 1 } }, one)
    expect(handed.state.possession.shots).toBe(1)
    expect(handed.state.subterfuge.queued[opponent(p)]).toBeNull()
  })

  describe('one per turn', () => {
    it('refuses a second Subterfuge in the same possession, without charging', () => {
      const s = ready()
      const p = s.possession.shooter
      const first = step(s, jam(p), c).state
      const second = step(first, jam(p), c)
      expect(second.events).toContainEqual({ type: 'refused' })
      expect(second.state.credits[p]).toBe(first.credits[p])
    })
    it('refuses a second Subterfuge in the same build turn', () => {
      const s = buildState(1)
      const first = step(s, jam(1), c).state
      const second = step(first, jam(1), c)
      expect(second.events).toContainEqual({ type: 'refused' })
      expect(second.state.credits[1]).toBe(first.credits[1])
    })
    it('allows one again in the next turn once the Jam has landed', () => {
      const s = ready()
      const p = s.possession.shooter
      const cast = step(s, jam(p), c).state
      const handed = step(cast, { refund: { player: p, count: s.possession.shots } }, c).state
      expect(canSubterfuge(handed, opponent(p))).toBe(true)
      expect(step(handed, jam(opponent(p)), c).state.subterfuge.queued[p]).toBe('jam')
    })
    it('refuses a Jam while one is already queued against that opponent, in a real later turn', () => {
      // The first builder casts in their own build turn and also holds the first possession, so the Jam stays queued while play begins.
      const first = firstBuilder(buildState(1).match.seed, 1)
      const s = buildState(first)
      let r = step({ ...s, possession: { ...s.possession, shooter: first } }, jam(first), c)
      expect(r.state.subterfuge.queued[opponent(first)]).toBe('jam')
      r = step(r.state, { done: first }, c)
      r = step(r.state, { done: opponent(first) }, c)
      expect(r.state.match.builder).toBeNull()
      expect(r.state.subterfuge.queued[opponent(first)]).toBe('jam')
      expect(r.state.subterfuge.spent).toBe(false)
      expect(canSubterfuge(r.state, first)).toBe(true)
      const second = step(r.state, jam(first), c)
      expect(second.events).toContainEqual({ type: 'refused' })
      expect(second.state.credits[first]).toBe(r.state.credits[first])
    })
  })

  describe('refused', () => {
    it('for an unknown item, without charging', () => {
      const s = ready()
      const p = s.possession.shooter
      const r = step(s, { subterfuge: { player: p, item: 'nuke' as never } }, c)
      expect(r.events).toContainEqual({ type: 'refused' })
      expect(r.state.credits).toEqual(s.credits)
      expect(r.state.subterfuge).toEqual(s.subterfuge)
    })
    it('without enough Credits', () => {
      const s = ready()
      const p = s.possession.shooter
      const r = step({ ...s, credits: { ...s.credits, [p]: rules.jamCost - 1 } }, jam(p), c)
      expect(r.events).toContainEqual({ type: 'refused' })
      expect(r.state.subterfuge.queued[opponent(p)]).toBeNull()
    })
    it('by a player who is not the shooter', () => {
      const s = ready()
      const r = step(s, jam(opponent(s.possession.shooter)), c)
      expect(r.events).toContainEqual({ type: 'refused' })
      expect(r.state.subterfuge.queued).toEqual({ 1: null, 2: null })
    })
    it('by the waiting player during a build turn', () => {
      const r = step(buildState(1), jam(2), c)
      expect(r.events).toContainEqual({ type: 'refused' })
    })
    it('while a shot is in flight', () => {
      const s = ready()
      const p = s.possession.shooter
      const live = { ...s, possession: { ...s.possession, live: true } }
      expect(canSubterfuge(live, p)).toBe(false)
      expect(step(live, jam(p), c).events).toContainEqual({ type: 'refused' })
    })
    it('in Siege, which has no Credits economy', () => {
      const s = ready()
      const p = s.possession.shooter
      const siege = { ...s, match: { mode: 'siege' as const, seed: 1, winner: null, builder: null, choosing: null, opening: false } }
      expect(step(siege, jam(p), { ...c, mode: 'siege' }).events).toContainEqual({ type: 'refused' })
    })
  })
})
