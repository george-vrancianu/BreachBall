import type { PlayerId } from '../../sim/pitch'
import type { SimEvent } from '../../sim/step'
import { structuresOf, type Structure } from '../../sim/wall'

/** One side of the Defence bar: the end digit and its segments, innermost first (filled = a structure standing). */
export type DefenceSide = { count: string; segments: boolean[] }
export type DefenceBar = Record<PlayerId, DefenceSide>

/** Structures each player has lost in play this match (broken, or a Steal tower sprung), which is what leaves empty segments. A piece the owner takes back is not counted. Reset on a new match. */
export type Destroyed = Record<PlayerId, number>

/** `destroyed` plus one for each structure the events destroyed, by owner. */
export function countDestroyed(prev: Destroyed, events: readonly SimEvent[]): Destroyed {
  const next = { ...prev }
  for (const ev of events) {
    if (ev.type === 'wall-destroyed') next[ev.wall.owner]++
    else if (ev.type === 'steal-triggered') next[ev.owner]++
  }
  return next
}

/**
 * The Defence bar: per player, a segment for each structure standing plus one for each destroyed in play. Structures only, towers included, never their hit points,
 * so Siege and Rounds read the same. A destroyed structure empties the outermost segment; one the owner takes back just goes. `hidden` is the seat whose build the viewer must not see yet (the blind opening build): "?" and no segments.
 */
export function defenceBar(objects: readonly Structure[], destroyed: Destroyed, hidden: PlayerId | null): DefenceBar {
  const side = (p: PlayerId): DefenceSide => {
    if (p === hidden) return { count: '?', segments: [] }
    const standing = structuresOf(objects, p).length
    return { count: String(standing), segments: Array.from({ length: standing + destroyed[p] }, (_, i) => i < standing) }
  }
  return { 1: side(1), 2: side(2) }
}
