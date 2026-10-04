export type ParticleKind = 'spark' | 'chunk' | 'dust' | 'ring'

/** One particle. Position and size are world units, velocity world units per second, `age` and `life` ms, `rot` and `spin` radians (and radians per second); `ang` turns a ring along its wall; `drag` is the fraction of speed left after one second. */
export type Particle = { kind: ParticleKind; x: number; y: number; vx: number; vy: number; rot: number; spin: number; size: number; ang: number; color: string; age: number; life: number; drag: number }

const blank = (): Particle => ({ kind: 'spark', x: 0, y: 0, vx: 0, vy: 0, rot: 0, spin: 0, size: 0, ang: 0, color: '', age: 0, life: 0, drag: 1 })

/**
 * Every particle a wall throws (hit sparks, spinning chunks, dust puffs, rings) in one fixed pool, allocated once and reused: the first `count` are alive.
 * When it is full a new particle takes the slot of an old one (cycling), so a burst of breaks never grows it past `cap`.
 */
export class ParticlePool {
  readonly items: Particle[]
  private live = 0
  private evict = 0

  constructor(readonly cap: number) {
    this.items = Array.from({ length: cap }, blank)
  }

  /** Particles alive now: never more than `cap`. */
  get count(): number {
    return this.live
  }

  /** Starts a particle in a free slot, or over the next one in the cycle when none is free; the rest of its fields start blank. */
  spawn(init: Partial<Particle> & Pick<Particle, 'kind' | 'life'>): Particle {
    const p = this.live < this.cap ? this.items[this.live++] : this.items[this.evict++ % this.cap]
    Object.assign(p, blank(), init)
    return p
  }

  /** Empties the pool. */
  clear(): void {
    this.live = 0
  }

  /** Moves and ages everything `dt` seconds on; an expired particle frees its slot. */
  update(dt: number): void {
    for (let i = 0; i < this.live; ) {
      const p = this.items[i]
      p.age += dt * 1000
      if (p.age >= p.life) {
        this.items[i] = this.items[--this.live]
        this.items[this.live] = p
        continue
      }
      const drag = p.drag ** dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= drag
      p.vy *= drag
      p.rot += p.spin * dt
      i++
    }
  }
}
