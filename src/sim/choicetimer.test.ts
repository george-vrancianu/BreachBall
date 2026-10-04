import { describe, expect, it } from 'vitest'
import { defaultConfig, initialState, step, type SimConfig, type SimEvent, type SimInput, type SimState } from './step'
import type { Structure } from './wall'
import { hudModel } from '../game/view/hudModel'
import { healthOf, hseg } from './testkit'

const timed: SimConfig = { ...defaultConfig, mode: 'siege', buildTime: 2 }
const hotseat: SimConfig = { ...defaultConfig, mode: 'siege' }
const TICKS = 2 * timed.tickHz
const w = (id: number, owner: 1 | 2, gx: number, hp = 1): Structure => ({ id, kind: 'wall', owner, ...hseg(gx, owner === 1 ? 40 : 10), segments: [hp] })

/** The state right after a goal opened a defence choice for player 1. */
const choice = (c: SimConfig): SimState => {
  const init = initialState(1, c)
  const s: SimState = { ...init, match: { ...init.match, builder: null, opening: false } as SimState['match'], objects: [w(1, 1, 2), w(2, 1, 8), w(3, 2, 2)], nextId: 4, ball: { ...init.ball, pos: { x: 20, y: 0.5 }, vel: { x: 0, y: -60 } }, possession: { shooter: 1, shots: 1, inHand: false, live: true } }
  return step(s, {}, c).state
}
/** Steps `n` ticks, `input` on the first. */
const run = (s: SimState, n: number, c: SimConfig, input: SimInput = {}) => {
  const events: SimEvent[] = []
  for (let i = 0; i < n; i++) {
    const r = step(s, i === 0 ? input : {}, c)
    s = r.state
    events.push(...r.events)
  }
  return { s, events }
}

describe('defence turn under the build timer', () => {
  it('a goal opens the choice with a full build window that drains while it is pending', () => {
    const s = choice(timed)
    expect(s.match).toMatchObject({ choosing: 1, builder: null })
    expect(s.clock.left).toBe(TICKS)
    expect(run(s, 10, timed).s.clock.left).toBe(TICKS - 10)
  })

  it('the HUD shows the draining build clock while the choice is pending', () => {
    const s = run(choice(timed), 20, timed).s
    const m = hudModel(s, timed, { active: 1, viewer: 1 })
    expect(m.clock?.seconds).toBeCloseTo((TICKS - 20) / timed.tickHz)
    expect(m.clock?.fraction).toBeCloseTo((TICKS - 20) / TICKS)
  })

  it('an unanswered choice resolves as Repair with a repaired event per structure when the window runs out', () => {
    const { s, events } = run(choice(timed), TICKS, timed)
    expect(s.match).toMatchObject({ choosing: null, builder: null })
    expect(s.objects.filter((o) => o.owner === 1).map((o) => healthOf(o))).toEqual([3, 3])
    expect(events.filter((e) => e.type === 'repaired')).toEqual([
      { type: 'repaired', id: 1, player: 1 },
      { type: 'repaired', id: 2, player: 1 },
    ])
    expect(s.clock.left).toBe(timed.shotClock * timed.tickHz)
  })

  it('does not time out one tick early', () => {
    expect(run(choice(timed), TICKS - 1, timed).s.match.choosing).toBe(1)
  })

  it('a choice made on the expiry tick wins over the timeout', () => {
    const waited = run(choice(timed), TICKS - 1, timed).s
    const r = step(waited, { defence: { player: 1, choice: 'rearrange' } }, timed)
    expect(r.state.match).toMatchObject({ choosing: null, builder: 1 })
    expect(r.events.filter((e) => e.type === 'repaired')).toEqual([])
  })

  it('Rearrange continues the same window instead of refilling it', () => {
    const waited = run(choice(timed), 30, timed).s
    const r = step(waited, { defence: { player: 1, choice: 'rearrange' } }, timed).state
    expect(r.match.builder).toBe(1)
    expect(r.clock.left).toBe(TICKS - 31)
  })

  it('the Rearrange expiry ends the turn like a timed-out build, handing play on', () => {
    const waited = run(choice(timed), 30, timed).s
    const r = step(waited, { defence: { player: 1, choice: 'rearrange' } }, timed).state
    const done = run(r, TICKS - 31, timed).s
    expect(done.match).toMatchObject({ builder: null, choosing: null })
    expect(done.clock.left).toBe(timed.shotClock * timed.tickHz)
    expect(done.possession).toMatchObject({ shooter: 2, inHand: false })
    expect(done.ball.pos).toEqual({ x: 20, y: 5 })
  })

  it('without a build timer the choice waits indefinitely', () => {
    expect(run(choice(hotseat), 50_000, hotseat).s.match).toMatchObject({ choosing: 1, builder: null })
  })
})
