import { describe, expect, it } from 'vitest'
import { aimMove, aimOf, aimPress, aimRelease, aimTick, aimViewOf, cancelArmed, type AimGesture } from './gesture'

const p = (x = 0, y = 0) => ({ x, y })
// A small ball at (100, 300) on a 400 x 800 px canvas; Touch is the tier a press starts in.
const size = { w: 400, h: 800 }
const press = (at = p(100, 300), over: { ballRadiusPx?: number; canShoot?: boolean } = {}) => aimPress({ at, now: 0, ball: p(100, 300), ballRadiusPx: 4, canShoot: true, size, ...over })

describe('aim gesture press', () => {
  it('pans when the press is off the ball', () => {
    expect(press(p(100, 400)).phase).toBe('pan')
  })
  it('counts a press within 28 px of a small ball', () => {
    expect([press(p(127, 300)).phase, press(p(129, 300)).phase]).toEqual(['holding', 'pan'])
  })
  it('counts a press anywhere on a ball drawn bigger than 28 px', () => {
    expect([press(p(100, 339), { ballRadiusPx: 40 }).phase, press(p(100, 341), { ballRadiusPx: 40 }).phase]).toEqual(['holding', 'pan'])
  })
  it('pans when the player cannot shoot, even on the ball', () => {
    expect(press(p(100, 300), { canShoot: false }).phase).toBe('pan')
  })
})

// Touch: radius 150 px, power [0.15, 0.45], slop 8 px, eased (quadratic) direct curve.
const dragTo = (x: number, y: number) => aimMove(press(), p(x, y), 100)

describe('aim gesture drag', () => {
  it('aims opposite the drag', () => {
    const { dir } = aimOf(dragTo(100 + 60, 300 + 80))!
    expect(dir.x).toBeCloseTo(-0.6)
    expect(dir.y).toBeCloseTo(-0.8)
  })
  it('starts at the bottom of the tier\'s range just past the slop', () => {
    expect(aimOf(dragTo(100, 308.001))!.power).toBeCloseTo(0.15)
  })
  it('reaches the top of the range at the control radius', () => {
    expect(aimOf(dragTo(100, 300 + 150))!.power).toBeCloseTo(0.45)
  })
  it('eases in between: halfway along the drag is a quarter of the way up the range', () => {
    expect(aimOf(dragTo(100, 300 + 8 + 71))!.power).toBeCloseTo(0.225)
  })
  it('keeps steering at the edge power past the control radius', () => {
    const aim = aimOf(dragTo(100, 300 + 450))!
    expect(aim.power).toBeCloseTo(0.45)
    expect(aim.dir).toEqual({ x: 0, y: -1 })
  })
  it('is a Touch aim', () => {
    expect(aimOf(dragTo(100, 400))!.tier).toBe(0)
  })
  it('has no aim within the slop', () => {
    expect(aimOf(dragTo(105, 305))).toBeNull()
  })
  it('measures from the ball\'s centre: a press off the centre aims as one on it', () => {
    const offCentre = aimOf(aimMove(press(p(120, 290)), p(100, 400), 100))
    expect(offCentre).toEqual(aimOf(dragTo(100, 400)))
    expect(offCentre!.dir).toEqual({ x: 0, y: -1 })
  })
})

// Power: held still for 1000 ms; radius 84 px, power [0.5, 1], eased inverted curve.
describe('aim gesture tiers', () => {
  const held = (ms: number) => aimTick(press(), ms)
  const tier = (g: AimGesture) => aimViewOf(g)?.tier
  it('stays Touch just short of holdMs', () => {
    expect(tier(held(999))).toBe(0)
  })
  it('climbs to Power at holdMs while the pointer stays still', () => {
    expect(tier(held(1000))).toBe(1)
  })
  it('climbs while the pointer wanders within the slop', () => {
    expect(tier(aimMove(press(), p(105, 305), 1000))).toBe(1)
  })
  it('locks the tier on the first move past the slop', () => {
    const dragged = aimMove(press(), p(100, 340), 500)
    expect(tier(aimTick(dragged, 5000))).toBe(0)
    expect(aimOf(aimMove(dragged, p(100, 360), 5000))!.tier).toBe(0)
  })
  it('never climbs during a drag, even back within the slop', () => {
    const back = aimMove(aimMove(press(), p(100, 340), 500), p(101, 301), 600)
    expect(tier(aimMove(back, p(102, 302), 5000))).toBe(0)
  })
  it('takes the tier reached by the time of the move that leaves the slop', () => {
    expect(aimOf(aimMove(press(), p(100, 340), 1200))!.tier).toBe(1)
  })
  const powerTo = (y: number) => aimOf(aimMove(held(1000), p(100, y), 1100))!
  it('is strongest just past the slop on the inverted curve', () => {
    expect(powerTo(308.001).power).toBeCloseTo(1)
  })
  it('is weakest at the Power control radius, and stays there past it', () => {
    expect(powerTo(300 + 84).power).toBeCloseTo(0.5)
    expect(powerTo(300 + 200).power).toBeCloseTo(0.5)
  })
  it('mirrors the Touch easing: halfway along the drag is a quarter of the way up the range', () => {
    expect(powerTo(300 + 8 + 38).power).toBeCloseTo(0.625)
  })
  it('shows how far the hold has climbed towards the next tier', () => {
    expect(aimViewOf(held(0))?.holdProgress).toBe(0)
    expect(aimViewOf(held(250))?.holdProgress).toBeCloseTo(0.25)
    expect(aimViewOf(held(1000))).toMatchObject({ tier: 1, radiusPx: 84, holdProgress: 1 })
    expect(aimViewOf(held(3000))?.holdProgress).toBe(1)
  })
})

describe('aim gesture release', () => {
  it('fires the aim held at release', () => {
    const r = aimRelease(dragTo(100, 520))
    expect(r.type).toBe('shot')
    expect(r.type === 'shot' && r.aim.dir).toEqual({ x: 0, y: -1 })
  })
  it('cancels a release without having dragged', () => {
    expect(aimRelease(aimMove(press(), p(103, 304), 100)).type).toBe('cancelled')
  })
  it('cancels a release after dragging back within the slop', () => {
    expect(aimRelease(aimMove(dragTo(100, 450), p(102, 302), 200)).type).toBe('cancelled')
  })
  it('a pan stays a pan', () => {
    expect(aimRelease(aimMove(press(p(0, 0)), p(200, 200), 100)).type).toBe('pan')
  })
})

describe('aim gesture view', () => {
  it('shows nothing for a pan', () => {
    expect(aimViewOf(press(p(0, 0)))).toBeUndefined()
  })
  it('shows the Touch control radius and no direction before the drag', () => {
    expect(aimViewOf(press())).toEqual({ phase: 'holding', tier: 0, holdProgress: 0, radiusPx: 150, ghost: { until: { contacts: 1 }, scale: 1 } })
  })
  it('shows the aim once dragging', () => {
    const v = aimViewOf(dragTo(100, 520))
    expect(v).toMatchObject({ phase: 'aiming', tier: 0, radiusPx: 150, dir: { x: 0, y: -1 } })
    expect(v?.power).toBeCloseTo(0.45)
  })
})

// Edge cancel: within 24 px of any canvas edge.
describe('aim gesture edge cancel', () => {
  const aimed = dragTo(100, 450)
  it('arms cancel within 24 px of any edge, and not further in', () => {
    const at = (x: number, y: number) => cancelArmed(aimMove(aimed, p(x, y), 200))
    expect([at(23, 400), at(377, 400), at(200, 23), at(200, 777)]).toEqual([true, true, true, true])
    expect([at(25, 400), at(375, 400), at(200, 25), at(200, 775)]).toEqual([false, false, false, false])
  })
  it('holds no aim while armed, so nothing fires on time out', () => {
    expect(aimOf(aimMove(aimed, p(100, 790), 200))).toBeNull()
  })
  it('cancels a release in the edge zone', () => {
    expect(aimRelease(aimMove(aimed, p(100, 790), 200)).type).toBe('cancelled')
  })
  it('shows the aim greyed while armed', () => {
    const v = aimViewOf(aimMove(aimed, p(100, 790), 200))
    expect(v).toMatchObject({ phase: 'aiming', cancel: true, dir: { x: 0, y: -1 } })
  })
  it('re-arms the same shot, tier unchanged, on moving back out', () => {
    const back = aimMove(aimMove(aimed, p(100, 790), 200), p(100, 450), 300)
    expect(cancelArmed(back)).toBe(false)
    expect(aimViewOf(back)?.cancel).toBeUndefined()
    expect(aimRelease(back)).toEqual({ type: 'shot', aim: aimOf(aimed) })
    expect(aimOf(back)?.tier).toBe(0)
  })
})
