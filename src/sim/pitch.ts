import { rules } from '../config/rules'
// World coordinates: x 0..WIDTH left to right, y 0..HEIGHT top to bottom.
// Player 2 owns the top half and defends the goal at y=0; player 1 owns the bottom half and defends y=HEIGHT.
export type PlayerId = 1 | 2
export type Point = { x: number; y: number }
export type Cell = { cx: number; cy: number }

/** The player whose half contains y, or null exactly on the halfway line. */
export function halfOf(y: number): PlayerId | null {
  if (y === rules.halfHeight) return null
  return y < rules.halfHeight ? 2 : 1
}

/** World centre of a grid cell. */
export function cellToWorld({ cx, cy }: Cell): Point {
  return { x: (cx + 0.5) * rules.cellSize, y: (cy + 0.5) * rules.cellSize }
}

export function worldToCell({ x, y }: Point): Cell {
  return { cx: Math.floor(x / rules.cellSize), cy: Math.floor(y / rules.cellSize) }
}

/** The owner of the goal whose line the segment from -> to crosses inside the mouth, else null. */
export function goalCrossed(from: Point, to: Point): PlayerId | null {
  const top = from.y > 0 && to.y <= 0
  if (!top && !(from.y < rules.pitchHeight && to.y >= rules.pitchHeight)) return null
  const lineY = top ? 0 : rules.pitchHeight
  const x = from.x + ((lineY - from.y) / (to.y - from.y)) * (to.x - from.x)
  if (x < rules.goalLeft || x > rules.goalRight) return null
  return top ? 2 : 1
}
