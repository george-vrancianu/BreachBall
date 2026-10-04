import { visual } from '../../config/visual'

/** How a label is drawn: font size and weight (the HUD font unless `font`), colour and alpha, whether it turns upright for Player 2, and an extra scale. */
export type LabelStyle = { size: number; weight: number; font?: string; color: string; alpha?: number; flipped: boolean; scale?: number }

/** Centred text at `at` in world units, turned half a revolution with the canvas when `style.flipped` so it reads upright for Player 2. */
export function drawLabel(ctx: CanvasRenderingContext2D, text: string, at: { x: number; y: number }, style: LabelStyle): void {
  ctx.save()
  ctx.translate(at.x, at.y)
  if (style.flipped) ctx.rotate(Math.PI)
  if (style.scale) ctx.scale(style.scale, style.scale)
  ctx.font = `${style.weight} ${style.size}px ${style.font ?? visual.hud.font}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.globalAlpha = style.alpha ?? 1
  ctx.fillStyle = style.color
  ctx.fillText(text, 0, 0)
  ctx.restore()
}
