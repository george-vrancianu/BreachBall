import { rules } from '../config/rules'
import { bullseyeEntered, chargeAt, goalCrossed, kickoffSpot, type BoostZone, type Charge, type PlayerId, type Point } from './pitch'
import type { GameModeName, Match } from './match'
import { modeFor, modeNamed, type DefenceChoice, type ModeContext } from './mode'
import { initialPlayers, type Player, type PowerUp } from './player'
import { type Ball } from './ball'
import { initialPallets, rollWithPallets, type Pallet } from './pallet'
import { canPlaceBall, centreRestart, handOver, opponent, resolveRest, type Possession } from './possession'
import { splashDamage, splashOf } from './splash'
import { damageSegment, isLegal, newStructure, segmentCount, structureCost, wallCost, wallUnits, type Structure, type Tower, type Wall, type TowerPower, type StructureSpec, type Vertex } from './wall'

const ctxOf = (objects: readonly Structure[], possession: Possession, shooter: PlayerId, credits: Record<PlayerId, number>): ModeContext => ({ objects, possession, shooter, credits })
/** A launch speed (0-1 of maxSpeed) once the ball's `charge` multiplies it. Splash never uses it. */
const launchSpeed = (power: number, charge: Charge | null, c: SimConfig): number => power * c.maxSpeed * (charge?.factor ?? 1)

/** Whether Done would be accepted for the current builder (the HUD disables the button when not). */
export function canFinishBuild(s: SimState, config: SimConfig): boolean {
  const b = s.match.builder
  return !!b && modeFor(s.match).onBuildDone(s.match, b, ctxOf(s.objects, s.possession, s.possession.shooter, s.credits), config) !== null
}

/** Whether `p` may refund Move points now: the shooter in play, ball placed, before a shot, in a mode with Credits (ADR-0004). */
export const canRefund = (s: Pick<SimState, 'match' | 'possession'>, p: PlayerId): boolean =>
  modeFor(s.match).mayRefund(s.match) && !s.match.builder && !s.match.choosing && s.possession.shooter === p && !s.possession.inHand && !s.possession.live && s.possession.shots > 0

/** Whether `p` may buy a Subterfuge item now (price and queue aside): their own possession with no shot in flight, or their build turn, in a mode with Credits, and not yet one this turn. */
export const canSubterfuge = (s: Pick<SimState, 'match' | 'possession' | 'subterfuge'>, p: PlayerId): boolean =>
  modeFor(s.match).maySubterfuge(s.match) && !s.match.winner && !s.match.choosing && !s.subterfuge.spent && (s.match.builder ? s.match.builder === p : s.possession.shooter === p && !s.possession.live)

/** Each Subterfuge item's price in Credits and what it does to the possession it lands on. */
export const SUBTERFUGE: Record<SubterfugeItem, { cost: number; land(p: SimState['possession']): SimState['possession'] }> = {
  // One Move point fewer, never the last.
  jam: { cost: rules.jamCost, land: (p) => ({ ...p, shots: Math.max(1, p.shots - 1) }) },
}

/** Whether `item` is a Subterfuge item that works (an unknown one is refused, nothing charged). */
export const isSubterfuge = (item: unknown): item is SubterfugeItem => typeof item === 'string' && Object.hasOwn(SUBTERFUGE, item)

/** Whether `p` may queue `item` now: Subterfuge is open to them, they can pay, and none is already queued against their opponent (an item never stacks). */
export const canCast = (s: Pick<SimState, 'match' | 'possession' | 'subterfuge' | 'credits'>, p: PlayerId, item: SubterfugeItem): boolean =>
  canSubterfuge(s, p) && s.credits[p] >= SUBTERFUGE[item].cost && s.subterfuge.queued[opponent(p)] === null

/** Whether `p` can pay for a Breaker shot: `rules.breakerCost` Credits in Rounds, one of the stock in Siege. */
export const canAffordBreaker = (s: Pick<SimState, 'match' | 'credits' | 'players'>, p: PlayerId): boolean =>
  modeFor(s.match).paysBreaker(s.match) ? s.credits[p] >= rules.breakerCost : s.players[p].inventory.breaker > 0

/** Whether `p` may arm the Breaker now: the shooter in their own play phase, before the shot, able to pay. Nothing is charged until the shot fires. */
export const canArm = (s: SimState, p: PlayerId): boolean =>
  !s.match.builder && s.possession.shooter === p && !s.possession.inHand && !s.possession.live && canAffordBreaker(s, p)

/** Whether the current build turn may place and demolish (false in a Rearrange turn, which only moves pieces). */
export const canEdit = (s: Pick<SimState, 'match'>): boolean => modeFor(s.match).mayEdit(s.match)

/** What the pure place/move checks read of a state. */
type Ledger = Pick<SimState, 'objects' | 'credits' | 'players' | 'match'>

/** Credits moving `was` to `now` costs (negative: refunded); a wall's price follows its units alone. */
const moveDiff = (was: Structure, now: StructureSpec): number => (was.kind === 'wall' && now.kind === 'wall' ? wallCost(now) - wallCost(was) : 0)

/** Credits placing `spec` spends: its price, except a Siege tower, which spends stock and no Credits. */
const chargeOf = (match: SimState['match'], spec: StructureSpec): number => (spec.kind === 'tower' && !modeFor(match).paysTowers(match) ? 0 : structureCost(spec))

/** `players` after `spec` is placed (`by` 1) or a fresh one demolished (`by` -1): a Siege tower moves one from the stock, anything else leaves it. */
const restocked = (match: SimState['match'], players: SimState['players'], spec: StructureSpec, by: 1 | -1): SimState['players'] =>
  spec.kind === 'tower' && !modeFor(match).paysTowers(match) ? spend(players, spec.owner, spec.power, by) : players

/** Whether `p` can pay for a `power` tower: its price in Credits in Rounds, one of the stock in Siege. */
export const canAffordTower = (s: Pick<SimState, 'match' | 'credits' | 'players'>, p: PlayerId, power: TowerPower): boolean =>
  modeFor(s.match).paysTowers(s.match) ? s.credits[p] >= rules.towerCost[power] : s.players[p].inventory[power] > 0

/**
 * Whether `spec` may be placed as it stands: payable (Credits for the price, or stock for a Siege tower) and a legal spot against the objects.
 * Who is building, and whether this turn may edit, are the caller's: the sim's `placeWall` and the build preview share this.
 */
export function canPlace(s: Ledger, spec: StructureSpec): boolean {
  const payable = spec.kind === 'wall' ? s.credits[spec.owner] >= wallCost(spec) : canAffordTower(s, spec.owner, spec.power)
  return payable && isLegal(spec, s.objects)
}

/**
 * Whether structure `id` may take the shape `spec`: it exists and is of that kind, the spot is legal ignoring itself, and the Credit difference
 * is covered. A turn that may only move pieces (Rearrange) refuses any change of a wall's length. Who may move it is the caller's.
 */
export function canMove(s: Ledger, id: number, spec: StructureSpec): boolean {
  const was = s.objects.find((o) => o.id === id)
  if (!was || was.kind !== spec.kind) return false
  const diff = moveDiff(was, spec)
  return (diff === 0 || (canEdit(s) && s.credits[spec.owner] >= diff)) && isLegal(spec, s.objects.filter((o) => o.id !== id))
}

/** Credits an in-play build of `spec` costs (`rules.playBuild`): a wall by its units, a tower at its in-play price. */
export const playCost = (spec: StructureSpec): number => (spec.kind === 'wall' ? wallUnits(spec) * rules.playBuild.wallUnitCost : rules.playBuild.towerCost[spec.power])

/** Whether `p` may build in play now: the mode allows it (Rounds, before the round's first shot), it is `p`'s own possession, no build turn or defence choice is running, no shot is in flight and the match is not over. */
export const canPlayBuild = (s: Pick<SimState, 'match' | 'possession'>, p: PlayerId): boolean =>
  modeFor(s.match).mayPlayBuild(s.match) && !s.match.builder && !s.match.choosing && !s.match.winner && s.possession.shooter === p && !s.possession.live

/** Whether `spec` may be placed now, by whichever way is open: a build turn's `canPlace`, else an in-play build at its in-play price. */
export function placeable(s: Ledger & Pick<SimState, 'possession'>, spec: StructureSpec): boolean {
  if (s.match.builder) return canPlace(s, spec)
  return canPlayBuild(s, spec.owner) && s.credits[spec.owner] >= playCost(spec) && isLegal(spec, s.objects)
}

export type SimEvent =
  | { type: 'wall-cracked'; id: number; hp: number; at: Point; /** The wall segment hit (walls only). */ segment?: number }
  /** A wall segment broke and left a Gap; the wall (carried, health as it now stands) still has standing segments. */
  | { type: 'segment-broken'; id: number; segment: number; wall: Wall; at: Point; /** Broken by a Breaker shot. */ breaker?: true }
  /** Carries the removed structure (hp 0, a wall with every segment at 0) so the renderer can shatter it; for a wall it is its last segment breaking, `segment`. */
  | { type: 'wall-destroyed'; wall: Structure; at: Point; segment?: number; /** Broken by a Breaker shot. */ breaker?: true }
  | { type: 'ball-hit-wall'; wall: number; speed: number; at: Point }
  /** The ball bounced off a board or net. */
  | { type: 'ball-hit-board'; speed: number; at: Point }
  /** A Pallet's arm struck the ball, which left at `speed` (once per Pallet per tick). */
  | { type: 'pallet-hit'; pallet: number; speed: number; at: Point }
  /** An illegal placement or demolition was dropped. */
  | { type: 'refused' }
  /** `from` is the ball's position at launch. */
  | { type: 'shot-fired'; player: PlayerId; from: Point; dir: Point; power: number; tier: number; breaker?: boolean; /** The Charged ball's factor, when the shot used one. */ charge?: number }
  /** The ball entered the Bullseye from outside during `player`'s shot, earning them `credits` (Rounds). */
  | { type: 'bullseye-credited'; player: PlayerId; credits: number }
  /** A shot came to rest in the Boost ring or Bullseye: the ball is Charged by `factor` until its next shot or move. */
  | { type: 'charged'; zone: BoostZone; factor: number; at: Point }
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
  /** `player` paid for a Subterfuge item; it waits against their opponent's next possession. */
  | { type: 'subterfuge-queued'; player: PlayerId; item: SubterfugeItem }
  /** A queued Subterfuge item took effect on `player`'s possession, which has just begun. */
  | { type: 'subterfuge-landed'; player: PlayerId; item: SubterfugeItem }

/** The Subterfuge items that work. */
export type SubterfugeItem = 'jam'

/** `queued` is the item waiting against each player's next possession (a player's own entry is what their opponent did to them); `spent` is set once the current turn has bought one (a turn is a possession or a build turn). */
export type SubterfugeState = { queued: Record<PlayerId, SubterfugeItem | null>; spent: boolean }

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
  /** The ball's charge, null when not Charged. Set when a shot comes to rest in a ring, spent by the next shot, lost whenever the ball is moved. */
  charge: Charge | null
  /** The shot in flight has already earned its Bullseye Credits (once per shot); cleared when a shot fires. */
  bullseyePaid: boolean
  possession: Possession
  match: Match
  /** Shot clock: ticks left (frozen while a shot is live) and consecutive expiries in this possession. */
  clock: { left: number; expiries: number }
  /** The shot in flight is a Breaker shot that has not broken anything yet. */
  breaker: boolean
  subterfuge: SubterfugeState
  /** The map's Pallets: neutral, never in `objects`; they spin every tick but only touch the ball while a shot is live. */
  pallets: Pallet[]
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
  /** The shooter or builder buys a Subterfuge item against their opponent's next possession. */
  subterfuge?: { player: PlayerId; item: SubterfugeItem }
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
  /** Rounds: Credits granted at each build turn after the first. Siege does not read it. */
  credits: number
  /** Credits held by each player's round-1 build turn, instead of the per-round grant (Rounds); Siege's opening build holds it as wall points. */
  openingCredits: number
  /** Shots in a round before it ends scoreless (not in sudden death). */
  shotCap: number
  /** Seconds per shot. */
  shotClock: number
  /** Seconds per build turn; 0 = no timer (hot-seat). */
  buildTime: number
  /** What an expiring shot clock does: 'shoot' shoots the held aim (burning if there is none), 'burn' always burns the shot. */
  expiry: 'shoot' | 'burn'
  /** Pivots of the map's Pallets; none by default. */
  pallets: Point[]
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
  // Rounds here on purpose: the sim default stays the original mode so tests and tools that never name a mode keep Rounds behaviour. The settings screen defaults to Siege (`defaultSettings`), and `configFrom` always sets the mode. Siege's 30 Wall points default lives in `sliderDefault`; hand-built Siege configs get 40.
  mode: 'rounds',
  rounds: 5,
  credits: 10,
  openingCredits: 40,
  shotCap: 30,
  shotClock: 15,
  buildTime: 0,
  expiry: 'shoot',
  pallets: [],
}

export function initialState(seed = 1, config: SimConfig = defaultConfig): SimState {
  const mode = modeNamed(config.mode)
  const start = mode.start(seed, config)
  const b = start.match.builder
  // The first builder's turn opens here, so it gets its grant as every later build turn does in step; the other player holds nothing yet.
  const none = { 1: 0, 2: 0 }
  const credits = { ...none, ...(b && { [b]: mode.onBuildStart(start.match, ctxOf([], start.possession, start.possession.shooter, none), config).credits }) }
  return { tick: 0, objects: [], players: initialPlayers(), credits, nextId: 1, built: [], ball: { pos: kickoffSpot(start.possession.shooter), vel: { x: 0, y: 0 }, rolled: 0 }, charge: null, bullseyePaid: false, possession: start.possession, match: start.match, clock: { left: (config.buildTime || config.shotClock) * config.tickHz, expiries: 0 }, breaker: false, subterfuge: { queued: { 1: null, 2: null }, spent: false }, pallets: initialPallets(config.pallets, seed) }
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
  /** Places a piece for the builder if cost (or Siege stock) and position allow. */
  const place = (spec: StructureSpec): boolean => {
    if (spec.owner !== match.builder || !canPlace({ objects, credits, players, match }, spec)) return false
    players = restocked(match, players, spec, 1)
    built = [...built, nextId]
    objects = [...objects, newStructure(spec, nextId++)]
    credits = { ...credits, [spec.owner]: credits[spec.owner] - chargeOf(match, spec) }
    return true
  }
  /** An in-play build: placed at its in-play price and never added to `built`, so it can be neither moved nor demolished. */
  const placeInPlay = (spec: StructureSpec): boolean => {
    if (!placeable({ objects, credits, players, match, possession: state.possession }, spec)) return false
    objects = [...objects, newStructure(spec, nextId++)]
    credits = { ...credits, [spec.owner]: credits[spec.owner] - playCost(spec) }
    return true
  }
  if (placeWall && !(building ? edit && place(placeWall) : placeInPlay(placeWall))) events.push({ type: 'refused' })
  if (move) {
    const it = objects.find((o) => o.id === move.id)
    const spec: StructureSpec | undefined = it && (it.kind === 'wall' ? ('a' in move ? { kind: 'wall', owner: move.player, a: move.a, b: move.b } : undefined) : 'at' in move ? { kind: 'tower', owner: move.player, power: it.power, at: move.at } : undefined)
    // A wall's length may change by its ends: the Credit difference is charged (or refunded).
    if (it && spec && move.player === match.builder && it.owner === move.player && built.includes(move.id) && canMove({ objects, credits, players, match }, move.id, spec)) {
      // A resize re-creates full segments (a build turn's own pieces are undamaged); a plain move keeps every segment's health, Gaps included.
      const moved: Structure = it.kind === 'wall' && spec.kind === 'wall' ? (segmentCount(spec) !== it.segments.length ? newStructure(spec, it.id) : { ...it, ...spec }) : it.kind === 'tower' && spec.kind === 'tower' ? { ...it, ...spec } : it
      objects = objects.map((o) => (o.id === move.id ? moved : o))
      credits = { ...credits, [it.owner]: credits[it.owner] - moveDiff(it, spec) }
    } else events.push({ type: 'refused' })
  }
  if (demolish) {
    const it = objects.find((w) => w.id === demolish.wall)
    const fresh = built.includes(demolish.wall)
    if (edit && it && demolish.player === match.builder && it.owner === demolish.player && (fresh || credits[demolish.player] >= rules.demolishCost)) {
      objects = objects.filter((w) => w.id !== demolish.wall)
      // This turn's items come back in full; older ones cost `rules.demolishCost`.
      credits = { ...credits, [demolish.player]: credits[demolish.player] + (fresh ? chargeOf(match, it) : -rules.demolishCost) }
      if (fresh) players = restocked(match, players, it, -1)
      built = built.filter((id) => id !== demolish.wall)
    } else events.push({ type: 'refused' })
  }
  let ball = state.ball
  let { charge, bullseyePaid } = state
  /** Moves the ball to rest on `pos`: a restart, kick-off or placement, which loses its charge. */
  const moveBall = (b: Ball, pos: Point): Ball => {
    charge = null
    return { ...b, pos, vel: { x: 0, y: 0 } }
  }
  let { possession } = state
  const { placeBall } = input
  if (placeBall) {
    if (!building && !waiting && possession.inHand && placeBall.player === possession.shooter && canPlaceBall(placeBall.player, placeBall.at, objects, config)) {
      ball = moveBall(ball, placeBall.at)
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
      const h = centreRestart(refund.player, config)
      possession = h.possession
      ball = moveBall(ball, h.ball)
      events.push(...h.events)
      clock = { left: config.shotClock * config.tickHz, expiries: 0 }
    }
    credits = { ...credits, [refund.player]: credits[refund.player] + refund.count * config.refundRate }
  }
  let { subterfuge } = state
  const cast = input.subterfuge
  if (cast) {
    // The price is paid and the item queued against the opponent at once; it lands when their next possession begins.
    if (isSubterfuge(cast.item) && canCast({ match, possession, subterfuge, credits }, cast.player, cast.item)) {
      subterfuge = { queued: { ...subterfuge.queued, [opponent(cast.player)]: cast.item }, spent: true }
      credits = { ...credits, [cast.player]: credits[cast.player] - SUBTERFUGE[cast.item].cost }
      events.push({ type: 'subterfuge-queued', player: cast.player, item: cast.item })
    } else events.push({ type: 'refused' })
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
      if (r.ball) ball = moveBall(ball, r.ball)
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
    if (!building && !waiting && shot.player === possession.shooter && !possession.inHand && !possession.live && inRange && (!shot.breaker || canAffordBreaker({ match, credits, players }, shot.player))) {
      // The Breaker is paid for as the shot fires, never for arming or a cancelled aim.
      if (shot.breaker) {
        if (mode.paysBreaker(match)) credits = { ...credits, [shot.player]: credits[shot.player] - rules.breakerCost }
        else players = spend(players, shot.player, 'breaker')
      }
      events.push({ type: 'shot-fired', ...shot, from: ball.pos, ...(charge && { charge: charge.factor }) })
      possession = { ...possession, live: true }
      match = mode.onShotFired(match)
      const v = launchSpeed(shot.power, charge, config)
      charge = null
      bullseyePaid = false
      ball = { ...ball, vel: { x: shot.dir.x * v, y: shot.dir.y * v } }
      const splash = splashOf(shot.tier, shot.power, config)
      if (splash) {
        for (const { wall, segment, loss, at } of splashDamage(objects, ball.pos, splash, shot.player)) {
          for (let i = 0; i < loss; i++) {
            const r = damageSegment(objects, wall.id, segment ?? 0, at)
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
        const h = centreRestart(shooter, config)
        possession = h.possession
        ball = moveBall(ball, h.ball)
        events.push(...h.events)
      } else {
        if (possession.inHand) {
          ball = moveBall(ball, { x: rules.pitchWidth / 2, y: rules.halfCentre[shooter] })
          possession = { ...possession, inHand: false }
        }
        const r = resolveRest(possession, ball.pos.y, config)
        possession = r.possession
        if (r.ball) ball = moveBall(ball, r.ball)
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
  const rolled = rollWithPallets(ball, objects, state.pallets, config, { live: possession.live, breaker, shooter: possession.shooter })
  events.push(...rolled.events)
  // Entering the Bullseye from outside pays the shooter once per shot, however the shot ends; the swept segment keeps a fast ball from skipping it.
  // The straight start-to-end segment is exact: walls and towers sit more than `centreZoneRadius` from the centre and a ball moves at most `maxSpeed * charge.factor / tickHz` per tick, so no bounce can happen near the Bullseye within one tick.
  // The `possession.live` guard is defensive.
  if (possession.live && !bullseyePaid && mode.hasCredits(match) && bullseyeEntered(ball.pos, rolled.ball.pos)) {
    bullseyePaid = true
    credits = { ...credits, [possession.shooter]: credits[possession.shooter] + rules.bullseyeCredits }
    events.push({ type: 'bullseye-credited', player: possession.shooter, credits: rules.bullseyeCredits })
  }
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
  // The charge a shot earned by coming to rest this tick; announced only if no restart below took it back.
  let earned: Charge | null = null
  const conceder = goalCrossed(ball.pos, landed.pos)
  if (conceder) events.push({ type: 'goal', scorer: opponent(conceder), at: landed.pos })
  else if (possession.live && !landed.vel.x && !landed.vel.y) {
    consumed = true
    // Only a shot coming to rest Charges the ball, by where it rests; a restart below moves it and takes the charge back.
    charge = earned = chargeAt(landed.pos)
    const r = resolveRest(possession, landed.pos.y, config)
    possession = r.possession
    if (r.ball) landed = moveBall(landed, r.ball)
    events.push(...r.events)
  }
  const ctx = ctxOf(rolled.objects, possession, shooter, credits)
  const turn = conceder ? mode.onGoal(match, opponent(conceder), ctx, config) : consumed ? mode.onShotConsumed(match, ctx, config) : null
  const ended = !!turn
  if (turn) {
    match = turn.match
    if (turn.possession) possession = turn.possession
    if (turn.ball) landed = moveBall(landed, turn.ball)
    events.push(...turn.events)
  }
  if (earned && charge === earned) events.push({ type: 'charged', ...charge, at: landed.pos })
  if (conceder || consumed) {
    const winner = mode.winner(match, ctxOf(rolled.objects, possession, shooter, credits), config)
    if (winner && !match.winner) {
      match = { ...match, winner, builder: null, choosing: null }
      events.push({ type: 'match-ended', winner })
    }
  }
  // A new turn (a hand-over, or a build turn starting or ending) may buy Subterfuge again.
  const turned = possession.shooter !== state.possession.shooter || match.builder !== state.match.builder || events.some((e) => e.type === 'possession-changed')
  if (turned) subterfuge = { ...subterfuge, spent: false }
  // A possession begins in play with a hand-over, or when the last build turn ends: an item queued against its shooter lands (a Jam takes one Move point, never the last).
  const began = !match.winner && !match.builder && (!!state.match.builder || events.some((e) => e.type === 'possession-changed'))
  const landing = subterfuge.queued[possession.shooter]
  if (began && landing) {
    possession = SUBTERFUGE[landing].land(possession)
    subterfuge = { ...subterfuge, queued: { ...subterfuge.queued, [possession.shooter]: null } }
    events.push({ type: 'subterfuge-landed', player: possession.shooter, item: landing })
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
  return { state: { ...state, possession, match, clock, tick: state.tick + 1, charge, bullseyePaid, players, subterfuge, breaker: rolled.breaker && possession.live, objects: rolled.objects, pallets: rolled.pallets, credits, nextId, built, ball: landed }, events }
}
