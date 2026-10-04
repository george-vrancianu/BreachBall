import { rules } from '../../config/rules'
import { modeFor } from '../../sim/mode'
import type { PlayerId } from '../../sim/pitch'
import { opponent, whoActs } from '../../sim/possession'
import { canJam, canSubterfuge, type SimState, type SubterfugeItem } from '../../sim/step'

/** One Subterfuge item in the circle's column: `when` is what its pill says about when it lands; `disabled` greys it (no Credits, one already queued, or not built yet, `soon`). */
export type SubterfugeSpec = { item: SubterfugeItem | 'soon1' | 'soon2'; label: string; when: string; disabled: boolean; soon?: boolean }

/** A Subterfuge item waiting against `against`'s next possession, bought by `by`: drawn as a small icon for both players until it lands. */
export type QueuedItem = { item: SubterfugeItem; by: PlayerId; against: PlayerId }

/** What the Subterfuge circle shows: the items to offer, whether the viewer may buy one now (else the circle is greyed), and what is queued on either side. */
export type SubterfugeCircle = { items: SubterfugeSpec[]; available: boolean; queued: QueuedItem[] }

/** The Subterfuge circle's model; undefined in a mode with no Credits economy (Siege), where there is no circle. */
export function subterfugeCircle(s: SimState, viewer: PlayerId, v: { /** A blocking hold or the map is up. */ blocked?: boolean; /** Whether this device plays a seat (hot-seat: always). */ mine(p: PlayerId): boolean }): SubterfugeCircle | undefined {
  if (!modeFor(s.match).maySubterfuge(s.match)) return undefined
  const queued = ([1, 2] as PlayerId[]).flatMap((against): QueuedItem[] => {
    const item = s.subterfuge.queued[against]
    return item ? [{ item, by: opponent(against), against }] : []
  })
  return {
    items: [
      { item: 'jam', label: `Jam · ${rules.jamCost}`, when: 'next possession', disabled: !canJam(s, viewer) },
      { item: 'soon1', label: 'Soon', when: '', disabled: true, soon: true },
      { item: 'soon2', label: 'Soon', when: '', disabled: true, soon: true },
    ],
    // Outside the viewer's own turn (or with this turn's Subterfuge already bought) the circle opens greyed out.
    available: whoActs(s) === viewer && v.mine(viewer) && !v.blocked && canSubterfuge(s, viewer),
    queued,
  }
}
