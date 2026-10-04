import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import type { PlayerId, Point } from '../../sim/pitch'
import { canArm, canPlaceBall } from '../../sim/possession'
import { canEdit, type Aiming, type SimConfig, type SimInput, type SimState } from '../../sim/step'
import { snapWallEnd } from '../../sim/wall'
import { screenDown, type Camera } from '../entities/Camera'
import { anchorOf, commit, edgeScrollDy, itemDisabled, landedAs, legal, movedTo, onPiece, pick, rotated, snapStart, towerAt, towerGrab, type BuildActions, type Item, type Selection } from '../view/buildMenu'
import { aimMove, aimOf, aimPress, aimRelease, aimTick, aimViewOf, type Aim, type AimGesture, type GestureView } from './gesture'

/** The aim view `Game` pushes into the Ball (hold and control rings) and Aim (Ghost): the gesture's view plus the screen px per world unit. */
export type AimView = GestureView & { pxPerUnit: number }

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
  // Grab point relative to the piece's anchor, and the pointer's last canvas position (for edge scrolling).
  // `moved` once the pointer has travelled past visual.input.dragSlopPx from the press, which is when edge scrolling may start.
  // `fresh`: a tower put down by this press, which lifting places even without a move.
  private drag?: { offset: Point; px: number; py: number; id: number; from: Point; moved: boolean; fresh: boolean }
  // A wall being drawn from `a` (world); the build piece shows once the pointer has moved past dragSlopPx.
  private draw?: { a: Point; px: number; py: number; id: number; from: Point; moved: boolean }
  private draggingBall = false
  private tap?: Point
  // Pan: any drag that is not an aim or ghost drag, or two fingers in any phase.
  private pointers = new Map<number, Point>()
  private panOnly = false
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
      if (this.draw || this.drag || !this.selection?.movable) return
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
    this.item = this.draw = this.drag = undefined
    if (this.selection?.id === undefined) this.selection = undefined
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
      if (taken && !this.selection && !this.draw && !this.drag) this.selection = taken
      // A piece lifted while the landing was in flight could not be sent then: send it now.
      else if (this.selection?.id === undefined && !this.draw && !this.drag) this.place()
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
    this.dropAim()
  }

  /** The build turn changed hands or ended: a new piece is gone, a moved one never left its spot in the sim. */
  resetBuild(): void {
    this.selection = this.landing = this.drag = this.draw = this.item = undefined
  }

  /** While dragging or drawing near the top or bottom tenth of the view, scroll toward any of the builder's half that is off screen. */
  edgeScroll(dt: number): void {
    const builder = this.host.state().match.builder
    const held = this.drag?.moved ? this.drag : this.draw?.moved ? this.draw : undefined
    if (!held || !builder) return
    const { visibleHeight } = this.view
    const dy = edgeScrollDy(this.host.camera.y, visibleHeight, builder, this.pxToWorld(held.px, held.py).y, dt)
    if (!dy) return
    this.host.camera.pan(dy)
    if (held === this.drag) this.dragTo(held.px, held.py)
    else this.drawTo(held.px, held.py)
  }

  // Drags keep the grab point under the finger; a wall slides freely, a tower snaps to the grid.
  private dragTo(px: number, py: number): void {
    const { drag, selection } = this
    if (!drag || !selection) return
    const p = this.pxToWorld(px, py)
    this.drag = { ...drag, px, py, moved: drag.moved || Math.hypot(px - drag.from.x, py - drag.from.y) > visual.input.dragSlopPx }
    this.selection = { ...selection, spec: movedTo(selection.spec, { x: p.x - drag.offset.x, y: p.y - drag.offset.y }) }
  }

  // The wall's start stays put; its end snaps live to the nearest allowed angle and unit. Under half a unit there is no piece.
  private drawTo(px: number, py: number): void {
    const { draw } = this
    const builder = this.host.state().match.builder
    if (!draw || !builder) return
    const moved = draw.moved || Math.hypot(px - draw.from.x, py - draw.from.y) > visual.input.dragSlopPx
    this.draw = { ...draw, px, py, moved }
    if (!moved) return
    const b = snapWallEnd(draw.a, this.pxToWorld(px, py))
    this.selection = b ? { spec: { kind: 'wall', owner: builder, a: draw.a, b }, movable: true } : undefined
  }

  private panBy(dyPx: number): void {
    this.host.camera.pan((-screenDown(this.host.shown()) * dyPx) / this.pxPerUnit)
  }

  private key(e: KeyboardEvent): void {
    const key = e.key.toLowerCase()
    if (e.code === 'Space') (e.preventDefault(), this.host.camera.recenter())
    if (key === 'm') this.host.toggleMap()
    else if (key === 'escape') this.host.mapOpen() ? this.host.toggleMap(false) : this.draw || this.drag ? this.abortGesture() : this.selection ? (this.selection = undefined) : ((this.placement = undefined), this.leaveBuild())
    else if (key === 'r') this.build.rotate()
    else if (key === 'enter' && !this.host.state().match.builder) this.confirmBall()
  }

  /** Stops a live draw or drag without placing: an unplaced piece goes, a placed structure stays selected as it is. */
  private abortGesture(): void {
    if (this.draw || this.drag?.fresh || this.selection?.id === undefined) this.selection = undefined
    this.draw = this.drag = undefined
  }

  private move(e: PointerEvent): void {
    if (this.draggingBall) this.placement = this.pxToWorld(e.offsetX, e.offsetY)
    const prev = this.pointers.get(e.pointerId)
    if (prev) {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const dy = e.clientY - prev.y
      if (this.pointers.size > 1) this.panBy(dy / this.pointers.size)
      else if (this.panOnly) this.panBy(dy)
    }
    if (this.drag?.id === e.pointerId) this.dragTo(e.offsetX, e.offsetY)
    if (this.draw?.id === e.pointerId) this.drawTo(e.offsetX, e.offsetY)
    if (this.aim?.id === e.pointerId) {
      this.aim.gesture = aimMove(this.aim.gesture, { x: e.offsetX, y: e.offsetY }, performance.now())
      this.sendAiming(aimOf(this.aim.gesture))
    }
  }

  /** The browser took the pointer: whatever it was drawing or dragging is abandoned, never placed. */
  private cancel(e: PointerEvent): void {
    if (this.draw?.id === e.pointerId || this.drag?.id === e.pointerId) this.abortGesture()
    this.draggingBall = false
    this.tap = undefined
    this.release(e)
    if (this.aim?.id === e.pointerId) this.dropAim()
  }

  private up(e: PointerEvent): void {
    this.draggingBall = false
    if (this.drag?.id === e.pointerId) {
      const { moved, fresh } = this.drag
      this.drag = undefined
      // Lifting after a translate (or putting a new tower down) places the piece if it stands legal; else it stays, red and unplaced.
      if (moved || fresh) this.place()
    }
    if (this.draw?.id === e.pointerId) {
      this.draw = undefined
      this.place()
    }
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
    this.panOnly = false
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
    // A second finger during a draw that is showing is ignored: it neither cancels the draw nor pans.
    if (this.draw?.moved && this.draw.id !== e.pointerId) return
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (this.pointers.size > 1) {
      // A second finger pinches/pans and abandons the aim, and a draw that has not shown yet.
      if (this.aim) (this.aim.gesture = { phase: 'pan' }), this.sendAiming(null)
      this.drag = this.draw = undefined
      return
    }
    const state = this.host.state()
    const builder = state.match.builder
    if (builder) {
      const at = this.pxToWorld(e.offsetX, e.offsetY)
      // On the piece: half a cell, or a 44px touch target.
      const tolerance = Math.max(rules.cellSize / 2, visual.input.touchTargetPx / this.pxPerUnit)
      if (!this.selection) this.selection = pick(state, builder, at, tolerance)
      const sel = this.selection
      const from = { x: e.offsetX, y: e.offsetY }
      if (sel?.movable && onPiece(sel.spec, at, tolerance)) {
        const anchor = anchorOf(sel.spec)
        this.drag = { offset: { x: at.x - anchor.x, y: at.y - anchor.y }, px: from.x, py: from.y, id: e.pointerId, from, moved: false, fresh: false }
        canvas.setPointerCapture(e.pointerId)
      } else if (this.item && canEdit(state)) {
        // Empty pitch with an item armed: draw. An unplaced piece is discarded first, and a tower is not put down by that same press (a tap only discards).
        const discarded = !!sel && sel.id === undefined
        this.selection = undefined
        canvas.setPointerCapture(e.pointerId)
        if (this.item === 'wall') this.draw = { a: snapStart(state, at, visual.input.snapPx / this.pxPerUnit), px: from.x, py: from.y, id: e.pointerId, from, moved: false }
        else if (!discarded) {
          this.selection = { spec: towerAt(this.item, builder, at), movable: true }
          this.drag = { offset: towerGrab, px: from.x, py: from.y, id: e.pointerId, from, moved: false, fresh: true }
        }
      } else this.panOnly = true
      return
    }
    // A defence choice is pending: the board is for looking at, not for placing the ball.
    if (state.match.choosing) {
      this.panOnly = true
      return
    }
    // Ball-in-hand: tap a point to set the placement, drag it to move (dragging elsewhere pans), Confirm fixes it.
    if (state.possession.inHand) {
      const at = this.pxToWorld(e.offsetX, e.offsetY)
      if (this.placement && Math.hypot(at.x - this.placement.x, at.y - this.placement.y) <= 2 * this.host.config().ballRadius) {
        this.draggingBall = true
        canvas.setPointerCapture(e.pointerId)
      } else {
        this.panOnly = true
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
      this.panOnly = true
      return
    }
    canvas.setPointerCapture(e.pointerId)
    this.aim = { gesture, player: state.possession.shooter, id: e.pointerId }
  }
}
