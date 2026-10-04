import { rules } from '../config/rules'
import { type PlayerId, type Point } from './pitch'
import { coinFlip, firstBuilder, startingPossession, type GameModeName, type Match, type RoundsMatch, type SiegeMatch } from './match'
import { opponent, type Possession } from './possession'
import type { SimConfig, SimEvent } from './step'
import { maxHp, structureCost, structuresOf, type Structure, type StructureSpec } from './wall'

/** The board a hook may read when deciding: read-only, so hooks stay pure. */
export type ModeContext = {
  objects: readonly Structure[]
  /** The possession at the moment the hook is called: for `onGoal` and `onShotConsumed` before the result is applied, for `winner` and `onBuildStart` after. */
  possession: Possession
  /** Who took the shot being resolved (possession may already have passed to the opponent). */
  shooter: PlayerId
  /** Credits each player holds before the hook's result is applied. */
  credits: Readonly<Record<PlayerId, number>>
}

/** What a match-level hook returns. `possession` and `ball` are set only when the hook resets play (a new round). */
export type ModeResult<M extends Match = Match> = { match: M; possession?: Possession; ball?: Point; /** Set when the hook changes structures (a repair). */ objects?: Structure[]; events: SimEvent[] }

/** What a scorer can do with their defence turn. */
export type DefenceChoice = 'repair' | 'rearrange'

/** How a build turn opens: the builder's Credits and which structures count as placed this turn (movable). */
export type BuildTurn = { credits: number; built: number[] }

/**
 * A game mode: pure hooks that own the match-level transitions. The step function owns physics, possession, build turns and the shot clock,
 * and calls `winner` whenever a shot is consumed or a goal is scored.
 */
export type GameMode<M extends Match = Match> = {
  /** Fresh match state and the opening possession. */
  start(seed: number, c: SimConfig): { match: M; possession: Possession }
  /** A shot was fired or burned by the shot clock. */
  onShotFired(m: M): M
  /** A shot was consumed (rested, stolen or burned); null = nothing changes. */
  onShotConsumed(m: M, ctx: ModeContext, c: SimConfig): ModeResult<M> | null
  /** `scorer` put the ball in the opponent's goal. */
  onGoal(m: M, scorer: PlayerId, ctx: ModeContext, c: SimConfig): ModeResult<M>
  /** The builder pressed Done (or timed out): the new match state (who builds next, null = play begins) and events, or null to refuse. */
  onBuildDone(m: M, builder: PlayerId, ctx: ModeContext, c: SimConfig): ModeResult<M> | null
  /** `player` (the one the match is waiting on) made a defence choice: the result, or null to refuse. */
  onDefenceChoice(m: M, player: PlayerId, choice: DefenceChoice, ctx: ModeContext, c: SimConfig): ModeResult<M> | null
  /** The build window ran out while `m.choosing` still owed a defence choice: what the sim picks for them. */
  choiceTimeout(m: M): DefenceChoice
  /** A timed-out Done was refused: a piece to place for the builder before finishing the turn, or null for none. */
  onBuildTimeout(m: M, builder: PlayerId, ctx: ModeContext, c: SimConfig): StructureSpec | null
  /** Whether the current build turn may place and demolish pieces (moving is always allowed); false in a Rearrange turn. */
  mayEdit(m: M): boolean
  /** Whether the shooter may refund Move points for Credits; Siege has no Credits economy (ADR-0004). */
  mayRefund(m: M): boolean
  /** Whether the match is in its blind opening build phase (a build turn that is not a Rearrange); fog and the reveal key on it. */
  opening(m: M): boolean
  /** A build turn just opened for `m.builder`: the Credits they hold for it (they hold `ctx.credits` now) and the ids they may move. */
  onBuildStart(m: M, ctx: ModeContext, c: SimConfig): BuildTurn
  /** Who has won, if anyone; derived from state. */
  winner(m: M, ctx: ModeContext, c: SimConfig): PlayerId | null
}

const center: Point = { x: rules.pitchWidth / 2, y: rules.halfHeight }

/** Ends the current round (`scorer` null = shot cap, scoreless) and sets up the next; the step function ends the match if `winner` says so. */
function endRound(m: RoundsMatch, scorer: PlayerId | null, c: SimConfig): ModeResult<RoundsMatch> {
  const score = scorer ? { ...m.score, [scorer]: m.score[scorer] + 1 } : m.score
  const round = m.round + 1
  const shooter = scorer ? opponent(scorer) : coinFlip(m.seed, round)
  return {
    match: { ...m, score, round, roundShots: 0, builder: firstBuilder(m.seed, round) },
    possession: startingPossession(shooter, c),
    ball: { ...center },
    events: [{ type: 'round-ended', round: m.round, scorer }],
  }
}

export const rounds: GameMode<RoundsMatch> = {
  start: (seed, c) => ({
    match: { mode: 'rounds', seed, round: 1, score: { 1: 0, 2: 0 }, roundShots: 0, winner: null, builder: firstBuilder(seed, 1), choosing: null },
    possession: startingPossession(coinFlip(seed, 1), c),
  }),
  onShotFired: (m) => ({ ...m, roundShots: m.roundShots + 1 }),
  onShotConsumed: (m, _ctx, c) => (m.roundShots >= c.shotCap && m.round <= c.rounds ? endRound(m, null, c) : null),
  onGoal: (m, scorer, _ctx, c) => endRound(m, scorer, c),
  onBuildDone: (m, builder) => ({ match: { ...m, builder: builder === firstBuilder(m.seed, m.round) ? opponent(builder) : null }, events: [] }),
  onDefenceChoice: () => null,
  choiceTimeout: () => 'repair',
  onBuildTimeout: () => null,
  mayEdit: () => true,
  mayRefund: () => true,
  opening: () => false,
  // Credits bank: each build turn adds the round's grant to what is left.
  onBuildStart: (m, ctx, c) => ({ credits: (m.builder ? ctx.credits[m.builder] : 0) + c.credits, built: [] }),
  // The last round is over and the score is not tied; a tie means sudden death.
  winner: (m, _ctx, c) => (m.round > c.rounds && m.score[1] !== m.score[2] ? (m.score[1] > m.score[2] ? 1 : 2) : null),
}

/** Siege: one opening build (Rounds ordering), no score, no shot cap; a goal hands the conceder ball-in-hand at the center; a player with no structures left loses. */
export const siege: GameMode<SiegeMatch> = {
  start: (seed, c) => ({ match: { mode: 'siege', seed, winner: null, builder: firstBuilder(seed, 1), choosing: null, opening: true }, possession: startingPossession(coinFlip(seed, 1), c) }),
  onShotFired: (m) => m,
  onShotConsumed: () => null,
  // The scorer owes a defence choice; step holds play until it is made. The conceder's ball-in-hand is set up here, once, and stays unusable while `choosing`.
  onGoal: (m, scorer, _ctx, c) => ({ match: { ...m, choosing: scorer }, possession: startingPossession(opponent(scorer), c), ball: { ...center }, events: [] }),
  // Nothing chosen in time takes the no-input option.
  choiceTimeout: () => 'repair',
  onDefenceChoice: (m, player, choice, ctx) => {
    // Rearrange opens a build-style turn for the scorer (step then asks `onBuildStart` for it); no event, nothing is restored.
    if (choice === 'rearrange') return { match: { ...m, choosing: null, builder: player }, events: [] }
    return {
      match: { ...m, choosing: null },
      objects: ctx.objects.map((o) => (o.owner === player ? { ...o, hp: maxHp(o) } : o)),
      // One per surviving own structure, full-HP ones included, so the sweep and flash always fire.
      events: structuresOf(ctx.objects, player).map((o) => ({ type: 'repaired', id: o.id, player })),
    }
  },
  // An empty defence would be an instant loss, so Done is refused until the builder owns a structure.
  // The opening build hands on to the opponent, then to play; a Rearrange turn (not `opening`) ends straight into play.
  onBuildDone: (m, builder, ctx) => {
    if (!structuresOf(ctx.objects, builder).length) return null
    const next = m.opening && builder === firstBuilder(m.seed, 1) ? opponent(builder) : null
    return { match: { ...m, builder: next, opening: m.opening && next !== null }, events: [] }
  },
  // A builder with nothing owned has the full budget (a fresh piece demolished refunds in full), so affordability is judged from `credits`:
  // a 1-unit horizontal wall centred left-right just in front of their goal no-build zone if it is affordable, else a Repulsor (free, always in stock at the opening).
  // The spot mirrors across the halfway line and is legal for either seat: on their half, outside the zone and the Centre zone, and the builder owns
  // nothing yet, so nothing can cross it. Both pieces therefore always place (tested for each seat).
  onBuildTimeout: (m, builder, _ctx, c) => {
    if (!m.opening) return null
    const half = rules.wall.unit / 2
    const dy = rules.noBuildRadius + rules.fallbackPiece.gap
    const y = builder === 1 ? rules.pitchHeight - dy : dy
    const x = rules.pitchWidth / 2
    const wall: StructureSpec = { kind: 'wall', owner: builder, a: { x: x - half, y }, b: { x: x + half, y } }
    // The Repulsor's cell sits on the near side of the same line, so it stays clear of the zone too.
    const at = { gx: rules.gridCols / 2 - 1, gy: builder === 1 ? Math.floor(y / rules.cellSize) - 1 : Math.ceil(y / rules.cellSize) }
    return structureCost(wall) <= c.credits ? wall : { kind: 'tower', owner: builder, at, power: 'repulsor' }
  },
  mayEdit: (m) => m.opening,
  mayRefund: () => false,
  opening: (m) => m.opening && m.builder !== null,
  // A Rearrange turn has no wall points and every own structure counts as placed this turn, so all of them can be moved.
  onBuildStart: (m, ctx, c) => (m.opening ? { credits: c.credits, built: [] } : { credits: 0, built: m.builder ? structuresOf(ctx.objects, m.builder).map((o) => o.id) : [] }),
  winner: (_m, ctx) => {
    const left = (p: PlayerId) => structuresOf(ctx.objects, p).length > 0
    if (left(1) && left(2)) return null
    // Wipe-out; if both are at zero the shooter loses.
    return !left(1) && !left(2) ? opponent(ctx.shooter) : left(1) ? 1 : 2
  },
}

/** Every mode by name: the one place a new mode registers. */
const MODES: Record<GameModeName, GameMode> = { rounds, siege }

/** The mode a match is being played in, read off the match itself. */
export const modeFor = (m: Match): GameMode => MODES[m.mode]

/** The mode a new match starts in. */
export const modeNamed = (name: GameModeName): GameMode => MODES[name]

/** The Siege opening build is in progress: a build turn in the mode's opening phase (a Rearrange turn is not). Fog, the reveal and the build label key on this. */
export const openingBuild = (m: Match): boolean => modeFor(m).opening(m)

/** The seat whose own half is the only one `viewer` may see: the viewer themselves while a blind opening build is on (also while waiting on the opponent's build; not a Rearrange turn), else undefined. Rounds stays open information. A pure function of state; hiding is view-only, so the sim stays complete. */
export const blindSeat = (m: Match, viewer: PlayerId): PlayerId | undefined => (openingBuild(m) ? viewer : undefined)

/** The phase label of the match right now: a build turn that may only move pieces is a Rearrange. */
export const buildPhase = (m: Match): 'Build' | 'Rearrange' | 'Play' => (m.builder === null ? 'Play' : modeFor(m).mayEdit(m) ? 'Build' : 'Rearrange')
