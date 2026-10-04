import type { Point } from '../sim/pitch'

/** An axis-aligned rectangle: its centre and its size, in whatever unit the caller works in. */
export type Rect = { x: number; y: number; w: number; h: number }

/** Whether two rectangles share area (touching edges do not count). */
export const overlaps = (a: Rect, b: Rect): boolean => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h

/** The box of centred `text` at `at`: `glyphEm` (of the font size) wide per character, one `size` high. */
export const textRect = (at: Point, text: string, size: number, glyphEm: number): Rect => ({ x: at.x, y: at.y, w: text.length * size * glyphEm, h: size })

/** A candidate spot for a label, as an offset from its anchor. */
export type Candidate = { dx: number; dy: number }

/** Where a label (`box`, its size) goes by `anchor`: the first of `spots` where it overlaps none of `avoid`, else the first spot. */
export function placeClear(anchor: Point, box: { w: number; h: number }, spots: Candidate[], avoid: Rect[]): Point {
  const at = ({ dx, dy }: Candidate) => ({ x: anchor.x + dx, y: anchor.y + dy })
  const clear = spots.find((s) => !avoid.some((r) => overlaps({ ...at(s), w: box.w, h: box.h }, r))) ?? spots[0]
  return at(clear)
}
