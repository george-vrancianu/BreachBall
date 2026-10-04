import { visual } from '../../config/visual'

/** Centred text at `at` in world units, turned half a revolution with the canvas when `flipped` so it reads upright for Player 2. */
export function drawLabel(ctx: CanvasRenderingContext2D, text: string, at: { x: number; y: number }, o: { size: number; weight: number; font?: string; color: string; alpha?: number; flipped: boolean; scale?: number }): void {
  ctx.save()
  ctx.translate(at.x, at.y)
  if (o.flipped) ctx.rotate(Math.PI)
  if (o.scale) ctx.scale(o.scale, o.scale)
  ctx.font = `${o.weight} ${o.size}px ${o.font ?? visual.hud.font}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.globalAlpha = o.alpha ?? 1
  ctx.fillStyle = o.color
  ctx.fillText(text, 0, 0)
  ctx.restore()
}
