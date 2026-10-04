import { type PlayerId } from './pitch'
import { opponent, type Possession } from './possession'
import type { SimConfig } from './step'

/** Fields every mode shares. `builder` is whose build turn it is (null = play phase); `winner` set means the match is over; `choosing` is who owes a defence choice (play is held until they make it). */
type MatchBase = { seed: number; winner: PlayerId | null; builder: PlayerId | null; choosing: PlayerId | null }

/** `round` counts from 1 and may exceed `config.rounds` (sudden death). */
export type RoundsMatch = MatchBase & { mode: 'rounds'; round: number; score: Record<PlayerId, number>; roundShots: number }

/** Siege has no score or rounds. `opening` is true from the start until the opening build is over (play begins); a build turn with it false is a Rearrange turn, and fog (blind build) must key on it. */
export type SiegeMatch = MatchBase & { mode: 'siege'; opening: boolean }

/** Match state, a union keyed by `mode`: read per-mode fields only after narrowing on it. */
export type Match = RoundsMatch | SiegeMatch

export type GameModeName = Match['mode']

/** Round 1: the coin-flip loser builds first; the order alternates each round. */
export const firstBuilder = (seed: number, round: number): PlayerId => (round % 2 ? opponent(coinFlip(seed, 1)) : coinFlip(seed, 1))

/** Seeded, deterministic: who kicks off when nobody conceded. */
export function coinFlip(seed: number, round: number): PlayerId {
  let h = Math.imul(seed ^ Math.imul(round, 0x9e3779b9), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35)
  return (h ^ (h >>> 13)) & 1 ? 1 : 2
}

/** A Kick-off possession: the ball is fixed at `kickoffSpot` by whoever sets the ball up, so nothing is placed (ADR-0006). */
export const startingPossession = (shooter: PlayerId, c: SimConfig): Possession => ({ shooter, shots: c.shots, inHand: false, live: false })
