import { describe, expect, it, vi } from 'vitest'
import { visual } from '../config/visual'
import { defaultConfig } from '../sim/step'
import { playState, hseg } from '../sim/testkit'
import type { SimEvent } from '../sim/step'
import type { Structure } from '../sim/wall'
import { Aim } from './entities/Aim'
import { Ball } from './entities/Ball'
import { Camera } from './entities/Camera'
import { Pitch } from './entities/Pitch'
import { Structures } from './entities/Structures'
import { Tower } from './entities/Tower'
import { routeEvents } from './events'

const at = { x: 20, y: 30 }
const wall: Structure = { id: 1, kind: 'wall', owner: 1, ...hseg(10, 40), hp: 0 }
const tower: Structure = { id: 2, kind: 'tower', owner: 2, power: 'repulsor', at: { gx: 5, gy: 10 }, hp: 3 }

function setup(objects: Structure[]) {
  const t = { camera: new Camera(54), structures: new Structures(), ball: new Ball(), aim: new Aim(), pitch: new Pitch(), vibrate: vi.fn() }
  t.structures.sync(objects)
  t.aim.sync({ ...playState(), ball: t.ball.state }, defaultConfig)
  const route = (events: SimEvent[], left: Structure[], reduced = false) => routeEvents(events, t, left, reduced)
  return { ...t, route }
}

describe('routeEvents', () => {
  it('a shot that comes to rest Charged pops the ball badge and sends a ring out of the zone', () => {
    const w = setup([])
    w.route([{ type: 'charged', zone: 'bullseye', factor: 2, at }], [])
    expect(w.pitch.arrivalCount).toBe(1)
    expect(w.ball.badgeScale).toBe(visual.ball.charged.popScale)
  })

  it('shows no arrival animation under reduced motion', () => {
    const w = setup([])
    w.route([{ type: 'charged', zone: 'bullseye', factor: 2, at }], [], true)
    expect(w.pitch.arrivalCount).toBe(0)
    expect(w.ball.badgeScale).toBe(1)
  })

  it('a Charged shot brightens the ball trail until the ball stops', () => {
    const w = setup([])
    const trailWidth = (b: Ball) => {
      const widths: number[] = []
      const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: (_t, k, v) => (k === 'lineWidth' && widths.push(v), true) }) as unknown as CanvasRenderingContext2D
      b.draw(ctx)
      return widths[0]
    }
    w.ball.sync({ pos: at, vel: { x: 0, y: -30 }, rolled: 0 })
    w.route([{ type: 'shot-fired', player: 1, from: at, dir: { x: 0, y: -1 }, power: 0.5, tier: 0, charge: 1.5 }], [])
    expect(trailWidth(w.ball)).toBe(visual.ball.charged.trailWidth)
    w.ball.sync({ pos: at, vel: { x: 0, y: 0 }, rolled: 0 })
    w.ball.update(0.016)
    w.ball.sync({ pos: at, vel: { x: 0, y: -30 }, rolled: 0 })
    expect(trailWidth(w.ball)).toBe(visual.ball.trailWidth)
  })

  it('a destroyed wall shatters: it leaves the sim but its child stays for the shatter', () => {
    const w = setup([wall])
    w.route([{ type: 'wall-destroyed', wall, at }], [])
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
    const [shorter, longer] = [Math.min(visual.tower.glowMs, visual.ball.trailMs), Math.max(visual.tower.glowMs, visual.ball.trailMs)]
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

  it('a strong shot shakes the camera, rings the aim and vibrates; reduced motion keeps only the ring', () => {
    const w = setup([])
    const shot: SimEvent = { type: 'shot-fired', player: 1, from: at, dir: { x: 0, y: -1 }, tier: 1, power: 1 }
    w.route([shot], [])
    expect(w.aim.splashCount).toBe(1)
    expect(w.camera.shakeNow).not.toEqual({ x: 0, y: 0 })
    expect(w.vibrate).toHaveBeenCalledTimes(1)
    const calm = setup([])
    calm.route([shot], [], true)
    expect([calm.aim.splashCount, calm.camera.shakeNow, calm.vibrate.mock.calls.length]).toEqual([1, { x: 0, y: 0 }, 0])
  })

  it('a Touch shot sets off no Splash ring', () => {
    const w = setup([])
    w.route([{ type: 'shot-fired', player: 1, from: at, dir: { x: 0, y: -1 }, tier: 0, power: 0.4 }], [])
    expect(w.aim.splashCount).toBe(0)
  })
})
