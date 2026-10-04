import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import type { Point } from '../../sim/pitch'
import { maxHp, wallSegments, type StructureSpec, type TowerSpec, type WallSpec } from '../../sim/wall'
import { Entity } from './Entity'

/** A structure as drawn: the sim's `Structure`, or a bare spec (a build piece) with no hp, id or spent flag yet. */
type Placed = { id?: number; hp?: number; spent?: boolean }
export type WallData = WallSpec & Placed
export type TowerData = TowerSpec & Placed
export type FixtureData = WallData | TowerData

/** Player 2 walls: owner colour with diagonal stripes. `angle` (radians) turns the stripes with the wall, so they cross it at 45 degrees whatever its direction. */
function hatch(ctx: CanvasRenderingContext2D, angle: number): CanvasPattern {
  const { tile: size, stripe, scale } = visual.wall.hatch
  const tile = document.createElement('canvas')
  tile.width = tile.height = size
  const t = tile.getContext('2d')!
  t.fillStyle = visual.player.colors[2]
  t.fillRect(0, 0, size, size)
  t.strokeStyle = visual.wall.hatchStripe
  t.lineWidth = stripe
  t.beginPath()
  t.moveTo(0, size)
  t.lineTo(size, 0)
  t.stroke()
  const pattern = ctx.createPattern(tile, 'repeat')!
  pattern.setTransform(new DOMMatrix().rotate((angle * 180) / Math.PI).scale(scale))
  return pattern
}

export const ownerFill = (ctx: CanvasRenderingContext2D, owner: StructureSpec['owner'], angle = 0) => (owner === 2 ? hatch(ctx, angle) : visual.player.colors[1])

/** Wall segments in the owner's colour (or `fill`) with a dark outline. */
export function drawSegments(ctx: CanvasRenderingContext2D, segments: { a: Point; b: Point }[], owner: StructureSpec['owner'], fill?: string): void {
  ctx.beginPath()
  for (const { a, b } of segments) {
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
  }
  ctx.lineCap = 'square'
  ctx.lineJoin = 'miter'
  ctx.strokeStyle = visual.wall.outline
  ctx.lineWidth = visual.wall.outlineWidth
  ctx.stroke()
  const first = segments[0]
  ctx.strokeStyle = fill ?? ownerFill(ctx, owner, first ? Math.atan2(first.b.y - first.a.y, first.b.x - first.a.x) : 0)
  ctx.lineWidth = 2 * rules.wallHalf
  ctx.stroke()
}

/** A structure's cell-sized runs: a tower's four edges, a wall cut into runs one cell long (a diagonal run is as long as a straight one). Cracks land on one and a shatter flies as one each. */
export function cellRuns(spec: StructureSpec): { a: Point; b: Point }[] {
  if (spec.kind === 'tower') return wallSegments(spec)
  const { a, b } = spec
  const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / rules.cellSize))
  return Array.from({ length: n }, (_, i) => ({ a: { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }, b: { x: a.x + ((b.x - a.x) * (i + 1)) / n, y: a.y + ((b.y - a.y) * (i + 1)) / n } }))
}

/** One jagged crack per lost hit point, as world-space polylines. Deterministic in (id, hp) so peers draw the same cracks. */
export function crackLines(spec: StructureSpec, id: number, hp: number): Point[][] {
  const cells = cellRuns(spec)
  const max = maxHp(spec)
  const { spread, across, jitter } = visual.wall.crack
  return Array.from({ length: max - hp }, (_, k) => {
    // Seeded from id and the hp remaining after this crack, so earlier cracks never move.
    let seed = (id * 31 + (max - 1 - k)) * 2654435761
    const rnd = () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822519) >>> 0) / 2 ** 32)
    const { a, b } = cells[Math.floor(rnd() * cells.length)]
    const [cx, cy] = [(a.x + b.x) / 2, (a.y + b.y) / 2]
    // Along the piece's direction, and across it: its perpendicular.
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const [ux, uy] = [(b.x - a.x) / len, (b.y - a.y) / len]
    const along = (rnd() - 0.5) * rules.cellSize * spread
    return across.map((t) => {
      const j = (rnd() - 0.5) * jitter
      return { x: cx - uy * t + ux * (along + j), y: cy + ux * t + uy * (along + j) }
    })
  })
}

/** One cell-sized piece of a destroyed structure, flying away from the impact point. */
type Fragment = { a: Point; b: Point }

/** What every structure shares: a flash on a hit, an outline when marked, and a shatter that outlives its sim object. */
export abstract class Fixture<D extends FixtureData = FixtureData> extends Entity {
  /** Placed this turn, so it can still be moved: drawn with a dashed outline. */
  movable = false
  /** The builder's selection: an outline that breathes. */
  selected = false
  /** Drawn by the build piece or landing piece instead. */
  hidden = false
  /** Overrides the owner colour (splash preview). */
  tint?: string
  /** Drawn half-transparent: build pieces. */
  alpha = 1
  private flash?: { dim: boolean; age: number }
  private shattering?: { from: Point; delay: number; age: number; fragments: Fragment[] }

  constructor(public data: D) {
    super()
  }

  get shattered(): boolean {
    return !!this.shattering && this.shattering.age >= this.shattering.delay + visual.wall.shatterMs
  }

  get isShattering(): boolean {
    return !!this.shattering
  }

  /** A ball hit: a bright flash after damage, a dim one otherwise. A flash still running is kept, so rapid re-hits show the oldest. */
  hit(dim: boolean): void {
    this.flash ??= { dim, age: 0 }
  }

  /** Breaks into one per cell-length run flying from `from`, after `delay` ms (the structure stays whole until then). */
  shatter(from: Point, delay = 0): void {
    const fragments = cellRuns(this.data)
    this.shattering = { from, delay, age: 0, fragments }
  }

  override update(dt: number): void {
    super.update(dt)
    const ms = dt * 1000
    if (this.flash) {
      this.flash.age += ms
      if (this.flash.age >= (this.flash.dim ? visual.wall.dimFlashMs : visual.wall.flashMs)) this.flash = undefined
    }
    if (this.shattering) this.shattering.age += ms
  }

  protected override render(ctx: CanvasRenderingContext2D): void {
    if (this.hidden) return
    ctx.globalAlpha = this.alpha
    const s = this.shattering
    // Once it breaks the body is gone; the fragments are drawn by `fx`, above the ball.
    if (!s || s.age < s.delay) {
      this.drawBody(ctx, this.tint)
      if (!s) this.drawMarks(ctx)
    }
    ctx.globalAlpha = 1
  }

  /** The flying fragments of a shattered structure, once its delay is over. Drawn in the `fx` layer. */
  drawShatter(ctx: CanvasRenderingContext2D): void {
    const s = this.shattering
    if (!this.hidden && s && s.age >= s.delay) this.drawFragments(ctx, s)
  }

  /** The boxes an outline traces, as corner pairs in world units. */
  protected abstract footprint(): { a: Point; b: Point }[]

  /** Adds the outline's shape to the path, `pad` clear of the footprint: a rectangle per box by default. */
  protected outlinePath(ctx: CanvasRenderingContext2D, pad: number): void {
    for (const { a, b } of this.footprint()) ctx.rect(Math.min(a.x, b.x) - pad, Math.min(a.y, b.y) - pad, Math.abs(b.x - a.x) + 2 * pad, Math.abs(b.y - a.y) + 2 * pad)
  }

  /** One crack per lost hit point, once the structure has an id and hp (a build piece has neither). */
  protected drawCracks(ctx: CanvasRenderingContext2D): void {
    const { id, hp } = this.data
    if (id === undefined || hp === undefined) return
    ctx.beginPath()
    for (const [p, ...rest] of crackLines(this.data, id, hp)) {
      ctx.moveTo(p.x, p.y)
      for (const q of rest) ctx.lineTo(q.x, q.y)
    }
    ctx.lineCap = 'butt'
    ctx.strokeStyle = visual.wall.outline
    ctx.lineWidth = visual.wall.crackWidth
    ctx.stroke()
  }

  /** The structure itself, filled with `fill` or the owner colour. */
  protected abstract drawBody(ctx: CanvasRenderingContext2D, fill?: string): void

  /** Pulse outline, tower glow and the hit flash, over the body. */
  protected drawMarks(ctx: CanvasRenderingContext2D): void {
    if (this.movable) this.outline(ctx, visual.wall.mark.pad, [...visual.wall.mark.movableDash])
    if (this.selected) this.drawSelected(ctx)
    this.drawEffect(ctx)
    if (this.flash) {
      const { dim, age } = this.flash
      const t = age / (dim ? visual.wall.dimFlashMs : visual.wall.flashMs)
      ctx.globalAlpha = (dim ? visual.wall.dimFlashAlpha : 1) * (1 - t)
      this.drawBody(ctx, visual.wall.flash)
      ctx.globalAlpha = 1
    }
  }

  /** Extra effect drawn over the body (the Repulsor glow). */
  protected drawEffect(_ctx: CanvasRenderingContext2D): void {}

  /** A thin outline around the footprint, in the owner's colour. */
  protected outline(ctx: CanvasRenderingContext2D, pad: number, dash: number[] = []): void {
    ctx.beginPath()
    this.outlinePath(ctx, pad)
    ctx.setLineDash(dash)
    ctx.strokeStyle = visual.player.colors[this.data.owner]
    ctx.lineWidth = visual.wall.mark.width
    ctx.stroke()
    ctx.setLineDash([])
  }

  private drawSelected(ctx: CanvasRenderingContext2D): void {
    const k = Math.sin(this.clock / visual.wall.selected.periodMs)
    const { alpha, alphaSwing, pad, padSwing } = visual.wall.selected
    ctx.globalAlpha = alpha + alphaSwing * k
    this.outline(ctx, pad + padSwing * k)
    ctx.globalAlpha = 1
  }

  private drawFragments(ctx: CanvasRenderingContext2D, { from, delay, age, fragments }: NonNullable<Fixture['shattering']>): void {
    const t = (age - delay) / visual.wall.shatterMs
    if (t >= 1) return
    for (const { a, b } of fragments) {
      const [cx, cy] = [(a.x + b.x) / 2, (a.y + b.y) / 2]
      const [dx, dy] = [cx - from.x, cy - from.y]
      const d = Math.hypot(dx, dy) || 1
      const fly = t * visual.wall.shatterFly
      ctx.save()
      ctx.globalAlpha = 1 - t
      ctx.translate(cx + (dx / d) * fly, cy + (dy / d) * fly)
      ctx.rotate(t * visual.wall.shatterSpin * (cx % 2 < 1 ? 1 : -1))
      ctx.translate(-cx, -cy)
      drawSegments(ctx, [{ a, b }], this.data.owner)
      ctx.restore()
    }
  }
}
