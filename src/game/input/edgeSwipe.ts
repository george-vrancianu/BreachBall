import { visual } from '../../config/visual'
import type { Point } from '../../sim/pitch'

/**
 * A press this close to the viewer's left edge is a Side menu swipe candidate: it starts no pan, aim or piece drag. In canvas-local px (`width` the canvas layer's), where the
 * viewer's left is the canvas layer's left whenever the canvas layer and the HUD layer turn together (the flip), and its right when `across` (Tabletop mode, seat 2: the HUD is turned and the canvas is not).
 */
export const startsAtEdge = (x: number, width: number, across = false): boolean => (across ? x >= width - visual.sideMenu.edgePx : x <= visual.sideMenu.edgePx)

/** The swipe is made once the pointer has travelled `swipePx` inward from the edge press, more across than along. `across` mirrors it, as for `startsAtEdge`. */
export function swipedIn(from: Point, at: Point, across = false): boolean {
  const [dx, dy] = [(across ? -1 : 1) * (at.x - from.x), at.y - from.y]
  return dx >= visual.sideMenu.swipePx && dx > Math.abs(dy)
}
