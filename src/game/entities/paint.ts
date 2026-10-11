import { visual } from '../../config/visual'

/** A dash pattern in reference px, scaled to world units. */
export const dashed = (dashPx: readonly number[]): number[] => dashPx.map((d) => d * visual.pitch.unit)

/** Runs `strokes` with a `style` dash and width in `color`, then clears the dash: the keep-out arc and the Activation rings (the Pitch's, and each Pallet's own). */
export function withDash(ctx: CanvasRenderingContext2D, style: { widthPx: number; dashPx: readonly number[] }, color: string, strokes: () => void): void {
  ctx.setLineDash(dashed(style.dashPx))
  ctx.strokeStyle = color
  ctx.lineWidth = style.widthPx * visual.pitch.unit
  strokes()
  ctx.setLineDash([])
}

// A `#rrggbb` colour made fully transparent, for a gradient that fades out tinted rather than through black.
export const clearOf = (color: string): string => `${color}00`
