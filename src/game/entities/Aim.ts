import { rules, type Tier } from '../../config/rules'
import { visual } from '../../config/visual'
import type { Charge, Point } from '../../sim/pitch'
import { predictPath, type Contact, type Path } from '../../sim/predict'
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

/** How far a tier's Ghost reaches for `power`: its `reach` min at the bottom of the tier's power range, max at the top. */
function reachOf(tier: number, power: number, { reach: [min, max] }: Tier['ghost']): number {
  const [lo, hi] = rules.shot.tiers[tier].power
  const t = hi > lo ? Math.min(1, Math.max(0, (power - lo) / (hi - lo))) : 1
  return min + (max - min) * t
}

/** A dot of the drawn Ghost: where it sits, its radius (world units) and alpha. */
export type GhostDot = { at: Point; radius: number; alpha: number }

/** The aim's Ghost (the ball's predicted path) and the expanding Splash ring of a fired Power shot. */
export class Aim extends Entity {
  aim?: AimLine
  /** Turns the Charged badge upright for Player 2's view. */
  flipped = false
  private state?: SimState
  private config?: SimConfig
  private rings: { origin: Point; radius: number; born: number }[] = []
  // The last prediction, redone only when the aim or what it depends on changes, not every frame.
  private predicted?: { key: string; objects: SimState['objects']; path: Path }

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

  /** The prediction for the aim in progress, as far as its tier's Ghost reaches; redone only when the aim or what it depends on changes. */
  private get path(): Path | undefined {
    const { aim, state, config } = this
    if (!aim?.dir || aim.power === undefined || !state || !config) return undefined
    const { tier, dir, power, ghost } = aim
    const key = JSON.stringify([tier, dir, power, ghost, state.ball.pos, state.possession.shooter, state.charge])
    const p = this.predicted
    if (p?.key === key && p.objects === state.objects) return p.path
    const limit = { maxBounces: ghost.maxBounces, maxLength: reachOf(tier, power, ghost) }
    const path = predictPath(state, { player: state.possession.shooter, tier, dir, power }, config, limit)
    this.predicted = { key, objects: state.objects, path }
    return path
  }

  /** The Ghost: the ball's predicted path from the ball, up to its tier's bounce cap or reach for this power. None before the drag. */
  get ghost(): Point[] | undefined {
    return this.path?.points
  }

  /** Where the Ghost bounces, each marked with a ring: ink off a structure, the tier's colour off a board, grey while cancel is armed. */
  get ghostBounces(): (Contact & { color: string })[] {
    const { path, aim } = this
    if (!path || !aim) return []
    const ring = (kind: Contact['kind']) => (aim.cancel ? visual.aim.cancel.color : kind === 'wall' ? visual.aim.ghost.bounce.wallColor : tierColor(aim.tier))
    return path.contacts.map((c) => ({ ...c, color: ring(c.kind) }))
  }

  /**
   * The Ghost as drawn: dots `visual.aim.ghost.dots.gap` apart from the ball's edge to the path's end, shrinking and fading
   * toward the end, drifting forward with the clock (faster with more power). Larger for a Charged ball.
   */
  get ghostDots(): GhostDot[] {
    const { path, aim, config } = this
    if (!path || aim?.power === undefined || !config) return []
    const { dots, drift, chargedScale } = visual.aim.ghost
    const { points } = path
    const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
    const total = lengths.reduce((a, b) => a + b, 0)
    const scale = this.charge ? chargedScale : 1
    const offset = ((this.clock / 1000) * (drift.speed + drift.perPower * aim.power)) % dots.gap
    const out: GhostDot[] = []
    // `from` is how far along the path segment `i` starts.
    let [i, from] = [0, 0]
    for (let d = config.ballRadius + offset; d < total; d += dots.gap) {
      while (i < lengths.length - 1 && from + lengths[i] < d) from += lengths[i++]
      const [a, b] = [points[i], points[i + 1]]
      const t = lengths[i] ? (d - from) / lengths[i] : 0
      const f = d / total
      out.push({
        at: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        radius: scale * (dots.radius[0] + (dots.radius[1] - dots.radius[0]) * f),
        alpha: dots.alpha[0] + (dots.alpha[1] - dots.alpha[0]) * f,
      })
    }
    return out
  }

  /** The ball's charge, null when not Charged: the Ghost's dots are drawn larger and badged. */
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
      ctx.fillStyle = ctx.strokeStyle = ghostColor
      for (const { at, radius, alpha } of this.ghostDots) {
        ctx.globalAlpha = alpha
        ctx.beginPath()
        ctx.arc(at.x, at.y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
      const { radius, width, alpha } = visual.aim.ghost.bounce
      ctx.globalAlpha = alpha
      ctx.lineWidth = width
      for (const { at, color } of this.ghostBounces) {
        ctx.strokeStyle = color
        ctx.beginPath()
        ctx.arc(at.x, at.y, radius, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      // A Charged ball's Ghost carries its factor at the tip, past the last point along the path's end direction.
      const { charge } = this
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
