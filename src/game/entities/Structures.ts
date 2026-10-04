import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import type { Point } from '../../sim/pitch'
import { splashDamage, splashOf } from '../../sim/splash'
import type { SimConfig, SimState } from '../../sim/step'
import { structureCost, type Structure, type StructureSpec } from '../../sim/wall'
import { Entity } from './Entity'
import { Fixture, type FixtureData } from './Fixture'
import { drawLabel } from './label'
import { Tower } from './Tower'
import { Wall } from './Wall'

/** Where the Credit cost reads: `offset` off a wall's midpoint along its unit normal, turned half a revolution with the canvas when it is `flipped`. A tower has no Credit cost, so it sits at its cell's centre. */
export function costLabelAt(spec: StructureSpec, offset: number, flipped: boolean): Point {
  if (spec.kind === 'tower') return { x: (spec.at.gx + 0.5) * rules.cellSize, y: (spec.at.gy + 0.5) * rules.cellSize }
  const [dx, dy] = [spec.b.x - spec.a.x, spec.b.y - spec.a.y]
  const len = Math.hypot(dx, dy) || 1
  const sign = flipped ? -1 : 1
  return { x: (spec.a.x + spec.b.x) / 2 - (sign * offset * dy) / len, y: (spec.a.y + spec.b.y) / 2 + (sign * offset * dx) / len }
}

type Particle = { at: Point; vel: Point; color: string; born: number }

const make = (d: FixtureData): Fixture => (d.kind === 'tower' ? new Tower(d) : new Wall(d))

/**
 * Every wall and tower, keyed by sim id. `sync` creates a child as an object appears; one that leaves the sim is dropped at once,
 * unless it was told to `shatter`, in which case it stays until the shatter ends. Holds the build overlays (build piece, landing) and hit particles too.
 * What flies above the ball and aim (fragments, particles, landing, build piece) is drawn by `fx`, which the game adds to the camera after them.
 */
export class Structures extends Entity {
  /** The piece being dragged and a placed piece not yet in the sim (the landing one), drawn half-transparent. */
  buildPiece?: StructureSpec
  landing?: StructureSpec
  /** The build piece is a new wall (unplaced or being drawn): its Credit cost shows beside its midpoint. Towers spend stock, not Credits, so show none. */
  costLabel = false
  /** The build piece fails the full legality check (the Credit balance too), which the build piece's own geometry check cannot see. */
  pieceBlocked = false
  /** The selected movable wall's two ends: handles are drawn on them. */
  handles?: { a: Point; b: Point }
  /** The canvas is turned for the other seat (hot-seat flip): text is turned back to read upright. */
  flipped = false
  /** Ids stood in for by the build piece or landing piece. */
  hidden: number[] = []
  /** An older structure picked to demolish. */
  selected?: number
  /** Ids placed this turn. */
  movable: number[] = []
  /** Splash preview: ids in range, and whether each is the shooter's own. */
  preview = new Map<number, boolean>()
  /** Drawn above the ball and aim: the game adds it to the camera after them. */
  readonly fx = new StructureFx(this)
  private fixtures = new Map<number, Fixture>()
  private particles: Particle[] = []

  get(id: number): Fixture | undefined {
    return this.fixtures.get(id)
  }

  /** Hit particles still flying. */
  get particleCount(): number {
    return this.particles.length
  }

  get count(): number {
    return this.fixtures.size
  }

  sync(objects: Structure[]): void {
    const present = new Set(objects.map((o) => o.id))
    for (const [id, f] of this.fixtures) if (!present.has(id) && !f.isShattering) this.drop(id, f)
    for (const o of objects) {
      const f = this.fixtures.get(o.id)
      if (f) f.data = o
      else {
        const made = this.add(make(o))
        this.fixtures.set(o.id, made)
      }
    }
  }

  hit(id: number, dim: boolean): void {
    this.fixtures.get(id)?.hit(dim)
  }

  pulse(id: number): void {
    const f = this.fixtures.get(id)
    if (f instanceof Tower) f.pulse()
  }

  /** The structure left the sim in a break at `from`: it stays, shattering, after `delay` ms. */
  shatter(id: number, from: Point, delay = 0): void {
    this.fixtures.get(id)?.shatter(from, delay)
  }

  burst(at: Point, color: string, count: number): void {
    const p = visual.wall.particles
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const s = p.minSpeed + Math.random() * p.speedRange
      this.particles.push({ at, vel: { x: Math.cos(a) * s, y: Math.sin(a) * s }, color, born: this.clock })
    }
  }

  /** A new match: sim ids restart, so nothing from the last one may linger, not even a shattering child. */
  reset(): void {
    for (const [id, f] of this.fixtures) this.drop(id, f)
    this.particles = []
    this.buildPiece = this.landing = this.selected = this.handles = undefined
    this.costLabel = this.pieceBlocked = false
    this.hidden = []
    this.movable = []
    this.preview = new Map()
  }

  /** Sets the Splash preview to the structures in range of the Splash the aim would set off from the ball; empty for a non-splash tier or before the drag. */
  previewSplash(state: Pick<SimState, 'objects' | 'ball' | 'possession'>, aim: { tier: number; power?: number } | undefined, config: SimConfig): void {
    const splash = aim?.power === undefined ? null : splashOf(aim.tier, aim.power, config)
    const { shooter } = state.possession
    this.preview = new Map(splash === null ? [] : splashDamage(state.objects, state.ball.pos, splash, shooter).map((h) => [h.wall.id, h.wall.owner === shooter]))
  }

  /** Hands each child what this frame shows (build overlays, splash preview). Call before drawing. */
  mark(): void {
    for (const [id, f] of this.fixtures) {
      f.hidden = this.hidden.includes(id)
      f.movable = this.movable.includes(id)
      f.selected = this.selected === id
      const hit = this.preview.get(id)
      f.tint = hit === undefined ? undefined : hit ? visual.wall.ownTint : visual.wall.illegal
    }
  }

  override update(dt: number): void {
    super.update(dt)
    for (const [id, f] of this.fixtures) if (f.shattered) this.drop(id, f)
    this.particles = this.particles.filter((p) => this.clock - p.born < visual.wall.particles.ms)
  }

  private drop(id: number, f: Fixture): void {
    this.fixtures.delete(id)
    this.remove(f)
  }

  /** Fragments of the structures that have broken. */
  drawShatter(ctx: CanvasRenderingContext2D): void {
    for (const f of this.fixtures.values()) f.drawShatter(ctx)
  }

  drawParticles(ctx: CanvasRenderingContext2D): void {
    ctx.save()
    const { ms, size } = visual.wall.particles
    for (const p of this.particles) {
      const t = (this.clock - p.born) / ms
      ctx.globalAlpha = 1 - t
      ctx.fillStyle = p.color
      ctx.fillRect(p.at.x + p.vel.x * t - size / 2, p.at.y + p.vel.y * t - size / 2, size, size)
    }
    ctx.restore()
  }

  /** The landing piece (placed, on its way to the sim), then the one being dragged. */
  drawPieces(ctx: CanvasRenderingContext2D): void {
    if (this.landing) this.drawBuildPiece(ctx, this.landing, false)
    if (this.buildPiece) this.drawBuildPiece(ctx, this.buildPiece, true)
    if (this.buildPiece && this.costLabel) this.drawCost(ctx, this.buildPiece)
    if (this.handles) this.drawHandles(ctx, this.handles)
  }

  /** A circle on each end of the selected wall: what a finger or the mouse grabs to swing and resize it. */
  private drawHandles(ctx: CanvasRenderingContext2D, ends: { a: Point; b: Point }): void {
    const { radius, width, stroke, fill } = visual.wall.handle
    ctx.save()
    ctx.lineWidth = width
    ctx.strokeStyle = stroke
    ctx.fillStyle = fill
    for (const at of [ends.a, ends.b]) {
      ctx.beginPath()
      ctx.arc(at.x, at.y, radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    ctx.restore()
  }

  /** The piece's Credit cost beside its midpoint, red where it cannot be placed. */
  private drawCost(ctx: CanvasRenderingContext2D, spec: StructureSpec): void {
    const { size, offset } = visual.wall.cost
    const at = costLabelAt(spec, offset, this.flipped)
    drawLabel(ctx, String(structureCost(spec)), at, { size, weight: visual.wall.cost.weight, color: this.pieceBlocked ? visual.wall.illegal : visual.hud.ink, flipped: this.flipped })
  }

  private drawBuildPiece(ctx: CanvasRenderingContext2D, spec: StructureSpec, selected: boolean): void {
    const f = make(spec)
    f.clock = this.clock
    f.alpha = visual.wall.buildPieceAlpha
    f.selected = selected
    if (selected && this.pieceBlocked) f.tint = visual.wall.illegal
    f.draw(ctx)
  }
}

/** Fragments, particles, the landing piece and the build piece: the layer that draws over the ball and aim. */
export class StructureFx extends Entity {
  constructor(private structures: Structures) {
    super()
  }

  protected override render(ctx: CanvasRenderingContext2D): void {
    this.structures.drawShatter(ctx)
    this.structures.drawParticles(ctx)
    this.structures.drawPieces(ctx)
  }
}
