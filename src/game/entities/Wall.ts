import { wallSegments } from '../../sim/wall'
import { drawSegments, Fixture, type WallData } from './Fixture'

export class Wall extends Fixture<WallData> {
  protected drawBody(ctx: CanvasRenderingContext2D, fill?: string): void {
    drawSegments(ctx, wallSegments(this.data), this.data.owner, fill)
    this.drawCracks(ctx)
  }

  protected footprint() {
    return wallSegments(this.data)
  }

  /** A rectangle turned with the wall, `pad` clear of the segment on every side (the segment's ends included). */
  protected override outlinePath(ctx: CanvasRenderingContext2D, pad: number): void {
    for (const { a, b } of this.footprint()) {
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const [ux, uy] = [((b.x - a.x) / len) * pad, ((b.y - a.y) / len) * pad]
      const [nx, ny] = [-uy, ux]
      ctx.moveTo(a.x - ux + nx, a.y - uy + ny)
      ctx.lineTo(b.x + ux + nx, b.y + uy + ny)
      ctx.lineTo(b.x + ux - nx, b.y + uy - ny)
      ctx.lineTo(a.x - ux - nx, a.y - uy - ny)
      ctx.closePath()
    }
  }
}
