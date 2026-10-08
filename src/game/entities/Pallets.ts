import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import type { Pallet } from '../../sim/pallet'
import type { Point } from '../../sim/pitch'
import type { Camera } from './Camera'
import { Entity } from './Entity'
import { flashLeft, ghostsOf, ringAlpha } from './palletLook'
import { withDash } from './Pitch'
import { clearOf } from './Tracer'

const TAU = Math.PI * 2
const V = visual.pallet
const P = rules.pallet

/**
 * Every Pallet: the tapered arm on its pivot, the Activation ring, the swing's motion ghosts and the flash of a swat. Top-level like `Fog`, drawn after it, so the Pallets
 * stay in view under a blind build's fog; the Minimap chip draws bands, not map pieces, so they are not there. Its state is the sim's Pallets as they are this frame.
 */
export class Pallets extends Entity {
  /** The sim's Pallets this frame. */
  pallets: readonly Pallet[] = []
  private flashes: { pallet: number; at: Point; born: number }[] = []

  /** `shake` is the offset the world is drawn with, so the Pallets move with it. */
  constructor(private camera: () => Camera, private shake: () => Point) {
    super()
  }

  /** Pallet `pallet` swatted the ball at `at`: the arm glows and a flash and ring play there for `visual.pallet.flash.ms`. */
  hit(pallet: number, at: Point): void {
    this.flashes.push({ pallet, at, born: this.clock })
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
    this.flashes = this.flashes.filter((f) => flashLeft(this.clock - f.born) > 0)
  }

  /** The strongest flash left on Pallet `id`'s arm, 0 to 1. */
  private glow(id: number): number {
    return this.flashes.reduce((k, f) => (f.pallet === id ? Math.max(k, flashLeft(this.clock - f.born)) : k), 0)
  }

  protected override render(ctx: CanvasRenderingContext2D): void {
    this.camera().through(ctx, this.shake(), () => {
      for (const p of this.pallets) this.drawRing(ctx, p)
      for (const p of this.pallets) this.drawArm(ctx, p)
      for (const f of this.flashes) this.drawFlash(ctx, f.at, flashLeft(this.clock - f.born))
    })
  }

  private drawRing(ctx: CanvasRenderingContext2D, { pivot, phase }: Pallet): void {
    ctx.globalAlpha = ringAlpha(phase)
    withDash(ctx, visual.pitch.palletRing, V.color, () => {
      ctx.beginPath()
      ctx.arc(pivot.x, pivot.y, P.ringRadius, 0, TAU)
      ctx.stroke()
    })
    ctx.globalAlpha = 1
  }

  /** The tapered capsule along +x from the origin: a disc of the root radius at the pivot, one of the tip radius at `length`, joined by their common tangents. */
  private armPath(ctx: CanvasRenderingContext2D): void {
    const sa = Math.asin((P.rootRadius - P.tipRadius) / P.length)
    ctx.beginPath()
    ctx.arc(0, 0, P.rootRadius, Math.PI / 2 - sa, -Math.PI / 2 + sa + TAU)
    ctx.arc(P.length, 0, P.tipRadius, -Math.PI / 2 + sa, Math.PI / 2 - sa)
    ctx.closePath()
  }

  private drawArm(ctx: CanvasRenderingContext2D, p: Pallet): void {
    const glow = this.glow(p.id)
    ctx.save()
    ctx.translate(p.pivot.x, p.pivot.y)
    ctx.fillStyle = V.color
    for (const g of ghostsOf(p)) {
      ctx.save()
      ctx.rotate(g.angle)
      ctx.globalAlpha = g.alpha
      this.armPath(ctx)
      ctx.fill()
      ctx.restore()
    }
    ctx.rotate(p.angle)
    this.armPath(ctx)
    if (glow > 0) {
      ctx.globalAlpha = glow * 0.5
      ctx.strokeStyle = V.color
      ctx.lineWidth = V.flash.armGlow * glow
      ctx.lineJoin = 'round'
      ctx.stroke()
    }
    ctx.globalAlpha = V.fillAlpha
    ctx.fill()
    ctx.globalAlpha = V.outlineAlpha
    ctx.strokeStyle = V.outline
    ctx.lineWidth = V.outlineWidth
    ctx.stroke()
    ctx.restore()
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(p.pivot.x, p.pivot.y, V.pivot.radius, 0, TAU)
    ctx.fillStyle = V.pivot.fill
    ctx.fill()
    ctx.strokeStyle = V.outline
    ctx.lineWidth = V.pivot.width
    ctx.stroke()
  }

  /** A swat's radial glow and the ring snapping out from `at`, `left` (1 to 0) of the flash still to play. */
  private drawFlash(ctx: CanvasRenderingContext2D, at: Point, left: number): void {
    const { glowRadius, glowAlpha, ringFrom, ringTo, ringEase, ringWidth } = V.flash
    const g = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, glowRadius)
    g.addColorStop(0, V.outline)
    g.addColorStop(1, clearOf(V.color))
    ctx.globalAlpha = glowAlpha * left
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(at.x, at.y, glowRadius, 0, TAU)
    ctx.fill()
    ctx.globalAlpha = left
    ctx.strokeStyle = V.color
    ctx.lineWidth = ringWidth * left
    ctx.beginPath()
    ctx.arc(at.x, at.y, ringFrom + (ringTo - ringFrom) * (1 - left ** ringEase), 0, TAU)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
}
