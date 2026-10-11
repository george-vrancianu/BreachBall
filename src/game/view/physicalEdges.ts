export type Edge = 'top' | 'right' | 'bottom' | 'left'

export const EDGES: Edge[] = ['top', 'right', 'bottom', 'left']
const OPPOSITE: Record<Edge, Edge> = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' }

/**
 * The physical screen edge each side of the HUD layer sits on, so its elements pad by that edge's safe-area inset (notch, status bar, home indicator), not their own side's.
 * Upright, a side is its own edge; turned half way round (Tabletop mode with the HUD at Player 2, or the whole-stage flip), each side is the opposite edge. This only maps an angle; when the swap happens is the caller's choice (see `safeAngle` in `stageLayers`).
 */
export function physicalEdges(hudAngle: number): Record<Edge, Edge> {
  const a = ((hudAngle % 360) + 360) % 360
  const turned = a > 90 && a < 270
  return Object.fromEntries(EDGES.map((s) => [s, turned ? OPPOSITE[s] : s])) as Record<Edge, Edge>
}
