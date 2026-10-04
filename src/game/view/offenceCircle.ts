import { rules } from '../../config/rules'
import { modeFor } from '../../sim/mode'
import { type PlayerId } from '../../sim/pitch'
import { canArm, type SimState } from '../../sim/step'

/** One Offence item in the column: `disabled` greys it (cannot be armed now, or `soon` locked), `pressed` marks the armed one. */
export type OffenceItemSpec = { item: 'breaker' | 'overdrive'; label: string; disabled: boolean; pressed: boolean; soon?: boolean }

/** What the Offence circle shows: whether the Breaker is armed (the circle fills), the items to offer, and whether it is the viewer's possession (else the circle and its column are greyed, though the column still opens to look at). */
export type OffenceCircle = { armed: boolean; items: OffenceItemSpec[]; available: boolean; /** Who holds possession, so a column left open closes when it changes hands. */ shooter: PlayerId }

export type OffenceActions = { arm(item: OffenceItemSpec['item']): void }

/** The Breaker's menu label: its Credit price where it is bought (Rounds), else what is left of the stock (Siege). */
const breakerLabel = (s: SimState, viewer: PlayerId) => (modeFor(s.match).paysBreaker(s.match) ? `Breaker · ${rules.breakerCost}` : `Breaker · ${s.players[viewer].inventory.breaker} left`)

export function offenceCircle(s: SimState, viewer: PlayerId, v: { /** The Breaker is armed for the next shot. */ armed: boolean; /** A blocking hold or the map is up. */ blocked?: boolean; /** Whether this device plays a seat (hot-seat: every seat). */ mine(p: PlayerId): boolean }): OffenceCircle {
  // Only the shooter's own play phase is the viewer's possession; a build turn or a pending defence choice is not.
  const available = !s.match.builder && !s.match.choosing && s.possession.shooter === viewer && v.mine(viewer) && !v.blocked
  return {
    armed: v.armed,
    available,
    shooter: s.possession.shooter,
    items: [
      { item: 'breaker', label: breakerLabel(s, viewer), disabled: !available || !canArm(s, viewer), pressed: available && v.armed },
      { item: 'overdrive', label: 'Overdrive', disabled: true, pressed: false, soon: true },
    ],
  }
}
