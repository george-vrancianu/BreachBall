import { describe, expect, it } from 'vitest'
import { rules } from '../config/rules'
import { defaultConfig, initialState, step, type SimConfig, type SimEvent, type SimState } from './step'
import { initialPallets, startAngle } from './pallet'
import type { Point } from './pitch'

const PIVOT: Point = { x: 10, y: 30 }
const config: SimConfig = { ...defaultConfig, pallets: [PIVOT] }
const { maxSpeed, ballRadius, tickHz } = config
const p = rules.pallet

/** A fresh state in the play phase (no build turn) with `config`'s pallets. */
const play = (seed = 1, c: SimConfig = config): SimState => {
  const s = initialState(seed, c)
  return { ...s, match: { ...s.match, builder: null } }
}
/** `s` with a live shot: the ball at `pos` moving at `vel`. */
const live = (s: SimState, pos: Point, vel: Point): SimState => ({ ...s, possession: { ...s.possession, live: true }, ball: { pos, vel, rolled: 0 } })
const speedOf = (s: SimState) => Math.hypot(s.ball.vel.x, s.ball.vel.y)
/** Smallest signed difference of two angles, in [-π, π). */
const wrapDiff = (a: number, b: number) => ((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI
/** A ball from (10, 40) straight at the pivot at `speed`. */
const aimed = (speed: number, c: SimConfig = config) => live(play(1, c), { x: 10, y: 40 }, { x: 0, y: -speed })

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
    let s = play()
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

describe('between shots', () => {
  it('leaves a resting ball alone and emits no pallet events', () => {
    let s = play()
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
    let swatted = false
    for (let i = 0; i < 100; i++) {
      const r = step(s, {}, config)
      s = r.state
      swatted ||= r.events.some((e) => e.type === 'pallet-hit')
    }
    expect(swatted).toBe(true)
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

describe('far from the rings', () => {
  it('rolls exactly as it does without pallets', () => {
    // Along x = 30, well over a ring radius from the pivot at (10, 30).
    const setup = (c: SimConfig) => live(play(1, c), { x: 30, y: 80 }, { x: 0, y: -25 })
    let a = setup(config)
    let b = setup({ ...config, pallets: [] })
    for (let i = 0; i < 120; i++) {
      a = step(a, {}, config).state
      b = step(b, {}, { ...config, pallets: [] }).state
      expect(a.ball).toEqual(b.ball)
    }
  })
})
