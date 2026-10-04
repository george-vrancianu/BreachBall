import type { Match } from '../../sim/match'
import { blindSeat, buildPhase, modeFor } from '../../sim/mode'
import type { PlayerId } from '../../sim/pitch'
import { STARTING_INVENTORY, type PowerUp } from '../../sim/player'
import { opponent } from '../../sim/possession'
import { canEdit, canRefund, type SimConfig, type SimState } from '../../sim/step'
import { structuresOf, type Structure } from '../../sim/wall'
import type { Item } from './defenceCircle'
import { resourceBar, type ResourceBar } from './resourceBar'
import { defenceBar, type DefenceBar, type Destroyed } from './defenceBar'

/**
 * One button. `onClick` runs whenever the button is clicked, and the HUD keeps a row alive while its `[label, disabled, pressed]` are unchanged,
 * so a handler must read live state at click time and never close over what was true when it was built. `pressed` marks a toggle that is on (aria-pressed and a filled look).
 */
export type ButtonSpec = { label: string; onClick(): void; disabled?: boolean; pressed?: boolean }

/** The dock variants (see `HudModel.dock`). */
export type Dock = 'build' | 'rearrange' | 'choice' | 'play'

export type HudModel = {
  players: Record<PlayerId, { /** What the big digit shows (Rounds: the score; Siege: remaining structures); null hides it. */ digit: string | null; /** The tower stock badges; null in Rounds, where towers are bought with Credits. */ inventory: Record<PowerUp, number> | null }>
  /** The Defence bar at the far edge: structure counts for both modes, `?` for the blind opponent. */
  defenceBar: DefenceBar
  /** The Resource bar under it: each player's share of the banked Credits; null in Siege, which has none. */
  resourceBar: ResourceBar | null
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
  /** Which dock the viewer gets: `build` (a build turn that places and demolishes), `rearrange` (a build turn that only moves pieces), `choice` (a defence choice is owed), `play`. */
  dock: Dock
  /** The active player's balance for the dock's chip: Credits in Rounds, wall points in a Siege opening build; null where there is none to spend (Siege play). */
  balance: { amount: number; unit: string } | null
  /** Credits one refunded Move point returns; null in modes without refunds (Siege). */
  refundRate: number | null
  /** Phase buttons (Done in a build turn; Repair and Rearrange on a defence choice) shown above the HUD row. The row is rebuilt only when a label or `disabled` flag changes, so handlers must read live state at click time (see `ButtonSpec`). */
  buttons?: ButtonSpec[]
}

/** What the game knows that the sim state does not. `viewer` is the local player (online: the peer's own seat; hot-seat: whoever holds the device), not necessarily the seat shown at the bottom. */
export type HudInputs = { active: PlayerId; viewer: PlayerId; buttons?: ButtonSpec[]; /** The Defence item of the piece the builder is drawing or holds unplaced (red), if any. */ placing?: Item; /** Structures each player has lost in play this match (see `countDestroyed`); defaults to none, so no empty segments. */ destroyed?: Destroyed }

/** The balance chip's short unit: Credits in Rounds, wall points in Siege. */
const BALANCE_UNIT: Record<Match['mode'], string> = { rounds: 'CR', siege: 'PTS' }

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
  const inventoryOf = (p: PlayerId) => (modeFor(s.match).paysTowers(s.match) ? null : p === hidden ? STARTING_INVENTORY : s.players[p].inventory)
  const digitOf = (p: PlayerId) => (p === hidden ? '?' : digit?.[p] ?? null)
  const timed = b || s.match.choosing ? c.buildTime : c.shotClock
  return {
    players: { 1: { digit: digitOf(1), inventory: inventoryOf(1) }, 2: { digit: digitOf(2), inventory: inventoryOf(2) } },
    defenceBar: defenceBar(s.objects, v.destroyed ?? { 1: 0, 2: 0 }, hidden),
    resourceBar: resourceBar(s),
    active: v.active,
    round: roundOf(s.match),
    rounds: c.rounds,
    clock: timed ? { seconds: s.clock.left / c.tickHz, fraction: s.clock.left / (timed * c.tickHz) } : null,
    shotsLeft: s.possession.shots,
    shotsMax: c.shots,
    refundable: canRefund(s, v.active),
    score: s.match.mode === 'rounds' ? `${s.match.score[v.active]}–${s.match.score[opponent(v.active)]}` : null,
    phase: buildPhase(s.match) === 'Rearrange' ? 'Rearrange' : v.placing ? PLACING[v.placing] : b ? 'Build phase' : aimHint(s, c) ? 'Play phase · Drag to aim' : 'Play phase',
    dock: b ? (canEdit(s) ? 'build' : 'rearrange') : s.match.choosing ? 'choice' : 'play',
    balance: modeFor(s.match).hasCredits(s.match) || (b && canEdit(s)) ? { amount: s.credits[v.active], unit: BALANCE_UNIT[s.match.mode] } : null,
    refundRate: modeFor(s.match).mayRefund(s.match) ? c.refundRate : null,
    buttons: v.buttons,
  }
}
