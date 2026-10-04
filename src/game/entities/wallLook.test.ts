import { describe, expect, it } from 'vitest'
import { visual } from '../../config/visual'
import { breachAlpha, breachSpecks, endKinds, gapsOf, hitMark, litSide, segmentLook, shadowLocal, shinePos, showPips } from './wallLook'

const LEN = 8
const both = { left: 'cap', right: 'cap' } as const
const deg = (d: number) => (d * Math.PI) / 180

describe('litSide', () => {
  /** The screen direction the lit edge faces: its normal in world space, turned back by the stage's half turn. */
  const litNormal = (angle: number, flipped: boolean) => {
    const side = litSide(angle, flipped)
    const [nx, ny] = [-Math.sin(angle) * side, Math.cos(angle) * side]
    return flipped ? { x: -nx, y: -ny } : { x: nx, y: ny }
  }
  it.each([0, 45, 90, 135])('the lit edge faces screen-up (left for a vertical wall) at %i degrees, flipped or not', (d) => {
    for (const flipped of [false, true]) {
      for (const angle of [deg(d), deg(d + 180)]) {
        const n = litNormal(angle, flipped)
        if (d === 90) expect(n.x).toBeLessThan(-0.99)
        else expect(n.y).toBeLessThan(-0.7)
      }
    }
  })
  it('turning the stage moves the lit edge to the opposite world edge: the same one on screen', () => {
    for (const d of [0, 45, 90, 135]) expect(litSide(deg(d), true)).toBe(-litSide(deg(d), false))
  })
  it('the drop shadow falls down-right on screen: down-right in world space, up-left when flipped', () => {
    const world = (angle: number, flipped: boolean) => {
      const s = shadowLocal(angle, flipped)
      return { x: s.u * Math.cos(angle) - s.v * Math.sin(angle), y: s.u * Math.sin(angle) + s.v * Math.cos(angle) }
    }
    for (const d of [0, 45, 90, 135]) {
      const a = world(deg(d), false)
      const b = world(deg(d), true)
      expect(a.x).toBeGreaterThan(0)
      expect(a.y).toBeGreaterThan(0)
      expect(b.x).toBeCloseTo(-a.x, 9)
      expect(b.y).toBeCloseTo(-a.y, 9)
    }
  })
})

describe('segmentLook', () => {
  const at = (id: number, segment: number, hp: number, origin?: { u: number; side: 1 | -1 }) => segmentLook(id, segment, hp, both, LEN, origin)
  it('is deterministic per (id, segment, health) and differs between them', () => {
    expect(at(3, 1, 2)).toEqual(at(3, 1, 2))
    expect(at(3, 1, 2)).not.toEqual(at(4, 1, 2))
    expect(at(3, 1, 2)).not.toEqual(at(3, 0, 2))
    expect(at(3, 1, 1).cracks).not.toEqual(at(3, 1, 2).cracks)
  })
  it('climbs the ladder: clean at 3, two cracks and a chip at 2, three cracks, a second chip, pits and a scorch at 1', () => {
    const [full, two, one] = [3, 2, 1].map((hp) => at(7, 0, hp))
    expect([full.cracks.length, full.chips.length, full.pits.length]).toEqual([0, 0, 0])
    expect([two.cracks.length, two.chips.length, two.pits.length]).toEqual([2, 1, 0])
    expect([one.cracks.length, one.chips.length]).toEqual([3, 2])
    expect(one.pits.length).toBe(visual.wall.look.pit.count)
    expect(one.scorch).toBeDefined()
    expect(one.chips[0].side).toBe(-one.chips[1].side)
  })
  it('cracks start at the event point when given, and fall back to a seeded spot otherwise', () => {
    const given = at(7, 0, 2, { u: 5, side: -1 })
    for (const c of given.cracks) expect(c[0]).toEqual({ u: 5, v: -visual.wall.look.thickness / 2 })
    const seeded = at(7, 0, 2)
    expect(seeded.origin).toEqual(at(7, 0, 2).origin)
    expect(seeded.cracks[0][0].u).toBe(seeded.origin.u)
  })
  it('chips, pits and jagged ends do not follow the event point', () => {
    const [a, b] = [at(7, 0, 1), at(7, 0, 1, { u: 5, side: -1 })]
    expect(b.chips).toEqual(a.chips)
    expect(b.pits).toEqual(a.pits)
  })
  it('chips stay clear of the caps and joints', () => {
    const m = visual.wall.look.crack.margin
    for (let id = 1; id < 40; id++) {
      for (const hp of [2, 1]) {
        for (const c of at(id, 0, hp).chips) {
          expect(c.u - c.w).toBeGreaterThanOrEqual(m - 1)
          expect(c.u + c.w).toBeLessThanOrEqual(LEN - m + 1)
        }
      }
    }
  })
  it('a Gap beside a segment gives that end a jagged outline, which differs from a joint or a cap', () => {
    const outline = (left: 'cap' | 'joint' | 'broken') => segmentLook(2, 1, 3, { left, right: 'cap' }, LEN).outline
    const [cap, joint, broken] = [outline('cap'), outline('joint'), outline('broken')]
    expect(broken).not.toEqual(cap)
    expect(broken).not.toEqual(joint)
    expect(broken).toEqual(outline('broken'))
    expect(Math.min(...joint.map((p) => p.u))).toBeCloseTo(visual.wall.look.jointWidth / 2, 9)
    expect(Math.min(...cap.map((p) => p.u))).toBeLessThan(0) // the rounded cap bulges past the end
    expect(broken.length).toBeGreaterThan(joint.length)
  })
})

describe('end kinds and Gaps', () => {
  it('reads each end from its neighbour: cap at a real end, joint beside a standing segment, broken beside a Gap', () => {
    expect(endKinds([3, 0, 2], 0)).toEqual({ left: 'cap', right: 'broken' })
    expect(endKinds([3, 0, 2], 2)).toEqual({ left: 'broken', right: 'cap' })
    expect(endKinds([3, 2], 0)).toEqual({ left: 'cap', right: 'joint' })
    expect(endKinds([3], 0)).toEqual({ left: 'cap', right: 'cap' })
  })
  it('lists the Gaps', () => expect(gapsOf([0, 3, 0])).toEqual([0, 2]))
})

describe('pips', () => {
  it('show only on damaged, standing segments, and only when the flag is on', () => {
    expect([3, 2, 1, 0].map((hp) => showPips(hp, 3, true))).toEqual([false, true, true, false])
    expect(showPips(2, 3, false)).toBe(false)
  })
})

describe('breach mark', () => {
  it('has 4 to 6 specks, the same every time for one (id, segment)', () => {
    for (let id = 1; id < 30; id++) {
      const s = breachSpecks(id, 1, LEN)
      expect(s.length).toBeGreaterThanOrEqual(4)
      expect(s.length).toBeLessThanOrEqual(6)
      expect(s).toEqual(breachSpecks(id, 1, LEN))
    }
    expect(breachSpecks(1, 0, LEN)).not.toEqual(breachSpecks(1, 1, LEN))
  })
  it('is full while the wall stands and fades out once it is destroyed', () => {
    expect(breachAlpha(undefined, 400)).toBe(1)
    expect(breachAlpha(0, 400)).toBe(1)
    expect(breachAlpha(200, 400)).toBeCloseTo(0.5, 9)
    expect(breachAlpha(400, 400)).toBe(0)
    expect(breachAlpha(900, 400)).toBe(0)
  })
})

describe('hitMark and shine', () => {
  const a = { x: 0, y: 0 }
  const b = { x: LEN, y: 0 }
  it('projects the hit along the segment, clamped clear of the ends, onto the edge it lies towards', () => {
    expect(hitMark(a, b, { x: 4, y: -1 })).toEqual({ u: 4, side: -1 })
    expect(hitMark(a, b, { x: 4, y: 1 })).toEqual({ u: 4, side: 1 })
    expect(hitMark(a, b, { x: 0, y: 1 }).u).toBe(visual.wall.look.crack.margin)
    expect(hitMark(a, b, { x: 99, y: 1 }).u).toBe(LEN - visual.wall.look.crack.margin)
  })
  it('the sheen sweeps along the wall, and walls with different ids are out of step', () => {
    expect(shinePos(1000, 1, 16)).toBeGreaterThan(shinePos(0, 1, 16))
    expect(shinePos(0, 1, 16)).not.toBe(shinePos(0, 2, 16))
    for (let t = 0; t < 20000; t += 500) expect(shinePos(t, 5, 8)).toBeGreaterThanOrEqual(-visual.wall.look.shine.halfWidth)
  })
})
