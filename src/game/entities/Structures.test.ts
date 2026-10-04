import { describe, expect, it, vi } from 'vitest'
import { visual } from '../../config/visual'
import { defaultConfig } from '../../sim/step'
import { playState, hseg } from '../../sim/testkit'
import type { Structure } from '../../sim/wall'
import { costLabelAt, Structures } from './Structures'
import { Tower } from './Tower'
import { Wall } from './Wall'

const wall = (id: number): Structure => ({ id, kind: 'wall', owner: 1, ...hseg(10, 40), segments: [3] })
const tower = (id: number): Structure => ({ id, kind: 'tower', owner: 2, power: 'repulsor', at: { gx: 5, gy: 10 }, hp: 3 })
const from = { x: 20, y: 80 }
const run = (s: Structures, ms: number) => s.update(ms / 1000)

describe('Structures', () => {
  it('creates a Wall or a Tower child as each sim object appears, and keeps them across syncs', () => {
    const s = new Structures()
    s.sync([wall(1), tower(2)])
    expect(s.count).toBe(2)
    expect(s.get(1)).toBeInstanceOf(Wall)
    expect(s.get(2)).toBeInstanceOf(Tower)
    const first = s.get(1)
    s.sync([wall(1), tower(2), wall(3)])
    expect(s.count).toBe(3)
    expect(s.get(1)).toBe(first)
  })

  it('drops a child at once when its object leaves the sim without a shatter (a demolition)', () => {
    const s = new Structures()
    s.sync([wall(1)])
    s.sync([])
    expect(s.count).toBe(0)
    expect(s.children).toHaveLength(0)
  })

  it('keeps a shattered child until the shatter ends, then removes it', () => {
    const s = new Structures()
    s.sync([wall(1)])
    s.shatter(1, from)
    s.sync([])
    expect(s.count).toBe(1)
    run(s, visual.wall.shatterMs - 1)
    expect(s.count).toBe(1)
    run(s, 2)
    expect(s.count).toBe(0)
    expect(s.children).toHaveLength(0)
  })

  it('holds a delayed shatter (a Steal tower) whole for the delay, then for the shatter', () => {
    const s = new Structures()
    s.sync([tower(2)])
    s.shatter(2, from, visual.ball.stealMs)
    s.sync([])
    run(s, visual.ball.stealMs + visual.wall.shatterMs - 1)
    expect(s.count).toBe(1)
    run(s, 2)
    expect(s.count).toBe(0)
  })

  it('applies the build overlays to the children it owns', () => {
    const s = new Structures()
    s.sync([wall(1), wall(2)])
    s.hidden = [1]
    s.movable = [2]
    s.mark()
    expect([s.get(1)?.hidden, s.get(2)?.hidden, s.get(1)?.movable, s.get(2)?.movable]).toEqual([true, false, false, true])
  })

  it('tints the walls a splash preview reaches: own ones differently from the enemy\'s', () => {
    const s = new Structures()
    s.sync([wall(1), wall(2)])
    s.preview = new Map([[1, true], [2, false]])
    s.mark()
    expect(s.get(1)?.tint).toBe(visual.wall.ownTint)
    expect(s.get(2)?.tint).toBe(visual.wall.illegal)
  })
})

describe('Splash preview', () => {
  const at = (id: number, owner: 1 | 2, gy: number): Structure => ({ id, kind: 'wall', owner, ...hseg(8, gy), segments: [3] })
  // P1's ball at (20, 79.5) under walls running x 16..24: own gy 39 is 1.5 away, enemy gy 37 5.5 away, enemy gy 34 11.5 away.
  const state = { ...playState(), objects: [at(1, 1, 39), at(2, 2, 37), at(3, 2, 34)], ball: { pos: { x: 20, y: 79.5 }, vel: { x: 0, y: 0 }, rolled: 0 }, possession: { shooter: 1 as const, shots: 3, inHand: false, live: false } }
  const previewOf = (aim?: { tier: number; power?: number }) => {
    const s = new Structures()
    s.previewSplash(state, aim, defaultConfig)
    return [...s.preview]
  }

  it('lists the structures a full Power aim\'s Splash reaches, marking the shooter\'s own', () => {
    // Radius 10 at full power.
    expect(previewOf({ tier: 1, power: 1 })).toEqual([[1, true], [2, false]])
  })
  it('shrinks with power within the tier: the weakest Power aim reaches only 2 units', () => {
    expect(previewOf({ tier: 1, power: 0.5 })).toEqual([[1, true]])
  })
  it('is empty for a Touch aim, before the drag, and without an aim', () => {
    expect(previewOf({ tier: 0, power: 0.45 })).toEqual([])
    expect(previewOf({ tier: 1 })).toEqual([])
    expect(previewOf()).toEqual([])
  })
})

/** A context that swallows every call: only the draw methods are under test. */
const ctx = new Proxy({}, { get: (_, k) => () => (k === 'getTransform' ? { a: 10, b: 0 } : undefined), set: () => true }) as unknown as CanvasRenderingContext2D
const spyDraws = (s: Structures) => ({ shatter: vi.spyOn(s, 'drawShatter'), particles: vi.spyOn(s, 'drawParticles'), pieces: vi.spyOn(s, 'drawPieces') })

describe('draw order', () => {
  it('fragments, particles, the landing piece and the build piece are drawn by `fx`, not by the structures', () => {
    const s = new Structures()
    const spies = spyDraws(s)
    s.draw(ctx)
    for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled()
    s.fx.draw(ctx)
    for (const spy of Object.values(spies)) expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('end handles', () => {
  const arcs = (s: Structures) => {
    const calls: number[][] = []
    const rec = new Proxy({}, { get: (_, k) => (k === 'arc' ? (...a: number[]) => calls.push(a) : () => {}), set: () => true }) as unknown as CanvasRenderingContext2D
    s.drawPieces(rec)
    return calls
  }

  it('draws a circle on each end of the selected wall, and none without one', () => {
    const s = new Structures()
    expect(arcs(s)).toEqual([])
    s.handles = { a: { x: 10, y: 80 }, b: { x: 18, y: 80 } }
    expect(arcs(s)).toEqual([
      [10, 80, visual.wall.handle.radius, 0, Math.PI * 2],
      [18, 80, visual.wall.handle.radius, 0, Math.PI * 2],
    ])
  })
})

describe('Tower pulse', () => {
  it('glows for glowMs after the Repulsor fires, then stops', () => {
    const s = new Structures()
    s.sync([tower(2)])
    const t = s.get(2) as Tower
    s.pulse(2)
    run(s, visual.tower.glowMs - 1)
    expect(t.glowing).toBe(true)
    run(s, 2)
    expect(t.glowing).toBe(false)
  })
})

describe('Structures reset', () => {
  it('drops every child, shattering ones too, so a new match\'s ids start clean', () => {
    const s = new Structures()
    s.sync([wall(1), wall(2)])
    s.shatter(1, from)
    s.burst(from, 'red', 3)
    expect(s.particleCount).toBeGreaterThanOrEqual(3)
    s.buildPiece = wall(3)
    s.reset()
    expect([s.count, s.children.length, s.buildPiece]).toEqual([0, 0, undefined])
    s.sync([tower(1)])
    expect(s.get(1)).toBeInstanceOf(Tower)
    expect(s.particleCount).toBe(0)
  })
})

describe('costLabelAt', () => {
  const w = { kind: 'wall' as const, owner: 1 as const, a: { x: 10, y: 80 }, b: { x: 18, y: 80 } }
  it('sits off the wall along its normal, on the other side when flipped', () => {
    expect(costLabelAt(w, 1.4, false)).toEqual({ x: 14, y: 81.4 })
    expect(costLabelAt(w, 1.4, true)).toEqual({ x: 14, y: 78.6 })
  })
  it('follows a vertical wall\'s normal', () => {
    const p = costLabelAt({ ...w, b: { x: 10, y: 88 } }, 1, false)
    expect(p.x).toBeCloseTo(9)
    expect(p.y).toBeCloseTo(84)
  })
})
