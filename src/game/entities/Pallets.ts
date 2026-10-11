import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import type { Pallet } from '../../sim/pallet'
import type { Point } from '../../sim/pitch'
import { Entity } from './Entity'
import { flashLeft, ghostsOf, ringAlpha } from './palletLook'
import { clearOf, withDash } from './paint'

/**
 * Every Pallet: the tapered arm on its pivot, the Activation ring, the swing's motion ghosts and the flash of a swat. A world entity drawn under the ball, aim and fx; in a blind build the
 * game draws it once more over the fog so the Pallets stay in view. The Minimap chip draws bands, not map pieces, so they are not there. Its state is the sim's Pallets as they are this frame.
 */
export class Pallets extends Entity {
  /** The sim's Pallets this frame. */
  pallets: readonly Pallet[] = []
  private flashes: { id: number; at: Point; born: number }[] = []

  /** A build ring is up (the Pitch draws each Activation ring in the builder's colour), so the Pallets leave theirs out, bar over the fog where the Pitch's is covered. */
  buildRing = false
  private overFog = false

  /** Pallet `id` swatted the ball at `at`: the arm glows and a flash and ring play there for `visual.pallet.flash.ms`. */
  hit(id: number, at: Point): void {
    this.flashes.push({ id, at, born: this.clock })
  }

  /** Swats still flashing. */
  get flashCount(): number {
    return this.flashes.length
  }

  /** A new match: no flashes. */
  reset(): void {
    this.pallets = []
    this.flashes = []
  }

  override update(dt: number): void {
    super.update(dt)
    if (this.flashes.length) this.flashes = this.flashes.filter((f) => flashLeft(this.clock - f.born) > 0)
  }

  /** The strongest flash left on Pallet `id`'s arm, 0 to 1. */
  private glow(id: number): number {
    return this.flashes.reduce((k, f) => (f.id === id ? Math.max(k, flashLeft(this.clock - f.born)) : k), 0)
  }

  /** The fog's second pass: draws as usual but always with the Activation rings, since the Pitch's own sits under the fog. */
  drawOverFog(ctx: CanvasRenderingContext2D): void {
    this.overFog = true
    try {
      this.draw(ctx)
    } finally {
      this.overFog = false
    }
  }

  protected override render(ctx: CanvasRenderingContext2D): void {
    if (!this.buildRing || this.overFog) for (const p of this.pallets) this.drawRing(ctx, p)
    for (const p of this.pallets) this.drawArm(ctx, p)
    for (const f of this.flashes) this.drawFlash(ctx, f.at, flashLeft(this.clock - f.born))
  }

  /** Pallet's Activation ring: dashed like the build-time one, bright while it tracks or swings. */
  private drawRing(ctx: CanvasRenderingContext2D, { pivot, phase }: Pallet): void {
    ctx.globalAlpha = ringAlpha(phase)
    withDash(ctx, visual.pitch.palletRing, visual.pallet.color, () => {
      ctx.beginPath()
      ctx.arc(pivot.x, pivot.y, rules.pallet.ringRadius, 0, Math.PI * 2)
      ctx.stroke()
    })
    ctx.globalAlpha = 1
  }

  /** The tapered capsule along +x from the origin: a disc of the root radius at the pivot, one of the tip radius at `length`, joined by their common tangents. */
  private armPath(ctx: CanvasRenderingContext2D): void {
    const sa = Math.asin((rules.pallet.rootRadius - rules.pallet.tipRadius) / rules.pallet.length)
    ctx.beginPath()
    ctx.arc(0, 0, rules.pallet.rootRadius, Math.PI / 2 - sa, -Math.PI / 2 + sa + Math.PI * 2)
    ctx.arc(rules.pallet.length, 0, rules.pallet.tipRadius, -Math.PI / 2 + sa, Math.PI / 2 - sa)
    ctx.closePath()
  }

  /** The arm at its angle with its swing ghosts and swat glow, then the pivot over it. */
  private drawArm(ctx: CanvasRenderingContext2D, p: Pallet): void {
    const glow = this.glow(p.id)
    ctx.save()
    ctx.translate(p.pivot.x, p.pivot.y)
    ctx.fillStyle = visual.pallet.color
    ghostsOf(p, (angle, alpha) => {
      ctx.save()
      ctx.rotate(angle)
      ctx.globalAlpha = alpha
      this.armPath(ctx)
      ctx.fill()
      ctx.restore()
    })
    ctx.rotate(p.angle)
    this.armPath(ctx)
    if (glow > 0) {
      ctx.globalAlpha = glow * visual.pallet.flash.armGlowAlpha
      ctx.strokeStyle = visual.pallet.color
      ctx.lineWidth = visual.pallet.flash.armGlow * glow
      ctx.lineJoin = 'round'
      ctx.stroke()
    }
    ctx.globalAlpha = visual.pallet.fillAlpha
    ctx.fill()
    ctx.globalAlpha = visual.pallet.outlineAlpha
    ctx.strokeStyle = visual.pallet.outline
    ctx.lineWidth = visual.pallet.outlineWidth
    ctx.stroke()
    ctx.restore()
    this.drawPivot(ctx, p.pivot)
  }

  /** The dark disc and ring the arm turns on. */
  private drawPivot(ctx: CanvasRenderingContext2D, pivot: Point): void {
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(pivot.x, pivot.y, visual.pallet.pivot.radius, 0, Math.PI * 2)
    ctx.fillStyle = visual.pallet.pivot.fill
    ctx.fill()
    ctx.strokeStyle = visual.pallet.outline
    ctx.lineWidth = visual.pallet.pivot.width
    ctx.stroke()
  }

  /** A swat's radial glow and the ring snapping out from `at`, `left` (1 to 0) of the flash still to play. */
  private drawFlash(ctx: CanvasRenderingContext2D, at: Point, left: number): void {
    const { glowRadius, glowAlpha, ringFrom, ringTo, ringEase, ringWidth } = visual.pallet.flash
    const g = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, glowRadius)
    g.addColorStop(0, visual.pallet.outline)
    g.addColorStop(1, clearOf(visual.pallet.color))
    ctx.globalAlpha = glowAlpha * left
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(at.x, at.y, glowRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = left
    ctx.strokeStyle = visual.pallet.color
    ctx.lineWidth = ringWidth * left
    ctx.beginPath()
    ctx.arc(at.x, at.y, ringFrom + (ringTo - ringFrom) * (1 - left ** ringEase), 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
}
