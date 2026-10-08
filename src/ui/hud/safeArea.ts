import type { CSSProperties } from 'react'
import { physicalEdges, type Side } from '../../game/view/physicalEdges'

const SIDES: Side[] = ['top', 'right', 'bottom', 'left']

/** The custom properties the HUD layer sets: `--safe-top` and the rest hold the device inset of the physical edge that HUD side sits on (read them with `safeInset`). */
export function safeAreaVars(hudAngle: number): Record<`--safe-${Side}`, string> {
  const edge = physicalEdges(hudAngle)
  return Object.fromEntries(SIDES.map((s) => [`--safe-${s}`, `env(safe-area-inset-${edge[s]}, 0px)`])) as Record<`--safe-${Side}`, string>
}

/** A HUD side's safe-area inset, as the CSS reference to the variable the HUD layer sets (0 where no layer sets it). */
export const safeInset = (side: Side): string => `var(--safe-${side}, 0px)`

/** `px` in from the far edge, measured from the safe area: the layer's top, or its bottom when `flipped`. */
export const farEdge = (flipped: boolean, px: number): CSSProperties => (flipped ? { bottom: `calc(${safeInset('bottom')} + ${px}px)` } : { top: `calc(${safeInset('top')} + ${px}px)` })

/** Left and right padding of at least `px`, and at least the side's inset. */
export const safeInline = (px: number): CSSProperties => ({ paddingLeft: `max(${px}px, ${safeInset('left')})`, paddingRight: `max(${px}px, ${safeInset('right')})` })
