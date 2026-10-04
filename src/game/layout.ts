import type { Point } from '../sim/pitch'

/** An axis-aligned rectangle: its centre and its size, in whatever unit the caller works in. */
export type Rect = { x: number; y: number; w: number; h: number }

/** Whether two rectangles share area (touching edges do not count). */
export const overlaps = (a: Rect, b: Rect): boolean => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h

/** The box of centred `text` at `at`: `glyphEm` (of the font size) wide per character, one `size` high. */
export const textRect = (at: Point, text: string, size: number, glyphEm: number): Rect => ({ x: at.x, y: at.y, w: text.length * size * glyphEm, h: size })

/** A badge's spot, as an offset from its ball. */
export type Spot = { dx: number; dy: number }

/** Where the `badge` (its box size) goes by `ball`: the first of `spots` where it overlaps none of `avoid`, else the first spot. */
export function placeBadge(ball: Point, badge: { w: number; h: number }, spots: Spot[], avoid: Rect[]): Point {
  const at = ({ dx, dy }: Spot) => ({ x: ball.x + dx, y: ball.y + dy })
  const clear = spots.find((s) => !avoid.some((r) => overlaps({ ...at(s), w: badge.w, h: badge.h }, r))) ?? spots[0]
  return at(clear)
}
