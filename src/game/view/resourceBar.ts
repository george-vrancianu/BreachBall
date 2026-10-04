import { modeFor } from '../../sim/mode'
import type { PlayerId } from '../../sim/pitch'
import type { SimEvent, SimState } from '../../sim/step'

/** One side of the Resource bar: the banked Credits, the fraction (0 to 1) of the bar they fill, and the Bullseye Credits earned this match (the digit flashes when it rises). */
export type ResourceSide = { credits: number; share: number; bullseyes: number }
export type ResourceBar = Record<PlayerId, ResourceSide>
/** Bullseye Credits each player has earned this match. */
export type Bullseyes = Record<PlayerId, number>

/** `prev` plus one for each `bullseye-credited` in a tick's events, to the player who earned it. */
export function countBullseyes(prev: Bullseyes, events: readonly SimEvent[]): Bullseyes {
  const next = { ...prev }
  for (const ev of events) if (ev.type === 'bullseye-credited') next[ev.player]++
  return next
}

/** The Resource bar: each player's share of the Credits both hold (banked only, so it moves the moment anyone spends, refunds or is granted). Even when both hold 0. Null where the mode has no Credits economy (Siege), so the bar is hidden. */
export function resourceBar(s: Pick<SimState, 'match' | 'credits'>, bullseyes: Bullseyes = { 1: 0, 2: 0 }): ResourceBar | null {
  if (!modeFor(s.match).hasCredits(s.match)) return null
  const { 1: a, 2: b } = s.credits
  const total = a + b
  return { 1: { credits: a, share: total ? a / total : 0.5, bullseyes: bullseyes[1] }, 2: { credits: b, share: total ? b / total : 0.5, bullseyes: bullseyes[2] } }
}
