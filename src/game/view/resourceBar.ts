import { modeFor } from '../../sim/mode'
import type { PlayerId } from '../../sim/pitch'
import type { SimState } from '../../sim/step'

/** One side of the Resource bar: the banked Credits and the fraction (0 to 1) of the bar they fill. */
export type ResourceSide = { credits: number; share: number }
export type ResourceBar = Record<PlayerId, ResourceSide>

/** The Resource bar: each player's share of the Credits both hold (banked only, so it moves the moment anyone spends, refunds or is granted). Even when both hold 0. Null where the mode has no Credits economy (Siege), so the bar is hidden. */
export function resourceBar(s: Pick<SimState, 'match' | 'credits'>): ResourceBar | null {
  if (!modeFor(s.match).hasCredits(s.match)) return null
  const { 1: a, 2: b } = s.credits
  const total = a + b
  return { 1: { credits: a, share: total ? a / total : 0.5 }, 2: { credits: b, share: total ? b / total : 0.5 } }
}
