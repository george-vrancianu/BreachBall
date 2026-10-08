export type Side = 'top' | 'right' | 'bottom' | 'left'

const SIDES: Side[] = ['top', 'right', 'bottom', 'left']
const OPPOSITE: Record<Side, Side> = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' }

/**
 * The physical screen edge each side of the HUD layer sits on, so its elements pad by that edge's safe-area inset (notch, status bar, home indicator), not their own side's.
 * Upright, a side is its own edge; turned half way round (Tabletop mode with the HUD at Player 2, or the whole-stage flip), each side is the opposite edge. The swap is at the half turn, which in the Tabletop slide falls in the gap where the Dock, strips and chips are hidden.
 */
export function safeInsets(hudAngle: number): Record<Side, Side> {
  const a = ((hudAngle % 360) + 360) % 360
  const turned = a > 90 && a < 270
  return Object.fromEntries(SIDES.map((s) => [s, turned ? OPPOSITE[s] : s])) as Record<Side, Side>
}

/** The custom properties the HUD layer sets: `--safe-top` and the rest hold the device inset of the physical edge that HUD side sits on (read them with `inset`). */
export function safeAreaVars(hudAngle: number): Record<`--safe-${Side}`, string> {
  const edge = safeInsets(hudAngle)
  return Object.fromEntries(SIDES.map((s) => [`--safe-${s}`, `env(safe-area-inset-${edge[s]}, 0px)`])) as Record<`--safe-${Side}`, string>
}

/** A HUD side's safe-area inset, as the CSS reference to the variable the HUD layer sets (0 where no layer sets it). */
export const inset = (side: Side): string => `var(--safe-${side}, 0px)`
