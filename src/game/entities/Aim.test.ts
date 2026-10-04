import { describe, expect, it } from 'vitest'
import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import { defaultConfig, step, type SimState } from '../../sim/step'
import { buildState, playState, hseg } from '../../sim/testkit'
import type { Point } from '../../sim/pitch'
import type { WallSpec } from '../../sim/wall'
import { splashOf } from '../../sim/splash'
import { Aim, tierColor, type AimLine } from './Aim'

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
    a.aim = { tier: 0, ghost, pxPerUnit: 10, ...aim }
    return a.ghost
  }
  const lengthOf = (ps: Point[]) => ps.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - ps[i].x, p.y - ps[i].y), 0)
  // Down the open middle of the pitch, 88 units from the far board: no shot here bounces before its reach runs out.
  const open = shooting({ x: 20, y: 20 })
  const down = { x: 0, y: 1 }
  /** How far the Ghost runs past the Comet's tip: the path from the ball, less the stretch under the Comet. */
  const reachOf = (tier: number, power: number, ghost = rules.shot.tiers[tier].ghost, state = open, pxPerUnit = 10) => {
    const a = new Aim()
    a.sync(state, defaultConfig)
    a.aim = { tier, ghost, dir: down, power, pxPerUnit }
    const { tip } = a.comet!
    return lengthOf(a.ghost!) - Math.hypot(tip.x - state.ball.pos.x, tip.y - state.ball.pos.y)
  }

  it('redraws the path when the charge changes, not from a stale cache', () => {
    const state = shooting()
    const a = new Aim()
    a.sync(state, defaultConfig)
    a.aim = { tier: 0, ghost: { ...far, maxBounces: Infinity }, dir: { x: 1, y: 0 }, power: 0.2, pxPerUnit: 10 }
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
    a.aim = { tier: 1, ghost: { ...far, maxBounces: 2 }, dir: { x: -0.6, y: -0.8 }, power: 1, pxPerUnit: 10 }
    expect(a.ghost!.at(-1)!.y).toBeCloseTo(1)
    expect(a.ghostBounces).toHaveLength(2)
    expect(a.ghostBounces[0].at.x).toBeCloseTo(1)
  })
  it('rings a wall bounce in ink and a board bounce in the tier\'s colour, both grey while cancel is armed', () => {
    // Off the left board, then up into a wall across x 6-14 at y = 20.
    const walled = step(buildState(2), { placeWall: { kind: 'wall', owner: 2, ...hseg(3, 10) } }, defaultConfig).state
    const a = new Aim()
    a.sync({ ...shooting({ x: 10, y: 40 }), objects: walled.objects }, defaultConfig)
    a.aim = { tier: 1, ghost: { ...far, maxBounces: 2 }, dir: { x: -0.6, y: -0.8 }, power: 1, pxPerUnit: 10 }
    expect(a.ghostBounces.map((b) => [b.kind, b.color])).toEqual([['board', tierColor(1)], ['wall', visual.aim.ghost.bounce.wallColor]])
    a.aim = { ...a.aim, cancel: true }
    expect(a.ghostBounces.map((b) => b.color)).toEqual([visual.aim.cancel.color, visual.aim.cancel.color])
  })
  it('reaches from its min to its max by where the power sits in the tier\'s range', () => {
    // Power runs 0.5-1: its weakest shot reaches 10 units, the middle 20, its strongest 30.
    const ghost = { maxBounces: 1, reach: [10, 30] } as const
    expect(reachOf(1, 0.5, ghost)).toBeCloseTo(10)
    expect(reachOf(1, 0.75, ghost)).toBeCloseTo(20)
    expect(reachOf(1, 1, ghost)).toBeCloseTo(30)
  })
  it('reaches as far past the Comet\'s tip at any zoom: the weakest Power shot shows 8 units on a 390 px phone', () => {
    // A 390 px wide phone shows the 40-unit pitch at 9.75 px a unit; zoomed in, the Comet covers fewer units.
    expect(reachOf(1, 0.5, undefined, open, 9.75)).toBeCloseTo(8)
    expect(reachOf(1, 0.5, undefined, open, 30)).toBeCloseTo(8)
  })
  it('shows the weakest Touch shot\'s short roll past a Comet half as long: about 5.66 units of dots on a 390 px phone, not 3.9', () => {
    // It rolls about 10 units from the ball's centre, well short of its 25-unit reach; the Comet's 17 px spear (not 34) leaves 17 / 9.75 = 1.74 units more of it showing.
    expect(reachOf(0, 0.15, undefined, open, 9.75)).toBeCloseTo(5.66)
  })
  it('counts a bounce under the Comet toward its cap', () => {
    // 3 units below the end board: a Power shot bounces off it well inside its Comet, and its 1-bounce cap ends the Ghost there.
    const a = new Aim()
    a.sync(shooting({ x: 10, y: 4 }), defaultConfig)
    a.aim = { tier: 1, ghost: rules.shot.tiers[1].ghost, dir: { x: 0, y: -1 }, power: 1, pxPerUnit: 10 }
    expect(a.ghostBounces).toHaveLength(1)
    expect(a.ghostDots).toEqual([])
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
  // A Power aim straight down the open pitch, its Ghost reaching 20 units past the Comet's tip.
  const aiming = (power = 0.75) => {
    const a = new Aim()
    a.sync({ ...playState(), possession: { shooter: 1, shots: 3, inHand: false, live: false }, ball }, defaultConfig)
    a.aim = { tier: 1, ghost: { maxBounces: 1, reach: [20, 20] }, dir: { x: 0, y: 1 }, power, pxPerUnit: 20 }
    return a
  }
  const { gap } = visual.aim.ghost.dots

  it('runs from the Comet\'s tip to the end of the Ghost, a gap apart', () => {
    const a = aiming()
    const { tip } = a.comet!
    const dots = a.ghostDots
    expect(dots[0].at.y).toBeGreaterThanOrEqual(tip.y)
    expect(dots[0].at.y).toBeLessThan(tip.y + gap)
    expect(dots.at(-1)!.at.y).toBeLessThanOrEqual(tip.y + 20)
    expect(dots.at(-1)!.at.y).toBeGreaterThan(tip.y + 20 - gap)
    expect(dots[1].at.y - dots[0].at.y).toBeCloseTo(gap)
  })
  it('shows as many dots behind a longer Comet: the reach runs from its tip', () => {
    expect(aiming(1).ghostDots).toHaveLength(aiming(0.5).ghostDots.length)
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
    return a.aimColor
  }
  it('is green for a Touch aim', () => {
    expect(colourOf({ tier: 0, dir: { x: 0, y: -1 }, power: 0.3, ghost: rules.shot.tiers[0].ghost, pxPerUnit: 10 })).toBe('#4ade80')
  })
  it('is red for a Power aim', () => {
    expect(colourOf({ tier: 1, dir: { x: 0, y: -1 }, power: 0.8, ghost: rules.shot.tiers[1].ghost, pxPerUnit: 10 })).toBe('#f87171')
  })
  it('is grey while cancel is armed, whatever the tier', () => {
    expect(colourOf({ tier: 1, dir: { x: 0, y: -1 }, power: 0.8, ghost: rules.shot.tiers[1].ghost, cancel: true, pxPerUnit: 10 })).toBe(visual.aim.cancel.color)
  })
})

describe('Aim cancel state', () => {
  const ball = { pos: { x: 20, y: 80 }, vel: { x: 0, y: 0 }, rolled: 0 }
  const { ghost } = rules.shot.tiers[0]

  it('greys the Ghost and marks an ✕ on the ball while cancel is armed', () => {
    const a = new Aim()
    a.sync({ ...playState(), ball }, defaultConfig)
    a.aim = { tier: 0, dir: { x: 0, y: -1 }, power: 0.3, ghost, cancel: true, pxPerUnit: 10 }
    expect(a.ghost).toBeDefined()
    expect(a.cancel).toEqual({ at: { x: 20, y: 80 }, color: visual.aim.cancel.color })
  })
  it('shows no ✕ for an armed aim', () => {
    const a = new Aim()
    a.sync({ ...playState(), ball }, defaultConfig)
    a.aim = { tier: 0, dir: { x: 0, y: -1 }, power: 0.3, ghost, pxPerUnit: 10 }
    expect(a.cancel).toBeUndefined()
  })
})

describe('Aim reset', () => {
  it('forgets the rings and the aim of the last match', () => {
    const a = new Aim()
    a.sync(placed(), defaultConfig)
    a.splash({ x: 20, y: 70 }, 1, 0.75)
    a.aim = { tier: 0, dir: { x: 0, y: -1 }, power: 0.45, ghost: rules.shot.tiers[0].ghost, pxPerUnit: 10 }
    a.reset()
    expect([a.splashCount, a.ghost]).toEqual([0, undefined])
  })
})

describe('Aim Comet', () => {
  const ball = { pos: { x: 20, y: 20 }, vel: { x: 0, y: 0 }, rolled: 0 }
  // 10 screen px to a world unit: the Comet's px sizes divide by 10.
  const aiming = (aim: Partial<AimLine> = {}) => {
    const a = new Aim()
    a.sync({ ...playState(), possession: { shooter: 1, shots: 3, inHand: false, live: false }, ball }, defaultConfig)
    a.aim = { tier: 0, ghost: rules.shot.tiers[0].ghost, dir: { x: 0, y: 1 }, power: 0.15, pxPerUnit: 10, ...aim }
    return a
  }

  it('runs 34 px for the weakest shot and 154 px for the strongest, at half length in Touch', () => {
    expect(aiming({ tier: 0, power: 0.15 }).comet!.length).toBeCloseTo(1.7)
    expect(aiming({ tier: 0, power: 0.45 }).comet!.length).toBeCloseTo(3.82)
    expect(aiming({ tier: 1, power: 0.5 }).comet!.length).toBeCloseTo(8.34)
    expect(aiming({ tier: 1, power: 1 }).comet!.length).toBeCloseTo(15.4)
  })
  it('points along the aim, from just past the ball\'s edge', () => {
    const { base, tip } = aiming({ dir: { x: 0.6, y: -0.8 }, power: 0.3 }).comet!
    const along = (p: Point) => ({ x: (p.x - 20) / 0.6, y: (p.y - 20) / -0.8 })
    expect(along(tip).x).toBeCloseTo(along(tip).y)
    expect(along(tip).x).toBeGreaterThan(along(base).x)
    expect(Math.hypot(base.x - 20, base.y - 20)).toBeCloseTo(defaultConfig.ballRadius + 0.2)
  })
  it('is wider at its base higher in its tier\'s range: 9 px at the bottom, 14 px at the top, half that in Touch', () => {
    expect(aiming({ tier: 1, power: 0.5 }).comet!.width).toBeCloseTo(0.9)
    expect(aiming({ tier: 1, power: 1 }).comet!.width).toBeCloseTo(1.4)
    expect(aiming({ tier: 0, power: 0.15 }).comet!.width).toBeCloseTo(0.45)
    expect(aiming({ tier: 0, power: 0.45 }).comet!.width).toBeCloseTo(0.7)
  })
  it('is its tier\'s colour, grey while cancel is armed', () => {
    expect(aiming({ tier: 1, power: 0.8 }).comet!.color).toBe('#f87171')
    expect(aiming({ tier: 1, power: 0.8, cancel: true }).comet!.color).toBe(visual.aim.cancel.color)
  })
  it('shows no Comet before the drag', () => {
    expect(aiming({ dir: undefined, power: undefined }).comet).toBeUndefined()
  })
  it('previews a Power shot\'s Splash around the ball, its radius the Splash it would set off', () => {
    expect(aiming({ tier: 1, power: 0.75 }).splashPreview).toEqual({ at: { x: 20, y: 20 }, radius: splashOf(1, 0.75, defaultConfig)!.radius, color: '#f87171' })
  })
  it('previews no Splash for a Touch shot, or while cancel is armed', () => {
    expect(aiming({ tier: 0, power: 0.3 }).splashPreview).toBeUndefined()
    expect(aiming({ tier: 1, power: 0.75, cancel: true }).splashPreview).toBeUndefined()
  })
  it('runs its chevrons from base to tip, faster with more power', () => {
    const travel = (power: number) => {
      const a = aiming({ tier: 1, power })
      const before = a.cometChevrons.map((c) => c.at.y)
      a.update(0.02)
      return a.cometChevrons.map((c, i) => c.at.y - before[i])
    }
    const [weak, strong] = [travel(0.5), travel(1)]
    expect(weak).toHaveLength(visual.aim.comet.chevrons.count)
    for (const [i, d] of weak.entries()) {
      expect(d).toBeGreaterThan(0)
      expect(strong[i]).toBeGreaterThan(d)
    }
  })
  it('keeps its chevrons on the spear', () => {
    const a = aiming({ tier: 1, power: 1 })
    const { base, end } = a.comet!
    for (let t = 0; t < 1; t += 0.1) {
      a.update(0.1)
      for (const { at } of a.cometChevrons) {
        expect(at.y).toBeGreaterThan(base.y)
        expect(at.y).toBeLessThan(end.y)
      }
    }
  })
})
