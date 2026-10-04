import { describe, expect, it } from 'vitest'
import { rules } from '../config/rules'
import type { Point } from './pitch'
import { hseg } from './testkit'
import { isDrawable, isLegal, nearestOnSegment, rotatedWall, segmentsTouchOnly, snapWallBetween, snapWallEnd, structureCost, translatedWall, wallCost, wallSegments, wallsOverlap, wallUnits, type TowerSpec, type WallSpec } from './wall'

const U = rules.wall.unit
const D = U * Math.SQRT1_2 // a diagonal unit's run along each axis
const wall = (owner: WallSpec['owner'], a: Point, b: Point): WallSpec => ({ kind: 'wall', owner, a, b })
const p = (x: number, y: number): Point => ({ x, y })
const near = (got: Point | null, want: Point) => {
  expect(got).not.toBeNull()
  expect(got!.x).toBeCloseTo(want.x, 6)
  expect(got!.y).toBeCloseTo(want.y, 6)
}

describe('rules', () => {
  it('a unit is four cells, one or two units long, at 0/45/90/135 degrees, 2 Credits a unit', () => {
    expect(rules.wall).toEqual({ unit: 8, units: [1, 2], angles: [0, 45, 90, 135], unitCost: 2, shapeTol: 0.01 })
    expect(rules.centreZoneRadius).toBe(6)
    expect(rules.wallHp).toBe(3)
  })
})

describe('cost', () => {
  it('is units times the per-unit price, at any angle', () => {
    expect(wallCost(wall(1, p(0, 0), p(U, 0)))).toBe(2)
    expect(wallCost(wall(1, p(0, 0), p(2 * U, 0)))).toBe(4)
    expect(wallCost(wall(1, p(0, 0), p(D, D)))).toBe(2)
    expect(wallCost(wall(1, p(0, 0), p(2 * D, -2 * D)))).toBe(4)
    expect(structureCost(wall(1, p(0, 0), p(0, 2 * U)))).toBe(4)
  })
  it('counts units from the length, rounded', () => {
    expect(wallUnits(wall(1, p(0, 0), p(D, D)))).toBe(1)
    expect(wallUnits(wall(1, p(0, 0), p(0, 2 * U)))).toBe(2)
  })
})

describe('collision segments', () => {
  it('a wall is its one segment in world units', () => {
    expect(wallSegments(wall(1, p(10, 14), p(18, 14)))).toEqual([{ a: p(10, 14), b: p(18, 14) }])
  })
})

describe('snapWallEnd', () => {
  const a = p(20, 80)
  it('snaps the direction to the nearest allowed angle and the length to whole units', () => {
    near(snapWallEnd(a, p(30, 80.5)), p(28, 80)) // 1.3 units east-ish: 1 unit at 0 degrees
    near(snapWallEnd(a, p(36, 80)), p(36, 80)) // 2 units
    near(snapWallEnd(a, p(21, 88)), p(20, 88)) // south: 90 degrees
    near(snapWallEnd(a, p(20, 70)), p(20, 72)) // north: 270, the same set as 90
    near(snapWallEnd(a, p(14, 80)), p(12, 80)) // west
  })
  it('picks 45 and 135 degrees for the diagonals, in every quadrant', () => {
    near(snapWallEnd(a, p(20 + 7, 80 + 8)), p(20 + D, 80 + D))
    near(snapWallEnd(a, p(20 - 7, 80 + 8)), p(20 - D, 80 + D))
    near(snapWallEnd(a, p(20 + 7, 80 - 8)), p(20 + D, 80 - D))
    near(snapWallEnd(a, p(20 - 7, 80 - 8)), p(20 - D, 80 - D))
  })
  it('chooses the nearer angle around the 22.5 degree boundary', () => {
    near(snapWallEnd(a, p(20 + 8 * Math.cos(Math.PI / 9), 80 + 8 * Math.sin(Math.PI / 9))), p(28, 80)) // 20 degrees
    near(snapWallEnd(a, p(20 + 8 * Math.cos(Math.PI / 6), 80 + 8 * Math.sin(Math.PI / 6))), p(20 + D, 80 + D)) // 30 degrees
  })
  it('a diagonal unit is as long as a horizontal one, end to end', () => {
    const b = snapWallEnd(a, p(20 + 8, 80 + 8))!
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(U, 6)
    const two = snapWallEnd(a, p(20 + 12, 80 + 12))!
    expect(Math.hypot(two.x - a.x, two.y - a.y)).toBeCloseTo(2 * U, 6)
  })
  it('rounds the length to the nearest allowed unit count, never past the largest', () => {
    near(snapWallEnd(a, p(20 + 11, 80)), p(28, 80)) // 1.375 units
    near(snapWallEnd(a, p(20 + 13, 80)), p(36, 80)) // 1.625 units
    near(snapWallEnd(a, p(20 + 40, 80)), p(36, 80)) // 5 units: capped at 2
  })
  it('cancels a drag shorter than half a unit', () => {
    expect(snapWallEnd(a, p(23.9, 80))).toBeNull()
    expect(snapWallEnd(a, a)).toBeNull()
    expect(snapWallEnd(a, p(24, 80))).not.toBeNull()
  })
  it('follows the configured sets', () => {
    const custom = { wallHalf: rules.wallHalf, wall: { unit: 4, units: [1, 3], angles: [0, 90], unitCost: 1, shapeTol: 0.01 } }
    near(snapWallEnd(a, p(20 + 7, 80 + 6), custom), p(32, 80)) // nearer 0 than 90 degrees; 2.3 units rounds to 3
    near(snapWallEnd(a, p(21, 80 + 10), custom), p(20, 92))
  })
})

describe('rotatedWall', () => {
  const w = wall(1, p(20, 80), p(28, 80))
  it('turns 45 degrees around a, keeping the length, through the whole set', () => {
    let r = w
    const seen: Point[] = []
    for (let i = 0; i < 8; i++) {
      r = rotatedWall(r)
      seen.push(r.b)
      expect(r.a).toEqual(w.a)
      expect(Math.hypot(r.b.x - 20, r.b.y - 80)).toBeCloseTo(U, 6)
    }
    near(seen[0], p(20 + D, 80 + D))
    near(seen[1], p(20, 88))
    near(seen[2], p(20 - D, 80 + D))
    near(seen[3], p(12, 80))
    near(seen[7], p(28, 80)) // full circle
  })
  it('8 rotations of an off-grid wall return exactly the start', () => {
    const start = wall(1, p(20.3, 80.7), p(20.3 + 8, 80.7))
    let r = start
    for (let i = 0; i < 8; i++) r = rotatedWall(r)
    expect(r).toEqual(start)
  })
  it('translating then rotating gives exact 45 degree components', () => {
    const r = rotatedWall(translatedWall(wall(1, p(20, 80), p(28, 80)), p(0.3, 0.7)))
    expect(r.b).toEqual(p(r.a.x + 8 * Math.SQRT1_2, r.a.y + 8 * Math.SQRT1_2))
  })
  it('steps 90 degrees with a custom angle set of [0, 90]', () => {
    const custom = { wallHalf: rules.wallHalf, wall: { ...rules.wall, angles: [0, 90] } }
    expect(rotatedWall(wall(1, p(20, 80), p(28, 80)), custom).b).toEqual(p(20, 88))
  })
  it('re-snaps a stray length to the nearest allowed units', () => {
    expect(wallUnits(rotatedWall(wall(1, p(20, 80), p(30.5, 80))))).toBe(1)
  })
  it('keeps a 2-unit length', () => {
    const r = rotatedWall(wall(1, p(20, 80), p(36, 80)))
    expect(Math.hypot(r.b.x - 20, r.b.y - 80)).toBeCloseTo(2 * U, 6)
  })
})

describe('translatedWall', () => {
  it('moves both ends and keeps the rest', () => {
    expect(translatedWall(wall(2, p(1, 2), p(9, 2)), p(3, -1))).toEqual(wall(2, p(4, 1), p(12, 1)))
  })
})

describe('segments touching, crossing and overlapping', () => {
  const s = (a: Point, b: Point) => ({ a, b })
  const base = s(p(0, 0), p(8, 0))
  it('crossing is not a touch, in a plus or at a slant', () => {
    expect(segmentsTouchOnly(base, s(p(4, -4), p(4, 4)), 1e-6)).toBe(false)
    expect(segmentsTouchOnly(base, s(p(2, -2), p(6, 2)), 1e-6)).toBe(false)
  })
  it('end to end is fine, straight or bent', () => {
    expect(segmentsTouchOnly(base, s(p(8, 0), p(16, 0)), 1e-6)).toBe(true)
    expect(segmentsTouchOnly(base, s(p(8, 0), p(8 + D, D)), 1e-6)).toBe(true)
    expect(segmentsTouchOnly(base, s(p(0, 0), p(0, 8)), 1e-6)).toBe(true)
  })
  it('an end on the other\'s body (a T) is fine', () => {
    expect(segmentsTouchOnly(base, s(p(4, 0), p(4, 8)), 1e-6)).toBe(true)
    expect(segmentsTouchOnly(s(p(4, 0), p(4, 8)), base, 1e-6)).toBe(true)
    expect(segmentsTouchOnly(base, s(p(4, 0), p(4 + D, D)), 1e-6)).toBe(true)
  })
  it('collinear overlap of positive length is not a touch, whatever the direction', () => {
    expect(segmentsTouchOnly(base, s(p(4, 0), p(12, 0)), 1e-6)).toBe(false)
    expect(segmentsTouchOnly(base, s(p(12, 0), p(4, 0)), 1e-6)).toBe(false)
    expect(segmentsTouchOnly(base, s(p(2, 0), p(6, 0)), 1e-6)).toBe(false)
    expect(segmentsTouchOnly(base, base, 1e-6)).toBe(false)
    expect(segmentsTouchOnly(s(p(0, 0), p(D, D)), s(p(D / 2, D / 2), p(2 * D, 2 * D)), 1e-6)).toBe(false)
  })
  it('parallel walls apart, and collinear ones that only meet at an end, are fine', () => {
    expect(segmentsTouchOnly(base, s(p(0, 1), p(8, 1)), 1e-6)).toBe(true)
    expect(segmentsTouchOnly(base, s(p(8, 0), p(16, 0)), 1e-6)).toBe(true)
    expect(segmentsTouchOnly(base, s(p(20, 0), p(28, 0)), 1e-6)).toBe(true)
  })
  it('forgives float noise within epsilon', () => {
    // A turned wall ends where another starts, up to rounding.
    const a = rotatedWall(wall(1, p(0, 0), p(8, 0)))
    const next = { a: a.b, b: { x: a.b.x + D, y: a.b.y + D } }
    expect(segmentsTouchOnly(a, next, 1e-6)).toBe(true)
    expect(segmentsTouchOnly(a, { a: { x: a.b.x - 1e-9, y: a.b.y }, b: { x: a.b.x + 8, y: a.b.y } }, 1e-6)).toBe(true)
    // Two walls from the same point at 45 degrees apart share an end only.
    expect(wallsOverlap(a, wall(1, p(0, 0), p(8, 0)))).toBe(false)
  })
  it('wallsOverlap counts parallel walls closer than the wall thickness, and lets touches be', () => {
    const w = wall(1, p(0, 80), p(8, 80))
    expect(wallsOverlap(w, wall(1, p(0, 80.5), p(8, 80.5)))).toBe(true)
    expect(wallsOverlap(w, wall(1, p(0, 81), p(8, 81)))).toBe(false)
    expect(wallsOverlap(w, wall(1, p(8, 80), p(16, 80)))).toBe(false) // end to end
    expect(wallsOverlap(w, wall(1, p(4, 80), p(4, 88)))).toBe(false) // a T
    expect(wallsOverlap(w, wall(1, p(4, 76), p(4, 84)))).toBe(true) // crossing
  })
  it('wallsOverlap takes the wall thickness from the rules it is given', () => {
    const [w, close] = [wall(1, p(0, 80), p(8, 80)), wall(1, p(0, 80.5), p(8, 80.5))]
    expect(wallsOverlap(w, close)).toBe(true)
    expect(wallsOverlap(w, close, undefined, { ...rules, wallHalf: 0.2 })).toBe(false)
  })
  it('wallsOverlap reads the same as not touching', () => {
    expect(wallsOverlap(wall(1, p(0, 0), p(8, 0)), wall(1, p(4, -4), p(4, 4)))).toBe(true)
    expect(wallsOverlap(wall(1, p(0, 0), p(8, 0)), wall(1, p(8, 0), p(16, 0)))).toBe(false)
  })
})

describe('isLegal', () => {
  /** Asserts the wall is a drawable shape first, so a failure below is down to the rule under test. */
  const illegal = (w: WallSpec) => {
    expect(isDrawable(w)).toBe(true)
    expect(isLegal(w)).toBe(false)
  }
  it('allows a wall on the owner half, and refuses the opponent half', () => {
    expect(isLegal(wall(1, ...ends(2, 40)))).toBe(true)
    expect(isLegal(wall(2, ...ends(2, 10)))).toBe(true)
    expect(isLegal(wall(1, ...ends(2, 10)))).toBe(false)
    expect(isLegal(wall(2, ...ends(2, 40)))).toBe(false)
  })
  it('refuses a wall with any part off the owner half, even if its ends are on it', () => {
    illegal(wall(1, p(4, 58), p(4, 50))) // a vertical unit stepping over the halfway line
    illegal(wall(2, p(4, 50), p(4, 58)))
    illegal(wall(1, p(4, 56), p(4 + D, 56 - D))) // a diagonal stepping over the line
    illegal(wall(2, p(4, 52), p(4 + D, 52 + D)))
  })
  it('refuses a wall lying on the halfway line, allows one touching it from the owner side', () => {
    expect(isLegal(wall(1, p(4, 54), p(12, 54)))).toBe(false)
    expect(isLegal(wall(2, p(4, 54), p(12, 54)))).toBe(false)
    expect(isLegal(wall(1, p(4, 54), p(4, 62)))).toBe(true)
    expect(isLegal(wall(2, p(4, 54), p(4, 46)))).toBe(true)
  })
  it('keeps the whole segment inside the pitch', () => {
    expect(isLegal(wall(1, p(-1, 80), p(7, 80)))).toBe(false)
    expect(isLegal(wall(1, p(34, 80), p(42, 80)))).toBe(false)
    expect(isLegal(wall(1, p(32, 80), p(40, 80)))).toBe(true)
    expect(isLegal(wall(1, p(0, 80), p(8, 80)))).toBe(true)
    illegal(wall(1, p(2, 104), p(2, 112))) // past the goal line
  })
  it('refuses a wall inside the own goal no-build semicircle, by distance to the whole segment', () => {
    expect(isLegal(wall(2, ...ends(8, 2)))).toBe(false)
    expect(isLegal(wall(1, ...ends(8, 52)))).toBe(false)
    // Radius 15 around (20, 0), inclusive. A vertical wall on x=20 from y=14 is 14 away; from y=16, 16.
    expect(isLegal(wall(2, p(20, 14), p(20, 22)))).toBe(false)
    expect(isLegal(wall(2, p(20, 16), p(20, 24)))).toBe(true)
    // Horizontal on y=14 from x=14: the nearest point (20, 14) is inside.
    expect(isLegal(wall(2, ...ends(7, 7)))).toBe(false)
    expect(isLegal(wall(2, ...ends(1, 7)))).toBe(true)
    // A diagonal: one clear of the zone, one with its far end inside.
    expect(isLegal(wall(2, p(2, 20), p(2 + D, 20 - D)))).toBe(true)
    expect(isLegal(wall(2, p(10, 18), p(10 + D, 18 - D)))).toBe(false)
  })
  it('tests the goal zone against the segment, not just its ends', () => {
    const [clear, clipped] = [wall(2, p(12, 15.5), p(28, 15.5)), wall(2, p(12, 14.5), p(28, 14.5))]
    // Both ends are outside the zone; only the middle (20, y) can be inside.
    for (const w of [clear, clipped]) expect(Math.min(Math.hypot(w.a.x - 20, w.a.y), Math.hypot(w.b.x - 20, w.b.y))).toBeGreaterThan(rules.noBuildRadius)
    expect(isDrawable(clear)).toBe(true)
    expect(isDrawable(clipped)).toBe(true)
    expect(isLegal(clear)).toBe(true)
    expect(isLegal(clipped)).toBe(false)
  })
  it('refuses a wall inside the Centre zone (radius 3 cells around the centre spot), by distance to the segment', () => {
    // Centre (20, 54). A vertical wall on x=20 from y=60 is 6 away (inside, inclusive).
    illegal(wall(1, p(20, 60), p(20, 68)))
    expect(isLegal(wall(1, p(20, 60.5), p(20, 68.5)))).toBe(true)
    // Ends outside the circle but the middle passing through it.
    const [inside, clear] = [wall(1, p(14, 60), p(30, 60)), wall(1, p(14, 60.5), p(30, 60.5))]
    expect(Math.hypot(inside.a.x - 20, inside.a.y - 54)).toBeGreaterThan(rules.centreZoneRadius)
    illegal(inside)
    expect(isDrawable(clear)).toBe(true)
    expect(isLegal(clear)).toBe(true)
    illegal(wall(2, p(14, 48), p(30, 48)))
    expect(isLegal(wall(2, p(14, 47.5), p(30, 47.5)))).toBe(true)
    // Far enough along the line.
    expect(isLegal(wall(1, p(26.5, 56), p(34.5, 56)))).toBe(true)
  })
  it('refuses a tower inside the Centre zone and accepts one just outside', () => {
    const tower = (owner: 1 | 2, gx: number, gy: number): TowerSpec => ({ kind: 'tower', owner, power: 'repulsor', at: { gx, gy } })
    // Centre (20, 54), radius 6: the cell at (24..26, 58..60) has its nearest corner 5.66 away; the one at (26..28, 58..60) 7.2.
    expect(isLegal(tower(1, 12, 29))).toBe(false)
    expect(isLegal(tower(1, 13, 29))).toBe(true)
    expect(isLegal(tower(2, 12, 24))).toBe(false)
    expect(isLegal(tower(2, 13, 24))).toBe(true)
  })
  it('judges a tower by its whole cell against the halfway line', () => {
    const tower = (owner: 1 | 2, gy: number): TowerSpec => ({ kind: 'tower', owner, power: 'repulsor', at: { gx: 2, gy } })
    // The halfway line is at grid row 27: a cell resting on it, wholly on the owner's side, is legal.
    expect(isLegal(tower(1, 27))).toBe(true)
    expect(isLegal(tower(2, 26))).toBe(true)
    // Wholly on the other half is not.
    expect(isLegal(tower(1, 26))).toBe(false)
    expect(isLegal(tower(2, 27))).toBe(false)
  })
  it('does not cross or overlap any existing wall, either owner\'s', () => {
    const existing = [wall(1, p(10, 80), p(18, 80)), wall(2, p(10, 20), p(18, 20))]
    expect(isLegal(wall(1, p(14, 76), p(14, 84)), existing)).toBe(false) // a plus
    expect(isLegal(wall(1, p(14, 86), p(14 + D, 86 - D)), existing)).toBe(true) // clear
    expect(isLegal(wall(1, p(14, 80), p(22, 80)), existing)).toBe(false) // collinear overlap
    expect(isLegal(wall(1, p(12, 76), p(12 + D, 76 + D)), existing)).toBe(false) // crossing at a slant
    expect(isLegal(wall(2, p(14, 16), p(14, 24)), existing)).toBe(false)
  })
  it('lets walls touch end to end and in a T', () => {
    const existing = [wall(1, p(10, 80), p(18, 80))]
    expect(isLegal(wall(1, p(18, 80), p(26, 80)), existing)).toBe(true) // straight on
    expect(isLegal(wall(1, p(18, 80), p(18 + D, 80 + D)), existing)).toBe(true) // a bend
    expect(isLegal(wall(1, p(14, 80), p(14, 88)), existing)).toBe(true) // a T on the body
    expect(isLegal(wall(1, p(14, 80), p(14 + D, 80 - D)), existing)).toBe(true) // a diagonal T
  })
  it('ignores itself only when the caller leaves it out (a move)', () => {
    const w = wall(1, p(10, 80), p(18, 80))
    expect(isLegal(w, [w])).toBe(false)
    expect(isLegal(w, [])).toBe(true)
  })
})

/** A horizontal unit from grid vertex (gx, gy), as a pair of ends. */
function ends(gx: number, gy: number): [Point, Point] {
  const { a, b } = hseg(gx, gy)
  return [a, b]
}

describe('allowed shapes', () => {
  it('refuses a wall whose length or angle is not in the configured sets', () => {
    expect(isLegal(wall(1, p(4, 80), p(4 + 12, 80)))).toBe(false) // 1.5 units
    expect(isLegal(wall(1, p(4, 80), p(4 + 24, 80)))).toBe(false) // 3 units
    expect(isLegal(wall(1, p(4, 80), p(4 + 8 * Math.cos(0.2), 80 + 8 * Math.sin(0.2))))).toBe(false) // an odd angle
    expect(isLegal(wall(1, p(4, 80), p(4 + 16, 80)))).toBe(true)
    expect(isLegal(wall(1, p(30, 80), p(30 - D, 80 - D)))).toBe(true) // 225 degrees is the 45 degree set
    expect(isLegal(wall(1, p(30, 80), p(30 + D, 80 - D)))).toBe(true)
  })
})

describe('snapWallBetween', () => {
  describe('swapping the fingers gives the same wall with a and b swapped', () => {
    const swapped = (f1: Point, f2: Point) => {
      const [x, y] = [snapWallBetween(f1, f2)!, snapWallBetween(f2, f1)!]
      expect(y.a.x).toBeCloseTo(x.b.x, 9)
      expect(y.a.y).toBeCloseTo(x.b.y, 9)
      expect(y.b.x).toBeCloseTo(x.a.x, 9)
      expect(y.b.y).toBeCloseTo(x.a.y, 9)
      return x
    }
    it('for an off-axis pair', () => void swapped(p(10, 70), p(31, 77)))
    it('for an exact 337.5 degree pair, the heading tie between two angles', () => {
      swapped(p(0, 0), p(12 * Math.cos((-22.5 * Math.PI) / 180), 12 * Math.sin((-22.5 * Math.PI) / 180)))
    })
    it('for an exact 1.5 unit pair, the length tie takes 1 unit from either side', () => {
      const w = swapped(p(0, 0), p(1.5 * U, 0))
      expect(Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)).toBeCloseTo(U, 9)
    })
  })
  it('a horizontal pair makes a horizontal wall centred between them, a at the first finger', () => {
    const w = snapWallBetween(p(10, 70), p(30, 70.5))
    near(w && w.a, p(12, 70.25))
    near(w && w.b, p(28, 70.25))
    const r = snapWallBetween(p(30, 70), p(10, 70))
    near(r && r.a, p(28, 70))
    near(r && r.b, p(12, 70))
  })
  it('a diagonal pair makes a 45 degree wall of the nearest unit count', () => {
    const w = snapWallBetween(p(20, 60), p(20 + D, 60 + D))
    near(w && w.a, p(20, 60))
    near(w && w.b, p(20 + D, 60 + D))
  })
  it('caps the length at the longest allowed unit count', () => {
    const w = snapWallBetween(p(0, 70), p(100, 70))
    expect(w && wallUnits(w)).toBe(Math.max(...rules.wall.units))
    near(w && w.a, p(50 - U, 70))
  })
  it('is null with the fingers under half a unit apart, and a unit at exactly half', () => {
    expect(snapWallBetween(p(20, 70), p(20 + U / 2 - 0.01, 70))).toBeNull()
    expect(snapWallBetween(p(20, 70), p(20 + U / 2, 70))).not.toBeNull()
  })
  it('always yields a drawable wall', () => {
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 60
    for (let i = 0; i < 300; i++) {
      const w = snapWallBetween(p(rnd(), rnd()), p(rnd(), rnd()))
      if (w) expect(isDrawable(w)).toBe(true)
    }
  })
})

describe('isLegal with custom wall rules', () => {
  it('reads the rules it is given: a three-unit wall is legal only where three units are allowed', () => {
    const w: WallSpec = { kind: 'wall', owner: 1, ...hseg(1, 40, 3) }
    expect(isLegal(w)).toBe(false)
    expect(isLegal(w, [], { ...rules, wall: { ...rules.wall, units: [1, 2, 3] } })).toBe(true)
  })
})

describe('nearestOnSegment', () => {
  it('projects onto the segment, clamps to its ends, and takes a zero-length segment as its point', () => {
    const s = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }
    expect(nearestOnSegment(s, { x: 4, y: 3 })).toEqual({ x: 4, y: 0 })
    expect(nearestOnSegment(s, { x: 20, y: 3 })).toEqual({ x: 10, y: 0 })
    expect(nearestOnSegment({ a: { x: 2, y: 2 }, b: { x: 2, y: 2 } }, { x: 5, y: 5 })).toEqual({ x: 2, y: 2 })
  })
})
