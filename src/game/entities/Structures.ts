import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import type { Point } from '../../sim/pitch'
import { splashDamage, splashOf } from '../../sim/splash'
import { playCost, type SimConfig, type SimState } from '../../sim/step'
import { segmentCount, segmentEnds, standing, structureCost, type Structure, type StructureSpec } from '../../sim/wall'
import { Entity } from './Entity'
import { Fixture, type FixtureData } from './Fixture'
import { drawLabel } from './label'
import { ParticlePool } from './particles'
import { Tower } from './Tower'
import { Wall } from './Wall'
import { cssPxPerUnit, drawParticle } from './wallPaint'

/** Where the Credit cost reads: `offset` off a wall's midpoint along its unit normal, turned half a revolution with the canvas when it is `flipped`. A tower has no Credit cost, so it sits at its cell's centre. */
export function costLabelAt(spec: StructureSpec, offset: number, flipped: boolean): Point {
  if (spec.kind === 'tower') return { x: (spec.at.gx + 0.5) * rules.cellSize, y: (spec.at.gy + 0.5) * rules.cellSize }
  const [dx, dy] = [spec.b.x - spec.a.x, spec.b.y - spec.a.y]
  const len = Math.hypot(dx, dy) || 1
  const sign = flipped ? -1 : 1
  return { x: (spec.a.x + spec.b.x) / 2 - (sign * offset * dy) / len, y: (spec.a.y + spec.b.y) / 2 + (sign * offset * dx) / len }
}

const make = (d: FixtureData): Fixture => (d.kind === 'tower' ? new Tower(d) : new Wall(d))

/**
 * Every wall and tower, keyed by sim id. `sync` creates a child as an object appears; one that leaves the sim is dropped at once,
 * unless it was told to `shatter`, in which case it stays until the shatter ends. Holds the build overlays (build piece, landing) and hit particles too.
 * What flies above the ball and aim (fragments, particles, landing, build piece) is drawn by `fx`, which the game adds to the camera after them.
 */
export class Structures extends Entity {
  /** The sim id the build piece or landing piece stands in for (a wall being moved), so a damaged wall keeps its segments, Gaps and cracks while it moves. */
  pieceId?: number
  landingId?: number
  /** The piece being dragged and a placed piece not yet in the sim (the landing one), drawn half-transparent. */
  buildPiece?: StructureSpec
  landing?: StructureSpec
  /** The build piece is a new wall (unplaced or being drawn): its Credit cost shows beside its midpoint. Towers spend stock, not Credits, so show none. */
  costLabel = false
  /** The piece is an in-play build: its cost label reads the in-play price (`rules.playBuild`). */
  inPlay = false
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
  private readonly pool = new ParticlePool(visual.wall.particles.cap)

  get(id: number): Fixture | undefined {
    return this.fixtures.get(id)
  }

  /** Particles still flying (sparks, chunks, dust, rings): never more than `visual.wall.particles.cap`. */
  get particleCount(): number {
    return this.pool.count
  }

  get count(): number {
    return this.fixtures.size
  }

  sync(objects: Structure[]): void {
    const present = new Set(objects.map((o) => o.id))
    for (const [id, f] of this.fixtures) {
      if (present.has(id)) continue
      if (!f.isShattering) this.drop(id, f)
      else if (f instanceof Wall) f.markGone()
    }
    for (const o of objects) {
      const f = this.fixtures.get(o.id)
      if (f) f.data = o
      else {
        const made = this.add(make(o))
        this.fixtures.set(o.id, made)
      }
    }
  }

  /** A hit on structure `id`: a wall flashes only the segment hit (`segment`, or the one `at` lies on). */
  hit(id: number, dim: boolean, segment?: number, at?: Point): void {
    this.fixtures.get(id)?.hit(dim, segment, at)
  }

  pulse(id: number): void {
    const f = this.fixtures.get(id)
    if (f instanceof Tower) f.pulse()
  }

  /** The structure left the sim in a break at `from`: a tower stays, shattering, after `delay` ms; a wall breaks every standing segment at once. */
  shatter(id: number, from: Point, delay = 0): void {
    const f = this.fixtures.get(id)
    if (f instanceof Wall) for (const i of standing({ segments: f.data.segments ?? [] })) this.shatterSegment(id, i, from)
    else f?.shatter(from, delay)
  }

  /** Wall segment `index` of wall `id` broke at `at`: it shatters into spinning chunks in its colour, with a dust puff, a ring along the wall and white sparks; a Breaker's break is heavier. The wall itself stays (or leaves, if that was its last segment). */
  shatterSegment(id: number, index: number, _at: Point, breaker = false): void {
    const f = this.fixtures.get(id)
    if (!(f instanceof Wall)) return
    f.breakSegment(index)
    const { a, b } = segmentEnds(f.data, index)
    const scale = breaker ? visual.wall.break.breakerScale : 1
    const color = visual.player.colors[f.data.owner]
    const [dx, dy] = [b.x - a.x, b.y - a.y]
    const len = Math.hypot(dx, dy) || 1
    const [nx, ny] = [-dy / len, dx / len]
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const { chunks, sparks, dust, ring } = visual.wall.break
    const between = ([lo, hi]: readonly number[]) => lo + Math.random() * (hi - lo)
    for (let k = 0; k < Math.round(chunks.count * scale); k++) {
      const t = Math.random()
      const v = (Math.random() - 0.5) * visual.wall.look.thickness
      // Thrown across the wall, either way.
      const ang = Math.atan2(ny, nx) + (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 1.8
      const speed = between(chunks.speed)
      this.pool.spawn({ kind: 'chunk', x: a.x + dx * t + nx * v, y: a.y + dy * t + ny * v, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, rot: Math.random() * 6, spin: (Math.random() - 0.5) * chunks.spin, size: between(chunks.size), life: between(chunks.lifeMs), color, drag: chunks.drag })
    }
    this.pool.spawn({ kind: 'dust', x: mid.x, y: mid.y, life: dust.ms })
    this.pool.spawn({ kind: 'ring', x: mid.x, y: mid.y, life: ring.ms, color, ang: Math.atan2(dy, dx) })
    this.burst(mid, visual.wall.flash, Math.round(sparks.count * scale), sparks.speed, sparks.lifeMs)
  }

  /** A spray of `count` square sparks from `at` (a crack the ball did not cause, or a break's white sparks). */
  burst(at: Point, color: string, count: number, speed?: number, lifeMs: readonly number[] = [visual.wall.particles.ms, visual.wall.particles.ms]): void {
    const p = visual.wall.particles
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const v = speed === undefined ? p.minSpeed + Math.random() * p.speedRange : speed * (0.3 + Math.random())
      this.pool.spawn({ kind: 'spark', x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: lifeMs[0] + Math.random() * (lifeMs[1] - lifeMs[0]), color })
    }
  }

  /** A new match: sim ids restart, so nothing from the last one may linger, not even a shattering child. */
  reset(): void {
    for (const [id, f] of this.fixtures) this.drop(id, f)
    this.pool.clear()
    this.buildPiece = this.landing = this.selected = this.handles = this.pieceId = this.landingId = undefined
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
      f.flipped = this.flipped
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
    this.pool.update(dt)
  }

  /** The Breach marks, at pitch level: drawn first, so every wall and the ball sit over them. The map view's simplified walls are set here, from the scale this draw is made at. */
  protected override render(ctx: CanvasRenderingContext2D): void {
    const simplified = cssPxPerUnit(ctx) < visual.wall.look.simplifiedBelowPx
    for (const f of this.fixtures.values()) {
      f.simplified = simplified
      if (f instanceof Wall && !f.hidden) f.drawBreach(ctx)
    }
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
    for (let i = 0; i < this.pool.count; i++) drawParticle(ctx, this.pool.items[i], visual.wall.particles.size)
  }

  /** The landing piece (placed, on its way to the sim), then the one being dragged. */
  drawPieces(ctx: CanvasRenderingContext2D): void {
    if (this.landing) this.drawBuildPiece(ctx, this.landing, false, this.landingId)
    if (this.buildPiece) this.drawBuildPiece(ctx, this.buildPiece, true, this.pieceId)
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
    drawLabel(ctx, String(this.inPlay ? playCost(spec) : structureCost(spec)), at, { size, weight: visual.wall.cost.weight, color: this.pieceBlocked ? visual.wall.illegal : visual.hud.ink, flipped: this.flipped })
  }

  /** A translucent piece: a bare spec draws clean segments with their joints; one standing in for a placed wall (`id`) draws that wall's real segments, Gaps and damage while the length is unchanged. */
  private drawBuildPiece(ctx: CanvasRenderingContext2D, spec: StructureSpec, selected: boolean, id?: number): void {
    const real = id === undefined ? undefined : this.fixtures.get(id)?.data
    const data = spec.kind === 'wall' && real?.kind === 'wall' && real.segments?.length === segmentCount(spec) ? { ...spec, id, segments: real.segments } : spec
    const f = make(data)
    f.clock = this.clock
    f.alpha = visual.wall.buildPieceAlpha
    f.selected = selected
    f.flipped = this.flipped
    f.simplified = cssPxPerUnit(ctx) < visual.wall.look.simplifiedBelowPx
    if (selected && this.pieceBlocked) f.tint = visual.wall.illegal
    if (f instanceof Wall) f.drawBreach(ctx)
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
