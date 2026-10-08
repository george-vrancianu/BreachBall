import { describe, expect, it } from 'vitest'
import { rules } from '../config/rules'
import { defaultConfig, initialState, step, type SimConfig, type SimEvent, type SimState } from './step'
import { initialPallets, startAngle } from './pallet'
import { place, playState } from './testkit'
import type { Point } from './pitch'

const PIVOT: Point = { x: 10, y: 30 }
const config: SimConfig = { ...defaultConfig, pallets: [PIVOT] }
const { maxSpeed, ballRadius, tickHz } = config
const p = rules.pallet

/** `s` with a live shot: the ball at `pos` moving at `vel`. */
const live = (s: SimState, pos: Point, vel: Point): SimState => ({ ...s, possession: { ...s.possession, live: true }, ball: { pos, vel, rolled: 0 } })
const speedOf = (s: SimState) => Math.hypot(s.ball.vel.x, s.ball.vel.y)
/** Smallest signed difference of two angles, in [-π, π). */
const wrapDiff = (a: number, b: number) => ((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI
/** A ball from (10, 40) straight at the pivot at `speed`. */
const aimed = (speed: number, c: SimConfig = config) => live(playState(1, c), { x: 10, y: 40 }, { x: 0, y: -speed })

describe('startAngle', () => {
  it('is deterministic and lies in [-π, π)', () => {
    for (let seed = 0; seed < 20; seed++)
      for (let i = 0; i < 5; i++) {
        const a = startAngle(seed, i)
        expect(a).toBe(startAngle(seed, i))
        expect(a).toBeGreaterThanOrEqual(-Math.PI)
        expect(a).toBeLessThan(Math.PI)
      }
  })
  it('differs across indices and seeds', () => {
    expect(startAngle(1, 0)).not.toBe(startAngle(1, 1))
    expect(startAngle(1, 0)).not.toBe(startAngle(2, 0))
    expect(new Set([0, 1, 2, 3, 4, 5].map((i) => startAngle(7, i))).size).toBe(6)
  })
})

describe('initial pallets', () => {
  it('puts config.pallets into the state, one idle pallet per spot', () => {
    const spots = [PIVOT, { x: 30, y: 60 }]
    const s = initialState(5, { ...defaultConfig, pallets: spots })
    expect(s.pallets).toEqual(initialPallets(spots, 5))
    expect(s.pallets.map((q) => q.id)).toEqual([0, 1])
    expect(s.pallets.map((q) => q.pivot)).toEqual(spots)
    expect(s.pallets.map((q) => q.angle)).toEqual([startAngle(5, 0), startAngle(5, 1)])
    expect(s.pallets.every((q) => q.phase === 'idle')).toBe(true)
  })
  it('gives no pallets by default', () => {
    expect(defaultConfig.pallets).toEqual([])
    expect(initialState(1).pallets).toEqual([])
  })
})

describe('idle spin', () => {
  it('advances the angle by idleSpin per second with no shot live', () => {
    let s = playState(1, config)
    for (let i = 0; i < 30; i++) {
      const r = step(s, {}, config)
      expect(wrapDiff(r.state.pallets[0].angle, s.pallets[0].angle)).toBeCloseTo(p.idleSpin / tickHz, 6)
      expect(r.state.pallets[0].angle).toBeGreaterThanOrEqual(-Math.PI)
      expect(r.state.pallets[0].angle).toBeLessThan(Math.PI)
      s = r.state
    }
  })
  it('spins during a build turn too', () => {
    const b = initialState(1, config)
    expect(b.match.builder).not.toBeNull()
    const r = step(b, {}, config)
    expect(wrapDiff(r.state.pallets[0].angle, b.pallets[0].angle)).toBeCloseTo(p.idleSpin / tickHz, 6)
  })
})

describe('swat', () => {
  it('sends a ball aimed at the pivot back out between the exit speeds', () => {
    let s = aimed(20)
    let hit: Extract<SimEvent, { type: 'pallet-hit' }> | undefined
    for (let i = 0; i < 200 && !hit; i++) {
      const r = step(s, {}, config)
      s = r.state
      hit = r.events.find((e): e is Extract<SimEvent, { type: 'pallet-hit' }> => e.type === 'pallet-hit')
    }
    expect(hit).toBeDefined()
    expect(hit!.pallet).toBe(0)
    expect(hit!.speed).toBeGreaterThanOrEqual(p.exitSpeed[0] * maxSpeed)
    expect(hit!.speed).toBeLessThanOrEqual(p.exitSpeed[1] * maxSpeed)
    // The ball keeps decaying for the rest of the tick, so allow a little under the floor.
    expect(speedOf(s)).toBeGreaterThanOrEqual(0.97 * p.exitSpeed[0] * maxSpeed)
    expect(speedOf(s)).toBeLessThanOrEqual(p.exitSpeed[1] * maxSpeed)
  })
  it('does not tunnel into the pivot at twice max speed', () => {
    let s = aimed(2 * maxSpeed)
    const minDist = p.rootRadius + ballRadius - 0.05
    let hits = 0
    for (let i = 0; i < 200; i++) {
      const r = step(s, {}, config)
      s = r.state
      hits += r.events.filter((e) => e.type === 'pallet-hit').length
      expect(Math.hypot(s.ball.pos.x - PIVOT.x, s.ball.pos.y - PIVOT.y)).toBeGreaterThanOrEqual(minDist)
      if (hits > 0 && Math.hypot(s.ball.pos.x - PIVOT.x, s.ball.pos.y - PIVOT.y) > p.ringRadius + ballRadius) break
    }
    expect(hits).toBeGreaterThan(0)
  })
})

describe('swat ceiling and threshold', () => {
  const hitOf = (r: ReturnType<typeof step>) => r.events.find((e): e is Extract<SimEvent, { type: 'pallet-hit' }> => e.type === 'pallet-hit')
  it('exits a swat at 2x maxSpeed at no more than 2x maxSpeed', () => {
    let s = aimed(2 * maxSpeed)
    let hit
    for (let i = 0; i < 200 && !hit; i++) {
      const r = step(s, {}, config)
      s = r.state
      hit = hitOf(r)
    }
    expect(hit).toBeDefined()
    expect(hit!.speed).toBeLessThanOrEqual(p.exitSpeed[1] * maxSpeed)
    expect(speedOf(s)).toBeLessThanOrEqual(p.exitSpeed[1] * maxSpeed)
  })
  it('bounces a slow ball off an idle arm: no pallet-hit, no launch to maxSpeed', () => {
    const s0 = playState(1, config)
    // The arm is on cooldown so it cannot swing; a ball 3 u/s drifts onto its middle from the side.
    const arm = { ...s0.pallets[0], cooldown: 10000 }
    const [ux, uy] = [Math.cos(arm.angle), Math.sin(arm.angle)]
    const off = p.rootRadius + ballRadius + 0.3
    let s = live({ ...s0, pallets: [arm] }, { x: PIVOT.x + ux * 2 - uy * off, y: PIVOT.y + uy * 2 + ux * off }, { x: uy * 3, y: -ux * 3 })
    let peak = 0
    let bounced = false
    for (let i = 0; i < 20; i++) {
      const r = step(s, {}, config)
      s = r.state
      expect(hitOf(r)).toBeUndefined()
      peak = Math.max(peak, speedOf(s))
      bounced ||= s.ball.vel.x * -uy + s.ball.vel.y * ux < 0
    }
    expect(bounced).toBe(true)
    expect(peak).toBeLessThan(p.exitSpeed[0] * maxSpeed)
  })
})

describe('swing', () => {
  it('runs on to its sweep and then cools down once the ball is gone', () => {
    // Mid-swing, with the ball far away and no shot live: the swing must not snap back to idle.
    const s0 = playState(1, config)
    const mid = { ...s0.pallets[0], phase: 'swing' as const, dir: 1 as const, swept: 0, sweepNeed: 1 }
    let s: SimState = { ...s0, pallets: [mid], ball: { pos: { x: 30, y: 90 }, vel: { x: 0, y: 0 }, rolled: 0 } }
    const ticks = Math.ceil(mid.sweepNeed / (p.swingSpeed / tickHz))
    for (let i = 1; i < ticks; i++) {
      const before = s.pallets[0]
      s = step(s, {}, config).state
      expect(s.pallets[0].phase).toBe('swing')
      expect(wrapDiff(s.pallets[0].angle, before.angle)).toBeCloseTo(p.swingSpeed / tickHz, 6)
    }
    s = step(s, {}, config).state
    expect(s.pallets[0].phase).toBe('idle')
    expect(s.pallets[0].cooldown).toBe(p.cooldownTicks)
  })
})

describe('start angle by seed', () => {
  it('gives a different swat outcome for the same fast shot', () => {
    const outcome = (seed: number) => {
      let s = live(playState(seed, config), { x: 10, y: 40 }, { x: 0, y: -2 * maxSpeed })
      for (let i = 0; i < 100; i++) s = step(s, {}, config).state
      return [s.ball.vel.x, s.ball.vel.y]
    }
    expect(outcome(1)).not.toEqual(outcome(2))
    expect(outcome(1)).toEqual(outcome(1))
  })
})

describe('between shots', () => {
  it('leaves a resting ball alone and emits no pallet events', () => {
    let s = playState(1, config)
    s = { ...s, ball: { pos: { x: PIVOT.x + 2, y: PIVOT.y }, vel: { x: 0, y: 0 }, rolled: 0 } }
    expect(s.possession.live).toBe(false)
    const start = s.ball
    for (let i = 0; i < 600; i++) {
      const r = step(s, {}, config)
      s = r.state
      expect(r.events.some((e) => e.type === 'pallet-hit')).toBe(false)
    }
    expect(s.ball.pos).toEqual(start.pos)
    expect(s.ball.vel).toEqual({ x: 0, y: 0 })
  })
})

describe('not structures', () => {
  it('never adds to or damages state.objects', () => {
    let s = aimed(30)
    const before = s.objects
    let sawHit = false
    for (let i = 0; i < 100; i++) {
      const r = step(s, {}, config)
      s = r.state
      sawHit ||= r.events.some((e) => e.type === 'pallet-hit')
    }
    expect(sawHit).toBe(true)
    expect(s.objects).toEqual(before)
    expect(s.objects).toHaveLength(0)
  })
})

describe('determinism', () => {
  it('gives deep-equal states and events from the same seed and inputs', () => {
    const run = () => {
      let s = aimed(30)
      const events: SimEvent[][] = []
      for (let i = 0; i < 100; i++) {
        const r = step(s, {}, config)
        s = r.state
        events.push(r.events)
      }
      return { s, events }
    }
    const a = run()
    const b = run()
    expect(a.events.flat().some((e) => e.type === 'pallet-hit')).toBe(true)
    expect(a).toEqual(b)
  })
})

describe('steal inside a substepped tick', () => {
  it('leaves the ball at rest once a Steal triggers', () => {
    // Player 2's Steal tower inside the ring, short of the arm: the ball reaches it on a substepped tick before any swat (a Palleted ball would pierce it).
    // The ring is a no-build zone, so the tower goes down before the Pallet does.
    const built = place({ kind: 'tower', owner: 2, power: 'steal', at: { gx: 3, gy: 16 } }, playState(1)).state
    const placed = { ...built, pallets: initialPallets([PIVOT], 1) }
    let s = live(placed, { x: 7, y: 45 }, { x: 0, y: -40 })
    expect(s.possession.shooter).toBe(1)
    let stolen = false
    for (let i = 0; i < 60 && !stolen; i++) {
      const r = step(s, {}, config)
      s = r.state
      stolen = r.events.some((e) => e.type === 'steal-triggered')
    }
    expect(stolen).toBe(true)
    expect(s.ball.vel).toEqual({ x: 0, y: 0 })
    const at = s.ball.pos
    for (let i = 0; i < 10; i++) {
      s = step(s, {}, config).state
      expect(s.ball.vel).toEqual({ x: 0, y: 0 })
      expect(s.ball.pos).toEqual(at)
    }
  })
})

describe('ring covers the arm', () => {
  it('is at least the arm plus a ball on each side of it (the ring is the no-build zone)', () => {
    expect(p.ringRadius).toBeGreaterThanOrEqual(p.length + p.tipRadius + 2 * defaultConfig.ballRadius)
  })
})

describe('arm never crossed', () => {
  it('keeps a 2x maxSpeed ball out of the swinging arm at every tick end', () => {
    for (const x of [8.5, 9.5, 10, 11, 12]) {
      let s = live(playState(1, config), { x, y: 40 }, { x: 0, y: -2 * maxSpeed })
      s = { ...s, pallets: s.pallets.map((q) => ({ ...q, angle: Math.PI / 2 - 1, phase: 'swing' as const, dir: 1 as const, swept: 0, sweepNeed: 2, cooldown: 0 })) }
      for (let i = 0; i < 20; i++) {
        s = step(s, {}, config).state
        const a = s.pallets[0].angle
        const [ux, uy] = [Math.cos(a), Math.sin(a)]
        const [rx, ry] = [s.ball.pos.x - PIVOT.x, s.ball.pos.y - PIVOT.y]
        const t = Math.max(0, Math.min(p.length, rx * ux + ry * uy))
        // The arm tapers from root to tip, so its radius at the closest point is what the ball must clear.
        const radius = p.rootRadius + (p.tipRadius - p.rootRadius) * (t / p.length)
        expect(Math.hypot(rx - ux * t, ry - uy * t)).toBeGreaterThanOrEqual(radius + ballRadius - 0.05)
      }
    }
  })
})

describe('far from the rings', () => {
  it('rolls exactly as it does without pallets', () => {
    // Along x = 30, well over a ring radius from the pivot at (10, 30).
    const setup = (c: SimConfig) => live(playState(1, c), { x: 30, y: 80 }, { x: 0, y: -25 })
    let a = setup(config)
    let b = setup({ ...config, pallets: [] })
    for (let i = 0; i < 120; i++) {
      a = step(a, {}, config).state
      b = step(b, {}, { ...config, pallets: [] }).state
      expect(a.ball).toEqual(b.ball)
    }
  })
})
