import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import type { PlayerId } from '../../sim/pitch'
import { Entity } from './Entity'

/** Boards, grass, lines, goals and nets; during a build turn also the grid and the builder's no-build zone. */
export class Pitch extends Entity {
  /** Whose build turn it is, if any. */
  builder?: PlayerId

  protected override render(ctx: CanvasRenderingContext2D): void {
    const { pitchWidth: w, pitchHeight: h, halfHeight, board, goalLeft, goalRight, netDepth } = rules
    const v = visual.pitch
    ctx.fillStyle = v.board
    ctx.fillRect(0, -board, w, h + 2 * board)
    ctx.fillStyle = v.pitch
    ctx.fillRect(0, 0, w, h)
    // Faint owner tint per half.
    ctx.globalAlpha = v.halfTint
    ctx.fillStyle = visual.player.colors[2]
    ctx.fillRect(0, 0, w, halfHeight)
    ctx.fillStyle = visual.player.colors[1]
    ctx.fillRect(0, halfHeight, w, halfHeight)
    ctx.globalAlpha = 1

    // Nets behind each goal, then the gap in the board.
    for (const [y, dir, color] of [[0, -1, visual.player.colors[2]], [h, 1, visual.player.colors[1]]] as const) {
      ctx.fillStyle = v.net
      ctx.fillRect(goalLeft, dir < 0 ? y - netDepth - board : y + board, goalRight - goalLeft, netDepth)
      ctx.fillStyle = v.pitch
      ctx.fillRect(goalLeft, dir < 0 ? y - board : y, goalRight - goalLeft, board)
      ctx.fillStyle = color
      ctx.fillRect(goalLeft, y - v.goalLineWidth / 2, goalRight - goalLeft, v.goalLineWidth)
    }

    ctx.fillStyle = v.line
    ctx.fillRect(0, halfHeight - v.halfLineWidth / 2, w, v.halfLineWidth)

    if (this.builder) this.drawBuildGrid(ctx, this.builder)
  }

  private drawBuildGrid(ctx: CanvasRenderingContext2D, builder: PlayerId): void {
    const { pitchWidth: w, pitchHeight: h, cellSize } = rules
    const { gridDot, noBuild } = visual.pitch
    ctx.fillStyle = visual.pitch.line
    for (let x = 0; x <= w; x += cellSize) for (let y = 0; y <= h; y += cellSize) ctx.fillRect(x - gridDot / 2, y - gridDot / 2, gridDot, gridDot)
    const [goalY, from] = builder === 1 ? [h, Math.PI] : [0, 0]
    ctx.beginPath()
    ctx.arc(w / 2, goalY, rules.noBuildRadius, from, from + Math.PI)
    ctx.setLineDash([...noBuild.dash])
    ctx.strokeStyle = visual.player.colors[builder]
    ctx.lineWidth = noBuild.lineWidth
    ctx.stroke()
    // The Centre zone: the builder's half of the circle around the centre spot (canvas y grows downwards, so player 1's high-y half is angles 0 to PI).
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, rules.centreZoneRadius, builder === 1 ? 0 : Math.PI, builder === 1 ? Math.PI : 2 * Math.PI)
    ctx.stroke()
    ctx.setLineDash([])
  }
}
