import { describe, expect, it } from 'vitest'
import { ParticlePool } from './particles'

describe('ParticlePool', () => {
  it('never holds more than its cap, however many are spawned', () => {
    const pool = new ParticlePool(10)
    for (let i = 0; i < 1000; i++) pool.spawn({ kind: 'spark', life: 500 })
    expect(pool.count).toBe(10)
    expect(pool.items).toHaveLength(10)
  })
  it('reuses its slots: no new particle objects once built', () => {
    const pool = new ParticlePool(4)
    const before = new Set(pool.items)
    for (let i = 0; i < 20; i++) pool.spawn({ kind: 'chunk', life: 500 })
    expect(pool.items.every((p) => before.has(p))).toBe(true)
  })
  it('moves a particle by its velocity and frees it when its life is up', () => {
    const pool = new ParticlePool(4)
    const p = pool.spawn({ kind: 'spark', life: 100, vx: 10 })
    pool.update(0.05)
    expect(p.x).toBeCloseTo(0.5, 9)
    expect(pool.count).toBe(1)
    pool.update(0.06)
    expect(pool.count).toBe(0)
  })
  it('slows a particle by its drag and turns it by its spin', () => {
    const pool = new ParticlePool(2)
    const p = pool.spawn({ kind: 'chunk', life: 5000, vx: 10, spin: 2, drag: 0.25 })
    pool.update(1)
    expect(p.vx).toBeCloseTo(2.5, 9)
    expect(p.rot).toBeCloseTo(2, 9)
  })
  it('a spawn after a free reuses the freed slot without clobbering a live particle', () => {
    const pool = new ParticlePool(2)
    const a = pool.spawn({ kind: 'spark', life: 50, color: 'a' })
    const b = pool.spawn({ kind: 'spark', life: 500, color: 'b' })
    pool.update(0.06)
    expect(pool.count).toBe(1)
    const c = pool.spawn({ kind: 'spark', life: 500, color: 'c' })
    expect([a, b, c].filter((p) => p.color === 'b')).toHaveLength(1)
    expect(pool.count).toBe(2)
  })
})
