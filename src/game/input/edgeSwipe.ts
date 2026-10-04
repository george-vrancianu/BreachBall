import { visual } from '../../config/visual'
import type { Point } from '../../sim/pitch'

/** A press this close to the viewer's left edge (canvas-local px: the stage turns with the hot-seat flip, so it is always the viewer's left) is a Side menu swipe candidate: it starts no pan, aim or piece drag. */
export const startsAtEdge = (x: number): boolean => x <= visual.sideMenu.edgePx

/** The swipe is made once the pointer has travelled `swipePx` inward from the edge press, more across than along. */
export function swipedIn(from: Point, at: Point): boolean {
  const [dx, dy] = [at.x - from.x, at.y - from.y]
  return dx >= visual.sideMenu.swipePx && dx > Math.abs(dy)
}
