import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import type { PlayerId, Point } from '../../sim/pitch'
import { Entity } from './Entity'

type Pane = { x: number; y: number; w: number; h: number }
type Size = { width: number; height: number }
/** Canvas px kept clear of the pitch at the top and bottom (the HUD band). */
export type Reserve = { top: number; bottom: number }
const NONE: Reserve = { top: 0, bottom: 0 }
/** What the camera draws through: per-axis scale (always equal, so the pitch is never distorted), the pane on the canvas, and the world height shown. */
export type View = { sx: number; sy: number; pane: Pane; visibleHeight: number }
/** The part of a camera the layout maths needs. */
export type CameraView = { y: number; map?: boolean; reserve?: Reserve }

export function viewOf(canvas: Size, cam: CameraView): View {
  if (!cam.map) {
    const l = layout(canvas, cam.reserve)
    return { sx: l.scale, sy: l.scale, pane: l.pane, visibleHeight: l.visibleHeight }
  }
  // The whole pitch fitted into what the HUD band leaves, centred.
  const { top, bottom } = cam.reserve ?? NONE
  const free = canvas.height - top - bottom
  const s = Math.min(canvas.width / rules.pitchWidth, free / rules.mapHeight)
  const [w, h] = [rules.pitchWidth * s, rules.mapHeight * s]
  return { sx: s, sy: s, pane: { x: (canvas.width - w) / 2, y: top + (free - h) / 2, w, h }, visibleHeight: rules.mapHeight }
}

/** Canvas rectangle where `cam`'s view lies, as seen through the map camera. */
export function viewOutline(canvas: Size, map: CameraView, cam: CameraView): Pane {
  const m = viewOf(canvas, map)
  const h = viewOf(canvas, cam).visibleHeight
  return { x: m.pane.x, y: m.pane.y + m.pane.h / 2 + (cam.y - h / 2 - map.y) * m.sy, w: rules.pitchWidth * m.sx, h: h * m.sy }
}

/**
 * The pane fills the width above the HUD band, showing between `minVisibleHeight` and `maxVisibleHeight` world units of height: screens too wide
 * for the minimum get side bands, screens taller than the maximum a band on the far side (away from the HUD, which `reserve` keeps clear).
 */
export function layout({ width, height }: Size, reserve: Reserve = NONE) {
  const { minVisibleHeight, maxVisibleHeight } = visual.camera
  const free = height - reserve.top - reserve.bottom
  const scale = Math.min(width / rules.pitchWidth, free / minVisibleHeight)
  const visibleHeight = Math.min(free / scale, maxVisibleHeight)
  const [w, h] = [rules.pitchWidth * scale, visibleHeight * scale]
  // The pane sits against the HUD band; the near goal stays next to the controls.
  const y = reserve.top > 0 ? reserve.top : height - reserve.bottom - h
  return { scale, visibleHeight, pane: { x: (width - w) / 2, y, w, h } }
}

/** The world y direction that points down the screen of `seat` at the bottom: +1 for seat 1, -1 for seat 2 (the stage is turned for it). */
export const screenDown = (seat: PlayerId): 1 | -1 => (seat === 1 ? 1 : -1)

/** The HUD band of `px` canvas px, kept clear at the bottom of `seat`'s screen (the top of the canvas when the stage is turned). */
export const hudReserve = (seat: PlayerId, px: number): Reserve => (screenDown(seat) > 0 ? { top: 0, bottom: px } : { top: px, bottom: 0 })

/** The camera centre that holds the ball `visual.camera.anchor` of the way down the screen of `seat` at the bottom. */
export const anchorY = (ballY: number, seat: PlayerId, visibleHeight: number): number => ballY - screenDown(seat) * (visual.camera.anchor - 0.5) * visibleHeight

/** World y range of the opponent's half left out for a blind viewer sitting at `seat`: boards and net included, up to the halfway line. */
export const fogOf = (seat: PlayerId): { top: number; bottom: number } => (seat === 1 ? { top: rules.mapTop, bottom: rules.halfHeight } : { top: rules.halfHeight, bottom: rules.mapTop + rules.mapHeight })

/**
 * Keeps the view on the boards; for a `blind` seat, on its half plus the halfway line. The view (at least `minVisibleHeight`, 64) is taller than a half (54 + board), so it rests on the far board and the strip it still shows above the halfway line is what the fog covers.
 */
export function clampY(y: number, visible: number, blind?: PlayerId): number {
  const top = blind === 1 ? rules.halfHeight : -rules.board
  const bottom = blind === 2 ? rules.halfHeight : rules.pitchHeight + rules.board
  const [lo, hi] = [top + visible / 2, bottom - visible / 2]
  return blind === 2 ? Math.max(Math.min(y, hi), lo) : Math.min(Math.max(y, lo), hi)
}

/** Screen offset in px at time `now` for a shake of `amp` px that started at `born`, decaying linearly to nothing. */
export function shakeOffset(amp: number, born: number, now: number): Point {
  const t = (now - born) / visual.camera.shake.ms
  if (t < 0 || t >= 1) return { x: 0, y: 0 }
  const a = amp * (1 - t)
  return { x: a * Math.sin(now * visual.camera.shake.freqX), y: a * Math.cos(now * visual.camera.shake.freqY) }
}

/**
 * The view onto the pitch: `y` is the world y at its centre, the width is always the pitch width. A `map` camera shows the whole pitch.
 * `held` keeps the view off the ball (manual pan or map jump) until `recenter()`. Its children are the world it draws.
 */
export class Camera extends Entity {
  held = false
  /** Canvas px kept clear for the HUD band; the game sets it each frame for the side the HUD sits on (the map camera's too, so the whole pitch fits above the band). */
  reserve: Reserve = NONE
  /** World height the main view shows, from the last `fit`. */
  visibleHeight: number = visual.camera.minVisibleHeight
  /** The seat whose half is the only one this view may show (a blind opening build); pans and follows are clamped to it. */
  blind?: PlayerId
  private shaking = { amp: 0, born: -Infinity }

  constructor(public y: number, public map?: boolean) {
    super()
  }

  /** Manual pan: moves the view and holds it off the ball until recenter() (sim events call it too). */
  pan(dy: number): void {
    this.y = clampY(this.y + dy, this.visibleHeight, this.blind)
    this.held = true
  }

  /** A new match: no shake, no hold, no blind clamp. */
  reset(): void {
    this.shaking = { amp: 0, born: -Infinity }
    this.held = false
    this.blind = undefined
  }

  recenter(): void {
    this.held = false
  }

  /** Eases toward `target` over about 150 ms, clamped to the boards. */
  follow(target: number, dt: number): void {
    this.y = clampY(this.y + (target - this.y) * (1 - Math.exp(-dt / visual.camera.smoothingS)), this.visibleHeight, this.blind)
  }

  /** Takes the height this canvas shows, so pans and follows clamp to it. */
  fit(canvas: Size): void {
    this.visibleHeight = this.map ? rules.mapHeight : layout(canvas, this.reserve).visibleHeight
  }

  shake(amp: number): void {
    this.shaking = { amp, born: this.clock }
  }

  /** Current shake offset in px. */
  get shakeNow(): Point {
    return shakeOffset(this.shaking.amp, this.shaking.born, this.clock)
  }

  view(canvas: Size): View {
    return viewOf(canvas, this)
  }

  /** Canvas pixel position to world units through this camera. */
  toWorld(canvas: Size, px: number, py: number): Point {
    const { sx, sy, pane } = this.view(canvas)
    return { x: (px - pane.x) / sx, y: this.y + (py - (pane.y + pane.h / 2)) / sy }
  }

  /** World units to canvas pixel position through this camera: the inverse of `toWorld`. */
  toCanvas(canvas: Size, { x, y }: Point): Point {
    const { sx, sy, pane } = this.view(canvas)
    return { x: pane.x + x * sx, y: pane.y + pane.h / 2 + (y - this.y) * sy }
  }

  /** Runs `paint` in world units through this camera, clipped to its pane and offset by `shake`. */
  through(ctx: CanvasRenderingContext2D, shake: Point, paint: () => void): void {
    const { sx, sy, pane } = this.view(ctx.canvas)
    ctx.save()
    ctx.beginPath()
    ctx.rect(pane.x, pane.y, pane.w, pane.h)
    ctx.clip()
    ctx.translate(pane.x + shake.x, pane.y + pane.h / 2 - this.y * sy + shake.y)
    ctx.scale(sx, sy)
    paint()
    ctx.restore()
  }

  /** Draws `content` through this camera. `shake` defaults to its own; the map passes the main camera's, since only that one is in the update tree. */
  override draw(ctx: CanvasRenderingContext2D, content: Entity[] = this.children, shake = this.shakeNow): void {
    ctx.fillStyle = visual.camera.bg
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    this.through(ctx, shake, () => content.forEach((c) => c.draw(ctx)))
  }
}
