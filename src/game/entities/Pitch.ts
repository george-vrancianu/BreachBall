import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import type { PlayerId } from '../../sim/pitch'
import { Entity } from './Entity'

/** One goal end: its line's y, the direction into the pitch (+1 down the canvas) and the owner. P2 defends the top, P1 the bottom. */
const ends = [
  { y: 0, into: 1, owner: 2 },
  { y: rules.pitchHeight, into: -1, owner: 1 },
] as const

/** A dash pattern in reference px, scaled to world units. */
const dashed = (dashPx: readonly number[]): number[] => dashPx.map((d) => d * visual.pitch.unit)

/** The ground, markings, goal mouths and nets; during a build turn also the snap grid on the builder's half and the build-zone edge on the halfway line, in the builder's colour. */
export class Pitch extends Entity {
  /** Whose build turn it is, if any. */
  builder?: PlayerId

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

    // Centre line, circle, inner ring and dot.
    const r = rules.centreZoneRadius
    ctx.lineWidth = v.centre.widthPx * u
    this.halfwayLine(ctx)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(w / 2, halfHeight, r, 0, 2 * Math.PI)
    ctx.stroke()
    ctx.lineWidth = v.centre.innerWidthPx * u
    ctx.setLineDash(dashed(v.centre.innerDashPx))
    ctx.beginPath()
    ctx.arc(w / 2, halfHeight, r * v.centre.innerRatio, 0, 2 * Math.PI)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = v.line
    ctx.beginPath()
    ctx.arc(w / 2, halfHeight, v.centre.dotRadiusPx * u, 0, 2 * Math.PI)
    ctx.fill()

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

    if (this.builder) this.drawBuildEdge(ctx, this.builder)
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
    for (let i = 0; i <= cols; i++) for (let j = 0; j <= rows; j++) ctx.fillRect(x0 + i * cell - dot / 2, y0 + j * cell - dot / 2, dot, dot)
  }

  /** The snap grid: a faint dot at every cell corner (`rules.cellSize`) on the builder's half, where pieces snap. Over the ground dots, under the markings. */
  private drawSnapGrid(ctx: CanvasRenderingContext2D, builder: PlayerId): void {
    const { pitchWidth: w, pitchHeight: h, halfHeight, cellSize } = rules
    const { unit: u, snapGrid } = visual.pitch
    const dot = snapGrid.dotPx * u
    // Player 1 builds on the bottom half (high y), player 2 on the top.
    const [top, bottom] = builder === 1 ? [halfHeight, h] : [0, halfHeight]
    ctx.globalAlpha = snapGrid.alpha
    ctx.fillStyle = snapGrid.color
    for (let x = 0; x <= w; x += cellSize) for (let y = top; y <= bottom; y += cellSize) ctx.fillRect(x - dot / 2, y - dot / 2, dot, dot)
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
    const { keepOut } = visual.pitch
    ctx.beginPath()
    ctx.arc(rules.pitchWidth / 2, y, rules.noBuildRadius, into > 0 ? 0 : Math.PI, into > 0 ? Math.PI : 2 * Math.PI)
    ctx.setLineDash(dashed(keepOut.dashPx))
    ctx.strokeStyle = this.builder === owner ? visual.player.colors[owner] : visual.pitch.line
    ctx.lineWidth = keepOut.widthPx * visual.pitch.unit
    ctx.stroke()
    ctx.setLineDash([])
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
