import { describe, expect, it } from 'vitest'
import { rules } from '../config/rules'
import { defaultConfig, step, type SimInput, type SimState } from './step'
import { buildState, hseg, place, playState } from './testkit'
import { canPlaceBall } from './possession'
import { damageWall, isLegal, wallSegments, type TowerSpec, type WallSpec } from './wall'

const tower = (gx: number, gy: number, owner: TowerSpec['owner'] = 1): TowerSpec => ({ kind: 'tower', owner, power: 'repulsor', at: { gx, gy } })
const straight = (gx: number, gy: number): WallSpec => ({ kind: 'wall', owner: 1, ...hseg(gx, gy) })
const run = (s: SimState, input: SimInput) => step(s, input, defaultConfig)

describe('tower shape', () => {
  it('is one cell: four unit edges and a 2x2 square of collision segments', () => {
    expect(wallSegments(tower(5, 40))).toEqual([
      { a: { x: 10, y: 80 }, b: { x: 12, y: 80 } },
      { a: { x: 12, y: 80 }, b: { x: 12, y: 82 } },
      { a: { x: 12, y: 82 }, b: { x: 10, y: 82 } },
      { a: { x: 10, y: 82 }, b: { x: 10, y: 80 } },
    ])
  })
  it('has a Credit price per power and configurable hp', () => {
    expect(rules.towerCost).toEqual({ repulsor: 5, steal: 4 })
    expect(rules.towerHp).toBe(3)
  })
})

describe('tower placement', () => {
  it('follows the half rule', () => {
    expect(isLegal(tower(5, 40))).toBe(true)
    expect(isLegal(tower(5, 10))).toBe(false)
    expect(isLegal(tower(5, 10, 2))).toBe(true)
  })
  it('refuses a cell straddling the halfway line', () => {
    expect(isLegal(tower(5, 26))).toBe(false)
    expect(isLegal(tower(5, 27))).toBe(true)
  })
  it('refuses the own no-build zone', () => {
    expect(isLegal(tower(10, 52))).toBe(false)
  })
  it('places through step with rules.towerHp and its Credit price, refuses illegal ones', () => {
    const r = run(buildState(1), { placeWall: tower(5, 40) })
    expect(r.state.objects).toMatchObject([{ kind: 'tower', id: 1, hp: rules.towerHp }])
    expect(r.state.credits[1]).toBe(playState().credits[1] - rules.towerCost.repulsor)
    expect(run(buildState(1), { placeWall: tower(5, 10) }).events).toEqual([{ type: 'refused' }])
  })
})

describe('tower as obstacle', () => {
  it('a wall may not pass through a tower\'s cell, but may touch its edge or end on it', () => {
    const t = [tower(10, 40)] // x 20..22, y 80..82
    expect(isLegal(straight(8, 40.5), t)).toBe(false) // runs through it
    expect(isLegal(straight(8, 41), t)).toBe(true) // clear below
    expect(isLegal({ kind: 'wall', owner: 1, a: { x: 12, y: 80 }, b: { x: 20, y: 80 } }, t)).toBe(true) // ends on its corner
    expect(isLegal({ kind: 'wall', owner: 1, a: { x: 20, y: 80 }, b: { x: 28, y: 80 } }, t)).toBe(true) // along its top edge
    expect(isLegal({ kind: 'wall', owner: 1, a: { x: 17, y: 85 }, b: { x: 17 + 8 * Math.SQRT1_2, y: 85 - 8 * Math.SQRT1_2 } }, t)).toBe(false) // a diagonal across it
    expect(isLegal({ kind: 'wall', owner: 1, a: { x: 16, y: 84 }, b: { x: 16 + 8 * Math.SQRT1_2, y: 84 - 8 * Math.SQRT1_2 } }, t)).toBe(true) // a diagonal that only grazes its corner
  })
  it('a tower may not sit on a wall or on another tower', () => {
    expect(isLegal(tower(10, 40), [straight(8, 40.5)])).toBe(false)
    expect(isLegal(tower(10, 40), [tower(10, 40)])).toBe(false)
    expect(isLegal(tower(11, 40), [tower(10, 40)])).toBe(true)
  })
})

describe('tower damage', () => {
  it('goes through the wall damage rule and events', () => {
    const at = { x: 11, y: 81 }
    const hit = (s: SimState) => {
      const r = damageWall(s.objects, 1, at)
      return { state: { ...s, objects: r.objects }, events: r.events }
    }
    const s0 = place(tower(5, 40)).state
    const first = hit(s0)
    expect(first.events).toEqual([{ type: 'wall-cracked', id: 1, hp: 2, at }])
    const last = hit(hit(first.state).state)
    expect(last.state.objects).toEqual([])
    expect(last.events).toMatchObject([{ type: 'wall-destroyed', wall: { kind: 'tower', hp: 0 }, at }])
  })
})

describe('tower and ball placement', () => {
  it('the ball cannot be placed inside or on a tower, but can be beside it', () => {
    const objects = [{ ...tower(5, 40), id: 1, hp: rules.towerHp }]
    // Tower square x 10..12, y 80..82; the ball needs its radius plus half a wall of clearance.
    expect(canPlaceBall(1, { x: 11, y: 81 }, objects, defaultConfig)).toBe(false)
    expect(canPlaceBall(1, { x: 10, y: 81 }, objects, defaultConfig)).toBe(false)
    expect(canPlaceBall(1, { x: 14, y: 81 }, objects, defaultConfig)).toBe(true)
  })
})
