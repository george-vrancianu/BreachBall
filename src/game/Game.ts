import { rules } from '../config/rules'
import { visual } from '../config/visual'
import type { PlayerId } from '../sim/pitch'
import type { PowerUp } from '../sim/player'
import { blindSeat, buildPhase, openingBuild } from '../sim/mode'
import { canPlaceBall, whoActs } from '../sim/possession'
import { configFrom, type Settings } from '../sim/settings'
import { canEdit, defaultConfig, type SimConfig, type SimEvent, type SimInput, type SimState, type SubterfugeItem } from '../sim/step'
import { structuresOf } from '../sim/wall'
import type { Driver, DriverFactory, Sink } from './driver'
import { Aim } from './entities/Aim'
import { AimGauge } from './entities/AimGauge'
import { Ball } from './entities/Ball'
import { anchorY, Camera, hudReserve, screenDown, viewOutline } from './entities/Camera'
import { EdgeFade } from './entities/EdgeFade'
import { Fog } from './entities/Fog'
import { Pitch } from './entities/Pitch'
import { Structures } from './entities/Structures'
import { routeEvents } from './events'
import { tierBuzz } from './feedback'
import { InputController } from './input/InputController'
import { builderNow, defenceCircle, legal, placingOf, type BuildActions, type DefenceCircle } from './view/defenceCircle'
import { countDestroyed, type Destroyed } from './view/defenceBar'
import { countBullseyes, type Bullseyes } from './view/resourceBar'
import { hudModel, roundOf, type HudModel } from './view/hudModel'
import { minimapOf, type MinimapView } from './view/minimap'
import { offenceCircle, type OffenceActions, type OffenceCircle } from './view/offenceCircle'
import { phaseButtons } from './view/phaseButtons'
import { pausesSim, settingRows, type SideMenuView } from './view/sideMenu'
import { loadFlipOnTurn, saveFlipOnTurn } from './deviceSettings'
import { subterfugeCircle, type SubterfugeCircle } from './view/subterfugeCircle'
import { planStrategy, STRATEGIES, strategyCards, type StrategyCard } from './view/strategies'
import { acrossTable, advance, angle, blocking, choosingNotice, dismiss, goalBall, newTransition, overlayView, revealing, type OverlayView } from './view/transition'

export type { PlayerId, PowerUp, SubterfugeItem }

/** Everything the HUD and screens draw from. Data only: pushed up through `onView` when it changes, never read back. */
export type HudView = {
  hud: HudModel
  /** The Defence circle's model, for the whole match (greyed when the viewer cannot build; absent when no build turn is running). */
  defence?: DefenceCircle
  /** The Subterfuge circle's model and what is queued (absent in Siege, which has no Credits). */
  subterfuge?: SubterfugeCircle
  /** The Strategies tray's cards: present only while the builder has the tray open in a build turn that places pieces. */
  strategies?: StrategyCard[]
  /** The Offence circle's model, for the whole match (greyed outside the viewer's possession). */
  offence: OffenceCircle
  overlay?: OverlayView
  /** Degrees the stage (canvas and in-match HUD) is rotated by the hot-seat flip. */
  angle: number
  /** Player 2 is at the bottom of the screen. */
  flipped: boolean
  /** The Flip on turn device setting (hot-seat only; online ignores it). */
  flipOnTurn: boolean
  /** The ball-in-hand Confirm button is up. */
  confirm: boolean
  mapOpen: boolean
  menu: SideMenuView
  /** The minimap chip's thumbnail: where the main camera looks, live. */
  minimap: MinimapView
  winner?: PlayerId
  /** The end screen's result line. */
  result: string
}

/** How the HUD and screens drive the game. */
export type GameActions = {
  start(settings: Settings): void
  rematch(): void
  map(open?: boolean): void
  recenter(): void
  /** The viewer taps an Offence item: the Breaker toggles armed (the sim charges it only when the shot fires). */
  offence: OffenceActions
  /** The shooter refunds `count` Move points for Credits; the sim refuses it when not allowed. A count under 1 only buzzes denied. */
  refund(count: number): void
  /** The player whose turn it is buys a Subterfuge item against the opponent; the sim refuses it when not allowed. */
  subterfuge(item: SubterfugeItem): void
  confirmBall(): void
  /** Opens or closes the Side menu (the ☰ button; Resume closes it). Hot-seat it pauses the clocks; online it never does. */
  menu(open?: boolean): void
  /** Restart: a new match with the same settings. Hot-seat only; online it does nothing. */
  restart(): void
  /** Quit: tears the match down, leaving a fresh default one behind the Title screen. */
  quit(): void
  /** Tap on the turn card. */
  dismiss(): void
  /** Flip on turn: a device setting, saved on this device. Takes effect at the next handover. */
  flipOnTurn(on: boolean): void
  build: BuildActions
  /** The build dock's Strategies: open or close the tray, and drop a layout in (this turn's own pieces are cleared and refunded first). */
  strategies: { toggle(open?: boolean): void; apply(id: string): void }
}

/** Hot-seat: every seat is local, so no one is ever waited on. The online wave swaps this one predicate. */
const mine = (_p?: PlayerId | null) => true
/** Every seat is on this device. */
const hotSeat = () => mine(1) && mine(2)

/** The end screen's result line, per mode. */
const resultOf = (m: SimState['match'], winner: PlayerId, objects: SimState['objects']): string => {
  switch (m.mode) {
    case 'rounds':
      return `${m.score[1]} - ${m.score[2]}`
    case 'siege': {
      const left = structuresOf(objects, winner).length
      return `${left} structure${left === 1 ? '' : 's'} left`
    }
    default:
      return m satisfies never
  }
}

/**
 * The game renderer: owns the entity tree, the input controller, the frame loop and a driver. Sim state enters only through `apply`,
 * which routes the tick's events to entity methods; inputs leave through the driver.
 */
export class Game implements Sink {
  readonly camera = new Camera(0)
  /** A second camera over the whole pitch for the map overlay, always fitted above the HUD band. */
  readonly mapCam = new Camera(rules.mapY, true)
  readonly pitch = new Pitch()
  readonly structures = new Structures()
  /** The control gauge around the ball while aiming, drawn under it. */
  readonly gauge = new AimGauge()
  readonly ball = new Ball()
  readonly aim = new Aim()
  readonly fog = new Fog(() => this.viewCam(), () => this.camera.shakeNow)
  readonly edgeFade = new EdgeFade(() => this.viewCam())
  readonly actions: GameActions
  state!: SimState
  private config: SimConfig = defaultConfig
  private driver: Driver
  private input: InputController
  private ctx: CanvasRenderingContext2D
  private transition = newTransition(1)
  private flipOnTurn = loadFlipOnTurn()
  private lastBuilder: SimState['match']['builder'] | undefined
  private mapOpen = false
  private menuOpen = false
  private now = performance.now()
  private last = this.now
  private raf = 0
  private dpr = 1
  private dead = false
  private lastView = ''
  private strategiesOpen = false
  /** A Strategy being placed: the sim takes one build input per tick, so its inputs go one tick at a time while the same builder holds the turn. */
  private strategyQueue?: { builder: PlayerId; inputs: SimInput[] }
  /** The most structures each player has stood this match: the Defence bar keeps a segment for each that falls. */
  private destroyed: Destroyed = { 1: 0, 2: 0 }
  private bullseyes: Bullseyes = { 1: 0, 2: 0 }

  constructor(private canvas: HTMLCanvasElement, makeDriver: DriverFactory, private onView?: (view: HudView) => void) {
    this.driver = makeDriver(this)
    this.ctx = canvas.getContext('2d')!
    this.camera.add(this.pitch)
    this.camera.add(this.structures)
    this.camera.add(this.gauge)
    this.camera.add(this.ball)
    this.camera.add(this.aim)
    this.camera.add(this.structures.fx)
    this.input = new InputController({
      canvas,
      camera: this.camera,
      mapCam: this.mapCam,
      state: () => this.state,
      config: () => this.config,
      shown: () => this.transition.shown,
      mine,
      mapOpen: () => this.mapOpen,
      blocked: this.inputBlocked,
      menuOpen: () => this.menuOpen,
      openMenu: () => this.toggleMenu(true),
      toggleMap: (open) => this.toggleMap(open),
      send: (input) => this.driver.send(input),
    })
    this.actions = {
      start: (s) => ((this.config = configFrom(s)), this.newMatch()),
      rematch: () => this.newMatch(),
      map: (open) => this.toggleMap(open),
      recenter: () => this.camera.recenter(),
      offence: { arm: (item) => item === 'breaker' && this.input.toggleArm() },
      refund: (count) => {
        // Only the device that plays the shooter's seat refunds for it, as only it may aim.
        const { shooter } = this.state.possession
        if (!mine(shooter)) return
        if (count >= 1) this.driver.send({ refund: { player: shooter, count } })
        else navigator.vibrate?.([...visual.hud.refund.denied])
      },
      subterfuge: (item) => {
        // Whoever acts (the builder, else the shooter) buys it, on the device that plays their seat.
        const player = whoActs(this.state)
        if (mine(player)) this.driver.send({ subterfuge: { player, item } })
      },
      confirmBall: this.input.confirmBall,
      menu: (open) => this.toggleMenu(open),
      restart: () => hotSeat() && this.newMatch(),
      quit: () => {
        this.config = defaultConfig
        this.newMatch()
      },
      flipOnTurn: (on) => ((this.flipOnTurn = on), saveFlipOnTurn(on)),
      dismiss: () => (this.transition = dismiss(this.transition, performance.now())),
      build: this.input.build,
      strategies: {
        toggle: (open = !this.strategiesOpen) => {
          const { builder } = this.state.match
          this.strategiesOpen = open && !!builder && mine(builder) && canEdit(this.state)
        },
        apply: (id) => {
          const { builder } = this.state.match
          const strategy = STRATEGIES.find((st) => st.id === id)
          if (!strategy || !builder || !mine(builder) || this.inputBlocked() || this.strategyQueue) return
          const { inputs, placed } = planStrategy(this.state, builder, strategy, this.config)
          if (!placed) return
          this.input.build.cancel()
          this.strategiesOpen = false
          this.strategyQueue = { builder, inputs: inputs.slice(1) }
          this.driver.send(inputs[0])
        },
      },
    }
    this.newMatch()
    this.raf = requestAnimationFrame(this.frame)
  }

  /** Stops the loop and removes every listener. */
  destroy(): void {
    this.dead = true
    cancelAnimationFrame(this.raf)
    this.input.destroy()
  }

  /** Whether the sim waits: behind a blocking hold, and behind the Side menu in hot-seat. */
  simPaused = () => blocking(this.transition) || pausesSim(this.menuOpen, hotSeat())

  /** Whether the board ignores input: behind a blocking hold or the Side menu, online or not. */
  private inputBlocked = () => blocking(this.transition) || this.menuOpen

  /** Whether this device turns the stage at a handover: hot-seat only, and only when the player has Flip on turn on. */
  private flips = () => hotSeat() && this.flipOnTurn

  /** Whoever builds, else whoever has the device: online it would be the peer's own seat. */
  private viewer = (): PlayerId => this.state.match.builder ?? this.transition.hudSeat

  /** The camera the pitch is drawn through: the whole-pitch map while it is open or during the reveal hold. */
  private viewCam = (): Camera => (this.mapOpen || revealing(this.transition) ? this.mapCam : this.camera)

  /** Siege blind build: the viewer sees only their own half. The camera clamps to it and the fog hides the rest. */
  private seeBlind(): void {
    this.camera.blind = this.fog.blind = blindSeat(this.state.match, this.viewer())
  }

  /** One sim tick's state and events, from the driver. */
  apply(state: SimState, events: SimEvent[]): void {
    this.state = state
    this.destroyed = countDestroyed(this.destroyed, events)
    this.bullseyes = countBullseyes(this.bullseyes, events)
    const { camera, input } = this
    this.seeBlind()
    input.settle(state, events.some((ev) => ev.type === 'refused'))
    if (!state.match.builder && events.length) camera.recenter()
    if (state.match.builder !== this.lastBuilder) {
      this.lastBuilder = state.match.builder
      input.resetBuild()
      this.strategiesOpen = false
      this.strategyQueue = undefined
      if (this.lastBuilder && mine(this.lastBuilder)) input.enterBuild()
      if (this.lastBuilder) camera.pan(rules.halfCentre[this.lastBuilder] - camera.y)
      else camera.recenter()
    }
    this.announce(events)
    this.aim.sync(state, this.config)
    routeEvents(events, { camera, structures: this.structures, ball: this.ball, aim: this.aim, pitch: this.pitch, vibrate: (p) => navigator.vibrate?.(p) }, state.objects)
    this.structures.sync(state.objects)
    const queue = this.strategyQueue
    if (queue && (state.match.builder !== queue.builder || !queue.inputs.length)) this.strategyQueue = undefined
    else if (queue) this.driver.send(queue.inputs.shift()!)
  }

  // The seed varies per match; only the sim stays deterministic.
  private newMatch(seed = (Math.random() * 2 ** 31) | 0): void {
    const s = this.driver.start(this.config, seed)
    // Sim ids restart, so the last match's visual state must not leak into this one.
    for (const e of [this.camera, this.structures, this.gauge, this.ball, this.aim, this.pitch]) e.reset()
    this.input.resetBuild()
    this.menuOpen = false
    this.strategiesOpen = false
    this.strategyQueue = undefined
    this.transition = newTransition(s.possession.shooter, this.flips())
    this.camera.recenter()
    this.camera.y = s.ball.pos.y
    this.lastBuilder = undefined
    this.destroyed = { 1: 0, 2: 0 }
    this.bullseyes = { 1: 0, 2: 0 }
    this.apply(s, [])
    this.push()
  }

  /** Sizes the canvas backing store to the screen, before anything reads it this frame. */
  private resize(): void {
    const { canvas } = this
    this.dpr = window.devicePixelRatio || 1
    canvas.width = canvas.clientWidth * this.dpr
    canvas.height = canvas.clientHeight * this.dpr
  }

  /** Keeps the HUD band clear on the side the HUD sits (the stage is turned for seat 2) and takes the height the canvas shows. */
  private fitCamera(): void {
    this.camera.reserve = hudReserve(this.transition.shown, visual.camera.hudReservePx * this.dpr)
    this.camera.fit(this.canvas)
    this.mapCam.reserve = this.camera.reserve
  }

  private toggleMap(open = !this.mapOpen): void {
    this.mapOpen = open
  }

  private toggleMenu(open = !this.menuOpen): void {
    this.menuOpen = open
    if (open) {
      this.toggleMap(false)
      // A second finger can tap ☰ mid-aim, so the aim and any live press go; a ball-in-hand placement stays for Resume.
      this.input.dropLive()
    }
  }

  private announce(events: SimEvent[]): void {
    const { state } = this
    this.transition = advance(this.transition, { handover: true, flip: this.flips(), active: whoActs(state), round: roundOf(state.match) ?? undefined, inHand: state.possession.inHand, phase: buildPhase(state.match), opening: openingBuild(state.match), events, now: this.now })
  }

  private frame = (now: number): void => {
    if (this.dead) return
    // The sim never waits on animations; the driver just stops stepping behind a flip, goal hold or turn card.
    const dt = Math.min((now - this.last) / 1000, visual.frame.maxDtS)
    this.last = this.now = now
    this.resize()
    // Clocks advance before the sim ticks, so an effect the tick starts is drawn at age 0.
    this.camera.update(dt)
    this.driver.update(dt)
    this.announce([])
    this.seeBlind()
    // A ball-in-hand placement or half-made gesture does not survive a blocking hold into the next player's turn.
    if (blocking(this.transition)) this.input.cancelGestures()
    const { state, transition, camera } = this
    this.fitCamera()
    const flipping = !!transition.flip && now - transition.flip.at >= transition.flip.ms / 2
    // The seat across the table (stage not turned for it) shoots down the screen, so the ball is held near the top instead.
    const target = anchorY(state.ball.pos.y, transition.shown, camera.visibleHeight, !acrossTable(transition))
    if (!state.match.builder && (flipping || (transition.overlay?.kind === 'turn' && !transition.flip))) (camera.y = target), camera.recenter()
    this.input.edgeScroll(dt)
    this.input.tickAim()
    if (!camera.held) camera.follow(target, dt)
    this.present()
    this.draw()
    this.push()
    this.raf = requestAnimationFrame(this.frame)
  }

  /** Hands the entities what this frame shows: the build overlays, the aim, the ball-in-hand placement. */
  private present(): void {
    const { state, input, structures, mapOpen } = this
    const { builder } = state.match
    const { shooter } = state.possession
    const sel = input.selection
    structures.buildPiece = mapOpen || !sel?.movable ? undefined : sel.spec
    structures.handles = !mapOpen && sel?.movable && sel.spec.kind === 'wall' ? { a: sel.spec.a, b: sel.spec.b } : undefined
    structures.costLabel = !mapOpen && !!sel?.movable && sel.id === undefined && sel.spec.kind === 'wall'
    structures.pieceBlocked = !!sel && !legal(state, sel)
    structures.inPlay = !builder
    structures.flipped = this.transition.shown === 2
    structures.pieceId = sel?.id
    structures.landing = mapOpen ? undefined : input.landing?.spec
    structures.landingId = input.landing?.id
    structures.hidden = mapOpen ? [] : [sel?.movable ? sel.id : undefined, input.landing?.id].filter((id) => id !== undefined)
    structures.selected = !mapOpen && sel && !sel.movable ? sel.id : undefined
    structures.movable = builder && !mapOpen ? state.built : []
    const aim = mapOpen ? undefined : input.aimView()
    const buzz = tierBuzz(this.ball.aim, aim)
    if (buzz) navigator.vibrate?.(buzz)
    this.aim.aim = this.ball.aim = this.gauge.aim = aim
    // A cancel-armed aim fires nothing, so it previews no Splash.
    structures.previewSplash(state, aim?.cancel ? undefined : aim, this.config)
    structures.mark()
    // The snap grid and build edge show for an in-play build too, while an item is armed.
    this.pitch.builder = builder ?? (input.item ? builderNow(state) ?? undefined : undefined)
    this.pitch.charge = this.ball.charge = state.charge
    this.ball.radius = this.config.ballRadius
    this.ball.tracer.pxPerUnit = this.camera.view(this.canvas).sy / this.dpr
    this.pitch.flipped = this.ball.flipped = this.aim.flipped = this.gauge.flipped = this.transition.shown === 2
    // During the goal hold the ball rests in the net (the sim has already reset it).
    const inNet = goalBall(this.transition)
    this.ball.sync(inNet ? { ...state.ball, pos: inNet, vel: { x: 0, y: 0 } } : state.ball)
    this.gauge.at = this.ball.state.pos
    // The view's edge on the HUD's side: the dock band starts there.
    this.gauge.dockEdge = this.camera.y + (screenDown(this.transition.shown) * this.camera.visibleHeight) / 2
    this.ball.placement = input.placement && { at: input.placement, legal: canPlaceBall(shooter, input.placement, state.objects, this.config), radius: this.config.ballRadius }
    this.ball.armed = input.armed || state.breaker ? shooter : undefined
  }

  private draw(): void {
    const { canvas, ctx, camera, mapCam } = this
    if (this.viewCam() === mapCam) mapCam.draw(ctx, camera.children, camera.shakeNow)
    else camera.draw(ctx)
    this.fog.draw(ctx)
    this.edgeFade.draw(ctx)
    if (this.mapOpen) {
      // The main view's frame: dashed, with solid corner brackets.
      const { mapOutline, mapOutlinePx, mapDashPx, mapBracket } = visual.camera
      const o = viewOutline(canvas, mapCam, camera)
      ctx.strokeStyle = mapOutline
      ctx.lineWidth = mapOutlinePx * this.dpr
      ctx.setLineDash(mapDashPx.map((d) => d * this.dpr))
      ctx.strokeRect(o.x, o.y, o.w, o.h)
      ctx.setLineDash([])
      ctx.lineWidth = mapBracket.linePx * this.dpr
      const arm = mapBracket.armPx * this.dpr
      strokeBrackets(ctx, o, arm)
    }
  }

  /** Calls `onView` with the HUD view, but only when it differs from the last one (functions in it are stable and not compared). */
  private push(): void {
    const { state, input, transition, now } = this
    const blocked = this.inputBlocked()
    const builder = state.match.builder
    const { inHand } = state.possession
    const placing = placingOf(input.selection)
    const view: HudView = {
      hud: hudModel(state, this.config, { active: transition.hudSeat, buttons: phaseButtons(state, this.config, { mine, current: () => this.state, send: (i) => this.driver.send(i), choosable: !blocked, unplaced: !!placing }), viewer: this.viewer(), placing, destroyed: this.destroyed, bullseyes: this.bullseyes }),
      offence: offenceCircle(state, this.viewer(), { armed: input.armed, blocked: blocked || this.mapOpen, mine }),
      defence: defenceCircle(state, this.viewer(), { item: input.item, selection: input.selection, blocked: blocked || this.mapOpen, mine }, input.build),
      subterfuge: subterfugeCircle(state, this.viewer(), { blocked: blocked || this.mapOpen, mine }),
      strategies: this.strategiesOpen && builder && !blocked ? strategyCards(state, builder, this.config) : undefined,
      overlay: overlayView(transition, now, choosingNotice(state.match, mine)),
      angle: angle(transition, now),
      flipped: transition.shown === 2,
      flipOnTurn: this.flipOnTurn,
      confirm: inHand && !builder && !state.match.choosing && !blocked,
      mapOpen: this.mapOpen,
      menu: { open: this.menuOpen, hotSeat: hotSeat(), settings: settingRows(this.config) },
      minimap: minimapOf(this.camera.y, this.camera.visibleHeight, this.camera.blind),
      winner: state.match.winner ?? undefined,
      result: state.match.winner ? resultOf(state.match, state.match.winner, state.objects) : '',
    }
    const key = JSON.stringify(view)
    if (key === this.lastView) return
    this.lastView = key
    this.onView?.(view)
  }
}

/** Solid corner brackets on the rectangle `o`, each corner's two arms `arm` long. */
function strokeBrackets(ctx: CanvasRenderingContext2D, o: { x: number; y: number; w: number; h: number }, arm: number): void {
  ctx.beginPath()
  for (const [x, dx] of [[o.x, 1], [o.x + o.w, -1]] as const) {
    for (const [y, dy] of [[o.y, 1], [o.y + o.h, -1]] as const) {
      ctx.moveTo(x + dx * arm, y)
      ctx.lineTo(x, y)
      ctx.lineTo(x, y + dy * arm)
    }
  }
  ctx.stroke()
}
