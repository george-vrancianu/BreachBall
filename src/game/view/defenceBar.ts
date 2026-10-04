import type { PlayerId } from '../../sim/pitch'
import { structuresOf, type Structure } from '../../sim/wall'

/** One side of the Defence bar: the end digit and its segments, innermost first (filled = a structure standing). */
export type DefenceSide = { count: string; segments: boolean[] }
export type DefenceBar = Record<PlayerId, DefenceSide>

/** The most structures each player has stood in this match, which sets how many segments their bar has. Destroyed structures leave the board, so the view carries this forward; reset it on a new match. */
export function growSlots(prev: Record<PlayerId, number>, objects: readonly Structure[]): Record<PlayerId, number> {
  return { 1: Math.max(prev[1], structuresOf(objects, 1).length), 2: Math.max(prev[2], structuresOf(objects, 2).length) }
}

/**
 * The Defence bar: per player, a segment for each structure they have stood and the count still standing. Structures only, towers included, never their hit points,
 * so Siege and Rounds read the same. A destroyed structure empties the outermost segment. `hidden` is the seat whose build the viewer must not see yet (the blind opening build): "?" and no segments.
 */
export function defenceBar(objects: readonly Structure[], slots: Record<PlayerId, number>, hidden: PlayerId | null): DefenceBar {
  const side = (p: PlayerId): DefenceSide => {
    if (p === hidden) return { count: '?', segments: [] }
    const standing = structuresOf(objects, p).length
    return { count: String(standing), segments: Array.from({ length: Math.max(slots[p], standing) }, (_, i) => i < standing) }
  }
  return { 1: side(1), 2: side(2) }
}
