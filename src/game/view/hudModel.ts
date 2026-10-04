import type { Match } from '../../sim/match'
import { blindSeat, buildPhase } from '../../sim/mode'
import type { PlayerId } from '../../sim/pitch'
import { STARTING_INVENTORY, type PowerUp } from '../../sim/player'
import { opponent } from '../../sim/possession'
import { canRefund, type SimConfig, type SimState } from '../../sim/step'
import { structuresOf, type Structure } from '../../sim/wall'
import type { Item } from './defenceCircle'

/**
 * One button. `onClick` runs whenever the button is clicked, and the HUD keeps a row alive while its `[label, disabled, pressed]` are unchanged,
 * so a handler must read live state at click time and never close over what was true when it was built. `pressed` marks a toggle that is on (aria-pressed and a filled look).
 */
export type ButtonSpec = { label: string; onClick(): void; disabled?: boolean; pressed?: boolean }

export type HudModel = {
  players: Record<PlayerId, { /** What the big digit shows (Rounds: the score; Siege: remaining structures); null hides it. */ digit: string | null; inventory: Record<PowerUp, number> }>
  /** Whose turn it is; their controls go to the bottom. */
  active: PlayerId
  /** Null in modes without rounds. */
  round: number | null
  rounds: number
  /** Seconds left and fraction of the clock remaining, or null when no clock runs. */
  clock: { seconds: number; fraction: number } | null
  /** Move points: left, and per possession. */
  shotsLeft: number
  shotsMax: number
  /** The active player may tap a Move point dot to refund it now. */
  refundable: boolean
  /** The score as `2–1`, the active player's first; null in modes without rounds, which show a structure count instead. */
  score: string | null
  /** The phase label: Build phase, Play phase, Rearrange or Placing …, and `· Drag to aim` while the first-play hint would show. */
  phase: string
  /** Phase buttons (Done in a build turn; Repair and Rearrange on a defence choice) shown above the HUD row. The row is rebuilt only when a label or `disabled` flag changes, so handlers must read live state at click time (see `ButtonSpec`). */
  buttons?: ButtonSpec[]
}

/** What the game knows that the sim state does not. `viewer` is the local player (online: the peer's own seat; hot-seat: whoever holds the device), not necessarily the seat shown at the bottom. */
export type HudInputs = { active: PlayerId; viewer: PlayerId; buttons?: ButtonSpec[]; /** The Defence item of the piece the builder is drawing or holds unplaced (red), if any. */ placing?: Item }

const PLACING: Record<Item, string> = { wall: 'Placing wall', repulsor: 'Placing Repulsor', steal: 'Placing Steal' }

/** The round number for modes that have rounds, else null; the first-play hints show on round 1. */
export function roundOf(m: Match): number | null {
  switch (m.mode) {
    case 'rounds':
      return m.round
    case 'siege':
      return null
    default:
      return m satisfies never
  }
}

/** What the big digit shows, per mode. A new mode adds a case; the `never` arm makes the compiler point at this spot. `null` = the mode has no such thing, so the HUD drops it. */
function digitsOf(m: Match, objects: readonly Structure[]): Record<PlayerId, string> | null {
  switch (m.mode) {
    case 'rounds':
      return { 1: String(m.score[1]), 2: String(m.score[2]) }
    case 'siege':
      // Every structure counts, towers included; derived from the board so repairs and rearranging need no extra state.
      return { 1: String(structuresOf(objects, 1).length), 2: String(structuresOf(objects, 2).length) }
    default:
      return m satisfies never
  }
}

/** The first-play hints (here and in the turn card) show only on round 1. */
export const isFirstRound = (round: number | null | undefined): boolean => round === 1

/** The first-play hint is up: round 1, a shot still to be aimed from a placed ball. */
const aimHint = (s: SimState, c: SimConfig): boolean => isFirstRound(roundOf(s.match)) && !s.match.builder && !s.match.choosing && !s.possession.inHand && !s.possession.live && s.possession.shots === c.shots

export function hudModel(s: SimState, c: SimConfig, v: HudInputs): HudModel {
  const b = s.match.builder
  const digit = digitsOf(s.match, s.objects)
  // Blind opening build: the viewer's opponent's count is a guess, not information.
  const hidden = blindSeat(s.match, v.viewer) ? opponent(v.viewer) : null
  const inventoryOf = (p: PlayerId) => (p === hidden ? STARTING_INVENTORY : s.players[p].inventory)
  const digitOf = (p: PlayerId) => (p === hidden ? '?' : digit?.[p] ?? null)
  const timed = b || s.match.choosing ? c.buildTime : c.shotClock
  return {
    players: { 1: { digit: digitOf(1), inventory: inventoryOf(1) }, 2: { digit: digitOf(2), inventory: inventoryOf(2) } },
    active: v.active,
    round: roundOf(s.match),
    rounds: c.rounds,
    clock: timed ? { seconds: s.clock.left / c.tickHz, fraction: s.clock.left / (timed * c.tickHz) } : null,
    shotsLeft: s.possession.shots,
    shotsMax: c.shots,
    refundable: canRefund(s, v.active),
    score: s.match.mode === 'rounds' ? `${s.match.score[v.active]}–${s.match.score[opponent(v.active)]}` : null,
    phase: buildPhase(s.match) === 'Rearrange' ? 'Rearrange' : v.placing ? PLACING[v.placing] : b ? 'Build phase' : aimHint(s, c) ? 'Play phase · Drag to aim' : 'Play phase',
    buttons: v.buttons,
  }
}
