import { describe, expect, it, vi } from 'vitest'
import { visual } from '../config/visual'
import { defaultConfig } from '../sim/step'
import { playState, hseg } from '../sim/testkit'
import type { SimEvent } from '../sim/step'
import type { Structure } from '../sim/wall'
import { Aim } from './entities/Aim'
import { Ball } from './entities/Ball'
import { Camera } from './entities/Camera'
import { Pallets } from './entities/Pallets'
import { Pitch } from './entities/Pitch'
import { Structures } from './entities/Structures'
import { Tower } from './entities/Tower'
import { Wall } from './entities/Wall'
import { routeEvents } from './events'

const at = { x: 20, y: 30 }
const wall: Structure = { id: 1, kind: 'wall', owner: 1, ...hseg(10, 40), segments: [0] }
const tower: Structure = { id: 2, kind: 'tower', owner: 2, power: 'repulsor', at: { gx: 5, gy: 10 }, hp: 3 }

function setup(objects: Structure[]) {
  const t = { camera: new Camera(54), structures: new Structures(), ball: new Ball(), aim: new Aim(), pitch: new Pitch(), pallets: new Pallets(() => new Camera(54), () => ({ x: 0, y: 0 })), vibrate: vi.fn() }
  t.structures.sync(objects)
  t.aim.sync({ ...playState(), ball: t.ball.state }, defaultConfig)
  const route = (events: SimEvent[], left: Structure[]) => routeEvents(events, t, left)
  return { ...t, route }
}

describe('routeEvents', () => {
  it('a Pallet swat flashes that Pallet and sprays sparks from the swat point', () => {
    const w = setup([])
    w.route([{ type: 'pallet-hit', pallet: 1, speed: 30, at }], [])
    expect(w.pallets.flashCount).toBe(1)
    expect(w.structures.particleCount).toBe(visual.pallet.sparks.count)
  })

  it('a shot that comes to rest Charged pops the ball badge and sends a ring out of the zone', () => {
    const w = setup([])
    w.route([{ type: 'charged', zone: 'bullseye', factor: 2, at }], [])
    expect(w.pitch.arrivalCount).toBe(1)
    expect(w.ball.badgeScale).toBe(visual.ball.charged.popScale)
  })

  it('a Bullseye pass-through flashes the zone and floats the Credits', () => {
    const w = setup([])
    w.route([{ type: 'bullseye-credited', player: 1, credits: 2 }], [])
    expect(w.pitch.creditCount).toBe(1)
  })

  it('a Charged shot brightens the tracer core until the ball stops', () => {
    const w = setup([])
    w.ball.sync({ pos: at, vel: { x: 0, y: -30 }, rolled: 0 })
    w.route([{ type: 'shot-fired', player: 1, from: at, dir: { x: 0, y: -1 }, power: 0.5, tier: 0, charge: 1.5 }], [])
    expect(w.ball.brightCore).toBe(true)
    w.ball.sync({ pos: at, vel: { x: 0, y: 0 }, rolled: 0 })
    w.ball.update(0.016)
    w.ball.sync({ pos: at, vel: { x: 0, y: -30 }, rolled: 0 })
    expect(w.ball.brightCore).toBe(false)
  })

  it('a shot sets the tracer to the colour of the tier that fired, and a possession change clears it', () => {
    const w = setup([])
    w.route([{ type: 'shot-fired', player: 1, from: at, dir: { x: 0, y: -1 }, power: 1, tier: 1 }], [])
    expect(w.ball.tracer.color).toBe(visual.aim.tierColors.Power)
    w.route([{ type: 'possession-changed', shooter: 2, inHand: false }], [])
    expect(w.ball.tracer.color).toBeUndefined()
  })

  it('a bounce off a wall or a board flashes the tracer there and sprays sparks', () => {
    const w = setup([])
    w.route([{ type: 'ball-hit-wall', wall: 1, speed: 20, at }, { type: 'ball-hit-board', speed: 20, at }], [])
    expect(w.ball.tracer.flashes).toBe(2)
    expect(w.ball.tracer.sparks).toBeGreaterThan(0)
  })

  it('a shot in flight draws its tail, sparks, flashes and glow without error', () => {
    const w = setup([])
    const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true }) as unknown as CanvasRenderingContext2D
    w.route([{ type: 'shot-fired', player: 1, from: at, dir: { x: 0, y: -1 }, power: 1, tier: 1 }], [])
    w.ball.sync({ pos: { x: at.x, y: at.y - 5 }, vel: { x: 0, y: -30 }, rolled: 0 })
    w.route([{ type: 'ball-hit-board', speed: 20, at }], [])
    w.ball.update(0.016)
    expect(() => w.ball.draw(ctx)).not.toThrow()
  })

  it('a destroyed wall shatters: it leaves the sim but its child stays for the shatter', () => {
    const w = setup([wall])
    w.route([{ type: 'wall-destroyed', wall, segment: 0, at }], [])
    w.structures.sync([])
    expect(w.structures.count).toBe(1)
    w.structures.update(visual.wall.shatterMs / 1000 + 0.01)
    expect(w.structures.count).toBe(0)
  })

  it('a Repulsor firing glows the tower and brightens the ball trail, each for its own full time', () => {
    const w = setup([tower])
    w.route([{ type: 'repulsor-fired', tower: 2, at }], [tower])
    const t = w.structures.get(2) as Tower
    expect([t.glowing, w.ball.bright]).toEqual([true, true])
    const [shorter, longer] = [Math.min(visual.tower.glowMs, visual.ball.tracer.brightMs), Math.max(visual.tower.glowMs, visual.ball.tracer.brightMs)]
    const wait = (ms: number) => (w.structures.update(ms / 1000), w.ball.update(ms / 1000))
    wait(shorter + 1)
    expect(t.glowing || w.ball.bright).toBe(true)
    wait(longer - shorter)
    expect(t.glowing || w.ball.bright).toBe(false)
  })

  it('a Steal trigger sinks the ball and holds the tower whole until the sink ends, then shatters it', () => {
    const w = setup([tower])
    w.route([{ type: 'steal-triggered', tower, owner: 2, at }], [])
    w.structures.sync([])
    expect(w.ball.stealing).toBe(true)
    w.structures.update(visual.ball.stealMs / 1000)
    expect(w.structures.count).toBe(1)
    w.structures.update(visual.wall.shatterMs / 1000 + 0.01)
    expect(w.structures.count).toBe(0)
  })

  it('a strong shot shakes the camera, rings the aim and vibrates', () => {
    const w = setup([])
    const shot: SimEvent = { type: 'shot-fired', player: 1, from: at, dir: { x: 0, y: -1 }, tier: 1, power: 1 }
    w.route([shot], [])
    expect(w.aim.splashCount).toBe(1)
    expect(w.camera.shakeNow).not.toEqual({ x: 0, y: 0 })
    expect(w.vibrate).toHaveBeenCalledTimes(1)
  })

  it('a Touch shot sets off no Splash ring', () => {
    const w = setup([])
    w.route([{ type: 'shot-fired', player: 1, from: at, dir: { x: 0, y: -1 }, tier: 0, power: 0.4 }], [])
    expect(w.aim.splashCount).toBe(0)
  })
})

describe('wall segments', () => {
  const two = (segments: number[]): Structure => ({ id: 1, kind: 'wall', owner: 1, ...hseg(10, 40, 2), segments })
  /** Counts the Breach marks drawn: one radial gradient each. */
  const breachDraws = (s: Structures) => {
    let n = 0
    const rec = new Proxy({}, { get: (_, k) => () => (k === 'getTransform' ? { a: 10, b: 0 } : k === 'createRadialGradient' ? (n++, { addColorStop() {} }) : k === 'createLinearGradient' ? { addColorStop() {} } : undefined), set: () => true }) as unknown as CanvasRenderingContext2D
    s.draw(rec)
    return n
  }

  it('segment-broken shatters that segment, not the whole wall', () => {
    const w = setup([two([3, 1])])
    const left = [two([3, 0])]
    w.route([{ type: 'segment-broken', id: 1, segment: 1, wall: left[0] as never, at }], left)
    w.structures.sync(left)
    const f = w.structures.get(1) as Wall
    expect(f.isShattering).toBe(true)
    expect(w.structures.count).toBe(1)
    expect(w.structures.particleCount).toBeGreaterThan(0)
    // The wall stays: nothing is dropped once the segment's shatter ends.
    w.structures.update(visual.wall.shatterMs / 1000 + 0.01)
    expect(w.structures.count).toBe(1)
    expect(f.isShattering).toBe(false)
  })

  it('the Breach mark is drawn while the wall stands, and gone once it is destroyed', () => {
    const w = setup([two([0, 3])])
    expect(breachDraws(w.structures)).toBe(1)
    w.structures.update(10)
    expect(breachDraws(w.structures)).toBe(1)
    const last = two([0, 0])
    w.route([{ type: 'wall-destroyed', wall: last, segment: 1, at }], [])
    w.structures.sync([])
    expect(w.structures.count).toBe(1)
    w.structures.update(visual.wall.shatterMs / 1000 + 0.01)
    expect(w.structures.count).toBe(0)
    expect(breachDraws(w.structures)).toBe(0)
  })

  it('a break spawns spinning chunks, dust, a ring and sparks, and a Breaker break spawns more', () => {
    const count = (breaker: boolean) => {
      const w = setup([two([3, 1])])
      w.route([{ type: 'wall-destroyed', wall: two([0, 0]), segment: 1, at, ...(breaker && { breaker: true as const }) }], [])
      return w.structures.particleCount
    }
    expect(count(true)).toBeGreaterThan(count(false))
  })

  it('the particle pool stays within its cap however many segments break', () => {
    const w = setup([two([3, 1])])
    for (let i = 0; i < 100; i++) w.route([{ type: 'wall-destroyed', wall: two([0, 0]), segment: 1, at, breaker: true }], [])
    expect(w.structures.particleCount).toBeLessThanOrEqual(visual.wall.particles.cap)
    expect(w.structures.particleCount).toBe(visual.wall.particles.cap)
  })

  it('several breaks in one tick shake the camera once, at the largest amplitude', () => {
    const w = setup([two([1, 1])])
    const broken = (segment: number): SimEvent => ({ type: 'segment-broken', id: 1, segment, wall: two([0, 1]) as never, at })
    w.route([broken(0), { type: 'wall-destroyed', wall: two([0, 0]), segment: 1, at, breaker: true }, broken(0)], [])
    // The camera holds the Breaker's amplitude, not a later smaller one: a shake begins at its full amplitude.
    expect(w.camera.shakeNow.y).toBeCloseTo(visual.wall.break.breakerShake, 9)
  })

  it('a crack never shakes the camera', () => {
    const w = setup([two([3, 3])])
    w.route([{ type: 'ball-hit-wall', wall: 1, speed: 40, at: { x: 26, y: 80 } }, { type: 'wall-cracked', id: 1, hp: 2, segment: 1, at: { x: 26, y: 80 } }], [two([3, 2])])
    expect(w.camera.shakeNow).toEqual({ x: 0, y: 0 })
  })
})
