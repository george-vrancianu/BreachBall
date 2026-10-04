import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import { cellToWorld } from '../../sim/pitch'
import { vertexToWorld, type TowerPower } from '../../sim/wall'
import { Fixture, ownerFill, type TowerData } from './Fixture'
import { drawTowerBody } from './wallPaint'

const GLYPHS: Record<TowerPower, (ctx: CanvasRenderingContext2D, x: number, y: number, spent: boolean) => void> = {
  // Concentric rings; dimmed once spent for the shot.
  repulsor(ctx, x, y, spent) {
    ctx.globalAlpha = spent ? visual.tower.spentAlpha : 1
    for (const r of visual.tower.rings) {
      ctx.beginPath()
      ctx.arc(x + rules.cellSize / 2, y + rules.cellSize / 2, r, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  },
  // Vortex: a spiral of two turns.
  steal(ctx, x, y) {
    const { turns, step, grow } = visual.tower.spiral
    ctx.beginPath()
    for (let a = 0; a <= turns; a += step) ctx.lineTo(x + rules.cellSize / 2 + Math.cos(a) * a * grow, y + rules.cellSize / 2 + Math.sin(a) * a * grow)
    ctx.stroke()
  },
}

/** A square in the owner's colour with its power-up glyph inset. */
export class Tower extends Fixture<TowerData> {
  /** The clock when the Repulsor fired; undefined when not glowing. */
  private pulsedAt?: number

  /** Repulsor fire effect: a glow over the tower and rings bursting outward for `visual.tower.glowMs`. */
  pulse(): void {
    this.pulsedAt = this.clock
  }

  get glowing(): boolean {
    return this.pulsedAt !== undefined && this.clock - this.pulsedAt < visual.tower.glowMs
  }

  protected drawBody(ctx: CanvasRenderingContext2D, fill?: string): void {
    const d = this.data
    const { cellSize } = rules
    const { x, y } = vertexToWorld(d.at)
    drawTowerBody(ctx, x, y, fill ?? ownerFill(ctx, d.owner), this.flipped)
    ctx.strokeStyle = visual.tower.outline
    ctx.lineWidth = visual.tower.outlineWidth
    ctx.strokeRect(x, y, cellSize, cellSize)
    ctx.lineWidth = visual.tower.innerWidth
    const inset = visual.tower.innerInset
    ctx.strokeRect(x + inset, y + inset, cellSize - 2 * inset, cellSize - 2 * inset)
    GLYPHS[d.power](ctx, x, y, !!d.spent)
    this.drawCracks(ctx)
  }

  protected footprint() {
    const a = vertexToWorld(this.data.at)
    return [{ a, b: { x: a.x + rules.cellSize, y: a.y + rules.cellSize } }]
  }

  protected override drawEffect(ctx: CanvasRenderingContext2D): void {
    if (!this.glowing) return
    const k = (this.clock - this.pulsedAt!) / visual.tower.glowMs
    const { x: cx, y: cy } = cellToWorld({ cx: this.data.at.gx, cy: this.data.at.gy })
    ctx.globalAlpha = 1 - k
    ctx.fillStyle = visual.tower.glow
    ctx.fillRect(cx - rules.cellSize / 2, cy - rules.cellSize / 2, rules.cellSize, rules.cellSize)
    ctx.strokeStyle = visual.tower.glow
    ctx.lineWidth = visual.tower.pulse.lineWidth
    for (const r of visual.tower.rings) {
      ctx.beginPath()
      ctx.arc(cx, cy, r + k * visual.tower.pulse.grow, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
}
