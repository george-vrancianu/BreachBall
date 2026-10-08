import type { Match } from '../../sim/match'
import { blindSeat, buildPhase, modeFor } from '../../sim/mode'
import type { PlayerId } from '../../sim/pitch'
import { STARTING_INVENTORY, type PowerUp } from '../../sim/player'
import { opponent } from '../../sim/possession'
import { canEdit, canRefund, type SimConfig, type SimState } from '../../sim/step'
import { structuresOf, type Structure } from '../../sim/wall'
import type { Item } from './defenceCircle'
import { UNITS } from './units'
import { resourceBar, type Bullseyes, type ResourceBar } from './resourceBar'
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
  /** The active player may tap a Move point dot to refund it now (not behind a hold or the Side menu). */
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
  /** The first-round coaching line for the pill above the dock; absent after round 1 or once the player has acted. */
  hint?: string
}

/** What the game knows that the sim state does not. `viewer` is the local player (online: the peer's own seat; hot-seat: whoever holds the device), not necessarily the seat shown at the bottom. */
export type HudInputs = { active: PlayerId; /** A blocking hold or the Side menu is up: the board ignores input, so Refund is greyed. */ blocked?: boolean; viewer: PlayerId; buttons?: ButtonSpec[]; /** The Defence item of the piece the builder is drawing or holds unplaced (red), if any. */ placing?: Item; /** Structures each player has lost in play this match (see `countDestroyed`); defaults to none, so no empty segments. */ destroyed?: Destroyed; /** Bullseye Credits each player has earned this match (see `countBullseyes`), for the Resource bar's flash. */ bullseyes?: Bullseyes; /** The active player has acted since their turn began, which clears the first-round hint. */ acted?: boolean }

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

/** The first-play hints show only on round 1. */
const isFirstRound = (round: number | null | undefined): boolean => round === 1

/** A shot still to be aimed from a placed ball. */
const shotToAim = (s: SimState, c: SimConfig): boolean => !s.match.builder && !s.match.choosing && !s.possession.inHand && !s.possession.live && s.possession.shots === c.shots

/** The first-play aim hint is up: round 1 and a shot still to be aimed. */
const aimHint = (s: SimState, c: SimConfig): boolean => isFirstRound(roundOf(s.match)) && shotToAim(s, c)

/** The coaching line for what the active player faces first: a build turn that places pieces, the ball to place, or the shot to aim; undefined after round 1 or once they have acted. */
function hintOf(s: SimState, c: SimConfig, acted?: boolean): string | undefined {
  if (acted || !isFirstRound(roundOf(s.match))) return undefined
  if (s.match.builder) return canEdit(s) ? 'Drag on your half to draw a wall, or pick a piece below, then OK' : undefined
  if (s.possession.inHand) return s.match.choosing ? undefined : 'Tap to place the ball, then Confirm'
  return shotToAim(s, c) ? 'Drag back from the ball to shoot; hold first for Power' : undefined
}

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
    resourceBar: resourceBar(s, v.bullseyes),
    active: v.active,
    round: roundOf(s.match),
    rounds: c.rounds,
    clock: timed ? { seconds: s.clock.left / c.tickHz, fraction: s.clock.left / (timed * c.tickHz) } : null,
    shotsLeft: s.possession.shots,
    shotsMax: c.shots,
    refundable: !v.blocked && canRefund(s, v.active),
    score: s.match.mode === 'rounds' ? `${s.match.score[v.active]}–${s.match.score[opponent(v.active)]}` : null,
    phase: buildPhase(s.match) === 'Rearrange' ? 'Rearrange' : v.placing ? PLACING[v.placing] : b ? 'Build phase' : aimHint(s, c) ? 'Play phase · Drag to aim' : 'Play phase',
    dock: b ? (canEdit(s) ? 'build' : 'rearrange') : s.match.choosing ? 'choice' : 'play',
    balance: modeFor(s.match).hasCredits(s.match) || (b && canEdit(s)) ? { amount: s.credits[v.active], unit: UNITS[s.match.mode].chip } : null,
    refundRate: modeFor(s.match).mayRefund(s.match) ? c.refundRate : null,
    buttons: v.buttons,
    hint: hintOf(s, c, v.acted),
  }
}
