import { describe, expect, it } from 'vitest'
import { coinFlip, firstBuilder } from './match'
import { opponent } from './possession'
import type { PlayerId } from './pitch'
import { isLegal, type Structure, type TowerSpec, type WallSpec } from './wall'
import { canFinishBuild, defaultConfig, initialState, step, type SimConfig, type SimEvent, type SimState } from './step'
import { emptied, funded, hseg, siegeBuild } from './testkit'

const siege: SimConfig = { ...defaultConfig, mode: 'siege' }
const wall = (id: number, owner: PlayerId, hp = 3, gy = owner === 1 ? 40 : 26): Structure => ({ id, kind: 'wall', owner, ...hseg(5, gy), hp })
const steal = (id: number, owner: PlayerId): Structure => ({ id, kind: 'tower', owner, power: 'steal', at: { gx: 10, gy: 40 }, hp: 1 })
/** Play phase with `objects` on the pitch (default: one wall each, so nobody is wiped out). */
const playing = (seed = 1, objects: Structure[] = [wall(1, 1), wall(2, 2)]): SimState => {
  const s = initialState(seed, siege)
  return { ...s, objects, match: { ...s.match, builder: null } }
}
/** `s` with `shooter` holding a ball at rest at `pos`, ready to shoot. */
const ready = (s: SimState, shooter: PlayerId, pos: { x: number; y: number }): SimState => ({ ...s, ball: { ...s.ball, pos, vel: { x: 0, y: 0 } }, possession: { shooter, shots: 2, inHand: false, live: false } })
/** Steps until the ball rests, returning the events of every tick. */
const settle = (s: SimState) => {
  const events: SimEvent[][] = []
  for (let t = 0; t < 3000 && (s.possession.live || t === 0); t++) {
    const r = step(s, {}, siege)
    s = r.state
    events.push(r.events)
  }
  return { s, events }
}
const ended = (events: SimEvent[][]) => events.flat().filter((e) => e.type === 'match-ended')
/** Fires a full-power shot straight up (`dy` -1) or down (1) and steps until the ball rests: the firing tick's events come first. */
const fire = (s: SimState, dy: 1 | -1, breaker?: true) => {
  const r = step(s, { shot: { player: s.possession.shooter, dir: { x: 0, y: dy }, tier: 1, power: 1, breaker } }, siege)
  const rest = settle(r.state)
  return { s: rest.s, events: [r.events, ...rest.events] }
}
const shot = (s: SimState, shooter: 1 | 2, y: number, vy: number): SimState => ({ ...s, ball: { ...s.ball, pos: { x: 20, y }, vel: { x: 0, y: vy } }, possession: { ...s.possession, shooter, inHand: false, live: true } })

const piece = (owner: 1 | 2): WallSpec => ({ kind: 'wall', owner, ...hseg(10, owner === 1 ? 40 : 10) })

describe('Siege', () => {
  it('opens with one build per player in the Rounds order, then never builds again', () => {
    let s = initialState(1, siege)
    const first = firstBuilder(1, 1)
    expect(s.match).toMatchObject({ mode: 'siege', builder: first })
    expect(s.possession).toMatchObject({ shooter: coinFlip(1, 1), inHand: false })
    s = step(step(s, { placeWall: piece(first) }, siege).state, { done: first }, siege).state
    expect(s.match.builder).toBe(opponent(first))
    expect(s.credits[opponent(first)]).toBe(siege.credits)
    s = step(step(s, { placeWall: piece(opponent(first)) }, siege).state, { done: opponent(first) }, siege).state
    expect(s.match.builder).toBeNull()
  })

  it('towers keep the fixed stock: no Credits spent, one drawn, a same-turn demolish returns it, none left refuses', () => {
    const spec: TowerSpec = { kind: 'tower', owner: 1, power: 'steal', at: { gx: 10, gy: 40 } }
    const b = siegeBuild(1)
    const r = step(b, { placeWall: spec }, siege).state
    expect(r.objects).toHaveLength(1)
    expect(r.credits[1]).toBe(b.credits[1])
    expect(r.players[1].inventory.steal).toBe(b.players[1].inventory.steal - 1)
    const back = step(r, { demolish: { player: 1, wall: 1 } }, siege).state
    expect(back.players[1].inventory.steal).toBe(b.players[1].inventory.steal)
    expect(back.credits[1]).toBe(b.credits[1])
    // No Credits do not matter, an empty stock does.
    expect(step(funded(b, 1, 0), { placeWall: spec }, siege).state.objects).toHaveLength(1)
    const empty = emptied(b, 1, 'steal')
    expect(step(empty, { placeWall: spec }, siege).events).toEqual([{ type: 'refused' }])
  })

  it('Done with no own structure is refused and the build turn continues', () => {
    const first = firstBuilder(1, 1)
    const r = step(initialState(1, siege), { done: first }, siege)
    expect(r.events).toEqual([{ type: 'refused' }])
    expect(r.state.match.builder).toBe(first)
  })

  it('Done is refused again after the only piece is demolished', () => {
    const first = firstBuilder(1, 1)
    let s = step(initialState(1, siege), { placeWall: piece(first) }, siege).state
    const id = s.objects[0].id
    s = step(s, { demolish: { player: first, wall: id } }, siege).state
    expect(s.objects).toEqual([])
    const r = step(s, { done: first }, siege)
    expect(r.events).toEqual([{ type: 'refused' }])
    expect(r.state.match.builder).toBe(first)
  })

  it('the Done button is enabled only once the builder owns a structure; Rounds always enables it', () => {
    const first = firstBuilder(1, 1)
    const empty = initialState(1, siege)
    expect(canFinishBuild(empty, siege)).toBe(false)
    const placed = step(empty, { placeWall: piece(first) }, siege).state
    expect(canFinishBuild(placed, siege)).toBe(true)
    expect(canFinishBuild(step(placed, { demolish: { player: first, wall: placed.objects[0].id } }, siege).state, siege)).toBe(false)
    expect(canFinishBuild(initialState(1), defaultConfig)).toBe(true)
  })

  it('a structure of the opponent does not let the builder finish', () => {
    const first = firstBuilder(1, 1)
    let s = step(initialState(1, siege), { placeWall: piece(first) }, siege).state
    s = step(step(s, { done: first }, siege).state, { done: opponent(first) }, siege).state
    expect(s.match.builder).toBe(opponent(first))
  })

  it('a goal scores nothing and hands the conceder a Kick-off from their own goal with a fresh counter', () => {
    const before = shot(playing(), 1, 0.5, -60)
    const r = step({ ...before, possession: { ...before.possession, shots: 1 } }, {}, siege)
    expect(r.events).toContainEqual({ type: 'goal', scorer: 1, at: expect.anything() })
    expect(r.events.some((e) => e.type === 'round-ended')).toBe(false)
    expect(r.state.match).toMatchObject({ mode: 'siege', builder: null, winner: null })
    expect(r.state.possession).toEqual({ shooter: 2, shots: siege.shots, inHand: false, live: false })
    expect(r.state.ball.pos).toEqual({ x: 20, y: 5 })
    expect(r.state.ball.vel).toEqual({ x: 0, y: 0 })
  })

  it('an own goal counts for the opponent', () => {
    const r = step(shot(playing(), 1, 107.5, 60), {}, siege)
    expect(r.events).toContainEqual({ type: 'goal', scorer: 2, at: expect.anything() })
    expect(r.state.possession).toMatchObject({ shooter: 1, inHand: false })
    expect(r.state.ball.pos).toEqual({ x: 20, y: 103 })
  })

  it('shots never end anything: no shot cap, no round-ended, no build', () => {
    let s = playing()
    for (let i = 0; i < siege.shotCap + 5; i++) {
      // A full-power shot from near player 1's goal travels a long way across the pitch before resting.
      s = { ...s, possession: { ...s.possession, shooter: 1, shots: siege.shots, inHand: false, live: false }, ball: { ...s.ball, pos: { x: 20, y: 90 }, vel: { x: 0, y: 0 } } }
      s = step(s, { shot: { player: 1, dir: { x: 0, y: -1 }, tier: 1, power: 1 } }, siege).state
      expect(Math.hypot(s.ball.vel.x, s.ball.vel.y)).toBeGreaterThan(0)
      let travelled = 0
      for (let t = 0; t < 2000 && s.possession.live; t++) {
        const r = step(s, {}, siege)
        expect(r.events.some((e) => e.type === 'round-ended')).toBe(false)
        s = r.state
        travelled = Math.max(travelled, 90 - s.ball.pos.y)
      }
      expect(travelled).toBeGreaterThan(20)
      expect(s.match.builder).toBeNull()
      expect(s.match.winner).toBeNull()
    }
  })
})

describe('Siege defence turn: Repair', () => {
  const wallAt = (owner: 1 | 2, id: number, hp: number, gx: number): Structure => ({ kind: 'wall', owner, ...hseg(gx, owner === 1 ? 40 : 10), id, hp })
  /** Player 1 has just scored: the sim waits on their choice. */
  const scored = (): SimState => {
    const s = playing()
    const base = { ...s, objects: [wallAt(1, 1, 1, 2), wallAt(1, 2, 3, 10), wallAt(2, 3, 1, 2)], nextId: 4 }
    const before = shot(base, 1, 0.5, -60)
    return step({ ...before, possession: { ...before.possession, shots: 1 } }, {}, siege).state
  }
  const repair = (player: 1 | 2) => ({ defence: { player, choice: 'repair' as const } })

  it('waits for the scorer: shots and ball placement are refused, and the clock does not run', () => {
    let s = scored()
    expect(s.match).toMatchObject({ choosing: 1 })
    for (const input of [{ shot: { player: 2 as const, dir: { x: 0, y: 1 }, tier: 0, power: 0.3 } }, { placeBall: { player: 2 as const, at: { x: 20, y: 80 } } }]) {
      const r = step(s, input, siege)
      expect(r.events).toContainEqual({ type: 'refused' })
      expect(r.state.possession.inHand).toBe(false)
    }
    const clock = s.clock
    for (let i = 0; i < siege.shotClock * siege.tickHz + 5; i++) s = step(s, {}, siege).state
    expect(s.clock).toEqual(clock)
    expect(s.match).toMatchObject({ choosing: 1 })
    expect(s.possession).toMatchObject({ shooter: 2, inHand: false, shots: siege.shots })
    expect(s.ball.pos).toEqual({ x: 20, y: 5 })
  })

  it("Repair restores the scorer's surviving structures to full HP and emits one repaired event each", () => {
    const r = step(scored(), repair(1), siege)
    expect(r.state.objects.map((o) => [o.id, o.hp])).toEqual([[1, 3], [2, 3], [3, 1]])
    expect(r.events.filter((e) => e.type === 'repaired')).toEqual([{ type: 'repaired', id: 1, player: 1 }, { type: 'repaired', id: 2, player: 1 }])
  })

  it('does not bring destroyed structures back', () => {
    const s = scored()
    const r = step({ ...s, objects: s.objects.filter((o) => o.id !== 1) }, repair(1), siege)
    expect(r.state.objects.map((o) => o.id)).toEqual([2, 3])
  })

  it('then the conceder kicks off with a fresh counter, and play goes on', () => {
    const s = step(scored(), repair(1), siege).state
    expect(s.match).toMatchObject({ choosing: null, builder: null })
    expect(s.possession).toEqual({ shooter: 2, shots: siege.shots, inHand: false, live: false })
    expect(s.ball.pos).toEqual({ x: 20, y: 5 })
    const r = step(s, { placeBall: { player: 2, at: { x: 20, y: 30 } } }, siege)
    expect(r.events).toContainEqual({ type: 'refused' })
    expect(r.state.ball.pos).toEqual({ x: 20, y: 5 })
  })

  it('refuses a choice from the conceder, or outside the window', () => {
    const conceder = step(scored(), repair(2), siege)
    expect(conceder.events).toEqual([{ type: 'refused' }])
    expect(conceder.state.match).toMatchObject({ choosing: 1 })
    expect(step(playing(), repair(1), siege).events).toContainEqual({ type: 'refused' })
    const again = step(step(scored(), repair(1), siege).state, repair(1), siege)
    expect(again.events).toContainEqual({ type: 'refused' })
  })

  it("an own goal offers the choice to the shooter's opponent", () => {
    const s = step(shot(playing(), 1, 107.5, 60), {}, siege).state
    expect(s.match).toMatchObject({ choosing: 2 })
    expect(step(s, repair(1), siege).events).toContainEqual({ type: 'refused' })
    const r = step(s, repair(2), siege)
    expect(r.state.possession).toMatchObject({ shooter: 1, inHand: false })
    expect(r.state.ball.pos).toEqual({ x: 20, y: 103 })
  })
})

describe('Siege wipe-out', () => {
  it('destroying the opponent\'s last structure ends the match for the shooter once the ball rests', () => {
    // The ball runs straight up into player 2's 1 hp wall (y 52).
    const r = fire(ready(playing(1, [wall(1, 1), wall(2, 2, 1)]), 1, { x: 14, y: 60 }), -1)
    expect(r.events.flat().some((e) => e.type === 'wall-destroyed')).toBe(true)
    expect(ended(r.events)).toEqual([{ type: 'match-ended', winner: 1 }])
    expect(r.s.match.winner).toBe(1)
  })

  it('destroying your own last structure with your shot loses the match', () => {
    // The ball runs straight down into player 1's own 1 hp wall (y 80).
    const r = fire(ready(playing(1, [wall(1, 1, 1), wall(2, 2)]), 1, { x: 14, y: 70 }), 1)
    expect(r.events.flat().some((e) => e.type === 'wall-destroyed')).toBe(true)
    expect(r.s.match.winner).toBe(2)
  })

  it('both players at zero on the same shot: the shooter loses', () => {
    // A Breaker shot goes through the first wall it meets at full speed and breaks the 1 hp wall behind it.
    const s = playing(1, [wall(1, 1, 1, 28), wall(2, 2, 1)])
    const r = fire(ready(s, 1, { x: 14, y: 60 }), -1, true)
    expect(r.s.objects).toHaveLength(0)
    expect(r.s.match.winner).toBe(2)
    const q = fire(ready(s, 2, { x: 14, y: 48 }), 1, true)
    expect(q.s.objects).toHaveLength(0)
    expect(q.s.match.winner).toBe(1)
  })

  it('a Steal tower that triggers as its owner\'s last structure ends the match against its owner', () => {
    const s = playing(1, [steal(1, 1), wall(2, 2)])
    const r = settle({ ...s, ball: { ...s.ball, pos: { x: 15, y: 81 }, vel: { x: 30, y: 0 } }, possession: { shooter: 2, shots: 2, inHand: false, live: true } })
    expect(r.s.objects.map((o) => o.id)).toEqual([2])
    expect(ended(r.events)).toEqual([{ type: 'match-ended', winner: 2 }])
  })

  it('does not end while the ball is still moving, even with a count at zero', () => {
    const s = playing(1, [wall(2, 2)])
    const r = settle({ ...s, ball: { ...s.ball, pos: { x: 20, y: 80 }, vel: { x: 5, y: 0 } }, possession: { shooter: 1, shots: 2, inHand: false, live: true } })
    const last = r.events.length - 1
    expect(r.events.length).toBeGreaterThan(2)
    expect(r.events.slice(0, last).flat().some((e) => e.type === 'match-ended')).toBe(false)
    expect(r.events[last]).toContainEqual({ type: 'match-ended', winner: 2 })
  })

  it('destroying the last structure mid-flight ends the match only when the ball rests', () => {
    let s = ready(playing(1, [wall(1, 1), wall(2, 2, 1)]), 1, { x: 14, y: 60 })
    s = step(s, { shot: { player: 1, dir: { x: 0, y: -1 }, tier: 1, power: 1 } }, siege).state
    for (let t = 0; t < 60 && s.objects.some((o) => o.owner === 2); t++) s = step(s, {}, siege).state
    expect(s.objects.some((o) => o.owner === 2)).toBe(false)
    expect(s.possession.live).toBe(true)
    expect(s.match.winner).toBeNull()
    const r = settle(s)
    expect(r.events.slice(0, -1).flat().some((e) => e.type === 'match-ended')).toBe(false)
    expect(r.events[r.events.length - 1]).toContainEqual({ type: 'match-ended', winner: 1 })
  })

  it('a goal on the shot that wipes a player out still ends the match on the wipe-out rule', () => {
    // Player 1 scores but owns nothing; player 2 still has a wall.
    const r = step(shot(playing(1, [wall(2, 2)]), 1, 0.5, -60), {}, siege)
    expect(r.events).toContainEqual({ type: 'goal', scorer: 1, at: expect.anything() })
    expect(r.events).toContainEqual({ type: 'match-ended', winner: 2 })
    expect(r.state.match).toMatchObject({ winner: 2, choosing: null })
    expect(r.events.some((e) => e.type === 'repaired')).toBe(false)
    expect(step(r.state, { defence: { player: 1, choice: 'repair' } }, siege).events).toEqual([])
  })

  it('ignores further input once the match has ended', () => {
    const over = step(shot(playing(1, [wall(2, 2)]), 1, 0.5, -60), {}, siege).state
    const r = step(over, { shot: { player: 1, dir: { x: 0, y: -1 }, tier: 1, power: 1 }, done: 1 }, siege)
    expect(r.state).toBe(over)
    expect(r.events).toEqual([])
  })
})

describe('Siege build timeout', () => {
  const timed: SimConfig = { ...siege, buildTime: 2 }
  const TICKS = 2 * timed.tickHz
  const idle = (s: SimState, n: number, cfg = timed) => {
    const events: string[] = []
    for (let i = 0; i < n; i++) {
      const r = step(s, {}, cfg)
      events.push(...r.events.map((e) => e.type))
      s = r.state
    }
    return { s, events }
  }
  const owned = (s: SimState, p: 1 | 2) => s.objects.filter((o) => o.owner === p)
  const first = firstBuilder(1, 1)

  it('an idle first builder gets a fallback piece and the turn ends without a refusal', () => {
    const { s, events } = idle(initialState(1, timed), TICKS)
    expect(s.match.builder).toBe(opponent(first))
    expect(owned(s, first)).toHaveLength(1)
    expect(s.clock.left).toBe(TICKS)
    expect(events).not.toContain('refused')
  })

  it('an idle second builder also gets a piece, then play starts with a Kick-off for the coin-flip winner', () => {
    const { s, events } = idle(initialState(1, timed), 2 * TICKS)
    expect(owned(s, first)).toHaveLength(1)
    expect(owned(s, opponent(first))).toHaveLength(1)
    expect(s.match.builder).toBeNull()
    expect(s.possession).toMatchObject({ shooter: coinFlip(1, 1), inHand: false })
    expect(events).not.toContain('refused')
  })

  it('with too few wall points the fallback is a tower', () => {
    const cfg = { ...timed, credits: 0 }
    const { s } = idle(initialState(1, cfg), TICKS, cfg)
    expect(owned(s, first)).toMatchObject([{ kind: 'tower' }])
    expect(s.match.builder).toBe(opponent(first))
  })

  it('the fallback piece mirrors across the halfway line and always places, for either seat, wall or tower', () => {
    for (const credits of [timed.credits, 0]) {
      const cfg = { ...timed, credits }
      const second = opponent(first)
      const { s } = idle(initialState(1, cfg), 2 * TICKS, cfg)
      const [a, b] = [owned(s, first), owned(s, second)]
      expect([a.length, b.length]).toEqual([1, 1])
      expect(a[0].kind).toBe(credits === 0 ? 'tower' : 'wall')
      const [p1, p2] = first === 1 ? [a[0], b[0]] : [b[0], a[0]]
      expect(isLegal(p1, [])).toBe(true)
      expect(isLegal(p2, [])).toBe(true)
      if (p1.kind === 'wall' && p2.kind === 'wall') {
        // A 1-unit horizontal wall centred left-right, just in front of the no-build zone; the seats mirror across the halfway line.
        expect(p1).toMatchObject({ a: { x: 16, y: 92 }, b: { x: 24, y: 92 } })
        expect(p2).toMatchObject({ a: { x: 16, y: 16 }, b: { x: 24, y: 16 } })
      } else if (p1.kind === 'tower' && p2.kind === 'tower') {
        expect(p1.at.gy + p2.at.gy).toBe(53)
        expect(p1.at.gx).toBe(p2.at.gx)
      } else throw new Error('both seats get the same kind of piece')
    }
  })

  it('a builder who already placed a piece just ends the turn, as in Rounds', () => {
    const placed = step(initialState(1, timed), { placeWall: piece(first) }, timed).state
    const { s } = idle(placed, TICKS)
    expect(owned(s, first)).toHaveLength(1)
    expect(s.match.builder).toBe(opponent(first))
  })
})

describe('Siege defence turn: Rearrange', () => {
  const wallAt = (owner: 1 | 2, id: number, hp: number, gx: number): Structure => ({ kind: 'wall', owner, ...hseg(gx, owner === 1 ? 40 : 10), id, hp })
  /** `scorer` has just scored and owes a choice; they own a cracked wall (1) and a full one (2), the other player owns wall 3. */
  const scored = (scorer: 1 | 2 = 1, cfg: SimConfig = siege): SimState => {
    const init = initialState(1, cfg)
    const s = { ...init, match: { ...init.match, builder: null, opening: false } }
    const other = opponent(scorer)
    const base: SimState = { ...s, objects: [wallAt(scorer, 1, 1, 2), wallAt(scorer, 2, 3, 10), wallAt(other, 3, 1, 2)], nextId: 4 }
    const y = scorer === 1 ? 0.5 : 107.5
    const before = { ...base, ball: { ...base.ball, pos: { x: 20, y }, vel: { x: 0, y: scorer === 1 ? -60 : 60 } }, possession: { shooter: scorer, shots: 1, inHand: false, live: true } }
    return step(before, {}, cfg).state
  }
  const choose = { defence: { player: 1 as const, choice: 'rearrange' as const } }
  const rearranging = (): SimState => step(scored(), choose, siege).state
  const move = (id: number, gx: number, gy: number) => ({ moveStructure: { player: 1 as const, id, ...hseg(gx, gy) } })

  it('opens a turn for the scorer in which every own structure is movable and no points are left', () => {
    const r = step(scored(), choose, siege)
    expect(r.state.match).toMatchObject({ choosing: null, builder: 1 })
    expect(r.state.built).toEqual([1, 2])
    expect(r.state.credits[1]).toBe(0)
    expect(r.events).toEqual([])
  })

  it('moves and rotates structures, keeping HP and cracks', () => {
    let s = rearranging()
    const r1 = step(s, { moveStructure: { player: 1, id: 1, a: { x: 40, y: 88 }, b: { x: 40, y: 96 } } }, siege)
    expect(r1.events).toEqual([])
    s = r1.state
    expect(s.objects.find((o) => o.id === 1)).toMatchObject({ a: { x: 40, y: 88 }, b: { x: 40, y: 96 }, hp: 1 })
    s = step(s, move(2, 10, 46), siege).state
    expect(s.objects.find((o) => o.id === 2)).toMatchObject({ ...hseg(10, 46), hp: 3 })
  })

  it('refuses moves off the pitch, off their half, into the no-build zone, and of the opponent structure', () => {
    const s = rearranging()
    for (const input of [move(1, 99, 40), move(1, 5, 10), move(1, 10, 54), move(3, 20, 44)]) {
      const r = step(s, input, siege)
      expect(r.events).toContainEqual({ type: 'refused' })
      expect(r.state.objects).toEqual(s.objects)
    }
  })

  it('refuses any change of length when moving a wall, and accepts the same length', () => {
    const s = rearranging()
    const longer = step(s, { moveStructure: { player: 1, id: 1, ...hseg(2, 40, 2) } }, siege)
    expect(longer.events).toContainEqual({ type: 'refused' })
    expect(longer.state.objects).toEqual(s.objects)
    expect(step(s, move(1, 6, 40), siege).events).toEqual([])
  })

  it('refuses placement and demolish', () => {
    const s = rearranging()
    const place = step(s, { placeWall: { kind: 'wall', owner: 1, ...hseg(25, 45) } }, siege)
    const tower = step(s, { placeWall: { kind: 'tower', owner: 1, power: 'repulsor', at: { gx: 25, gy: 45 } } }, siege)
    const gone = step(s, { demolish: { player: 1, wall: 1 } }, siege)
    for (const r of [place, tower, gone]) {
      expect(r.events).toContainEqual({ type: 'refused' })
      expect(r.state.objects).toEqual(s.objects)
      expect(r.state.credits[1]).toBe(0)
    }
  })

  it('Done ends the turn: the conceder kicks off, whichever player rearranged', () => {
    for (const scorer of [1, 2] as const) {
      let s = step(scored(scorer), { defence: { player: scorer, choice: 'rearrange' } }, siege).state
      expect(s.match.builder).toBe(scorer)
      expect(canFinishBuild(s, siege)).toBe(true)
      s = step(s, { done: scorer }, siege).state
      expect(s.match).toMatchObject({ builder: null, choosing: null })
      expect(s.possession).toEqual({ shooter: opponent(scorer), shots: siege.shots, inHand: false, live: false })
      expect(s.ball.pos).toEqual({ x: 20, y: scorer === 1 ? 5 : 103 })
    }
  })

  it('Done with nothing moved is the escape hatch, and the choice cannot go back to Repair', () => {
    let s = rearranging()
    expect(step(s, { defence: { player: 1, choice: 'repair' } }, siege).events).toContainEqual({ type: 'refused' })
    s = step(s, { done: 1 }, siege).state
    expect(s.objects.map((o) => o.hp)).toEqual([1, 3, 1])
    expect(step(s, { defence: { player: 1, choice: 'repair' } }, siege).events).toContainEqual({ type: 'refused' })
  })

  it('refuses a rearrange choice from the conceder', () => {
    const r = step(scored(), { defence: { player: 2, choice: 'rearrange' } }, siege)
    expect(r.events).toEqual([{ type: 'refused' }])
  })

  it('the turn runs on the build window (opened at the goal), not the shot clock, and play resumes on the shot clock', () => {
    const timed: SimConfig = { ...siege, buildTime: 30 }
    let s = step(scored(1, timed), { defence: { player: 1, choice: 'rearrange' } }, timed).state
    // The window opened at the goal and is not refilled by the choice (one tick has drained since): see choicetimer.test.ts.
    expect(s.clock.left).toBe(30 * timed.tickHz - 1)
    s = step(s, { done: 1 }, timed).state
    expect(s.clock.left).toBe(timed.shotClock * timed.tickHz)
  })

  it('a build timeout in the rearrange turn ends it without a fallback piece', () => {
    const timed: SimConfig = { ...siege, buildTime: 1 }
    let s = step(scored(1, timed), { defence: { player: 1, choice: 'rearrange' } }, timed).state
    const n = s.objects.length
    for (let i = 0; i < timed.tickHz + 2; i++) s = step(s, {}, timed).state
    expect(s.match.builder).toBeNull()
    expect(s.objects).toHaveLength(n)
  })

  it('refuses a move onto another wall, and accepts a 45 degree swing off its end with HP kept', () => {
    const w = (id: number, gx: number, gy: number, hp = 3, owner: 1 | 2 = 1): Structure => ({ kind: 'wall', owner, ...hseg(gx, gy), id, hp })
    const init = initialState(1, siege)
    const objects = [w(1, 0, 40), w(2, 4, 40), w(3, 8, 40, 2), w(4, 12, 40), w(5, 16, 46, 1), w(6, 2, 10, 3, 2)]
    const pre: SimState = { ...init, match: { ...init.match, builder: null, opening: false, choosing: 1 } as SimState['match'], objects, nextId: 7, possession: { shooter: 2, shots: 3, inHand: true, live: false } }
    const s = step(pre, choose, siege).state
    const onto = step(s, move(5, 10, 40), siege)
    expect(onto.events).toEqual([{ type: 'refused' }])
    expect(onto.state.objects).toEqual(s.objects)
    const d = 8 * Math.SQRT1_2
    const ok = step(s, { moveStructure: { player: 1, id: 5, a: { x: 32, y: 80 }, b: { x: 32 + d, y: 80 + d } } }, siege)
    expect(ok.events).toEqual([])
    expect(ok.state.objects.find((o) => o.id === 5)).toMatchObject({ a: { x: 32, y: 80 }, hp: 1 })
  })

  it('marks the opening build until play begins, and not the rearrange turn', () => {
    const first = firstBuilder(1, 1)
    let s = step(step(initialState(1, siege), { placeWall: piece(first) }, siege).state, { done: first }, siege).state
    expect(s.match).toMatchObject({ opening: true })
    const second = opponent(first)
    s = step(step(s, { placeWall: piece(second) }, siege).state, { done: second }, siege).state
    expect(s.match).toMatchObject({ builder: null, opening: false })
    const r = step({ ...s, match: { ...s.match, choosing: 1 } }, choose, siege).state
    expect(r.match).toMatchObject({ builder: 1, opening: false })
  })
})
