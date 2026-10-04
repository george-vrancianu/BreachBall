import { describe, expect, it } from 'vitest'
import type { SimState } from './step'
import { healthOf, hseg, place } from './testkit'
import { damageWall, type WallSpec } from './wall'

const spec = (units: number): WallSpec => ({ kind: 'wall', owner: 1, ...hseg(5, 40, units) })
const at = { x: 11, y: 80 }
const placed = (units = 1) => place(spec(units)).state
/** Damages the first object through the shared damage path, as a ball hit or splash would. */
const hit = (s: SimState, id = s.objects[0].id) => {
  const r = damageWall(s.objects, id, at)
  return { state: { ...s, objects: r.objects }, events: r.events }
}

describe('wall damage', () => {
  it('placed walls start with 3 hp', () => {
    expect(healthOf(placed().objects[0])).toBe(3)
  })
  it('goes 3 to 2 to 1 with a cracked event each time, then 0 removes it with destroyed', () => {
    let s = placed()
    const id = s.objects[0].id
    for (const hp of [2, 1]) {
      const r = hit(s)
      s = r.state
      expect(healthOf(s.objects[0])).toBe(hp)
      expect(r.events).toEqual([{ type: 'wall-cracked', id, hp, segment: 0, at }])
    }
    const r = hit(s)
    expect(r.state.objects).toEqual([])
    expect(r.events).toEqual([{ type: 'wall-destroyed', wall: { ...s.objects[0], segments: [0] }, segment: 0, at }])
  })
  it('a 2-unit wall is one structure with a pool per segment: a hit costs only the segment it lands on', () => {
    const s = hit(placed(2)).state
    expect(s.objects).toHaveLength(1)
    expect(s.objects[0]).toMatchObject({ segments: [2, 3] })
  })
  it('refunds nothing on destruction', () => {
    let s = placed()
    const before = s.players
    for (let i = 0; i < 3; i++) s = hit(s).state
    expect(s.players).toEqual(before)
  })
  it('ignores damage to an unknown wall', () => {
    const r = hit(placed(), 99)
    expect(r.events).toEqual([])
    expect(healthOf(r.state.objects[0])).toBe(3)
  })
})
