import { rules } from '../config/rules'
import { visual } from '../config/visual'
import type { PlayerId } from '../sim/pitch'
import type { PowerUp } from '../sim/player'
import { blindSeat, buildPhase, openingBuild } from '../sim/mode'
import { canArm, canPlaceBall, whoActs } from '../sim/possession'
import { configFrom, type Settings } from '../sim/settings'
import { defaultConfig, type SimConfig, type SimEvent, type SimState } from '../sim/step'
import { structuresOf } from '../sim/wall'
import type { Driver, DriverFactory, Sink } from './driver'
import { Aim } from './entities/Aim'
import { Ball } from './entities/Ball'
import { anchorY, Camera, hudReserve, viewOutline } from './entities/Camera'
import { EdgeFade } from './entities/EdgeFade'
import { Fog } from './entities/Fog'
import { Pitch } from './entities/Pitch'
import { Structures } from './entities/Structures'
import { routeEvents } from './events'
import { reducedMotion, tierBuzz } from './feedback'
import { InputController } from './input/InputController'
import { defenceCircle, legal, placingOf, type BuildActions, type DefenceCircle } from './view/defenceCircle'
import { countDestroyed, type Destroyed } from './view/defenceBar'
import { hudModel, roundOf, type HudModel } from './view/hudModel'
import { phaseButtons } from './view/phaseButtons'
import { advance, angle, blocking, choosingNotice, dismiss, goalBall, newTransition, overlayView, revealing, type OverlayView } from './view/transition'

export type { PlayerId, PowerUp }

/** Everything the HUD and screens draw from. Data only: pushed up through `onView` when it changes, never read back. */
export type HudView = {
  hud: HudModel
  /** The Defence circle's model, for the whole match (greyed when the viewer cannot build; absent when no build turn is running). */
  defence?: DefenceCircle
  overlay?: OverlayView
  /** Degrees the stage (canvas and in-match HUD) is rotated by the hot-seat flip. */
  angle: number
  /** Player 2 is at the bottom of the screen. */
  flipped: boolean
  /** The ball-in-hand Confirm button is up. */
  confirm: boolean
  mapOpen: boolean
  winner?: PlayerId
  /** The end screen's result line. */
  result: string
}

/** How the HUD and screens drive the game. */
export type GameActions = {
  start(settings: Settings): void
  rematch(): void
  map(open?: boolean): void
  mapStretch(): void
  recenter(): void
  powerUp(p: PowerUp): void
  /** The shooter refunds `count` Move points for Credits; the sim refuses it when not allowed. A count under 1 only buzzes denied. */
  refund(count: number): void
  confirmBall(): void
  /** Tap on the turn card. */
  dismiss(): void
  build: BuildActions
}

/** Hot-seat: every seat is local, so no one is ever waited on. The online wave swaps this one predicate. */
const mine = (_p?: PlayerId | null) => true

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

const storedStretch = () => {
  try {
    return sessionStorage.getItem('mapStretch') === '1'
  } catch {
    return false
  }
}

/**
 * The game renderer: owns the entity tree, the input controller, the frame loop and a driver. Sim state enters only through `apply`,
 * which routes the tick's events to entity methods; inputs leave through the driver.
 */
export class Game implements Sink {
  readonly camera = new Camera(0)
  /** A second camera over the whole pitch for the map overlay; its fit/stretch choice lasts the session. */
  readonly mapCam = new Camera(rules.mapY, { stretch: storedStretch() })
  readonly pitch = new Pitch()
  readonly structures = new Structures()
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
  private lastBuilder: SimState['match']['builder'] | undefined
  private mapOpen = false
  private now = performance.now()
  private last = this.now
  private raf = 0
  private dpr = 1
  private dead = false
  private lastView = ''
  /** The most structures each player has stood this match: the Defence bar keeps a segment for each that falls. */
  private destroyed: Destroyed = { 1: 0, 2: 0 }

  constructor(private canvas: HTMLCanvasElement, makeDriver: DriverFactory, private onView?: (view: HudView) => void) {
    this.driver = makeDriver(this)
    this.ctx = canvas.getContext('2d')!
    this.camera.add(this.pitch)
    this.camera.add(this.structures)
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
      blocked: this.blocked,
      toggleMap: (open) => this.toggleMap(open),
      send: (input) => this.driver.send(input),
    })
    this.actions = {
      start: (s) => ((this.config = configFrom(s)), this.newMatch()),
      rematch: () => this.newMatch(),
      map: (open) => this.toggleMap(open),
      mapStretch: () => {
        const map = this.mapCam.map!
        map.stretch = !map.stretch
        try {
          sessionStorage.setItem('mapStretch', map.stretch ? '1' : '0')
        } catch {}
      },
      recenter: () => this.camera.recenter(),
      powerUp: (p) => p === 'breaker' && this.input.toggleArm(),
      refund: (count) => {
        // Only the device that plays the shooter's seat refunds for it, as only it may aim.
        const { shooter } = this.state.possession
        if (!mine(shooter)) return
        if (count >= 1) this.driver.send({ refund: { player: shooter, count } })
        else if (!reducedMotion()) navigator.vibrate?.([...visual.hud.refund.denied])
      },
      confirmBall: this.input.confirmBall,
      dismiss: () => (this.transition = dismiss(this.transition, performance.now())),
      build: this.input.build,
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

  blocked = () => blocking(this.transition)

  /** Whoever builds, else whoever has the device: online it would be the peer's own seat. */
  private viewer = (): PlayerId => this.state.match.builder ?? this.transition.shown

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
    const { camera, input } = this
    this.seeBlind()
    input.settle(state, events.some((ev) => ev.type === 'refused'))
    if (!state.match.builder && events.length) camera.recenter()
    if (state.match.builder !== this.lastBuilder) {
      this.lastBuilder = state.match.builder
      input.resetBuild()
      if (this.lastBuilder) camera.pan(rules.halfCentre[this.lastBuilder] - camera.y)
      else camera.recenter()
    }
    this.announce(events)
    this.aim.sync(state, this.config)
    routeEvents(events, { camera, structures: this.structures, ball: this.ball, aim: this.aim, vibrate: (p) => navigator.vibrate?.(p) }, state.objects, reducedMotion())
    this.structures.sync(state.objects)
  }

  // The seed varies per match; only the sim stays deterministic.
  private newMatch(seed = (Math.random() * 2 ** 31) | 0): void {
    const s = this.driver.start(this.config, seed)
    // Sim ids restart, so the last match's visual state must not leak into this one.
    for (const e of [this.camera, this.structures, this.ball, this.aim]) e.reset()
    this.input.resetBuild()
    this.transition = newTransition(s.possession.shooter)
    this.camera.recenter()
    this.camera.y = s.ball.pos.y
    this.lastBuilder = undefined
    this.destroyed = { 1: 0, 2: 0 }
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
  }

  private toggleMap(open = !this.mapOpen): void {
    this.mapOpen = open
  }

  private announce(events: SimEvent[]): void {
    const { state } = this
    this.transition = advance(this.transition, { handover: true, active: whoActs(state), round: roundOf(state.match) ?? undefined, inHand: state.possession.inHand, phase: buildPhase(state.match), opening: openingBuild(state.match), events, now: this.now, reduced: reducedMotion() })
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
    if (this.blocked()) this.input.cancelGestures()
    const { state, transition, camera } = this
    this.fitCamera()
    const flipping = !!transition.flip && now - transition.flip.at >= transition.flip.ms / 2
    const target = anchorY(state.ball.pos.y, transition.shown, camera.visibleHeight)
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
    structures.flipped = this.transition.shown === 2
    structures.landing = mapOpen ? undefined : input.landing?.spec
    structures.hidden = mapOpen ? [] : [sel?.movable ? sel.id : undefined, input.landing?.id].filter((id) => id !== undefined)
    structures.selected = !mapOpen && sel && !sel.movable ? sel.id : undefined
    structures.movable = builder && !mapOpen ? state.built : []
    const aim = mapOpen ? undefined : input.aimView()
    const reduced = reducedMotion()
    const buzz = tierBuzz(this.ball.aim, aim, reduced)
    if (buzz) navigator.vibrate?.(buzz)
    this.aim.aim = this.ball.aim = aim
    // A cancel-armed aim fires nothing, so it previews no Splash.
    structures.previewSplash(state, aim?.cancel ? undefined : aim, this.config)
    this.ball.reduced = reduced
    structures.mark()
    this.pitch.builder = builder ?? undefined
    // During the goal hold the ball rests in the net (the sim has already reset it).
    const inNet = goalBall(this.transition)
    this.ball.sync(inNet ? { ...state.ball, pos: inNet, vel: { x: 0, y: 0 } } : state.ball)
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
      const o = viewOutline(canvas, mapCam, camera)
      ctx.strokeStyle = visual.camera.mapOutline
      ctx.lineWidth = visual.camera.mapOutlinePx * this.dpr
      ctx.strokeRect(o.x, o.y, o.w, o.h)
    }
  }

  /** Calls `onView` with the HUD view, but only when it differs from the last one (functions in it are stable and not compared). */
  private push(): void {
    const { state, input, transition, now } = this
    const blocked = this.blocked()
    const builder = state.match.builder
    const { shooter, inHand } = state.possession
    const placing = placingOf(input.selection)
    const view: HudView = {
      hud: hudModel(state, this.config, { active: transition.shown, buttons: phaseButtons(state, this.config, { mine, current: () => this.state, send: (i) => this.driver.send(i), choosable: !blocked, unplaced: !!placing }), viewer: this.viewer(), armed: input.armed, tappable: canArm(state, shooter), placing, destroyed: this.destroyed }),
      defence: defenceCircle(state, this.viewer(), { item: input.item, selection: input.selection, blocked: blocked || this.mapOpen, mine }, input.build),
      overlay: overlayView(transition, now, choosingNotice(state.match, mine)),
      angle: angle(transition, now),
      flipped: transition.shown === 2,
      confirm: inHand && !builder && !state.match.choosing && !blocked,
      mapOpen: this.mapOpen,
      winner: state.match.winner ?? undefined,
      result: state.match.winner ? resultOf(state.match, state.match.winner, state.objects) : '',
    }
    const key = JSON.stringify(view)
    if (key === this.lastView) return
    this.lastView = key
    this.onView?.(view)
  }
}
