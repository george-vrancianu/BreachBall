import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import type { PalletSpot } from '../../sim/pallet'
import { centreSpot, halfSpan, type BoostZone, type Charge, type PlayerId } from '../../sim/pitch'
import { boostColor, boostZones as zones, zoneLabels } from '../boost'
import { Entity } from './Entity'
import { drawLabel } from './label'

/** One goal end: its line's y, the direction into the pitch (+1 down the canvas) and the owner. P2 defends the top, P1 the bottom. */
const ends = [
  { y: 0, into: 1, owner: 2 },
  { y: rules.pitchHeight, into: -1, owner: 1 },
] as const

/** A dash pattern in reference px, scaled to world units. */
const dashed = (dashPx: readonly number[]): number[] => dashPx.map((d) => d * visual.pitch.unit)

/** Runs `strokes` with a `style` dash and width in `color`, then clears the dash: the keep-out arc and the Activation rings. */
function withDash(ctx: CanvasRenderingContext2D, style: { widthPx: number; dashPx: readonly number[] }, color: string, strokes: () => void): void {
  ctx.setLineDash(dashed(style.dashPx))
  ctx.strokeStyle = color
  ctx.lineWidth = style.widthPx * visual.pitch.unit
  strokes()
  ctx.setLineDash([])
}

/** The ground, markings, goal mouths and nets; during a build turn also the snap grid on the builder's half, the build-zone edge on the halfway line and each Activation ring, in the builder's colour. */
export class Pitch extends Entity {
  /** Whose build turn it is, if any. */
  builder?: PlayerId
  /** The ball's charge, null when not Charged: the zone holding a Charged ball is tinted stronger. */
  charge: Charge | null = null
  /** Turns the labels upright for Player 2's view. */
  flipped = false
  /** The map's Pallet pivots, whose Activation rings are drawn during a build. */
  pallets: readonly PalletSpot[] = []
  private arrivals: { zone: BoostZone; born: number }[] = []
  private credits: { player: PlayerId; credits: number; born: number }[] = []

  /** A shot came to rest in a zone: it flashes and a ring grows out from it for `visual.pitch.boost.arrive.ms`. */
  arrive(zone: BoostZone): void {
    this.arrivals.push({ zone, born: this.clock })
  }

  /** The ball entered the Bullseye from outside and earned `player` `credits`: the Bullseye flashes and a "+credits" in their colour floats up from it for `visual.pitch.boost.credit.ms`. */
  credit(player: PlayerId, credits: number): void {
    this.credits.push({ player, credits, born: this.clock })
  }

  /** Credit animations still running. */
  get creditCount(): number {
    return this.credits.length
  }

  /** The alpha of something born at `born` that flashes at `from` and fades out over `ms`. */
  private fade(from: number, born: number, ms: number): number {
    return from * (1 - (this.clock - born) / ms)
  }

  /** Whether something born at `born` is still animating for `ms`. */
  private alive(born: number, ms: number): boolean {
    return this.clock - born < ms
  }

  /** Arrivals still animating. */
  get arrivalCount(): number {
    return this.arrivals.length
  }

  /** A new match: no arrivals, no charge. */
  reset(): void {
    this.arrivals = []
    this.credits = []
    this.charge = null
  }

  override update(dt: number): void {
    super.update(dt)
    this.arrivals = this.arrivals.filter((a) => this.alive(a.born, visual.pitch.boost.arrive.ms))
    this.credits = this.credits.filter((c) => this.alive(c.born, visual.pitch.boost.credit.ms))
  }

  protected override render(ctx: CanvasRenderingContext2D): void {
    const { pitchWidth: w, pitchHeight: h, halfHeight, board } = rules
    const v = visual.pitch
    const u = v.unit
    ctx.fillStyle = v.ground
    ctx.fillRect(-board, rules.mapTop, w + 2 * board, rules.mapHeight)

    this.drawDots(ctx)
    if (this.builder) this.drawSnapGrid(ctx, this.builder)
    ctx.strokeStyle = v.line
    ctx.lineWidth = v.outline.widthPx * u
    ctx.beginPath()
    ctx.roundRect(0, 0, w, h, v.outline.radiusPx * u)
    ctx.stroke()
    for (const end of ends) this.drawEnd(ctx, end)

    // The Boost ring and Bullseye tints go under the centre line.
    this.drawBoostFills(ctx)
    // Centre line, circle, the Bullseye's outline and dot.
    ctx.lineWidth = v.centre.widthPx * u
    this.halfwayLine(ctx)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(w / 2, halfHeight, rules.centreZoneRadius, 0, 2 * Math.PI)
    ctx.stroke()
    ctx.lineWidth = v.centre.bullseyeWidthPx * u
    ctx.setLineDash(dashed(v.centre.bullseyeDashPx))
    ctx.beginPath()
    ctx.arc(w / 2, halfHeight, rules.boost.bullseye.radius, 0, 2 * Math.PI)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = v.line
    ctx.beginPath()
    ctx.arc(w / 2, halfHeight, v.centre.dotRadiusPx * u, 0, 2 * Math.PI)
    ctx.fill()

    this.drawBoostLabels(ctx)
    this.drawArrivals(ctx)
    this.drawCredits(ctx)

    // Quarter marks on both sidelines.
    ctx.lineWidth = v.quarter.widthPx * u
    const len = v.quarter.lengthPx * u
    for (const y of [h / 4, (3 * h) / 4]) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(len, y)
      ctx.moveTo(w, y)
      ctx.lineTo(w - len, y)
      ctx.stroke()
    }

    if (this.builder) {
      this.drawBuildEdge(ctx, this.builder)
      this.drawPalletRings(ctx, this.builder)
    }
  }

  /** The alpha of the `zone` tint: steady, pulsing slowly, stronger while it holds a Charged ball, flashing on an arrival. */
  private zoneAlpha(zone: BoostZone): number {
    const { alpha, litAlpha, pulse, arrive, credit } = visual.pitch.boost
    const swing = pulse.alphaSwing * Math.sin((2 * Math.PI * this.clock) / pulse.periodMs)
    const lit = this.charge?.zone === zone
    const flash = this.arrivals.reduce((a, r) => (r.zone === zone ? Math.max(a, this.fade(arrive.flashAlpha, r.born, arrive.ms)) : a), 0)
    const credited = zone === 'bullseye' ? this.credits.reduce((a, c) => Math.max(a, this.fade(credit.flashAlpha, c.born, credit.ms)), 0) : 0
    return Math.max(lit ? litAlpha : alpha + swing, flash, credited)
  }

  /** The Boost ring's disc, then the Bullseye's over it, each tinted its own colour. */
  private drawBoostFills(ctx: CanvasRenderingContext2D): void {
    const at = centreSpot()
    for (const zone of zones) {
      ctx.globalAlpha = this.zoneAlpha(zone)
      ctx.fillStyle = visual.pitch.boost.colors[zone]
      ctx.beginPath()
      ctx.arc(at.x, at.y, rules.boost[zone].radius, 0, 2 * Math.PI)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  /** "x1.5" and "x2" below the centre spot, each inside its own zone. */
  private drawBoostLabels(ctx: CanvasRenderingContext2D): void {
    const { label, colors } = visual.pitch.boost
    for (const { zone, text, at, size } of zoneLabels()) {
      drawLabel(ctx, text, at, { size, weight: label.weight, color: colors[zone], alpha: label.alpha, flipped: this.flipped })
    }
  }

  /** Each arrival's ring, growing out from its zone and fading. */
  private drawArrivals(ctx: CanvasRenderingContext2D): void {
    const { arrive } = visual.pitch.boost
    const at = centreSpot()
    for (const a of this.arrivals) {
      const t = (this.clock - a.born) / arrive.ms
      const { zone } = a
      ctx.globalAlpha = 1 - t
      ctx.beginPath()
      ctx.arc(at.x, at.y, rules.boost[zone].radius * (1 + arrive.grow * t), 0, 2 * Math.PI)
      ctx.strokeStyle = boostColor(zone)
      ctx.lineWidth = arrive.widthPx * visual.pitch.unit
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  /** Each credit's "+Credits", rising from the Bullseye in the shooter's colour and fading (up the screen, so down the canvas for Player 2). */
  private drawCredits(ctx: CanvasRenderingContext2D): void {
    const { credit } = visual.pitch.boost
    const at = centreSpot()
    const dir = this.flipped ? 1 : -1
    for (const c of this.credits) {
      const t = (this.clock - c.born) / credit.ms
      drawLabel(ctx, `+${c.credits}`, { x: at.x, y: at.y + dir * (rules.boost.bullseye.radius + credit.rise * t) }, { size: credit.px * visual.pitch.unit, weight: credit.weight, color: visual.player.colors[c.player], alpha: 1 - t, flipped: this.flipped })
    }
  }

  private drawDots(ctx: CanvasRenderingContext2D): void {
    const { pitchWidth: w, pitchHeight: h } = rules
    const { unit: u, grid } = visual.pitch
    const cell = grid.cellPx * u
    const dot = grid.dotPx * u
    ctx.fillStyle = visual.pitch.dot
    // Centred on the pitch so the dots sit symmetrically.
    const cols = Math.floor(w / cell)
    const rows = Math.floor(h / cell)
    const x0 = (w - cols * cell) / 2
    const y0 = (h - rows * cell) / 2
    fillDots(ctx, { x0, x1: x0 + cols * cell, y0, y1: y0 + rows * cell }, cell, dot)
  }

  /** The snap grid: a faint dot at every cell corner (`rules.cellSize`) on the builder's half, marking the cells towers sit in (walls are drawn freely, ADR-0005). Over the ground dots, under the markings. */
  private drawSnapGrid(ctx: CanvasRenderingContext2D, builder: PlayerId): void {
    const { pitchWidth: w, cellSize } = rules
    const { unit: u, snapGrid } = visual.pitch
    const dot = snapGrid.dotPx * u
    const [top, bottom] = halfSpan(builder)
    ctx.globalAlpha = snapGrid.alpha
    ctx.fillStyle = visual.player.colors[builder]
    fillDots(ctx, { x0: 0, x1: w, y0: top, y1: bottom }, cellSize, dot)
    ctx.globalAlpha = 1
  }

  /** One end: corner brackets, goal mouth and keep-out arc. */
  private drawEnd(ctx: CanvasRenderingContext2D, end: (typeof ends)[number]): void {
    this.drawBrackets(ctx, end)
    this.drawGoalMouth(ctx, end)
    this.drawKeepOutArc(ctx, end)
  }

  /** The owner's corner brackets, with rounded elbows. */
  private drawBrackets(ctx: CanvasRenderingContext2D, { y, into, owner }: (typeof ends)[number]): void {
    const { pitchWidth: w } = rules
    const { unit: u, bracket } = visual.pitch
    const inset = bracket.insetPx * u
    const arm = bracket.armPx * u
    ctx.globalAlpha = bracket.alpha
    ctx.strokeStyle = visual.player.colors[owner]
    ctx.lineWidth = bracket.widthPx * u
    ctx.lineJoin = 'round'
    for (const [x, dx] of [[inset, 1], [w - inset, -1]] as const) {
      ctx.beginPath()
      ctx.moveTo(x + dx * arm, y + into * inset)
      ctx.lineTo(x, y + into * inset)
      ctx.lineTo(x, y + into * (inset + arm))
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  /** The goal mouth behind the line: chevrons pointing into the pitch, net lines, then the goal line over the outline. */
  private drawGoalMouth(ctx: CanvasRenderingContext2D, { y, into, owner }: (typeof ends)[number]): void {
    const { goalLeft, goalRight, netDepth } = rules
    const { unit: u, goal: g } = visual.pitch
    const color = visual.player.colors[owner]
    const mouth = goalRight - goalLeft
    const [cw, ch] = [g.chevronPx[0] * u, g.chevronPx[1] * u]
    ctx.save()
    ctx.beginPath()
    ctx.rect(goalLeft, Math.min(y, y - into * netDepth), mouth, netDepth)
    ctx.clip()
    ctx.strokeStyle = color
    ctx.globalAlpha = g.chevronAlpha
    ctx.lineWidth = g.chevronWidthPx * u
    ctx.lineJoin = 'round'
    const cols = Math.ceil(mouth / cw)
    const rows = Math.ceil(netDepth / ch)
    ctx.beginPath()
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const x = goalLeft + i * cw
        // Tip toward the pitch (up for P1 at the bottom, down for P2 at the top), base further behind the line.
        const tip = y - into * (j * ch)
        const base = tip - into * ch
        ctx.moveTo(x, base)
        ctx.lineTo(x + cw / 2, tip)
        ctx.lineTo(x + cw, base)
      }
    ctx.stroke()
    ctx.globalAlpha = g.netAlpha
    ctx.lineWidth = g.netWidthPx * u
    ctx.beginPath()
    for (let i = 1; i <= g.netLines; i++) {
      const x = goalLeft + (mouth * i) / (g.netLines + 1)
      ctx.moveTo(x, y)
      ctx.lineTo(x, y - into * netDepth)
    }
    ctx.stroke()
    ctx.restore()

    ctx.globalAlpha = 1
    ctx.fillStyle = color
    ctx.fillRect(goalLeft, y - (g.lineWidthPx * u) / 2, mouth, g.lineWidthPx * u)
  }

  /** The keep-out arc, the drawn edge of the goal no-build zone: neutral, the builder's colour while that player builds. */
  private drawKeepOutArc(ctx: CanvasRenderingContext2D, { y, into, owner }: (typeof ends)[number]): void {
    withDash(ctx, visual.pitch.keepOut, this.builder === owner ? visual.player.colors[owner] : visual.pitch.line, () => {
      ctx.beginPath()
      ctx.arc(rules.pitchWidth / 2, y, rules.noBuildRadius, into > 0 ? 0 : Math.PI, into > 0 ? Math.PI : 2 * Math.PI)
      ctx.stroke()
    })
  }

  /** Each Activation ring, a no-build zone: dashed like the keep-out arc, in the builder's colour. The Pallet itself is drawn elsewhere. */
  private drawPalletRings(ctx: CanvasRenderingContext2D, builder: PlayerId): void {
    withDash(ctx, visual.pitch.palletRing, visual.player.colors[builder], () => {
      for (const at of this.pallets) {
        ctx.beginPath()
        ctx.arc(at.x, at.y, rules.pallet.ringRadius, 0, 2 * Math.PI)
        ctx.stroke()
      }
    })
  }

  /** The halfway line as the current path, shared by the centre line and the build-zone edge. */
  private halfwayLine(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath()
    ctx.moveTo(0, rules.halfHeight)
    ctx.lineTo(rules.pitchWidth, rules.halfHeight)
  }

  /** The edge of the builder's half, on the halfway line (building is allowed on the whole half). */
  private drawBuildEdge(ctx: CanvasRenderingContext2D, builder: PlayerId): void {
    const { buildEdge: b, unit: u } = visual.pitch
    ctx.globalAlpha = b.alpha
    ctx.strokeStyle = visual.player.colors[builder]
    ctx.lineWidth = b.widthPx * u
    ctx.setLineDash(dashed(b.dashPx))
    this.halfwayLine(ctx)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
  }
}

/** Fills a square dot at every `step` across the bounds `b`, inclusive of both edges. */
function fillDots(ctx: CanvasRenderingContext2D, b: { x0: number; x1: number; y0: number; y1: number }, step: number, dot: number): void {
  const { x0, x1, y0, y1 } = b
  // Float drift can leave (x1 - x0) / step just under a whole number, which would drop the far-edge dots; nudge it over.
  const eps = 1e-9
  const cols = Math.floor((x1 - x0) / step + eps)
  const rows = Math.floor((y1 - y0) / step + eps)
  for (let i = 0; i <= cols; i++) for (let j = 0; j <= rows; j++) ctx.fillRect(x0 + i * step - dot / 2, y0 + j * step - dot / 2, dot, dot)
}
