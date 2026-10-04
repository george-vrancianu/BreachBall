import { rules } from '../config/rules'
import { goalCrossed, type PlayerId, type Point } from './pitch'
import type { GameModeName, Match } from './match'
import { modeFor, modeNamed, type DefenceChoice, type ModeContext } from './mode'
import { initialPlayers, type Player, type PowerUp } from './player'
import { rollBall, type Ball } from './ball'
import { canPlaceBall, handOver, opponent, resolveRest, type Possession } from './possession'
import { splashDamage, splashOf } from './splash'
import { damageWall, isLegal, maxHp, structureCost, wallCost, type Structure, type Tower, type StructureSpec, type Vertex } from './wall'

const ctxOf = (objects: readonly Structure[], possession: Possession, shooter: PlayerId, credits: Record<PlayerId, number>): ModeContext => ({ objects, possession, shooter, credits })

/** Whether Done would be accepted for the current builder (the HUD disables the button when not). */
export function canFinishBuild(s: SimState, config: SimConfig): boolean {
  const b = s.match.builder
  return !!b && modeFor(s.match).onBuildDone(s.match, b, ctxOf(s.objects, s.possession, s.possession.shooter, s.credits), config) !== null
}

/** Whether `p` may refund Move points now: the shooter in play, ball placed, before a shot, in a mode with Credits (ADR-0004). */
export const canRefund = (s: Pick<SimState, 'match' | 'possession'>, p: PlayerId): boolean =>
  modeFor(s.match).mayRefund(s.match) && !s.match.builder && !s.match.choosing && s.possession.shooter === p && !s.possession.inHand && !s.possession.live && s.possession.shots > 0

/** Whether the current build turn may place and demolish (false in a Rearrange turn, which only moves pieces). */
export const canEdit = (s: SimState): boolean => modeFor(s.match).mayEdit(s.match)

export type SimEvent =
  | { type: 'wall-cracked'; id: number; hp: number; at: Point }
  /** Carries the removed wall (hp 0) so the renderer can shatter it. */
  | { type: 'wall-destroyed'; wall: Structure; at: Point; /** Broken by a Breaker shot. */ breaker?: true }
  | { type: 'ball-hit-wall'; wall: number; speed: number; at: Point }
  /** The ball bounced off a board or net. */
  | { type: 'ball-hit-board'; speed: number; at: Point }
  /** An illegal placement or demolition was dropped. */
  | { type: 'refused' }
  /** `from` is the ball's position at launch. */
  | { type: 'shot-fired'; player: PlayerId; from: Point; dir: Point; power: number; tier: number; breaker?: boolean }
  | { type: 'possession-changed'; shooter: PlayerId; inHand: boolean }
  /** The shooter traded `count` Move points for Credits. */
  | { type: 'refunded'; player: PlayerId; count: number }
  | { type: 'goal'; scorer: PlayerId; at: Point }
  /** `scorer` null = the shot cap ended the round. */
  | { type: 'round-ended'; round: number; scorer: PlayerId | null }
  | { type: 'match-ended'; winner: PlayerId }
  | { type: 'shot-clock-expired'; player: PlayerId }
  /** An opponent's ball hit a Steal tower: the ball stopped and the tower (hp 0) is gone. */
  | { type: 'steal-triggered'; tower: Tower; owner: PlayerId; at: Point }
  | { type: 'repulsor-fired'; tower: number; at: Point }
  /** A defence-turn Repair restored this structure to full HP. */
  | { type: 'repaired'; id: number; player: PlayerId }

export type SimState = {
  tick: number
  objects: Structure[]
  players: Record<PlayerId, Player>
  /** Credits each player holds (Siege: wall points); building and demolishing spend them. */
  credits: Record<PlayerId, number>
  nextId: number
  /** Ids placed in the current build turn: they can still be moved, and demolishing them refunds them. */
  built: number[]
  ball: Ball
  possession: Possession
  match: Match
  /** Shot clock: ticks left (frozen while a shot is live) and consecutive expiries in this possession. */
  clock: { left: number; expiries: number }
  /** The shot in flight is a Breaker shot that has not broken anything yet. */
  breaker: boolean
}

/** An aim: `dir` is a world-space unit vector (the way the ball goes), `tier` an index into `rules.shot.tiers`, `power` 0-1 of maxSpeed. */
export type Aiming = { dir: Point; tier: number; power: number; breaker?: boolean }

/** Per-tick input from both players. `demolish.wall` is a wall id. */
export type SimInput = {
  shot?: Aiming & { player: PlayerId }
  placeWall?: StructureSpec
  demolish?: { player: PlayerId; wall: number }
  /** The builder moves a structure placed this build turn: a wall to new ends `a` and `b` (a drag or a 45 degree turn), a tower to a new cell `at`. */
  moveStructure?: { player: PlayerId; id: number } & ({ a: Point; b: Point } | { at: Vertex })
  /** The shooter's aim in progress (null clears it); it fires when the shot clock runs out. */
  aiming?: Aiming | null
  /** The builder ends their build turn. */
  done?: PlayerId
  /** The player the match is waiting on makes their defence choice. */
  defence?: { player: PlayerId; choice: DefenceChoice }
  /** Confirm ball-in-hand: the shooter's ball goes to `at`. */
  placeBall?: { player: PlayerId; at: Point }
  /** The shooter trades `count` unspent Move points for Credits. */
  refund?: { player: PlayerId; count: number }
}

export type SimConfig = {
  tickHz: number
  ballRadius: number
  maxSpeed: number
  /** Seconds for ball speed to halve. */
  halfLife: number
  restSpeed: number
  restitution: number
  /** A wall hit above this fraction of maxSpeed removes 1 hp. */
  damageFraction: number
  /** Speed kept by a ball that destroys a wall mid-shot. */
  destroyedSpeedFactor: number
  /** Shots per possession (Move points). */
  shots: number
  /** Credits a refunded Move point is worth. */
  refundRate: number
  /** Which game mode decides the match. */
  mode: GameModeName
  rounds: number
  /** Rounds: Credits granted at each build turn. Siege: wall points for the opening build. */
  credits: number
  /** Shots in a round before it ends scoreless (not in sudden death). */
  shotCap: number
  /** Seconds per shot. */
  shotClock: number
  /** Seconds per build turn; 0 = no timer (hot-seat). */
  buildTime: number
  /** What an expiring shot clock does: 'shoot' shoots the held aim (burning if there is none), 'burn' always burns the shot. */
  expiry: 'shoot' | 'burn'
}

export const defaultConfig: SimConfig = {
  tickHz: 60,
  ballRadius: 1,
  maxSpeed: 60,
  halfLife: 0.8,
  restSpeed: 0.5,
  restitution: 0.85,
  damageFraction: 0.5,
  destroyedSpeedFactor: 0.5,
  shots: 3,
  refundRate: 2,
  // Rounds here on purpose: the sim default stays the original mode so tests and tools that never name a mode keep Rounds behaviour. The settings screen defaults to Siege (`defaultSettings`), and `configFrom` always sets the mode.
  mode: 'rounds',
  rounds: 5,
  credits: 10,
  shotCap: 30,
  shotClock: 15,
  buildTime: 0,
  expiry: 'shoot',
}

export function initialState(seed = 1, config: SimConfig = defaultConfig): SimState {
  const mode = modeNamed(config.mode)
  const start = mode.start(seed, config)
  const b = start.match.builder
  // The first builder's turn opens here, so it gets its grant as every later build turn does in step; the other player holds nothing yet.
  const none = { 1: 0, 2: 0 }
  const credits = { ...none, ...(b && { [b]: mode.onBuildStart(start.match, ctxOf([], start.possession, start.possession.shooter, none), config).credits }) }
  return { tick: 0, objects: [], players: initialPlayers(), credits, nextId: 1, built: [], ball: { pos: { x: rules.pitchWidth / 2, y: rules.halfHeight }, vel: { x: 0, y: 0 }, rolled: 0 }, possession: start.possession, match: start.match, clock: { left: (config.buildTime || config.shotClock) * config.tickHz, expiries: 0 }, breaker: false }
}

const spend = (players: SimState['players'], id: PlayerId, power: PowerUp, n = 1): SimState['players'] => ({ ...players, [id]: { ...players[id], inventory: { ...players[id].inventory, [power]: players[id].inventory[power] - n } } })

/** Pure and deterministic: no DOM, no randomness. */
export function step(
  state: SimState,
  input: SimInput,
  config: SimConfig,
): { state: SimState; events: SimEvent[] } {
  if (state.match.winner) return { state, events: [] }
  let { objects, credits, nextId, players, built } = state
  let { match } = state
  const mode = modeFor(match)
  /** Who took the shot being resolved: possession may pass to the opponent before the hooks run. */
  const shooter = state.possession.shooter
  const events: SimEvent[] = []
  const building = match.builder !== null
  // Play is held while a defence choice is owed: no shots, no ball placement, no shot clock.
  const waiting = match.choosing !== null
  const { placeWall, demolish, moveStructure: move } = input
  // A Rearrange turn moves pieces only: placing and demolishing are refused.
  const edit = mode.mayEdit(match)
  /** Places a piece for the builder if cost, stock and position allow. */
  const place = (spec: StructureSpec): boolean => {
    const cost = structureCost(spec)
    const stocked = spec.kind === 'wall' || players[spec.owner].inventory[spec.power] > 0
    if (spec.owner !== match.builder || !stocked || credits[spec.owner] < cost || !isLegal(spec, objects)) return false
    if (spec.kind === 'tower') players = spend(players, spec.owner, spec.power)
    built = [...built, nextId]
    objects = [...objects, { ...spec, id: nextId++, hp: maxHp(spec) }]
    credits = { ...credits, [spec.owner]: credits[spec.owner] - cost }
    return true
  }
  if (placeWall && !(edit && place(placeWall))) events.push({ type: 'refused' })
  if (move) {
    const it = objects.find((o) => o.id === move.id)
    const others = objects.filter((o) => o.id !== move.id)
    const moved = it && (it.kind === 'wall' ? ('a' in move ? { ...it, a: move.a, b: move.b } : undefined) : 'at' in move ? { ...it, at: move.at } : undefined)
    // A wall's length may change by its ends: the Credit difference is charged (or refunded), and a Rearrange turn refuses any change.
    const diff = moved && it.kind === 'wall' && moved.kind === 'wall' ? wallCost(moved) - wallCost(it) : 0
    const owner = it?.owner
    const affordable = diff === 0 || (edit && owner !== undefined && credits[owner] >= diff)
    if (moved && move.player === match.builder && it.owner === move.player && built.includes(move.id) && affordable && isLegal(moved, others)) {
      objects = objects.map((o) => (o.id === move.id ? moved : o))
      if (diff !== 0) credits = { ...credits, [it.owner]: credits[it.owner] - diff }
    } else events.push({ type: 'refused' })
  }
  if (demolish) {
    const it = objects.find((w) => w.id === demolish.wall)
    const fresh = built.includes(demolish.wall)
    if (edit && it && demolish.player === match.builder && it.owner === demolish.player && (fresh || credits[demolish.player] >= rules.demolishCost)) {
      objects = objects.filter((w) => w.id !== demolish.wall)
      // This turn's items come back in full; older ones cost `rules.demolishCost`.
      credits = { ...credits, [demolish.player]: credits[demolish.player] + (fresh ? structureCost(it) : -rules.demolishCost) }
      if (fresh && it.kind === 'tower') players = spend(players, it.owner, it.power, -1)
      built = built.filter((id) => id !== demolish.wall)
    } else events.push({ type: 'refused' })
  }
  let ball = state.ball
  let { possession } = state
  const { placeBall } = input
  if (placeBall) {
    if (!building && !waiting && possession.inHand && placeBall.player === possession.shooter && canPlaceBall(placeBall.player, placeBall.at, objects, config)) {
      ball = { ...ball, pos: placeBall.at, vel: { x: 0, y: 0 } }
      possession = { ...possession, inHand: false }
    } else events.push({ type: 'refused' })
  }
  let { clock } = state
  const { refund } = input
  // Before a shot only: a refund is a bet that the Move points left are enough (ADR-0004).
  // A whole count only: lockstep peers must never see fractional Move points or Credits.
  const refundable = refund && canRefund({ match, possession }, refund.player) && Number.isInteger(refund.count) && refund.count >= 1 && refund.count <= possession.shots
  if (refund && !refundable) events.push({ type: 'refused' })
  if (refund && refundable) {
    const left = possession.shots - refund.count
    events.push({ type: 'refunded', player: refund.player, count: refund.count })
    // Refunding the last one ends the possession as running out of shots does.
    if (left > 0) possession = { ...possession, shots: left }
    else {
      const h = handOver(opponent(refund.player), true, config)
      possession = h.possession
      events.push(...h.events)
      clock = { left: config.shotClock * config.tickHz, expiries: 0 }
    }
    credits = { ...credits, [refund.player]: credits[refund.player] + refund.count * config.refundRate }
  }
  let chose = false
  // The build window covers a pending defence choice too; when it runs out the mode picks for the chooser.
  const choiceExpired = waiting && config.buildTime > 0 && state.clock.left <= 1
  const defence = input.defence ?? (choiceExpired && match.choosing ? { player: match.choosing, choice: mode.choiceTimeout(match) } : undefined)
  if (defence) {
    const r = match.choosing === defence.player ? mode.onDefenceChoice(match, defence.player, defence.choice, ctxOf(objects, possession, shooter, credits), config) : null
    if (r) {
      chose = true
      match = r.match
      if (r.possession) possession = r.possession
      if (r.ball) ball = { ...ball, pos: r.ball, vel: { x: 0, y: 0 } }
      if (r.objects) objects = r.objects
      events.push(...r.events)
    } else events.push({ type: 'refused' })
  }
  const buildExpired = building && config.buildTime > 0 && clock.left <= 1
  if ((building || waiting) && config.buildTime > 0) clock = { ...clock, left: Math.max(0, clock.left - 1) }
  const expired = !building && !waiting && !possession.live && clock.left <= 1
  if (!building && !waiting && !possession.live) clock = { ...clock, left: clock.left - 1 }
  const { aiming } = input
  const shot = input.shot ?? (expired && aiming && config.expiry === 'shoot' ? { player: possession.shooter, ...aiming } : undefined)
  if (shot) {
    const tier = rules.shot.tiers[shot.tier]
    const inRange = !!tier && shot.power >= tier.power[0] && shot.power <= tier.power[1]
    if (!building && !waiting && shot.player === possession.shooter && !possession.inHand && !possession.live && inRange && (!shot.breaker || players[shot.player].inventory.breaker > 0)) {
      if (shot.breaker) players = spend(players, shot.player, 'breaker')
      events.push({ type: 'shot-fired', ...shot, from: ball.pos })
      possession = { ...possession, live: true }
      match = mode.onShotFired(match)
      const v = shot.power * config.maxSpeed
      ball = { ...ball, vel: { x: shot.dir.x * v, y: shot.dir.y * v } }
      const splash = splashOf(shot.tier, shot.power, config)
      if (splash) {
        for (const { wall, loss, at } of splashDamage(objects, ball.pos, splash, shot.player)) {
          for (let i = 0; i < loss; i++) {
            const r = damageWall(objects, wall.id, at)
            objects = r.objects
            events.push(...r.events)
          }
        }
      }
    } else events.push({ type: 'refused' })
  }
  const fired = possession.live && !state.possession.live
  // A shot is consumed when it rests, is stolen, or is burned by the clock; the round cap is checked then.
  let consumed = false
  if (expired) {
    events.push({ type: 'shot-clock-expired', player: shooter })
    if (!possession.live) {
      consumed = true
      match = mode.onShotFired(match)
      if (clock.expiries >= 1) {
        const h = handOver(opponent(shooter), true, config)
        possession = h.possession
        events.push(...h.events)
      } else {
        if (possession.inHand) {
          ball = { ...ball, pos: { x: rules.pitchWidth / 2, y: rules.halfCentre[shooter] }, vel: { x: 0, y: 0 } }
          possession = { ...possession, inHand: false }
        }
        const r = resolveRest(possession, ball.pos.y, config)
        possession = r.possession
        events.push(...r.events)
        clock = { ...clock, expiries: clock.expiries + 1 }
      }
    }
  }
  const breaker = state.breaker || (fired && !!shot?.breaker)
  const done = input.done ?? (buildExpired ? match.builder : null)
  if (done) {
    let r = done === match.builder ? mode.onBuildDone(match, done, ctxOf(objects, possession, shooter, credits), config) : null
    // A timed-out build the mode refuses gets the mode's fallback piece, then finishes: the timer must bound the turn.
    const fallback = !r && !input.done && done === match.builder ? mode.onBuildTimeout(match, done, ctxOf(objects, possession, shooter, credits), config) : null
    if (fallback && place(fallback)) r = mode.onBuildDone(match, done, ctxOf(objects, possession, shooter, credits), config)
    if (r) {
      match = r.match
      events.push(...r.events)
    } else if (input.done) events.push({ type: 'refused' })
  }
  const rolled = rollBall(ball, objects, config, breaker, possession.shooter)
  events.push(...rolled.events)
  let landed = rolled.ball
  const stolen = rolled.events.find((e) => e.type === 'steal-triggered')
  if (stolen) {
    consumed = true
    const h = handOver(stolen.owner, true, config)
    possession = h.possession
    events.push(...h.events)
  }
  // A Repulsor rearms when the ball rests.
  if (!landed.vel.x && !landed.vel.y && rolled.objects.some((o) => o.kind === 'tower' && o.spent)) rolled.objects = rolled.objects.map((o) => (o.kind === 'tower' && o.spent ? { ...o, spent: false } : o))
  const conceder = goalCrossed(ball.pos, landed.pos)
  if (conceder) events.push({ type: 'goal', scorer: opponent(conceder), at: landed.pos })
  else if (possession.live && !landed.vel.x && !landed.vel.y) {
    consumed = true
    const r = resolveRest(possession, landed.pos.y, config)
    possession = r.possession
    events.push(...r.events)
  }
  const ctx = ctxOf(rolled.objects, possession, shooter, credits)
  const turn = conceder ? mode.onGoal(match, opponent(conceder), ctx, config) : consumed ? mode.onShotConsumed(match, ctx, config) : null
  const ended = !!turn
  if (turn) {
    match = turn.match
    if (turn.possession) possession = turn.possession
    if (turn.ball) landed = { ...landed, pos: turn.ball, vel: { x: 0, y: 0 } }
    events.push(...turn.events)
  }
  if (conceder || consumed) {
    const winner = mode.winner(match, ctxOf(rolled.objects, possession, shooter, credits), config)
    if (winner && !match.winner) {
      match = { ...match, winner, builder: null, choosing: null }
      events.push({ type: 'match-ended', winner })
    }
  }
  if (match.builder !== state.match.builder) built = []
  if (match.builder && match.builder !== state.match.builder) {
    const t = mode.onBuildStart(match, ctxOf(rolled.objects, possession, shooter, credits), config)
    built = t.built
    credits = { ...credits, [match.builder]: t.credits }
    // A turn opened by a defence choice continues the window the choice was made in.
    if (config.buildTime && !chose) clock = { left: config.buildTime * config.tickHz, expiries: 0 }
  }
  if (!match.builder && state.match.builder) clock = { left: config.shotClock * config.tickHz, expiries: 0 }
  if (possession.shooter !== state.possession.shooter || fired || ended || chose) clock = { ...clock, expiries: 0 }
  if (expired || fired || ended || (chose && !match.builder) || (state.possession.live && !possession.live) || possession.shooter !== state.possession.shooter) clock = { ...clock, left: config.shotClock * config.tickHz }
  // A goal opens the choice: its window is the build window, set after the resets above.
  if (match.choosing && !state.match.choosing && config.buildTime) clock = { left: config.buildTime * config.tickHz, expiries: 0 }
  return { state: { ...state, possession, match, clock, tick: state.tick + 1, players, breaker: rolled.breaker && possession.live, objects: rolled.objects, credits, nextId, built, ball: landed }, events }
}
