import { describe, expect, it } from 'vitest'
import { rules } from '../config/rules'
import { defaultConfig, step, type SimConfig, type SimEvent, type SimState } from './step'
import { hseg, place, playState } from './testkit'
import type { Point } from './pitch'
import type { TowerSpec, Wall } from './wall'

const c = defaultConfig
const full = rules.pallet.pierces
/** A ball flying up the pitch from `pos`, live, carrying `pierces`. */
const palleted = (s: SimState, pierces: number, vy = -40, pos: Point = { x: 20, y: 70 }): SimState => ({ ...s, pierces, possession: { ...s.possession, live: true }, ball: { pos, vel: { x: 0, y: vy }, rolled: 0 } })
/** Steps until `done` or `max` ticks, collecting the events. */
const roll = (s: SimState, done: (t: SimState) => boolean, max = 300, config: SimConfig = c) => {
  const events: SimEvent[] = []
  for (let i = 0; i < max && !done(s); i++) {
    const r = step(s, {}, config)
    s = r.state
    events.push(...r.events)
  }
  return { s, events }
}
/** A 2-segment wall at grid row gy, 8 units wide from x = 10, so a ball at x = 14 crosses its first segment, x = 18 its second. */
const wallAt = (id: number, gy: number, owner: 1 | 2 = 2, segments = [3, 3]): Wall => ({ kind: 'wall', owner, ...hseg(5, gy, 2), id, segments })
const withObjects = (s: SimState, objects: SimState['objects']): SimState => ({ ...s, objects, nextId: 10 })
const tower = (owner: 1 | 2, power: 'repulsor' | 'steal'): TowerSpec => ({ kind: 'tower', owner, power, at: { gx: 10, gy: owner === 1 ? 40 : 14 } })

describe('palleted ball', () => {
  it('starts with no pierces', () => {
    expect(playState().pierces).toBe(0)
  })

  it('breaks 2 full wall segments in a row, then behaves like a normal ball', () => {
    const walls = [wallAt(1, 30), wallAt(2, 24, 1), wallAt(3, 18)]
    const { s, events } = roll(palleted(withObjects(playState(), walls), full), (t) => t.pierces === 0 && t.ball.vel.y > 0)
    const broken = events.filter((e) => e.type === 'segment-broken')
    expect(broken).toHaveLength(2)
    expect(broken[0]).toMatchObject({ id: 1 })
    expect(broken[1]).toMatchObject({ id: 2 })
    // Not marked as a Breaker break.
    for (const e of broken) expect(e).not.toHaveProperty('breaker')
    // The third wall stopped the ball like any wall: its bounce sent the ball back down.
    expect(s.objects.find((o) => o.id === 3)).toBeDefined()
    expect(s.ball.vel.y).toBeGreaterThan(0)
    expect(s.pierces).toBe(0)
  })

  it('breaks a full-health segment at any speed and keeps the ball\'s speed', () => {
    const { s, events } = roll(palleted(withObjects(playState(), [wallAt(1, 30)]), full, -6, { x: 20, y: 64 }), (t) => t.pierces < full)
    expect(events.some((e) => e.type === 'segment-broken')).toBe(true)
    expect(s.ball.vel.y).toBeLessThan(0)
    expect(Math.abs(s.ball.vel.y)).toBeGreaterThan(3)
  })

  it('spends one pierce per segment, and the wall goes with its last', () => {
    const { s, events } = roll(palleted(withObjects(playState(), [wallAt(1, 30, 1, [0, 3])]), full), (t) => t.pierces < full)
    expect(events.find((e) => e.type === 'wall-destroyed')).toMatchObject({ segment: 1 })
    expect(s.objects).toEqual([])
    expect(s.pierces).toBe(full - 1)
  })

  it('destroys a tower outright, either player\'s, and spends a pierce', () => {
    for (const owner of [1, 2] as const) {
      const placed = place(tower(owner, 'repulsor')).state
      const { s, events } = roll(palleted(placed, full, -40, { x: 21, y: owner === 1 ? 90 : 40 }), (t) => t.pierces < full)
      expect(events.find((e) => e.type === 'wall-destroyed')).toMatchObject({ wall: { kind: 'tower', hp: 0 } })
      expect(s.objects).toEqual([])
      expect(s.pierces).toBe(full - 1)
    }
  })

  it('does not fire a destroyed Repulsor or Steal', () => {
    for (const power of ['repulsor', 'steal'] as const) {
      const placed = place(tower(2, power)).state
      const { s, events } = roll(palleted(placed, full, -40, { x: 21, y: 60 }), (t) => t.pierces < full)
      expect(events.some((e) => e.type === 'repulsor-fired' || e.type === 'steal-triggered')).toBe(false)
      expect(s.objects).toEqual([])
      expect(s.pierces).toBe(full - 1)
      // Still flying: a Steal would have stopped it, a Repulsor would have sped it to maxSpeed.
      expect(s.ball.vel.y).toBeLessThan(0)
      expect(Math.hypot(s.ball.vel.x, s.ball.vel.y)).toBeLessThan(c.maxSpeed)
    }
  })

  it('spends one pierce at a Joint, not one per segment either side of it', () => {
    // The ball (radius 1) aimed at the Joint of a 2-segment wall (x 10 to 26, Joint at 18), and a little either side of it.
    for (const x of [17.2, 18, 18.9]) {
      const { s, events } = roll(palleted(withObjects(playState(), [wallAt(1, 30)]), full, -40, { x, y: 70 }), (t) => t.pierces < full)
      expect(events.filter((e) => e.type === 'segment-broken' || e.type === 'wall-destroyed')).toHaveLength(1)
      expect(s.pierces).toBe(full - 1)
      expect((s.objects[0] as Wall).segments.filter((h) => h === 0)).toHaveLength(1)
    }
  })

  it('stacks on the Breaker: the Breaker goes first, then the pierces', () => {
    const walls = [wallAt(1, 33), wallAt(2, 28, 1), wallAt(3, 23), wallAt(4, 18, 1)]
    const { s, events } = roll({ ...palleted(withObjects(playState(), walls), full), breaker: true }, (t) => t.pierces === 0 && !t.breaker)
    const broken = events.filter((e) => e.type === 'segment-broken')
    expect(broken.map((e) => e.type === 'segment-broken' && e.id)).toEqual([1, 2, 3])
    expect(broken[0]).toHaveProperty('breaker', true)
    expect(broken[1]).not.toHaveProperty('breaker')
    expect(s.objects.find((o) => o.id === 4)).toBeDefined()
  })

  it('keeps its pierces through a board bounce', () => {
    const { s, events } = roll(palleted(playState(), full, -40, { x: 5, y: 6 }), (t) => t.ball.vel.y > 0)
    expect(events.some((e) => e.type === 'ball-hit-board')).toBe(true)
    expect(s.pierces).toBe(full)
  })

  it('clears when the ball comes to rest', () => {
    const { s, events } = roll(palleted(playState(), full, -4, { x: 20, y: 60 }), (t) => t.pierces === 0, 3000)
    expect(s.pierces).toBe(0)
    expect(events.filter((e) => e.type === 'palleted-ended')).toHaveLength(1)
  })

  it('clears when the shot is no longer live', () => {
    const s = palleted(playState(), full)
    const r = step({ ...s, possession: { ...s.possession, live: false } }, {}, c)
    expect(r.state.pierces).toBe(0)
    expect(r.events.filter((e) => e.type === 'palleted-ended')).toHaveLength(1)
  })

  it('announces the end once, after the last pierce is spent', () => {
    const { s, events } = roll(palleted(withObjects(playState(), [wallAt(1, 30), wallAt(2, 24)]), full), (t) => t.pierces === 0)
    expect(s.pierces).toBe(0)
    expect(events.filter((e) => e.type === 'palleted-ended')).toHaveLength(1)
    expect(events.map((e) => e.type).lastIndexOf('segment-broken')).toBeLessThan(events.findIndex((e) => e.type === 'palleted-ended'))
  })
})

describe('a Pallet swat', () => {
  const config: SimConfig = { ...defaultConfig, pallets: [{ x: 10, y: 30 }] }
  /** A ball aimed at the pivot from below. */
  const aimed = (pierces = 0): SimState => {
    const s = playState(1, config)
    return { ...s, pierces, possession: { ...s.possession, live: true }, ball: { pos: { x: 10, y: 40 }, vel: { x: 0, y: -30 }, rolled: 0 } }
  }
  const swat = (s: SimState) => roll(s, () => false, 200, config)

  it('makes a Palleted ball with rules.pallet.pierces, announced by palleted-started', () => {
    expect(rules.pallet.pierces).toBe(2)
    const { events } = swat(aimed())
    const hit = events.findIndex((e) => e.type === 'pallet-hit')
    const started = events.filter((e) => e.type === 'palleted-started')
    expect(hit).toBeGreaterThanOrEqual(0)
    expect(started).toHaveLength(1)
    expect(started[0]).toMatchObject({ pallet: 0, pierces: 2 })
    expect(events.findIndex((e) => e.type === 'palleted-started')).toBeGreaterThan(hit)
  })

  it('carries the pierces out of the swat', () => {
    let s = aimed()
    for (let i = 0; i < 200 && s.pierces === 0; i++) s = step(s, {}, config).state
    expect(s.pierces).toBe(full)
  })

  it('resets a partly spent count to 2 on a second swat', () => {
    let s = aimed(1)
    const seen: number[] = []
    for (let i = 0; i < 200 && s.pierces !== 2; i++) {
      s = step(s, {}, config).state
      seen.push(s.pierces)
    }
    expect(s.pierces).toBe(full)
    expect(seen[0]).toBe(1)
  })
})
