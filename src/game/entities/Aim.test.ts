import { describe, expect, it } from 'vitest'
import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import { defaultConfig, step, type SimState } from '../../sim/step'
import { buildState, playState, hseg } from '../../sim/testkit'
import type { Point } from '../../sim/pitch'
import type { WallSpec } from '../../sim/wall'
import { Aim, type AimLine } from './Aim'

const wall: WallSpec = { kind: 'wall', owner: 1, ...hseg(10, 40) }
const placed = () => step(buildState(1), { placeWall: wall }, defaultConfig).state

describe('Aim', () => {
  it('shows a Power shot\'s Splash ring for its duration', () => {
    const a = new Aim()
    a.sync(placed(), defaultConfig)
    a.splash({ x: 20, y: 70 }, 1, 0.75)
    a.update((visual.aim.splash.ms - 1) / 1000)
    expect(a.splashCount).toBe(1)
    a.update(0.002)
    expect(a.splashCount).toBe(0)
  })
  it('shows no ring for a Touch shot', () => {
    const a = new Aim()
    a.sync(placed(), defaultConfig)
    a.splash({ x: 20, y: 70 }, 0, 0.4)
    expect(a.splashCount).toBe(0)
  })
})

describe('Aim Ghost', () => {
  // Straight up the left of the pitch, from 19 units below the end board: the ball (radius 1) first touches it at y = 1.
  const shooting = (pos = { x: 10, y: 20 }): SimState => ({ ...playState(), possession: { shooter: 1, shots: 3, inHand: false, live: false }, ball: { pos, vel: { x: 0, y: 0 }, rolled: 0 } })
  /** Long enough never to cut the path. */
  const far = { maxBounces: 1, reach: [1000, 1000] } as const
  const ghostOf = (ghost: AimLine['ghost'], aim: Partial<AimLine> = { dir: { x: 0, y: -1 }, power: 0.45 }, state = shooting()) => {
    const a = new Aim()
    a.sync(state, defaultConfig)
    a.aim = { tier: 0, ghost, ...aim }
    return a.ghost
  }
  const lengthOf = (ps: Point[]) => ps.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - ps[i].x, p.y - ps[i].y), 0)
  // Down the open middle of the pitch, 88 units from the far board: no shot here bounces before its reach runs out.
  const open = shooting({ x: 20, y: 20 })
  const down = { x: 0, y: 1 }
  const reachOf = (tier: number, power: number, ghost = rules.shot.tiers[tier].ghost, state = open) => lengthOf(ghostOf(ghost, { tier, dir: down, power }, state)!)

  it('redraws the path when the charge changes, not from a stale cache', () => {
    const state = shooting()
    const a = new Aim()
    a.sync(state, defaultConfig)
    a.aim = { tier: 0, ghost: { ...far, maxBounces: Infinity }, dir: { x: 1, y: 0 }, power: 0.2 }
    const plain = a.ghost
    a.sync({ ...state, charge: { zone: 'bullseye', factor: rules.boost.bullseye.factor } }, defaultConfig)
    expect(a.ghost).not.toEqual(plain)
  })

  it('is the predicted path from the ball to its first bounce', () => {
    const g = ghostOf(far)!
    expect(g[0]).toEqual({ x: 10, y: 20 })
    expect(g.at(-1)!.x).toBeCloseTo(10)
    expect(g.at(-1)!.y).toBeCloseTo(1)
  })
  it('stops at its bounce cap, marking each bounce', () => {
    // Off the left board first, then on to the end board.
    const a = new Aim()
    a.sync(shooting(), defaultConfig)
    a.aim = { tier: 1, ghost: { ...far, maxBounces: 2 }, dir: { x: -0.6, y: -0.8 }, power: 1 }
    expect(a.ghost!.at(-1)!.y).toBeCloseTo(1)
    expect(a.ghostBounces).toHaveLength(2)
    expect(a.ghostBounces[0].x).toBeCloseTo(1)
  })
  it('reaches from its min to its max by where the power sits in the tier\'s range', () => {
    // Power runs 0.5-1: its weakest shot reaches 10 units, the middle 20, its strongest 30.
    const ghost = { maxBounces: 1, reach: [10, 30] } as const
    expect(reachOf(1, 0.5, ghost)).toBeCloseTo(10)
    expect(reachOf(1, 0.75, ghost)).toBeCloseTo(20)
    expect(reachOf(1, 1, ghost)).toBeCloseTo(30)
  })
  it('reaches further for Touch than for Power at the same relative pull', () => {
    for (const t of [0, 0.5, 1]) {
      const powerAt = (tier: number) => {
        const [lo, hi] = rules.shot.tiers[tier].power
        return lo * (1 - t) + hi * t
      }
      expect(reachOf(0, powerAt(0))).toBeGreaterThan(reachOf(1, powerAt(1)))
    }
  })
  it('reaches as far from a Charged ball as from a plain one', () => {
    const charged: SimState = { ...open, charge: { zone: 'bullseye', factor: rules.boost.bullseye.factor } }
    // Power at 0.75 reaches 20 units (10 to 30), well short of where either ball would stop.
    const ghost = { maxBounces: 1, reach: [10, 30] } as const
    expect(reachOf(1, 0.75, ghost)).toBeCloseTo(20)
    expect(reachOf(1, 0.75, ghost, charged)).toBeCloseTo(20)
  })
  it('shows no Ghost before the drag', () => {
    expect(ghostOf(far, {})).toBeUndefined()
  })
})

describe('Aim Ghost dots', () => {
  const ball = { pos: { x: 20, y: 20 }, vel: { x: 0, y: 0 }, rolled: 0 }
  // A Power aim straight down the open pitch, its Ghost 20 units long.
  const aiming = (power = 0.75) => {
    const a = new Aim()
    a.sync({ ...playState(), possession: { shooter: 1, shots: 3, inHand: false, live: false }, ball }, defaultConfig)
    a.aim = { tier: 1, ghost: { maxBounces: 1, reach: [20, 20] }, dir: { x: 0, y: 1 }, power }
    return a
  }
  const { gap } = visual.aim.ghost.dots

  it('runs from the ball\'s edge to the end of the Ghost, a gap apart', () => {
    const dots = aiming().ghostDots
    expect(dots[0].at.y).toBeGreaterThanOrEqual(20 + defaultConfig.ballRadius)
    expect(dots[0].at.y).toBeLessThan(20 + defaultConfig.ballRadius + gap)
    expect(dots.at(-1)!.at.y).toBeLessThanOrEqual(40)
    expect(dots[1].at.y - dots[0].at.y).toBeCloseTo(gap)
  })
  it('fades and shrinks toward the end', () => {
    const dots = aiming().ghostDots
    expect(dots.at(-1)!.alpha).toBeLessThan(dots[0].alpha)
    expect(dots.at(-1)!.radius).toBeLessThan(dots[0].radius)
  })
  it('is larger for a Charged ball', () => {
    const plain = aiming()
    const charged = aiming()
    charged.sync({ ...playState(), possession: { shooter: 1, shots: 3, inHand: false, live: false }, ball, charge: { zone: 'ring', factor: rules.boost.ring.factor } }, defaultConfig)
    expect(charged.ghostDots[0].radius).toBeGreaterThan(plain.ghostDots[0].radius)
  })
  it('drifts forward over time, faster with more power', () => {
    const drift = (power: number) => {
      const a = aiming(power)
      const before = a.ghostDots[0].at.y
      a.update(0.05)
      return a.ghostDots[0].at.y - before
    }
    expect(drift(0.5)).toBeGreaterThan(0)
    expect(drift(1)).toBeGreaterThan(drift(0.5))
  })
})

describe('Aim Ghost colour', () => {
  const ball = { pos: { x: 20, y: 80 }, vel: { x: 0, y: 0 }, rolled: 0 }
  const colourOf = (aim: AimLine) => {
    const a = new Aim()
    a.sync({ ...playState(), ball }, defaultConfig)
    a.aim = aim
    return a.ghostColor
  }
  it('is green for a Touch aim', () => {
    expect(colourOf({ tier: 0, dir: { x: 0, y: -1 }, power: 0.3, ghost: rules.shot.tiers[0].ghost })).toBe('#4ade80')
  })
  it('is red for a Power aim', () => {
    expect(colourOf({ tier: 1, dir: { x: 0, y: -1 }, power: 0.8, ghost: rules.shot.tiers[1].ghost })).toBe('#f87171')
  })
  it('is grey while cancel is armed, whatever the tier', () => {
    expect(colourOf({ tier: 1, dir: { x: 0, y: -1 }, power: 0.8, ghost: rules.shot.tiers[1].ghost, cancel: true })).toBe(visual.aim.cancel.color)
  })
})

describe('Aim cancel state', () => {
  const ball = { pos: { x: 20, y: 80 }, vel: { x: 0, y: 0 }, rolled: 0 }
  const { ghost } = rules.shot.tiers[0]

  it('greys the Ghost and marks an ✕ on the ball while cancel is armed', () => {
    const a = new Aim()
    a.sync({ ...playState(), ball }, defaultConfig)
    a.aim = { tier: 0, dir: { x: 0, y: -1 }, power: 0.3, ghost, cancel: true }
    expect(a.ghost).toBeDefined()
    expect(a.cancel).toEqual({ at: { x: 20, y: 80 }, color: visual.aim.cancel.color })
  })
  it('shows no ✕ for an armed aim', () => {
    const a = new Aim()
    a.sync({ ...playState(), ball }, defaultConfig)
    a.aim = { tier: 0, dir: { x: 0, y: -1 }, power: 0.3, ghost }
    expect(a.cancel).toBeUndefined()
  })
})

describe('Aim reset', () => {
  it('forgets the rings and the aim of the last match', () => {
    const a = new Aim()
    a.sync(placed(), defaultConfig)
    a.splash({ x: 20, y: 70 }, 1, 0.75)
    a.aim = { tier: 0, dir: { x: 0, y: -1 }, power: 0.45, ghost: rules.shot.tiers[0].ghost }
    a.reset()
    expect([a.splashCount, a.ghost]).toEqual([0, undefined])
  })
})
