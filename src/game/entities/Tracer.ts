import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import type { Point } from '../../sim/pitch'
import { tierColor } from './Aim'

type Mark = { x: number; y: number; t: number }
type Spark = { x: number; y: number; vx: number; vy: number; age: number; life: number; r: number; color: string }
type Flash = { x: number; y: number; t: number; color: string }

const between = ([lo, hi]: readonly [number, number]): number => lo + Math.random() * (hi - lo)
const easeOut = (u: number): number => 1 - (1 - u) ** 3

/**
 * The Tracer: the glowing tail behind a shot, the sparks it sheds and the flashes at its bounces, in the colour of the tier that fired.
 * The Ball owns one, feeds it positions, shots and bounces, and draws it under the disc. Its pools are allocated once and reused, since it runs every frame.
 */
export class Tracer {
  /** Screen px per world unit; the game sets it each frame, so the tracer's px sizes hold on any screen. */
  pxPerUnit = 1
  // The tier of the last shot (kept after the ball rests, so its fading tail keeps its colour), and whether that shot is still in flight.
  private tier?: number
  private flying = false
  // The tail: a ring buffer of marks, oldest at `head`.
  private readonly marks: Mark[] = Array.from({ length: visual.ball.tracer.maxPoints }, () => ({ x: 0, y: 0, t: 0 }))
  private head = 0
  private count = 0
  // Live sparks are the first `live` of the pool; once it is full, new sparks overwrite slot `evict`, which cycles.
  private readonly pool: Spark[] = Array.from({ length: visual.ball.tracer.sparks.max }, () => ({ x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0, r: 0, color: '' }))
  private live = 0
  private evict = 0
  private readonly flashPool: Flash[] = Array.from({ length: visual.ball.tracer.flash.max }, () => ({ x: 0, y: 0, t: 0, color: '' }))
  private lit = 0
  private flashEvict = 0
  // Screen px travelled since the tail last shed a spark.
  private shed = 0

  /** Tail points still showing. */
  get points(): number {
    return this.count
  }

  /** The colour of the tier that fired, while its shot is in flight; none once the ball rests or possession changes. */
  get color(): string | undefined {
    return this.flying && this.tier !== undefined ? tierColor(this.tier) : undefined
  }

  /** The tail's width at the ball, in world units: wider for Power. */
  get width(): number {
    return visual.ball.tracer.widthPx[this.tierName] / this.pxPerUnit
  }

  /** Sparks still flying. */
  get sparks(): number {
    return this.live
  }

  /** Bounce flashes still showing. */
  get flashes(): number {
    return this.lit
  }

  /** A shot fired: the tail restarts at `from` in the tier's colour, with a burst of sparks there. */
  fire(tier: number, from: Point, now: number): void {
    const { count, speedPx } = visual.ball.tracer.launch
    this.tier = tier
    this.flying = true
    this.count = this.head = this.shed = 0
    this.mark(from.x, from.y, now)
    this.burst(from, this.tint, count[this.tierName], speedPx[this.tierName])
  }

  /** The ball bounced at `at` off a wall (white sparks) or a board (sparks in the tier's colour): a flash and a spray of sparks there. */
  bounce(at: Point, wall: boolean, now: number): void {
    const { count, speedPx, wall: white } = visual.ball.tracer.bounce
    const f = this.lit < this.flashPool.length ? this.flashPool[this.lit++] : this.flashPool[this.flashEvict++ % this.flashPool.length]
    f.x = at.x
    f.y = at.y
    f.t = now
    f.color = this.tint
    this.burst(at, wall ? white : this.tint, count[this.tierName], speedPx)
  }

  /** The ball moved to `pos`: the tail follows, with points added every `stepPx` across the gap, shedding sparks on the way while the shot flies. */
  follow(pos: Point, now: number): void {
    if (!this.count) return this.mark(pos.x, pos.y, now)
    const { stepPx, sparks } = visual.ball.tracer
    const last = this.marks[(this.head + this.count - 1) % this.marks.length]
    const gapPx = Math.hypot(pos.x - last.x, pos.y - last.y) * this.pxPerUnit
    const steps = Math.ceil(gapPx / stepPx)
    const [x0, y0] = [last.x, last.y]
    for (let k = 1; k <= steps; k++) this.mark(x0 + ((pos.x - x0) * k) / steps, y0 + ((pos.y - y0) * k) / steps, now)
    if (!this.flying) return
    this.shed += gapPx
    for (; this.shed >= sparks.everyPx; this.shed -= sparks.everyPx) this.spark(pos, this.tint, sparks.trailSpeedPx)
  }

  /** The ball came to rest: the shot is over, so the tracer loses its colour; its tail fades out. */
  rest(): void {
    this.flying = false
  }

  /** Possession changed: the tracer loses its colour and its tail. */
  handOver(): void {
    this.flying = false
    this.count = this.head = this.shed = 0
  }

  /** A new match: nothing lingers. */
  clear(): void {
    this.handOver()
    this.tier = undefined
    this.live = this.lit = 0
  }

  /** Ages everything to the clock `now` (ms), `dt` seconds after the last update. */
  update(now: number, dt: number): void {
    const { tailMs, sparks, flash } = visual.ball.tracer
    while (this.count && now - this.marks[this.head].t >= tailMs) {
      this.head = (this.head + 1) % this.marks.length
      this.count--
    }
    const drag = sparks.drag ** dt
    for (let i = 0; i < this.live; ) {
      const p = this.pool[i]
      p.age += dt * 1000
      if (p.age >= p.life) {
        this.pool[i] = this.pool[--this.live]
        this.pool[this.live] = p
        continue
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= drag
      p.vy *= drag
      i++
    }
    for (let i = 0; i < this.lit; ) {
      const f = this.flashPool[i]
      if (now - f.t < flash.ms) i++
      else {
        this.flashPool[i] = this.flashPool[--this.lit]
        this.flashPool[this.lit] = f
      }
    }
  }

  /** Draws the tail, the flashes, the sparks and (at `speed`, world units per second) the ball's halo, additively. `bright`: the white core runs wide. */
  draw(ctx: CanvasRenderingContext2D, now: number, ball: Point, speed: number, ballRadius: number, bright: boolean): void {
    const { tailMs, minWidthPx, glow, band, core, brightCore, flash, halo, clear } = visual.ball.tracer
    const px = this.pxPerUnit
    const color = this.tint
    const width = this.width
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    const n = this.count
    for (const [share, alpha, stroke] of [[glow.width, glow.alpha, color], [band.width, band.alpha, color], [bright ? brightCore : core.width, core.alpha, core.color]] as const) {
      ctx.strokeStyle = stroke
      for (let i = 1; i < n; i++) {
        const a = this.marks[(this.head + i - 1) % this.marks.length]
        const b = this.marks[(this.head + i) % this.marks.length]
        const k = (1 - (now - b.t) / tailMs) * (i / n)
        if (k <= 0) continue
        ctx.globalAlpha = alpha * k
        ctx.lineWidth = Math.max(minWidthPx / px, width * share * k)
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
    }
    for (let i = 0; i < this.lit; i++) {
      const f = this.flashPool[i]
      const u = Math.min((now - f.t) / flash.ms, 1)
      const r = flash.glowPx / px
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r)
      g.addColorStop(0, core.color)
      g.addColorStop(1, clear)
      ctx.globalAlpha = flash.glowAlpha * (1 - u)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2)
      ctx.fill()
      const [thin, thick] = flash.ringWidthPx
      ctx.globalAlpha = 1 - u
      ctx.strokeStyle = f.color
      ctx.lineWidth = (thin + (thick - thin) * (1 - u)) / px
      ctx.beginPath()
      ctx.arc(f.x, f.y, (flash.ringFromPx + (flash.ringToPx - flash.ringFromPx) * easeOut(u)) / px, 0, Math.PI * 2)
      ctx.stroke()
    }
    for (let i = 0; i < this.live; i++) {
      const p = this.pool[i]
      const k = 1 - p.age / p.life
      ctx.globalAlpha = k
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, (p.r * (0.5 + k)) / px, 0, Math.PI * 2)
      ctx.fill()
    }
    if (this.flying && speed > 0) {
      const g = ctx.createRadialGradient(ball.x, ball.y, ballRadius * halo.inner, ball.x, ball.y, ballRadius * halo.radius)
      g.addColorStop(0, color)
      g.addColorStop(1, clear)
      ctx.globalAlpha = Math.min(halo.alpha, (halo.alpha * speed * px) / halo.fullSpeedPx)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(ball.x, ball.y, ballRadius * halo.radius, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  // The last shot's colour, kept while its tail fades; `idle` before any shot.
  private get tint(): string {
    return this.tier === undefined ? visual.ball.tracer.idle : tierColor(this.tier)
  }

  private get tierName() {
    return rules.shot.tiers[this.tier ?? 0].name
  }

  private mark(x: number, y: number, t: number): void {
    const cap = this.marks.length
    // Full: the oldest mark gives way.
    if (this.count === cap) (this.head = (this.head + 1) % cap), this.count--
    const m = this.marks[(this.head + this.count++) % cap]
    m.x = x
    m.y = y
    m.t = t
  }

  private burst(at: Point, color: string, count: number, speedPx: number): void {
    for (let i = 0; i < count; i++) this.spark(at, color, speedPx)
  }

  private spark(at: Point, color: string, speedPx: number): void {
    const { lifeMs, radiusPx, spread } = visual.ball.tracer.sparks
    const p = this.live < this.pool.length ? this.pool[this.live++] : this.pool[this.evict++ % this.pool.length]
    const a = Math.random() * Math.PI * 2
    const v = (speedPx * between(spread)) / this.pxPerUnit
    p.x = at.x
    p.y = at.y
    p.vx = Math.cos(a) * v
    p.vy = Math.sin(a) * v
    p.age = 0
    p.life = between(lifeMs)
    p.r = between(radiusPx)
    p.color = color
  }
}
