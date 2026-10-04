import { visual } from '../../config/visual'

/** How a label is drawn: font size and weight (the HUD font unless `font`), colour and alpha, whether it turns upright for Player 2, and an extra scale. */
export type LabelStyle = { size: number; weight: number; font?: string; color: string; alpha?: number; flipped: boolean; scale?: number }

/** A label with a decimal point, laid out as its two runs and a disc between them: x is each part's left edge (the dot's centre), relative to the label's centre. */
export type DecimalLayout = { left: { text: string; x: number }; dot: { x: number; r: number }; right: { text: string; x: number } }

/** Splits `text` at its point, `width` measuring a run, the disc `r` in radius with `gap` each side; none when `text` has no point. All in one unit. */
export function decimalLayout(text: string, width: (run: string) => number, r: number, gap: number): DecimalLayout | undefined {
  const i = text.indexOf('.')
  if (i < 0) return undefined
  const [left, right] = [text.slice(0, i), text.slice(i + 1)]
  const [lw, rw] = [width(left), width(right)]
  const total = lw + gap + 2 * r + gap + rw
  const x0 = -total / 2
  return { left: { text: left, x: x0 }, dot: { x: x0 + lw + gap + r, r }, right: { text: right, x: x0 + lw + gap + 2 * r + gap } }
}

/** Centred text at `at` in world units, turned half a revolution on its own (the canvas layer itself may not turn, in Tabletop mode) when `style.flipped` so it reads upright for Player 2. */
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
  const { radiusEm, gapEm, dropEm } = visual.decimalPoint
  const split = decimalLayout(text, (run) => ctx.measureText(run).width, radiusEm * style.size, gapEm * style.size)
  if (split) {
    // The point is a disc so it reads at phone size, not a font's tiny dot (or a full tabular cell).
    ctx.textAlign = 'left'
    ctx.fillText(split.left.text, split.left.x, 0)
    ctx.fillText(split.right.text, split.right.x, 0)
    ctx.beginPath()
    ctx.arc(split.dot.x, dropEm * style.size, split.dot.r, 0, Math.PI * 2)
    ctx.fill()
  } else ctx.fillText(text, 0, 0)
  ctx.restore()
}
