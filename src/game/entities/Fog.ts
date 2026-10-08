import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import type { PlayerId, Point } from '../../sim/pitch'
import { Entity } from './Entity'
import { fogOf, type Camera } from './Camera'

/**
 * Top-level, above the world. Hides the opponent's half during a blind opening build.
 * The reveal is `blind` going back to undefined while the map camera shows the whole pitch.
 */
export class Fog extends Entity {
  /** The seat whose half is the only one shown; undefined = nothing hidden. */
  blind?: PlayerId

  /** The pitch range hidden right now (the opponent's half); undefined once nothing is blind. */
  get covered(): { top: number; bottom: number } | undefined {
    return this.blind && fogOf(this.blind)
  }

  /** `shake` is the offset the world is drawn with, so the fog moves with it. */
  constructor(private camera: () => Camera, private shake: () => Point) {
    super()
  }

  protected override render(ctx: CanvasRenderingContext2D): void {
    const cam = this.camera()
    if (this.blind) cam.through(ctx, this.shake(), () => this.cover(ctx, this.covered!))
  }

  /** Draws `entity` again over the fog, clipped to the covered rect, so it shows through the fog without stacking on its own first draw anywhere else. Nothing when nothing is covered. */
  drawOver(ctx: CanvasRenderingContext2D, entity: Entity): void {
    const covered = this.covered
    if (!covered) return
    const { bleed } = visual.fog
    this.camera().through(ctx, this.shake(), () => {
      ctx.save()
      ctx.beginPath()
      ctx.rect(-bleed, covered.top, rules.pitchWidth + 2 * bleed, covered.bottom - covered.top)
      ctx.clip()
      entity.draw(ctx)
      ctx.restore()
    })
  }

  /** Over everything, so neither structures, grid, arc nor the ball betray the other half; the halfway line stays. */
  private cover(ctx: CanvasRenderingContext2D, { top, bottom }: { top: number; bottom: number }): void {
    const { bleed } = visual.fog
    ctx.fillStyle = visual.camera.bg
    ctx.fillRect(-bleed, top, rules.pitchWidth + 2 * bleed, bottom - top)
    ctx.fillStyle = visual.pitch.line
    const line = visual.pitch.centre.widthPx * visual.pitch.unit
    ctx.fillRect(0, rules.halfHeight - line / 2, rules.pitchWidth, line)
  }
}
