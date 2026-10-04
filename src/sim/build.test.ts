import { describe, expect, it } from 'vitest'
import { coinFlip } from './match'
import { opponent } from './possession'
import { defaultConfig as c, initialState, step, type SimInput, type SimState } from './step'
import { rules } from '../config/rules'
import { buildState, roundsMatch, hseg } from './testkit'
import type { TowerSpec, WallSpec } from './wall'

const wall = (owner: 1 | 2, units = 1): WallSpec => ({ kind: 'wall', owner, ...hseg(10, owner === 1 ? 40 : 10, units) })
const run = (s: SimState, ...inputs: SimInput[]) => inputs.reduce((st, i) => step(st, i, c).state, s)
const loser = opponent(coinFlip(1, 1))

describe('build order', () => {
  it('round 1 starts with the coin-flip loser, who holds the Opening Credits, whatever Credits per round is', () => {
    const s = initialState()
    expect(s.match.builder).toBe(loser)
    expect(s.credits[loser]).toBe(c.openingCredits)
    const rich = { ...c, credits: 25 }
    expect(initialState(1, rich).credits[loser]).toBe(c.openingCredits)
  })
  it('the second builder follows, then play begins', () => {
    let s = run(initialState(), { done: loser })
    expect(s.match.builder).toBe(opponent(loser))
    expect(s.credits[opponent(loser)]).toBe(c.openingCredits)
    s = run(s, { done: opponent(loser) })
    expect(s.match.builder).toBeNull()
  })
  it('order alternates each round', () => {
    const base = initialState()
    const goal = { ...base, match: { ...base.match, builder: null }, ball: { pos: { x: 20, y: 0.5 }, vel: { x: 0, y: -60 }, rolled: 0 }, possession: { shooter: 1 as const, shots: 3, inHand: false, live: true } }
    const s = run(goal, {})
    expect(roundsMatch(s).round).toBe(2)
    expect(s.match.builder).toBe(opponent(loser))
    expect(s.credits[opponent(loser)]).toBe(c.credits)
  })
  it('Rounds banks unspent Credits: round 1 holds the Opening Credits, every later build turn adds the grant to what is left', () => {
    // Round 1: the loser spends 1, the other spends nothing; a goal ends the round.
    const played = run(initialState(), { placeWall: wall(loser) }, { done: loser }, { done: opponent(loser) })
    const goal = { ...played, ball: { pos: { x: 20, y: 0.5 }, vel: { x: 0, y: -60 }, rolled: 0 }, possession: { shooter: 1 as const, shots: 3, inHand: false, live: true } }
    const round2 = run(goal, {})
    expect(round2.match.builder).toBe(opponent(loser))
    expect(round2.credits[opponent(loser)]).toBe(c.openingCredits + c.credits)
    const second = run(round2, { done: opponent(loser) })
    expect(second.credits[loser]).toBe(c.openingCredits - 1 + c.credits)
  })
  it('spending 3 of the opening 40 in round 1 leaves 47 at the start of round 2', () => {
    const at = (gx: number): WallSpec => ({ ...wall(loser), ...hseg(gx, loser === 1 ? 40 : 10) })
    const played = run(initialState(), { placeWall: at(4) }, { placeWall: at(10) }, { placeWall: at(16) }, { done: loser }, { done: opponent(loser) })
    expect(played.credits[loser]).toBe(c.openingCredits - 3)
    const goal = { ...played, ball: { pos: { x: 20, y: 0.5 }, vel: { x: 0, y: -60 }, rolled: 0 }, possession: { shooter: 1 as const, shots: 3, inHand: false, live: true } }
    const round2 = run(run(goal, {}), { done: opponent(loser) })
    expect(round2.match.builder).toBe(loser)
    expect(round2.credits[loser]).toBe(c.openingCredits - 3 + c.credits)
  })
  it('a player holds no Credits before their first build turn', () => {
    expect(initialState().credits[opponent(loser)]).toBe(0)
  })
})

describe('build actions', () => {
  it('Done with nothing placed just ends the turn', () => {
    const r = step(initialState(), { done: loser }, c)
    expect(r.events).toEqual([])
    expect(r.state.objects).toEqual([])
  })
  it('Done from the player who is not building is refused', () => {
    expect(step(initialState(), { done: opponent(loser) }, c).events).toEqual([{ type: 'refused' }])
  })
  it('placement costs points; a shape that does not fit the budget is refused', () => {
    let s = run(initialState(), { placeWall: wall(loser, 2) })
    expect(s.credits[loser]).toBe(c.openingCredits - 2)
    s = { ...initialState(), credits: { ...s.credits, [loser]: 0 } }
    const r = step(s, { placeWall: wall(loser) }, c)
    expect(r.events).toEqual([{ type: 'refused' }])
    expect(r.state.credits[loser]).toBe(0)
  })
  it('only the builder may place or demolish', () => {
    const other = opponent(loser)
    expect(step(initialState(), { placeWall: wall(other) }, c).events).toEqual([{ type: 'refused' }])
    const s = run(initialState(), { placeWall: wall(loser) })
    expect(step({ ...s, match: { ...s.match, builder: other } }, { demolish: { player: loser, wall: 1 } }, c).events).toEqual([{ type: 'refused' }])
  })
  it('no placing once the play phase has begun, and the clock waits for it', () => {
    const play = run(initialState(), { done: loser }, { done: opponent(loser) })
    expect(step(play, { placeWall: wall(loser) }, c).events).toEqual([{ type: 'refused' }])
    expect(run(initialState(), {}).clock.left).toBe(c.shotClock * c.tickHz)
  })
})

describe('pitch bounds', () => {
  const placed = (spec: WallSpec | TowerSpec) => step(buildState(1), { placeWall: spec }, c).events.every((e) => e.type !== 'refused')
  it('refuses a wall or tower with any cell outside the pitch', () => {
    expect(placed({ kind: 'wall', owner: 1, ...hseg(19, 40) })).toBe(false)
    expect(placed({ kind: 'wall', owner: 1, a: { x: 2, y: 80 }, b: { x: -6, y: 80 } })).toBe(false)
    expect(placed({ kind: 'wall', owner: 1, a: { x: 36, y: 80 }, b: { x: 36 + 8 * Math.SQRT1_2, y: 80 + 8 * Math.SQRT1_2 } })).toBe(false)
    expect(placed({ kind: 'tower', owner: 1, power: 'steal', at: { gx: 20, gy: 40 } })).toBe(false)
  })
  it('accepts a wall flush against the boards', () => {
    expect(placed({ kind: 'wall', owner: 1, ...hseg(16, 40) })).toBe(true)
    expect(placed({ kind: 'wall', owner: 1, a: { x: 8, y: 80 }, b: { x: 0, y: 80 } })).toBe(true)
    expect(placed({ kind: 'wall', owner: 1, a: { x: 32, y: 80 }, b: { x: 40, y: 80 } })).toBe(true)
  })
})

describe('moving and refunding this turn\'s items', () => {
  const moved = { gx: 6, gy: 40 }
  const movedSeg = hseg(6, 40)
  it('records ids placed this build turn and forgets them when the turn ends', () => {
    let s = run(buildState(1), { placeWall: wall(1) })
    expect(s.built).toEqual([1])
    s = run(s, { done: 1 })
    expect(s.built).toEqual([])
  })
  it('moves an item placed this turn for free, keeping id and hp', () => {
    const s = run(buildState(1), { placeWall: wall(1) })
    const r = step(s, { moveStructure: { player: 1, id: 1, ...movedSeg } }, c)
    expect(r.events).toEqual([])
    expect(r.state.objects).toEqual([{ ...wall(1), id: 1, hp: s.objects[0].hp, ...movedSeg }])
    expect(r.state.credits[1]).toBe(s.credits[1])
  })
  it('a move may overlap the item\'s own old spot', () => {
    const s = run(buildState(1), { placeWall: wall(1) })
    expect(step(s, { moveStructure: { player: 1, id: 1, ...hseg(11, 40) } }, c).events).toEqual([])
  })
  describe('changing a wall\'s length by its ends', () => {
    // A one-unit wall placed, then the builder's Credits set to `after` (what is left once it is down).
    const withCredits = (after?: number) => {
      const s = run({ ...buildState(1), credits: { 1: 10, 2: 10 } }, { placeWall: wall(1) })
      return after === undefined ? s : { ...s, credits: { ...s.credits, 1: after } }
    }
    const longer = { player: 1 as const, id: 1, ...hseg(10, 40, 2) }
    it('charges the difference for a longer wall, and demolishing then refunds everything paid', () => {
      const s = withCredits()
      expect(s.credits[1]).toBe(9)
      const r = step(s, { moveStructure: longer }, c)
      expect(r.events).toEqual([])
      expect(r.state.credits[1]).toBe(8)
      expect(step(r.state, { demolish: { player: 1, wall: 1 } }, c).state.credits[1]).toBe(10)
    })
    it('refuses a longer wall the builder cannot afford, changing nothing', () => {
      const s = withCredits(0)
      const r = step(s, { moveStructure: longer }, c)
      expect(r.events).toEqual([{ type: 'refused' }])
      expect(r.state.objects).toEqual(s.objects)
      expect(r.state.credits).toEqual(s.credits)
    })
    it('accepts a longer wall that costs exactly the Credits left', () => {
      const s = withCredits(1)
      const r = step(s, { moveStructure: longer }, c)
      expect(r.events).toEqual([])
      expect(r.state.credits[1]).toBe(0)
    })
    it('two units cut to one then demolished nets zero', () => {
      let s = run({ ...buildState(1), credits: { 1: 10, 2: 10 } }, { placeWall: wall(1, 2) })
      s = run(s, { moveStructure: { player: 1, id: 1, ...hseg(10, 40, 1) } }, { demolish: { player: 1, wall: 1 } })
      expect(s.credits[1]).toBe(10)
    })
    it('is charged in Siege\'s opening build as in Rounds', () => {
      const siege = { ...c, mode: 'siege' as const }
      const base = initialState(1, siege)
      const builder = base.match.builder!
      expect(base.match.builder).not.toBeNull()
      const s = step({ ...base, credits: { ...base.credits, [builder]: 10 } }, { placeWall: { ...wall(builder), ...hseg(10, builder === 1 ? 40 : 10) } }, siege).state
      const r = step(s, { moveStructure: { player: builder, id: s.objects[0].id, ...hseg(10, builder === 1 ? 40 : 10, 2) } }, siege)
      expect(r.events).toEqual([])
      expect(r.state.credits[builder]).toBe(8)
    })
    it('refunds the difference for a shorter wall', () => {
      let s = run({ ...buildState(1), credits: { 1: 10, 2: 10 } }, { placeWall: wall(1, 2) })
      expect(s.credits[1]).toBe(8)
      s = step(s, { moveStructure: { player: 1, id: 1, ...hseg(10, 40, 1) } }, c).state
      expect(s.credits[1]).toBe(9)
    })
  })
  it('refuses moving an older item, another player\'s item, or to an illegal spot', () => {
    const s = run(buildState(1), { placeWall: wall(1) })
    const older = { ...s, built: [] }
    expect(step(older, { moveStructure: { player: 1, id: 1, ...movedSeg } }, c).events).toEqual([{ type: 'refused' }])
    expect(step(s, { moveStructure: { player: 2, id: 1, ...movedSeg } }, c).events).toEqual([{ type: 'refused' }])
    expect(step(s, { moveStructure: { player: 1, id: 1, ...hseg(19, 40) } }, c).events).toEqual([{ type: 'refused' }])
    expect(step(s, { moveStructure: { player: 1, id: 1, ...hseg(10, 10) } }, c).events).toEqual([{ type: 'refused' }])
  })
  it('demolishing an item placed this turn refunds its points and costs nothing', () => {
    let s = run(buildState(1), { placeWall: wall(1, 2) })
    s = { ...s, credits: { ...s.credits, 1: 0 } }
    const r = step(s, { demolish: { player: 1, wall: 1 } }, c)
    expect(r.events).toEqual([])
    expect(r.state.objects).toEqual([])
    expect(r.state.credits[1]).toBe(2)
    expect(r.state.built).toEqual([])
  })
  it('demolishing a tower placed this turn refunds its price in full', () => {
    const tower: TowerSpec = { kind: 'tower', owner: 1, power: 'repulsor', at: { gx: 10, gy: 40 } }
    const before = buildState(1).credits[1]
    const s = run(buildState(1), { placeWall: tower })
    expect(s.credits[1]).toBe(before - rules.towerCost.repulsor)
    expect(run(s, { demolish: { player: 1, wall: 1 } }).credits[1]).toBe(before)
  })
  it('demolishing an older tower costs rules.demolishCost, as for a wall', () => {
    const tower: TowerSpec = { kind: 'tower', owner: 1, power: 'steal', at: { gx: 10, gy: 40 } }
    const s = { ...run(buildState(1), { placeWall: tower }), built: [] }
    expect(run(s, { demolish: { player: 1, wall: 1 } }).credits[1]).toBe(s.credits[1] - rules.demolishCost)
  })
  it('demolishing an older tower is refused when Credits are below rules.demolishCost', () => {
    const tower: TowerSpec = { kind: 'tower', owner: 1, power: 'steal', at: { gx: 10, gy: 40 } }
    const placed = { ...run(buildState(1), { placeWall: tower }), built: [] }
    const s = { ...placed, credits: { ...placed.credits, 1: rules.demolishCost - 1 } }
    const r = step(s, { demolish: { player: 1, wall: 1 } }, c)
    expect(r.events).toEqual([{ type: 'refused' }])
    expect(r.state.objects).toHaveLength(1)
    expect(r.state.credits[1]).toBe(s.credits[1])
  })
  it('demolishing an older item still costs 1 point', () => {
    const s = { ...run(buildState(1), { placeWall: wall(1) }), built: [] }
    expect(run(s, { demolish: { player: 1, wall: 1 } }).credits[1]).toBe(s.credits[1] - 1)
  })
  it('placing and Done in the same tick leaves nothing movable', () => {
    const s = run(buildState(1), { placeWall: wall(1), done: 1 })
    expect(s.objects).toHaveLength(1)
    expect(s.built).toEqual([])
  })
  it('moving a tower keeps its power, id and hp', () => {
    const tower: TowerSpec = { kind: 'tower', owner: 1, power: 'repulsor', at: { gx: 10, gy: 40 } }
    const s = run(buildState(1), { placeWall: tower })
    const r = step(s, { moveStructure: { player: 1, id: 1, at: moved } }, c)
    expect(r.events).toEqual([])
    expect(r.state.objects).toEqual([{ ...s.objects[0], at: moved }])
    expect(r.state.objects[0]).toMatchObject({ power: 'repulsor', id: 1, hp: s.objects[0].hp })
  })
  it('a wall built in an earlier turn costs 1 to demolish and cannot be moved, across a real turn sequence', () => {
    let s = run(initialState(), { placeWall: wall(loser) }, { done: loser })
    expect(s.built).toEqual([])
    s = run(s, { done: opponent(loser) })
    expect(s.match.builder).toBeNull()
    expect(s.built).toEqual([])
    s = { ...s, match: { ...s.match, builder: loser }, credits: { ...s.credits, [loser]: c.credits } }
    expect(step(s, { moveStructure: { player: loser, id: 1, ...movedSeg } }, c).events).toEqual([{ type: 'refused' }])
    const r = step(s, { demolish: { player: loser, wall: 1 } }, c)
    expect(r.events).toEqual([])
    expect(r.state.credits[loser]).toBe(c.credits - 1)
  })
})
