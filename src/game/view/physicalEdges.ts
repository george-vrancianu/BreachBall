export type Side = 'top' | 'right' | 'bottom' | 'left'

const SIDES: Side[] = ['top', 'right', 'bottom', 'left']
const OPPOSITE: Record<Side, Side> = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' }

/**
 * The physical screen edge each side of the HUD layer sits on, so its elements pad by that edge's safe-area inset (notch, status bar, home indicator), not their own side's.
 * Upright, a side is its own edge; turned half way round (Tabletop mode with the HUD at Player 2, or the whole-stage flip), each side is the opposite edge. This only maps an angle; when the swap happens is the caller's choice (see `safeAngle` in App).
 */
export function physicalEdges(hudAngle: number): Record<Side, Side> {
  const a = ((hudAngle % 360) + 360) % 360
  const turned = a > 90 && a < 270
  return Object.fromEntries(SIDES.map((s) => [s, turned ? OPPOSITE[s] : s])) as Record<Side, Side>
}
