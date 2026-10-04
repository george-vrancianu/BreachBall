import { defaultConfig, initialState, step, type SimState } from './step'
import type { RoundsMatch } from './match'
import type { PlayerId, Point } from './pitch'
import type { PowerUp } from './player'
import type { StructureSpec } from './wall'

/** A fresh state already in the play phase (build turns are skipped), both players holding one round's Credits. */
export const playState = (seed = 1): SimState => {
  const s = initialState(seed)
  return { ...s, match: { ...s.match, builder: null }, credits: { 1: defaultConfig.credits, 2: defaultConfig.credits } }
}

/** A fresh state in `owner`'s build turn. */
export const buildState = (owner: PlayerId): SimState => {
  const s = playState()
  return { ...s, match: { ...s.match, builder: owner } }
}

/** Steps a placement as its owner's build turn would, then returns to the play phase. */
export const place = (spec: StructureSpec, s = playState()) => {
  const r = step({ ...s, match: { ...s.match, builder: spec.owner } }, { placeWall: spec }, defaultConfig)
  const state: SimState = { ...r.state, match: { ...r.state.match, builder: null } }
  return { ...r, state }
}

/** `s` with `player`'s stock of `power` emptied. */
export const emptied = (s: SimState, player: PlayerId, power: PowerUp): SimState => ({ ...s, players: { ...s.players, [player]: { ...s.players[player], inventory: { ...s.players[player].inventory, [power]: 0 } } } })

/** The Rounds match inside `s`, for tests that read round, score or round shots. */
export const roundsMatch = (s: SimState): RoundsMatch => {
  if (s.match.mode !== 'rounds') throw new Error('not a Rounds match')
  return s.match
}

/** The ends of a horizontal wall `units` long starting at grid vertex (gx, gy): the old straight piece is one unit (8 world units). */
export const hseg = (gx: number, gy: number, units = 1): { a: Point; b: Point } => ({ a: { x: gx * 2, y: gy * 2 }, b: { x: gx * 2 + 8 * units, y: gy * 2 } })
