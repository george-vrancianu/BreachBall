import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import type { Charge, Point } from '../../sim/pitch'
import { predictPath } from '../../sim/predict'
import { splashOf } from '../../sim/splash'
import type { SimConfig, SimState } from '../../sim/step'
import type { GestureView } from '../input/gesture'
import { boostColor, boostLabel } from '../boost'
import { Entity } from './Entity'
import { drawLabel } from './label'

/** The aim in progress, as far as the Ghost needs it: `dir` and `power` once the shooter is dragging, the ghost config in effect; `cancel` while cancel-armed. */
export type AimLine = Pick<GestureView, 'tier' | 'dir' | 'power' | 'ghost' | 'cancel'>

/** A tier's colour (Touch green, Power red), for its Ghost and hold ring. */
export const tierColor = (tier: number): string => visual.aim.tierColors[rules.shot.tiers[tier].name]

/** The first `scale` of a polyline's length. */
function cut(points: Point[], scale: number): Point[] {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
  let left = scale * lengths.reduce((a, b) => a + b, 0)
  const out = [points[0]]
  for (let i = 0; i < lengths.length; i++) {
    const [a, b] = [points[i], points[i + 1]]
    if (lengths[i] >= left) {
      const t = lengths[i] ? left / lengths[i] : 0
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
      break
    }
    left -= lengths[i]
    out.push(b)
  }
  return out
}

/** The aim's Ghost (the ball's predicted path) and the expanding Splash ring of a fired Power shot. */
export class Aim extends Entity {
  aim?: AimLine
  /** Turns the Charged badge upright for Player 2's view. */
  flipped = false
  private state?: SimState
  private config?: SimConfig
  private rings: { origin: Point; radius: number; born: number }[] = []
  // The last prediction, redone only when the aim or what it depends on changes, not every frame.
  private predicted?: { key: string; objects: SimState['objects']; points: Point[] }

  sync(state: SimState, config: SimConfig): void {
    this.state = state
    this.config = config
  }

  /** A shot fired from `origin`: for a splash tier, a ring expands to the Splash radius over `visual.aim.splash.ms`. */
  splash(origin: Point, tier: number, power: number): void {
    const splash = this.config && splashOf(tier, power, this.config)
    if (splash) this.rings.push({ origin, radius: splash.radius, born: this.clock })
  }

  /** A new match: no rings, no aim. */
  reset(): void {
    this.rings = []
    this.aim = this.predicted = undefined
  }

  /** Splash rings still expanding. */
  get splashCount(): number {
    return this.rings.length
  }

  /** The ball's predicted path from the ball, as the ghost config reaches and cut to its scale. None before the drag. */
  get ghost(): Point[] | undefined {
    const { aim, state, config } = this
    if (!aim?.dir || aim.power === undefined || !state || !config) return undefined
    const { tier, dir, power, ghost } = aim
    const key = JSON.stringify([tier, dir, power, ghost, state.ball.pos, state.possession.shooter, state.charge])
    const p = this.predicted
    if (p?.key === key && p.objects === state.objects) return p.points
    const path = predictPath(state, { player: state.possession.shooter, tier, dir, power }, config, ghost.until)
    const points = cut(path.points, ghost.scale)
    this.predicted = { key, objects: state.objects, points }
    return points
  }

  /** The ball's charge, null when not Charged: the Ghost is drawn wider and badged. */
  get charge(): Charge | null {
    return this.state?.charge ?? null
  }

  private drawBadge(ctx: CanvasRenderingContext2D, ghost: Point[], { zone, factor }: Charge): void {
    const { size, offset, weight } = visual.aim.ghost.badge
    const [a, b] = [ghost.at(-2) ?? ghost[0], ghost.at(-1)!]
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const at = { x: b.x + ((b.x - a.x) / len) * offset, y: b.y + ((b.y - a.y) / len) * offset }
    drawLabel(ctx, boostLabel(factor), at, { size, weight, color: boostColor(zone), flipped: this.flipped })
  }

  /** While cancel is armed: an ✕ on the ball, and the Ghost drawn in the same grey. */
  get cancel(): { at: Point; color: string } | undefined {
    const { aim, state } = this
    return aim?.cancel && state ? { at: state.ball.pos, color: visual.aim.cancel.color } : undefined
  }

  /** The Ghost's colour: its tier's, or the cancel grey while cancel is armed. */
  get ghostColor(): string | undefined {
    const { aim } = this
    return aim && (aim.cancel ? visual.aim.cancel.color : tierColor(aim.tier))
  }

  override update(dt: number): void {
    super.update(dt)
    this.rings = this.rings.filter((r) => this.clock - r.born < visual.aim.splash.ms)
  }

  protected override render(ctx: CanvasRenderingContext2D): void {
    const { ghost, cancel, ghostColor } = this
    if (ghost && ghostColor) {
      ctx.beginPath()
      ghost.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.lineCap = ctx.lineJoin = 'round'
      ctx.strokeStyle = ghostColor
      const { charge } = this
      ctx.lineWidth = charge ? visual.aim.ghost.chargedWidth : visual.aim.ghost.width
      ctx.stroke()
      // A Charged ball's Ghost carries its factor at the tip, past the last point along the path's end direction.
      if (charge && !cancel) this.drawBadge(ctx, ghost, charge)
    }
    if (cancel) {
      const { size, width } = visual.aim.cancel
      const { x, y } = cancel.at
      ctx.beginPath()
      ctx.moveTo(x - size, y - size)
      ctx.lineTo(x + size, y + size)
      ctx.moveTo(x + size, y - size)
      ctx.lineTo(x - size, y + size)
      ctx.lineCap = 'round'
      ctx.strokeStyle = cancel.color
      ctx.lineWidth = width
      ctx.stroke()
    }
    for (const r of this.rings) {
      const t = (this.clock - r.born) / visual.aim.splash.ms
      ctx.globalAlpha = 1 - t
      ctx.beginPath()
      ctx.arc(r.origin.x, r.origin.y, r.radius * t, 0, Math.PI * 2)
      ctx.strokeStyle = visual.aim.splash.color
      ctx.lineWidth = visual.aim.splash.width
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }
}
