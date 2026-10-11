import type { CSSProperties } from 'react'
import { visual } from '../../config/visual'
import { EDGES, physicalEdges, type Edge } from '../../game/view/physicalEdges'

/** The custom properties the HUD layer sets: `--safe-top` and the rest hold the device inset of the physical edge that HUD side sits on (read them with `safeInset`). */
export function safeAreaVars(hudAngle: number): Record<`--safe-${Edge}`, string> {
  const edge = physicalEdges(hudAngle)
  return Object.fromEntries(EDGES.map((s) => [`--safe-${s}`, `env(safe-area-inset-${edge[s]}, 0px)`])) as Record<`--safe-${Edge}`, string>
}

/** A HUD side's safe-area inset, as the CSS reference to the variable the HUD layer sets (0 where no layer sets it). */
export const safeInset = (side: Edge): string => `var(--safe-${side}, 0px)`

/** `px` in from the far edge, measured from the safe area: the layer's top, or its bottom when `flipped`. */
export const farEdge = (flipped: boolean, px: number): CSSProperties => (flipped ? { bottom: `calc(${safeInset('bottom')} + ${px}px)` } : { top: `calc(${safeInset('top')} + ${px}px)` })

/** Padding of at least `px`, and at least the side's inset. */
export const safePad = (px: number, side: Edge): string => `max(${px}px, ${safeInset(side)})`

/** Left and right padding of at least `px`, and at least the side's inset. */
export const safeInline = (px: number): CSSProperties => ({ paddingLeft: safePad(px, 'left'), paddingRight: safePad(px, 'right') })

/** How far in from the far edge the minimap chip (top-left) and the ☰ button (top-right) sit: just inside the Defence bar, and the Resource bar when it is shown. */
export const underBars = (resourceBar: boolean): number => visual.hud.bar.heightPx + (resourceBar ? visual.hud.bar.resourceRowPx : 0) + visual.sideMenu.buttonInsetPx

/** Where a corner chip sits: `underBars` in from the far edge (the stage's bottom when `flipped`) and `buttonInsetPx` in from the side, both measured from the safe area, so the chip clears the notch or status bar the HUD layer's turn puts there. */
export const cornerPos = (flipped: boolean, resourceBar: boolean, side: Extract<Edge, 'left' | 'right'>): CSSProperties => ({ ...farEdge(flipped, underBars(resourceBar)), [side]: `calc(${safeInset(side)} + ${visual.sideMenu.buttonInsetPx}px)` })
