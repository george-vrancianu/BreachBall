import { rules, type Tier, type TierName } from '../../config/rules'
import { visual } from '../../config/visual'
import type { Point } from '../../sim/pitch'
import type { AimView } from '../input/InputController'
import { scaleOf } from '../input/gesture'
import { tierClimbed } from '../feedback'
import { tierColor } from './Aim'
import { Entity } from './Entity'
import { drawLabel } from './label'
import { placeClear, textRect, type Rect } from '../layout'

/** What the gauge reads of the aim in progress: its phase and tier, the tier's control radius and the finger's pull in screen px, the aim once there is one, and how many screen px a world unit spans. */
export type GaugeAim = Pick<AimView, 'phase' | 'tier' | 'radiusPx' | 'pxPerUnit'> & Partial<Pick<AimView, 'dir' | 'power' | 'pullPx' | 'cancel'>>

/** The limit ring of the current tier: its tier, radius in world units, the chip on the ring and where it sits (world units, at `visual.aim.gauge.label.chipDeg` on screen), and its colour. */
export type GaugeLimit = { tier: TierName; radius: number; chip: string; chipAt: Point; color: string }

/** The control gauge around the ball while aiming: the current tier's scale band and limit, and the knob at the finger. */
export class AimGauge extends Entity {
  aim?: GaugeAim
  /** The ball's centre, in world units. */
  at: Point = { x: 0, y: 0 }
  /** The stage is turned for Player 2: screen right and down are world left and up, and text turns upright. */
  flipped = false
  /** The world y where the dock band starts, at the screen bottom of the pitch view (the game sets it each frame); none: no dock to keep clear of. */
  dockEdge?: number
  private flared = 0
  // The aim last seen, and the tier switch in progress: the radius (screen px) and colour it morphs from, and the clock when it started.
  private lastAim?: GaugeAim
  private switched?: { fromPx: number; fromColor: string; at: number }

  /** The gauge's radius (its limit ring), in world units: mid-switch it morphs from the old tier's size, overshooting a little. */
  get radius(): number | undefined {
    const { aim, switched } = this
    if (!aim) return undefined
    const px = switched ? switched.fromPx + (aim.radiusPx - switched.fromPx) * backOut(this.morph) : aim.radiusPx
    return px / aim.pxPerUnit
  }

  /** The inner cancel circle's radius, in world units (`visual.aim.gauge.cancelPx`): drawn, and where the scale band starts. */
  get cancelRadius(): number | undefined {
    return this.aim && visual.aim.gauge.cancelPx / this.aim.pxPerUnit
  }

  /** How far the tier switch's morph has run, 0-1; 1 when settled (and before any switch). */
  get morph(): number {
    return this.switched ? Math.min(1, (this.clock - this.switched.at) / visual.aim.gauge.morph.ms) : 1
  }

  /** The tier name popping up above the ring just after a switch ("POWER!"), and how far its rise has run, 0-1. */
  get pop(): { text: string; progress: number } | undefined {
    const { aim, switched } = this
    if (!aim || !switched) return undefined
    const progress = (this.clock - switched.at) / visual.aim.gauge.pop.ms
    return progress < 1 ? { text: `${rules.shot.tiers[aim.tier].name.toUpperCase()}!`, progress } : undefined
  }

  /** +1, or -1 on the turned stage: the gauge's screen-px frame (+x right, +y down) against world axes. */
  private get turn(): number {
    return this.flipped ? -1 : 1
  }

  /** A world point in the gauge's screen-px frame (+x right, +y down from the ball), for an aim's `ppu` px per world unit. */
  private toPx(p: Point, ppu: number): Point {
    return { x: (p.x - this.at.x) * ppu * this.turn, y: (p.y - this.at.y) * ppu * this.turn }
  }

  /** A point in the gauge's screen-px frame as a world point: the inverse of `toPx`. */
  private toWorld(p: Point, ppu: number): Point {
    return { x: this.at.x + (p.x * this.turn) / ppu, y: this.at.y + (p.y * this.turn) / ppu }
  }

  /** The near-ball end chip's centre in the gauge's screen-px frame: past the inner cancel circle (`visual.aim.gauge.cancelPx`) by `nearGapPx`, above the ball. */
  private nearChipPx(): Point {
    const { cancelPx, label } = visual.aim.gauge
    return { x: 0, y: -(cancelPx + label.nearGapPx) }
  }

  /** A label chip's box in the gauge's screen-px frame (+x right, +y down from the ball): `text` at `sizePx` centred on `at`, padded as drawn. */
  private chipBox(at: Point, text: string, sizePx: number): Rect {
    const { heightPx } = visual.aim.gauge.label
    const r = textRect(at, text, sizePx, visual.text.glyphEm)
    return { ...r, w: chipWidthPx(r.w), h: heightPx }
  }

  /** The end chips' boxes in the gauge's screen-px frame: the near-ball one and the one at the limit. */
  private endBoxesPx(): Rect[] {
    const { ends, radius, aim } = this
    if (!aim || !ends || radius === undefined) return []
    const { label } = visual.aim.gauge
    return [
      this.chipBox(this.nearChipPx(), ends.near, label.nearSizePx),
      this.chipBox({ x: 0, y: -radius * aim.pxPerUnit }, ends.limit, label.sizePx),
    ]
  }

  /** The near-ball end chip's box in world units, for the Charged ball's badge to keep clear of; none without an aim. */
  get chipRects(): Rect[] {
    const { aim } = this
    const near = this.endBoxesPx()[0]
    if (!aim || !near) return []
    return [{ ...this.toWorld(near, aim.pxPerUnit), w: near.w / aim.pxPerUnit, h: near.h / aim.pxPerUnit }]
  }

  /** The limits drawn: only the current tier's, never the other tier's. The chip is on the ring at the first of `chipDegs` where it keeps clear of the readout and the end chips. */
  get limits(): GaugeLimit[] {
    const { aim, radius, readout } = this
    if (!aim || radius === undefined) return []
    const tier = rules.shot.tiers[aim.tier].name
    const chip = `${tier.toUpperCase()} LIMIT`
    const { chipDegs, sizePx } = visual.aim.gauge.label
    const { wPx, hPx } = visual.aim.gauge.readout
    const ppu = aim.pxPerUnit
    const avoid = this.endBoxesPx()
    if (readout) avoid.push({ ...this.toPx(readout.at, ppu), w: wPx, h: hPx })
    // Screen degrees: on the turned stage screen right and down are world left and up.
    const spots = chipDegs.map((deg) => ({ dx: radius * ppu * Math.cos((deg * Math.PI) / 180), dy: radius * ppu * Math.sin((deg * Math.PI) / 180) }))
    const box = this.chipBox({ x: 0, y: 0 }, chip, sizePx)
    const chipAt = this.toWorld(placeClear({ x: 0, y: 0 }, box, spots, avoid), ppu)
    return [{ tier, radius, chip, chipAt, color: this.color }]
  }

  /** The scale's end labels: its reading near the ball and at the limit, by the tier's curve. */
  get ends(): { near: string; limit: string } | undefined {
    return this.aim && visual.aim.gauge.ends[rules.shot.tiers[this.aim.tier].curve]
  }

  /** The knob at the finger, clamped to the limit, in world units; none before the drag. */
  get knob(): Point | undefined {
    const { aim } = this
    if (!aim?.dir || aim.pullPx === undefined) return undefined
    const d = Math.min(aim.pullPx, aim.radiusPx) / aim.pxPerUnit
    return { x: this.at.x - aim.dir.x * d, y: this.at.y - aim.dir.y * d }
  }

  /** The readout chip beside the knob (world units): to its screen right, or its left near the pitch's right edge as the viewer sees it (the screen's, on a phone); above the knob instead when it would land in the dock band (`dockEdge`); the tier, the power in %, and how many meter segments are lit (by the scale position, all at the tier's strong end). */
  get readout(): { at: Point; tier: string; percent: number; lit: number } | undefined {
    const { aim, knob } = this
    if (!aim || !knob || aim.power === undefined) return undefined
    const { offsetPx, dropPx, edgePx, segments, hPx, dockClearPx, risePx } = visual.aim.gauge.readout
    // World units per screen px, right and down: negative on the turned stage.
    const s = this.turn / aim.pxPerUnit
    const roomPx = (this.flipped ? knob.x : rules.pitchWidth - knob.x) * aim.pxPerUnit
    const side = roomPx < edgePx ? -1 : 1
    const belowPx = this.dockEdge === undefined ? Infinity : (this.dockEdge - knob.y) / s
    const rise = belowPx < dropPx + hPx / 2 + dockClearPx
    const at = { x: knob.x + s * side * offsetPx, y: knob.y + s * (rise ? -risePx : dropPx) }
    return { at, tier: rules.shot.tiers[aim.tier].name.toUpperCase(), percent: Math.round(aim.power * 100), lit: Math.round(scaleOfAim(aim) * segments) }
  }

  /** How far the limit ring and the knob have flared, 0-1: easing towards 1 while the drag is past the limit, back to 0 inside it. */
  get flare(): number {
    return this.flared
  }

  /** A new match: no aim, no switch, no flare. */
  reset(): void {
    this.aim = this.lastAim = this.switched = undefined
    this.flared = 0
  }

  override update(dt: number): void {
    const { aim, lastAim } = this
    if (lastAim && tierClimbed(lastAim, aim)) this.switched = { fromPx: lastAim.radiusPx, fromColor: tierColor(lastAim.tier), at: this.clock }
    if (!aim) this.switched = undefined
    this.lastAim = aim
    super.update(dt)
    const past = aim?.pullPx !== undefined && aim.pullPx > aim.radiusPx ? 1 : 0
    this.flared += (past - this.flared) * Math.min(1, dt * visual.aim.gauge.flare.rate)
  }

  /** The gauge's colour: the tier's, cross-fading from the old tier's during a switch. */
  get color(): string {
    const to = tierColor(this.aim?.tier ?? 0)
    return this.switched ? mixColor(this.switched.fromColor, to, easeOut(this.morph)) : to
  }

  /** Drawn in screen px around the ball, turned with the stage so it reads upright: +x is screen right, +y screen down. */
  protected override render(ctx: CanvasRenderingContext2D): void {
    const { aim, radius } = this
    if (!aim || radius === undefined) return
    const ppu = aim.pxPerUnit
    const local = (p: Point): Point => this.toPx(p, ppu)
    ctx.save()
    ctx.translate(this.at.x, this.at.y)
    ctx.scale(1 / ppu, 1 / ppu)
    if (this.flipped) ctx.rotate(Math.PI)
    // Shadow blur ignores the transform: scale it to device px by hand.
    const m = ctx.getTransform()
    const blur = Math.hypot(m.a, m.b)
    const curve = rules.shot.tiers[aim.tier].curve
    const knob = this.knob && local(this.knob)
    const inner = visual.aim.gauge.cancelPx
    this.drawScale(ctx, radius * ppu, inner, curve, blur, local)
    if (knob && aim.pullPx !== undefined) this.drawPull(ctx, knob, Math.min(aim.pullPx, aim.radiusPx), inner, curve, scaleOfAim(aim))
    const readout = this.readout
    if (readout && knob) this.drawReadout(ctx, local(readout.at), readout)
    const pop = this.pop
    if (pop) {
      const { sizePx, growPx, growShare, gapPx, risePx, weight } = visual.aim.gauge.pop
      const size = sizePx + growPx * easeOut(Math.min(1, pop.progress / growShare))
      // In the new tier's colour, not the cross-fade's. The frame is already turned with the stage.
      drawLabel(ctx, pop.text, { x: 0, y: -(radius * ppu + gapPx + risePx * pop.progress) }, { size, weight, font: visual.hud.display, color: tierColor(aim.tier), alpha: 1 - pop.progress, flipped: false })
    }
    ctx.restore()
  }

  /** The scale band, tick rings, inner cancel circle, the breathing limit, the end labels and the limit chip; `R` the shown radius and `inner` the cancel circle's, in px; `local` a world point in the gauge's px frame. */
  private drawScale(ctx: CanvasRenderingContext2D, R: number, inner: number, curve: Tier['curve'], blur: number, local: (p: Point) => Point): void {
    const { band, ticks, cancel, limit, flare, label } = visual.aim.gauge
    const col = this.color
    const g = ctx.createRadialGradient(0, 0, inner, 0, 0, R)
    g.addColorStop(0, withAlpha(col, band[curve][0]))
    g.addColorStop(1, withAlpha(col, band[curve][1]))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, R, 0, Math.PI * 2)
    ctx.moveTo(inner, 0)
    ctx.arc(0, 0, inner, 0, Math.PI * 2, true)
    ctx.fill('evenodd')
    ctx.lineWidth = ticks.widthPx
    ctx.strokeStyle = withAlpha(col, ticks.alpha)
    ctx.setLineDash(ticks.dashPx)
    // Ticks at true shares of the power scale, which starts at the gesture's slop, not the wider drawn cancel circle.
    const slop = visual.aim.slopPx
    for (const f of ticks.at) circle(ctx, slop + (R - slop) * f)
    ctx.setLineDash([])
    ctx.strokeStyle = withAlpha(cancel.color, cancel.alpha)
    ctx.lineWidth = cancel.widthPx
    circle(ctx, inner)
    const k = this.flared
    const breathe = limit.breathePx * Math.sin((2 * Math.PI * this.clock) / limit.breatheMs) * (1 - k)
    ctx.save()
    ctx.shadowColor = col
    ctx.shadowBlur = (limit.glowPx + flare.glowPx * k) * blur
    ctx.strokeStyle = col
    ctx.lineWidth = limit.widthPx + flare.widthPx * k
    circle(ctx, Math.max(0, R + breathe))
    ctx.restore()
    const ends = this.ends
    if (ends) {
      chip(ctx, ends.limit, { x: 0, y: -R }, col, label.sizePx)
      const near = label.near[curve]
      chip(ctx, ends.near, this.nearChipPx(), withAlpha(col, near.alpha), label.nearSizePx, near.fill)
    }
    for (const l of this.limits) chip(ctx, l.chip, local(l.chipAt), l.color, label.sizePx)
  }

  /** While aiming: the lit wedge on the pull side, the ring at the finger's distance `d` (px, clamped to the limit), the ripple, the elastic line and the knob; `inner` the cancel circle's radius (px), `e` the scale position. */
  private drawPull(ctx: CanvasRenderingContext2D, knob: Point, d: number, inner: number, curve: Tier['curve'], e: number): void {
    const { wedge, level, ripple, elastic, knob: kn, flare } = visual.aim.gauge
    const col = this.color
    const pull = Math.atan2(knob.y, knob.x)
    const half = (wedge.halfDeg * Math.PI) / 180
    const w = ctx.createRadialGradient(0, 0, inner, 0, 0, Math.max(inner, d))
    w.addColorStop(0, withAlpha(col, wedge[curve][0]))
    w.addColorStop(1, withAlpha(col, wedge[curve][1]))
    ctx.fillStyle = w
    ctx.beginPath()
    ctx.arc(0, 0, Math.max(inner, d), pull - half, pull + half)
    ctx.arc(0, 0, inner, pull + half, pull - half, true)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = withAlpha(col, level.alpha[0] + (level.alpha[1] - level.alpha[0]) * e)
    ctx.lineWidth = level.widthPx
    circle(ctx, d)
    const period = ripple.slowMs - (ripple.slowMs - ripple.fastMs) * e
    const ph = (this.clock % period) / period
    ctx.strokeStyle = withAlpha(col, ripple.alpha * (1 - ph))
    ctx.lineWidth = ripple.widthPx
    circle(ctx, inner + Math.max(0, d - inner) * ph)
    ctx.strokeStyle = withAlpha(elastic.color, elastic.alpha)
    ctx.lineWidth = elastic.widthPx
    ctx.setLineDash(elastic.dashPx)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(knob.x, knob.y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = kn.fill
    ctx.strokeStyle = col
    ctx.lineWidth = kn.widthPx
    ctx.beginPath()
    ctx.arc(knob.x, knob.y, kn.radiusPx + flare.knobPx * this.flared, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.arc(knob.x, knob.y, kn.dotPx, 0, Math.PI * 2)
    ctx.fill()
  }

  /** The readout chip at `at` (px): the tier name, the power in % and the meter. */
  private drawReadout(ctx: CanvasRenderingContext2D, at: Point, { tier, percent, lit }: { tier: string; percent: number; lit: number }): void {
    const r = visual.aim.gauge.readout
    const col = this.color
    ctx.fillStyle = r.fill
    ctx.beginPath()
    ctx.roundRect(at.x - r.wPx / 2, at.y - r.hPx / 2, r.wPx, r.hPx, r.radiusPx)
    ctx.fill()
    ctx.strokeStyle = withAlpha(col, r.borderAlpha)
    ctx.lineWidth = r.borderPx
    ctx.stroke()
    drawLabel(ctx, tier, { x: at.x, y: at.y + r.nameDyPx }, { size: r.namePx, weight: r.nameWeight, color: col, flipped: false })
    drawLabel(ctx, `${percent}%`, { x: at.x, y: at.y + r.percentDyPx }, { size: r.percentPx, weight: r.percentWeight, font: visual.hud.display, color: visual.hud.ink, flipped: false })
    const left = at.x - (r.segments * r.segPitchPx - (r.segPitchPx - r.segWPx)) / 2
    for (let i = 0; i < r.segments; i++) {
      ctx.fillStyle = i < lit ? col : withAlpha(col, r.unlitAlpha)
      ctx.fillRect(left + i * r.segPitchPx, at.y + r.segDyPx, r.segWPx, r.segHPx)
    }
  }
}

/** Strokes a circle of radius `r` (px) round the gauge's centre. */
function circle(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.stroke()
}

/** A chip's width (px) for a text `textPx` wide: the side padding (`visual.aim.gauge.label.padPx`) added. */
const chipWidthPx = (textPx: number): number => textPx + visual.aim.gauge.label.padPx

/** A label chip centred on `at` (px): text in `color` (`#rrggbb` or `rgba()`) on a dark pill (`fill`) with a faint border in the same colour. */
function chip(ctx: CanvasRenderingContext2D, text: string, at: Point, color: string, sizePx: number, fill: string = visual.aim.gauge.label.fill): void {
  const { heightPx, borderPx, borderAlpha, weight } = visual.aim.gauge.label
  ctx.font = `${weight} ${sizePx}px ${visual.hud.font}`
  const w = chipWidthPx(ctx.measureText(text).width)
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.roundRect(at.x - w / 2, at.y - heightPx / 2, w, heightPx, heightPx / 2)
  ctx.fill()
  ctx.strokeStyle = color
  ctx.globalAlpha = borderAlpha
  ctx.lineWidth = borderPx
  ctx.stroke()
  ctx.globalAlpha = 1
  drawLabel(ctx, text, at, { size: sizePx, weight, color, flipped: false })
}

/** Where the aim's pull sits on its tier's scale, 0-1 (see `scaleOf`). */
const scaleOfAim = ({ tier, pullPx = 0 }: GaugeAim): number => scaleOf(rules.shot.tiers[tier], pullPx)

/** Eases out (cubic): fast, then settling. */
const easeOut = (t: number): number => 1 - (1 - t) ** 3

/** Eases out past 1 and back (`visual.aim.gauge.morph.overshoot`), ending at 1. */
function backOut(t: number): number {
  const c = visual.aim.gauge.morph.overshoot
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2
}

const rgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

/** `#rrggbb` colours `a` to `b`, `t` (0-1) of the way. */
function mixColor(a: string, b: string, t: number): string {
  const [x, y] = [rgb(a), rgb(b)]
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')
}

/** A `#rrggbb` colour at `alpha`, 0-1. */
function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}
