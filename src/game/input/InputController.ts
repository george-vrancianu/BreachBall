import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import type { PlayerId, Point } from '../../sim/pitch'
import { canArm, canPlaceBall } from '../../sim/possession'
import { canEdit, type Aiming, type SimConfig, type SimInput, type SimState } from '../../sim/step'
import { snapWallEnd, type StructureSpec } from '../../sim/wall'
import { screenDown, type Camera } from '../entities/Camera'
import { anchorOf, commit, edgeScrollDy, itemDisabled, landedAs, legal, movedTo, onPiece, pick, rotated, snapBody, snapStart, towerAt, towerGrab, type BuildActions, type Item, type Selection } from '../view/buildMenu'
import { aimMove, aimOf, aimPress, aimRelease, aimTick, aimViewOf, type Aim, type AimGesture, type GestureView } from './gesture'

/** The aim view `Game` pushes into the Ball (hold and control rings) and Aim (Ghost): the gesture's view plus the screen px per world unit. */
export type AimView = GestureView & { pxPerUnit: number }

/**
 * The one press in progress, decided progressively. It starts `pending` (nothing has changed yet) and becomes a gesture once the pointer
 * travels past `dragSlopPx`; a lift while still pending is a tap.
 * - `pending`: `hit` is what lay under the finger on press: the selected structure's body, an unselected own structure, or nothing.
 * - `body`: translating the selected, movable structure; `origin` is where it stood on press, restored if it cannot be committed.
 * - `draw`: drawing a wall from `a`. `tower`: a fresh tower under the finger. Both are held by `offset` for `bodyTo`.
 * - `pan`: the camera follows the finger.
 * `px`/`py` are the pointer's last canvas position (for edge scrolling).
 */
type Press =
  | { kind: 'pending'; id: number; startPx: Point; startWorld: Point; hit?: { sel: Selection; selected: boolean } }
  | { kind: 'body'; id: number; origin: StructureSpec; offset: Point; px: number; py: number }
  | { kind: 'draw'; id: number; a: Point; px: number; py: number }
  | { kind: 'tower'; id: number; offset: Point; px: number; py: number }
  | { kind: 'pan'; id: number }
type Live = Extract<Press, { kind: 'body' | 'draw' | 'tower' }>

/** What the controller needs from the game that owns it. */
export type InputHost = {
  canvas: HTMLCanvasElement
  camera: Camera
  mapCam: Camera
  state(): SimState
  config(): SimConfig
  /** Whose end of the pitch is at the bottom of the screen. */
  shown(): PlayerId
  /** Whether a seat is played on this device: every seat in hot-seat, only the peer's own online. */
  mine(p: PlayerId): boolean
  mapOpen(): boolean
  /** A flip, goal hold, turn card, reveal or REPAIRED sweep is up: the board is not the player's to act on yet. */
  blocked(): boolean
  toggleMap(open?: boolean): void
  send(input: SimInput): void
}

/** Turns canvas gestures and keys into sim inputs (through the host) and camera moves, and owns the build and aim interaction state. */
export class InputController {
  /** The builder's selection: a new piece, or one of their structures. */
  selection?: Selection
  /** A committed selection stays drawn until the sim has it (online it runs a few ticks later) or refuses it. */
  landing?: Selection
  // Ticks the landing has been in flight, so a dropped input cannot block the turn for good.
  private landingTicks = 0
  /** The Defence item armed for drawing: set while in build mode (Rounds, Siege opening), never in a Rearrange turn. */
  item?: Item
  /** Ball-in-hand: where the shooter has put the ball, before Confirm. */
  placement?: Point
  /** Breaker icon armed for the next shot; the shot carries it, cancelling just disarms. */
  armed = false

  // The aim gesture, fed canvas-local CSS px: the hot-seat flip rotates the whole canvas, so its local frame is already the world's way up.
  private aim?: { gesture: AimGesture; player: PlayerId; id: number }
  // The last `aiming` sent, so updates go out only when the aim changes.
  private sentAim = 'null'
  private press?: Press
  private draggingBall = false
  private tap?: Point
  // Every finger down, for two-finger pan. The gesture's own pointer is `press.id`.
  private pointers = new Map<number, Point>()
  private stop = new AbortController()

  constructor(private host: InputHost) {
    const { canvas } = host
    const on = (target: EventTarget, type: string, fn: (e: never) => void, passive?: boolean) => target.addEventListener(type, fn as EventListener, { signal: this.stop.signal, passive })
    // Desktop keys: M map, Space recenter, R rotate, Enter confirm, Esc close the map, else drop the selection, else leave building.
    on(globalThis as unknown as EventTarget, 'keydown', (e: KeyboardEvent) => this.key(e))
    on(canvas, 'wheel', (e: WheelEvent) => (e.preventDefault(), this.panBy(-e.deltaY)), false)
    on(canvas, 'pointermove', (e: PointerEvent) => this.move(e))
    on(canvas, 'pointerup', (e: PointerEvent) => this.up(e))
    // A cancelled pointer (the browser took the gesture) aborts: it never places.
    on(canvas, 'pointercancel', (e: PointerEvent) => this.cancel(e))
    on(canvas, 'pointerdown', (e: PointerEvent) => this.down(e))
  }

  destroy(): void {
    this.stop.abort()
  }

  private get canvasPx() {
    return this.host.canvas.width / this.host.canvas.clientWidth
  }

  private pxToWorld(px: number, py: number) {
    return this.host.camera.toWorld(this.host.canvas, px * this.canvasPx, py * this.canvasPx)
  }

  confirmBall = () => {
    const { shooter } = this.host.state().possession
    if (!this.host.blocked() && !this.host.state().match.choosing && this.placement && canPlaceBall(shooter, this.placement, this.host.state().objects, this.host.config())) this.host.send({ placeBall: { player: shooter, at: this.placement } })
  }

  /** Tap on the Breaker icon. */
  toggleArm = () => {
    const s = this.host.state()
    if (canArm(s, s.possession.shooter)) this.armed = !this.armed
  }

  // Build turn: arm an item, then draw (wall) or press (tower) on the pitch; lifting places the piece if it is legal, else it stays red and unplaced.
  // Pressing one of this turn's structures selects it; an older one is only selected, to demolish it.
  build: BuildActions = {
    toggle: () => {
      if (this.item) this.leaveBuild()
      else if (canEdit(this.host.state())) this.item = 'wall'
    },
    arm: (item: Item) => {
      const s = this.host.state()
      const builder = s.match.builder
      if (this.item && !(builder && itemDisabled(s, builder, item))) this.item = item
    },
    rotate: () => {
      // Mid-gesture the piece is still the finger's: rotating would place a second one.
      if (this.live || !this.selection?.movable) return
      this.selection = rotated(this.selection)
      this.place()
    },
    cancel: () => (this.selection = undefined),
    remove: () => {
      if (this.selection?.id !== undefined) this.host.send({ demolish: { player: this.selection.spec.owner, wall: this.selection.id } })
      this.selection = undefined
    },
  }

  /** Leaves build mode: the armed item and any unplaced piece go. */
  private leaveBuild(): void {
    this.cancelPress()
    this.item = undefined
    if (this.selection?.id === undefined) this.selection = undefined
  }

  /** The press while it is a draw, a tower or a body drag: the finger holds a piece. */
  private get live(): Live | undefined {
    const p = this.press
    return p && p.kind !== 'pending' && p.kind !== 'pan' ? p : undefined
  }

  /** Sends the selection if it stands legal (a new piece is placed, a structure moved) and keeps it drawn as `landing` until the sim has it. */
  private place(): void {
    const { selection } = this
    const input = !this.landing && selection && legal(this.host.state(), selection) && commit(selection)
    if (input) (this.host.send(input), (this.landing = selection), (this.landingTicks = 0), (this.selection = undefined))
  }

  /** The aim to draw, while pressing on the ball or dragging back from it. */
  aimView(): AimView | undefined {
    const v = this.aim && aimViewOf(this.aim.gesture)
    return v && { ...v, pxPerUnit: this.pxPerUnit }
  }

  /** Each frame: holding still on the ball climbs the tier without any pointer move. */
  tickAim(): void {
    if (this.aim) this.aim.gesture = aimTick(this.aim.gesture, performance.now())
  }

  /** The main view as the canvas shows it now. */
  private get view() {
    return this.host.camera.view(this.host.canvas)
  }

  /** Screen (CSS) px per world unit in the main view. */
  private get pxPerUnit() {
    return this.view.sy / this.canvasPx
  }

  private withBreaker(aim: Aim): Aiming {
    return { ...aim, ...(this.armed && { breaker: true }) }
  }

  /** Sends `aiming` only when it differs from the last one sent. */
  private sendAiming(aim: Aim | null): void {
    const aiming = aim && this.withBreaker(aim)
    const key = JSON.stringify(aiming)
    if (key === this.sentAim) return
    this.sentAim = key
    this.host.send({ aiming })
  }

  /** After each sim tick: drop what the new state has made stale. */
  settle(state: SimState, refused: boolean): void {
    if (!canArm(state, state.possession.shooter)) this.armed = false
    if (!state.possession.inHand || state.match.choosing) this.placement = undefined
    if (this.landing && (landedAs(state, this.landing) || refused || ++this.landingTicks >= visual.input.landingTimeoutTicks)) {
      // What the sim took becomes the selection (unless the builder has already moved on to something else).
      const taken = landedAs(state, this.landing)
      this.landing = undefined
      if (taken && !this.selection && !this.live) this.selection = taken
      // A piece lifted while the landing was in flight could not be sent then: send it now.
      else if (this.selection?.id === undefined && !this.live) this.place()
    }
    // The last of an armed tower's stock is down: fall back to the wall.
    const builder = state.match.builder
    if (this.item && this.item !== 'wall' && builder && state.players[builder].inventory[this.item] <= 0) this.item = 'wall'
    // The shot clock fired the held aim: the gesture is spent.
    if (this.aim && state.possession.live) this.dropAim()
  }

  private dropAim(): void {
    this.aim = undefined
    this.sendAiming(null)
  }

  /** Drops a ball-in-hand placement and any half-made gesture. */
  cancelGestures(): void {
    this.placement = this.tap = undefined
    this.draggingBall = false
    this.cancelPress()
    this.dropAim()
  }

  /** The build turn changed hands or ended: a new piece is gone, a moved one never left its spot in the sim. */
  resetBuild(): void {
    this.selection = this.landing = this.press = this.item = undefined
  }

  /** While dragging or drawing near the top or bottom tenth of the view, scroll toward any of the builder's half that is off screen. */
  edgeScroll(dt: number): void {
    const builder = this.host.state().match.builder
    const held = this.live
    if (!held || !builder) return
    const { visibleHeight } = this.view
    const dy = edgeScrollDy(this.host.camera.y, visibleHeight, builder, this.pxToWorld(held.px, held.py).y, dt)
    if (!dy) return
    this.host.camera.pan(dy)
    this.pressTo(held, held.px, held.py)
  }

  /** Feeds the live press the pointer's canvas position. */
  private pressTo(press: Live, px: number, py: number): void {
    const next = { ...press, px, py }
    this.press = next
    if (next.kind === 'draw') this.drawTo(next, px, py)
    else this.bodyTo(next, px, py)
  }

  // A body drag or fresh tower keeps the grab point under the finger; a wall slides freely and its end snaps to a nearby wall end, a tower snaps to the grid.
  private bodyTo(press: Extract<Live, { offset: Point }>, px: number, py: number): void {
    const { selection } = this
    if (!selection) return
    const p = this.pxToWorld(px, py)
    const moved = movedTo(selection.spec, { x: p.x - press.offset.x, y: p.y - press.offset.y })
    const spec = moved.kind === 'wall' ? snapBody(moved, this.host.state().objects, selection.id, visual.input.snapPx / this.pxPerUnit) : moved
    this.selection = { ...selection, spec }
  }

  // The wall's start stays put; its end snaps live to the nearest allowed angle and unit. Under half a unit there is no piece.
  private drawTo(press: Extract<Live, { kind: 'draw' }>, px: number, py: number): void {
    const builder = this.host.state().match.builder
    if (!builder) return
    const b = snapWallEnd(press.a, this.pxToWorld(px, py))
    this.selection = b ? { spec: { kind: 'wall', owner: builder, a: press.a, b }, movable: true } : undefined
  }

  private panBy(dyPx: number): void {
    this.host.camera.pan((-screenDown(this.host.shown()) * dyPx) / this.pxPerUnit)
  }

  private key(e: KeyboardEvent): void {
    const key = e.key.toLowerCase()
    if (e.code === 'Space') (e.preventDefault(), this.host.camera.recenter())
    if (key === 'm') this.host.toggleMap()
    else if (key === 'escape') this.host.mapOpen() ? this.host.toggleMap(false) : this.live ? this.cancelPress() : this.selection ? (this.selection = undefined) : ((this.placement = undefined), this.leaveBuild())
    else if (key === 'r') this.build.rotate()
    else if (key === 'enter' && !this.host.state().match.builder) this.confirmBall()
  }

  /** Abandons the press without committing: a placed structure goes back to where it stood (still selected), a draw, fresh tower or unplaced piece goes. */
  private cancelPress(): void {
    const live = this.live
    const { selection } = this
    if (live?.kind === 'body' && selection?.id !== undefined) this.selection = { ...selection, spec: live.origin }
    else if (live) this.selection = undefined
    this.press = undefined
  }

  private move(e: PointerEvent): void {
    if (this.draggingBall) this.placement = this.pxToWorld(e.offsetX, e.offsetY)
    const { press } = this
    if (press?.id === e.pointerId) {
      if (press.kind === 'pending') this.promote(press, e.offsetX, e.offsetY)
      else if (press.kind !== 'pan') this.pressTo(press, e.offsetX, e.offsetY)
    }
    const prev = this.pointers.get(e.pointerId)
    if (prev) {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const dy = e.clientY - prev.y
      // A second finger pans only when no piece is held: it never moves a piece that is live.
      if (this.pointers.size > 1) this.live || this.panBy(dy / this.pointers.size)
      else if (this.press?.kind === 'pan') this.panBy(dy)
    }
    if (this.aim?.id === e.pointerId) {
      this.aim.gesture = aimMove(this.aim.gesture, { x: e.offsetX, y: e.offsetY }, performance.now())
      this.sendAiming(aimOf(this.aim.gesture))
    }
  }

  /** The browser took the pointer: whatever it was drawing or dragging is abandoned, never placed. */
  private cancel(e: PointerEvent): void {
    if (this.press?.id === e.pointerId) this.cancelPress()
    this.draggingBall = false
    this.tap = undefined
    this.release(e)
    if (this.aim?.id === e.pointerId) this.dropAim()
  }

  private up(e: PointerEvent): void {
    this.draggingBall = false
    if (this.press?.id === e.pointerId) this.lift(this.press)
    if (this.tap && Math.hypot(e.clientX - this.tap.x, e.clientY - this.tap.y) <= visual.input.tapSlopPx) this.placement = this.pxToWorld(e.offsetX, e.offsetY)
    this.tap = undefined
    this.release(e)
    if (this.aim?.id !== e.pointerId) return
    const { gesture, player } = this.aim
    const result = aimRelease(aimMove(gesture, { x: e.offsetX, y: e.offsetY }, performance.now()))
    this.aim = undefined
    if (result.type === 'shot') {
      this.host.send({ shot: { player, ...this.withBreaker(result.aim) }, aiming: null })
      this.sentAim = 'null'
    } else {
      // A cancelled aim disarms Breaker.
      if (result.type === 'cancelled') this.armed = false
      this.sendAiming(null)
    }
  }

  /** The pointer is gone: forget it, and a cancelled aim goes without a shot. */
  private release(e: PointerEvent): void {
    this.pointers.delete(e.pointerId)
    if (this.press?.id === e.pointerId) this.press = undefined
  }

  /** The press moved past the drag slop: it becomes what the armed item and the press point say. */
  private promote(press: Extract<Press, { kind: 'pending' }>, px: number, py: number): void {
    if (Math.hypot(px - press.startPx.x, py - press.startPx.y) <= visual.input.dragSlopPx) return
    const state = this.host.state()
    const builder = state.match.builder
    const { selection, item } = this
    const [id, at] = [press.id, press.startWorld]
    if (builder && selection?.movable && press.hit?.selected) {
      const anchor = anchorOf(selection.spec)
      this.press = { kind: 'body', id, origin: selection.spec, offset: { x: at.x - anchor.x, y: at.y - anchor.y }, px, py }
    } else if (builder && item === 'wall') {
      // From anywhere but the selected piece: a wall's start snaps to a nearby wall end, which is how a new wall chains from an old one.
      this.selection = undefined
      this.press = { kind: 'draw', id, a: snapStart(state, at, visual.input.snapPx / this.pxPerUnit), px, py }
    } else if (builder && item && item !== 'wall') {
      this.selection = { spec: towerAt(item, builder, at), movable: true }
      this.press = { kind: 'tower', id, offset: towerGrab, px, py }
    } else {
      this.press = { kind: 'pan', id }
      return
    }
    this.pressTo(this.press as Live, px, py)
  }

  /** The gesture's pointer lifted. */
  private lift(press: Press): void {
    this.press = undefined
    const { selection } = this
    if (press.kind === 'pending') return this.tapped(press)
    if (press.kind !== 'body') return press.kind === 'pan' ? undefined : this.place()
    // A placed structure never stays displaced and uncommitted: it moves if the sim will take it, else it goes back.
    if (selection?.id === undefined) return this.place()
    if (this.landing || !legal(this.host.state(), selection)) this.selection = { ...selection, spec: press.origin }
    else this.place()
  }

  /** A press lifted before it became a gesture: select what is under it, or drop what is not; an armed tower goes down under the finger. */
  private tapped(press: Extract<Press, { kind: 'pending' }>): void {
    const builder = this.host.state().match.builder
    const { hit } = press
    if (!builder) return
    if (hit?.selected) return
    if (hit) return void (this.selection = hit.sel)
    const unplaced = this.selection?.id === undefined && !!this.selection
    this.selection = undefined
    // A tap only discards an unplaced piece; otherwise an armed tower is put down.
    if (this.item && this.item !== 'wall' && !unplaced) {
      this.selection = { spec: towerAt(this.item, builder, press.startWorld), movable: true }
      this.place()
    }
  }

  /** What lies under a press: the selected structure's body (a 22px touch target), else another of the builder's own, else nothing. */
  private hitAt(state: SimState, builder: PlayerId, at: Point): { sel: Selection; selected: boolean } | undefined {
    const tolerance = Math.max(rules.cellSize / 2, visual.input.touchTargetPx / this.pxPerUnit)
    const { selection } = this
    if (selection && onPiece(selection.spec, at, tolerance)) return { sel: selection, selected: true }
    const own = pick(state, builder, at, tolerance)
    return own && { sel: own, selected: false }
  }

  private down(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const { canvas, camera, mapCam } = this.host
    // The Map and Close buttons still work; everything else is ignored behind a blocking hold, so a tap there cannot carry into the next player's turn.
    if (this.host.blocked() && !this.host.mapOpen()) return
    if (this.host.mapOpen()) {
      camera.pan(mapCam.toWorld(canvas, e.offsetX * this.canvasPx, e.offsetY * this.canvasPx).y - camera.y)
      this.host.toggleMap(false)
      return
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (this.pointers.size > 1) {
      // A second finger pinches/pans and abandons the aim and a press that has not become a gesture yet (nothing has changed, so nothing to restore).
      // A live draw, body drag or tower ignores it (it is registered above, but `move` does not pan while a piece is held).
      // Hook for the end-handle drag: a second finger on the other end of the selected wall would start its own handle press here instead.
      if (this.aim) (this.aim.gesture = { phase: 'pan' }), this.sendAiming(null)
      if (this.press?.kind === 'pending') this.press = undefined
      return
    }
    const state = this.host.state()
    const builder = state.match.builder
    if (builder) {
      // Nothing changes on the press: what is under the finger decides on the move or the lift.
      const at = this.pxToWorld(e.offsetX, e.offsetY)
      this.press = { kind: 'pending', id: e.pointerId, startPx: { x: e.offsetX, y: e.offsetY }, startWorld: at, hit: this.hitAt(state, builder, at) }
      canvas.setPointerCapture(e.pointerId)
      return
    }
    // A defence choice is pending: the board is for looking at, not for placing the ball.
    if (state.match.choosing) {
      this.press = { kind: 'pan', id: e.pointerId }
      return
    }
    // Ball-in-hand: tap a point to set the placement, drag it to move (dragging elsewhere pans), Confirm fixes it.
    if (state.possession.inHand) {
      const at = this.pxToWorld(e.offsetX, e.offsetY)
      if (this.placement && Math.hypot(at.x - this.placement.x, at.y - this.placement.y) <= 2 * this.host.config().ballRadius) {
        this.draggingBall = true
        canvas.setPointerCapture(e.pointerId)
      } else {
        this.press = { kind: 'pan', id: e.pointerId }
        this.tap = { x: e.clientX, y: e.clientY }
      }
      return
    }
    // Press on the ball to aim, when this device plays the shooter (hot-seat: always); anywhere else pans.
    const ball = camera.toCanvas(canvas, state.ball.pos)
    const gesture = aimPress({
      at: { x: e.offsetX, y: e.offsetY },
      now: performance.now(),
      ball: { x: ball.x / this.canvasPx, y: ball.y / this.canvasPx },
      ballRadiusPx: this.host.config().ballRadius * this.pxPerUnit,
      canShoot: !state.possession.live && this.host.mine(state.possession.shooter),
      size: { w: canvas.clientWidth, h: canvas.clientHeight },
    })
    if (gesture.phase === 'pan') {
      this.press = { kind: 'pan', id: e.pointerId }
      return
    }
    canvas.setPointerCapture(e.pointerId)
    this.aim = { gesture, player: state.possession.shooter, id: e.pointerId }
  }
}
