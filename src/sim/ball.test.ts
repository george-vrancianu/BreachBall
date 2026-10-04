import { describe, expect, it } from 'vitest'
import { defaultConfig, step, type SimInput, type SimState } from './step'
import { hseg, place, playState } from './testkit'
import type { Point } from './pitch'
import type { WallSpec } from './wall'

const c = defaultConfig
const run = (s: SimState, input: SimInput = {}) => step(s, input, c)
const at = (x: number, y: number, vx = 0, vy = 0, s = playState()): SimState => ({ ...s, ball: { pos: { x, y }, vel: { x: vx, y: vy }, rolled: 0 } })
const wall = (a: Point, b: Point): WallSpec => ({ kind: 'wall', owner: 1, a, b })
/** The old straight piece: one unit along y=80 from x=10. */
const straight = (): WallSpec => ({ kind: 'wall', owner: 1, ...hseg(5, 40) })
/** A straight wall placed in the sim, then the ball positioned over it. */
const withWall = (spec: WallSpec, x: number, y: number, vx: number, vy: number) => at(x, y, vx, vy, place(spec).state)
const ticks = (s: SimState, n: number) => {
  const events = []
  for (let i = 0; i < n; i++) {
    const r = run(s)
    s = r.state
    events.push(...r.events)
  }
  return { s, events }
}

describe('ball', () => {
  it('halves its speed every 0.8 s', () => {
    const s = ticks(at(20, 54, 0, 30), 48).s // 0.8 s at 60 Hz
    expect(s.ball.vel.y).toBeCloseTo(15, 5)
  })
  it('comes to rest after a full-power hit, roughly 69 units from where it started', () => {
    const s = ticks(at(20, 100, 0, -60), 600).s
    expect(s.ball.vel).toEqual({ x: 0, y: 0 })
    expect(100 - s.ball.pos.y).toBeGreaterThan(65)
    expect(100 - s.ball.pos.y).toBeLessThan(70)
  })
  it('bounces off a board with restitution 0.85 and the mirrored angle', () => {
    const s = at(2, 54, -20, 10)
    const r = run(s)
    // Moves 1/3 unit left, so it first touches the board (centre at x=1) after 3 ticks.
    const after = ticks(s, 4).s
    expect(after.ball.vel.x).toBeGreaterThan(0)
    expect(after.ball.vel.y).toBeGreaterThan(0)
    expect(after.ball.vel.x / after.ball.vel.y).toBeCloseTo(0.85 * 2, 1)
    expect(r.state.ball.pos.x).toBeLessThan(2)
  })
  it('bounces off a 45 degree wall like a mirror', () => {
    // A "/" wall from (10, 90) to (15.66, 84.34); a ball rising at x=13 meets it and leaves along +x.
    const d = 8 * Math.SQRT1_2
    const r = ticks(withWall(wall({ x: 10, y: 90 }, { x: 10 + d, y: 90 - d }), 13, 100, 0, -30), 40)
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'ball-hit-wall' }))
    expect(r.s.ball.vel.x).toBeGreaterThan(5)
    expect(Math.abs(r.s.ball.vel.y)).toBeLessThan(r.s.ball.vel.x * 0.1)
  })
  it('never tunnels through a zero-thickness wall at max speed', () => {
    // Straight wall along y=80, x 10..18.
    for (const startY of [100, 100.37, 100.9]) {
      let s = withWall(straight(), 14, startY, 0, -60)
      for (let i = 0; i < 40; i++) s = run(s).state
      expect(s.ball.pos.y).toBeGreaterThan(80)
    }
  })
  it('does not tunnel through the end of a wall when grazing a corner', () => {
    let s = withWall(straight(), 9.2, 84, 10, -50)
    for (let i = 0; i < 20; i++) s = run(s).state
    expect(Number.isFinite(s.ball.pos.x)).toBe(true)
  })
  it('emits ball-hit-wall with the speed on contact', () => {
    const { events } = ticks(withWall(straight(), 14, 84, 0, -30), 20)
    expect(events.find((e) => e.type === 'ball-hit-wall')).toMatchObject({ speed: expect.closeTo(30, -1) })
  })
  it('a hit at exactly half max speed does not damage; above it removes 1 hp', () => {
    // Pre-compensate for one tick of friction so the speed at impact is v.
    const pre = (v: number) => -v / 0.5 ** (1 / 48)
    for (const [v, hp] of [[30, 3], [31, 2]] as const) {
      const s = run(withWall(straight(), 14, 81.02, 0, pre(v))).state
      expect(s.objects[0].hp).toBe(hp)
    }
  })
  it('a ball that destroys a wall mid-shot continues through at reduced speed', () => {
    let s = withWall(straight(), 14, 81.02, 0, -60 / 0.5 ** (1 / 48))
    s = { ...s, objects: s.objects.map((w) => ({ ...w, hp: 1 })) }
    const r = run(s)
    expect(r.events.map((e) => e.type)).toEqual(['ball-hit-wall', 'wall-destroyed'])
    expect(r.state.objects).toEqual([])
    expect(r.state.ball.vel.y).toBeCloseTo(-30, 3)
    expect(r.state.ball.pos.y).toBeLessThan(81)
  })
  it('a slow ball rolling over the goal line scores and the round restarts', () => {
    const r = ticks(at(20, 1, 0, -3), 600)
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'goal' }))
    expect(r.s.ball.pos).toEqual({ x: 20, y: 54 })
  })
  it('is deterministic: the same inputs give identical state twice', () => {
    const play = () => {
      let s = withWall(wall({ x: 16, y: 80 }, { x: 32, y: 80 }), 20, 54, 0, 0)
      s = { ...s, ball: { ...s.ball, vel: { x: -17, y: -55 } } }
      return ticks(s, 400).s
    }
    expect(play()).toEqual(play())
  })
})
