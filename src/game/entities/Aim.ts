import { rules, type Tier } from '../../config/rules'
import { visual } from '../../config/visual'
import type { Charge, Point } from '../../sim/pitch'
import { predictPath, type Path } from '../../sim/predict'
import { splashOf } from '../../sim/splash'
import type { SimConfig, SimState } from '../../sim/step'
import type { AimView } from '../input/InputController'
import { boostColor, boostLabel } from '../boost'
import { Entity } from './Entity'
import { drawLabel } from './label'

/** The aim in progress, as far as the Comet and Ghost need it: `dir` and `power` once the shooter is dragging, the ghost config in effect; `cancel` while cancel-armed; screen px per world unit. */
export type AimLine = Pick<AimView, 'tier' | 'dir' | 'power' | 'ghost' | 'cancel' | 'pxPerUnit'>

/** A tier's colour (Touch green, Power red), for its Ghost and hold ring. */
export const tierColor = (tier: number): string => visual.aim.tierColors[rules.shot.tiers[tier].name]

/** Where `power` sits in its tier's power range: 0 at the bottom, 1 at the top. */
function withinTier(tier: number, power: number): number {
  const [lo, hi] = rules.shot.tiers[tier].power
  return hi > lo ? Math.min(1, Math.max(0, (power - lo) / (hi - lo))) : 1
}

/** How far a tier's Ghost reaches for `power`: its `reach` min at the bottom of the tier's power range, max at the top. */
function reachOf(tier: number, power: number, { reach: [min, max] }: Tier['ghost']): number {
  return min + (max - min) * withinTier(tier, power)
}

/** `power` across every tier's range: 0 at the weakest tier's lowest, 1 at the strongest's highest. */
function acrossTiers(power: number): number {
  const ranges = rules.shot.tiers.map((t) => t.power)
  const [lo, hi] = [Math.min(...ranges.map(([l]) => l)), Math.max(...ranges.map(([, h]) => h))]
  return hi > lo ? Math.min(1, Math.max(0, (power - lo) / (hi - lo))) : 1
}

/**
 * The Comet as drawn, world units: the spear from `base` (just past the ball's edge) to `end`, then the arrowhead to `tip`, all along `dir`;
 * `length` from the ball's edge to `end`, `width` the spear's half-width at its base, `color` its tier's (grey while cancel-armed).
 */
export type Comet = { dir: Point; base: Point; end: Point; tip: Point; length: number; width: number; color: string }

/** A `#rrggbb` colour at alpha `a` (0-1), as `#rrggbbaa`. */
const withAlpha = (hex: string, a: number): string => hex + Math.round(a * 255).toString(16).padStart(2, '0')

/** A chevron on the Comet: its point, arm length (world units) and alpha. */
export type Chevron = { at: Point; size: number; alpha: number }

/** A dot of the drawn Ghost: where it sits, its radius (world units) and alpha. */
export type GhostDot = { at: Point; radius: number; alpha: number }

/** The aim's Comet and Ghost (the ball's predicted path), and the expanding Splash ring of a fired Power shot. */
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

  /** The Comet while dragging: longer with more power, wider at its base higher in its tier's range. None before the drag. */
  get comet(): Comet | undefined {
    const { aim, state, config, ghostColor } = this
    if (!aim?.dir || aim.power === undefined || !state || !config || !ghostColor) return undefined
    const { length, gapPx, width, head } = visual.aim.comet
    const { tier, dir, power, pxPerUnit } = aim
    const { pos } = state.ball
    const r = config.ballRadius
    const at = (d: number) => ({ x: pos.x + dir.x * d, y: pos.y + dir.y * d })
    const len = (length.base + length.perPower * acrossTiers(power)) / pxPerUnit
    return {
      dir,
      base: at(r + gapPx / pxPerUnit),
      end: at(r + len),
      tip: at(r + len + head.lengthPx / pxPerUnit),
      length: len,
      width: (width.base + width.perPower * withinTier(tier, power)) / pxPerUnit,
      color: ghostColor,
    }
  }

  /** The Comet's chevrons, running from its base toward its end and round again, faster higher in the tier's range; fading in and out at the ends. */
  get cometChevrons(): Chevron[] {
    const { comet, aim, config, state } = this
    if (!comet || aim?.power === undefined || !config || !state) return []
    const { count, speed, perPower, startPx, endPx, sizePx, alpha } = visual.aim.comet.chevrons
    const { pxPerUnit } = aim
    const { pos } = state.ball
    const laps = (this.clock / 1000) * (speed + perPower * withinTier(aim.tier, aim.power))
    const [from, to] = [config.ballRadius + startPx / pxPerUnit, config.ballRadius + comet.length - endPx / pxPerUnit]
    return Array.from({ length: count }, (_, i) => {
      const f = (laps + i / count) % 1
      const d = from + (to - from) * f
      return {
        at: { x: pos.x + comet.dir.x * d, y: pos.y + comet.dir.y * d },
        size: (sizePx[0] + (sizePx[1] - sizePx[0]) * f) / pxPerUnit,
        alpha: alpha * Math.sin(f * Math.PI),
      }
    })
  }

  /** A splash tier's aim previews its Splash around the ball, dashed in the tier's colour; none while cancel-armed, as nothing would fire. */
  get splashPreview(): { at: Point; radius: number; color: string } | undefined {
    const { aim, state, config } = this
    if (!aim?.dir || aim.power === undefined || aim.cancel || !state || !config) return undefined
    const splash = splashOf(aim.tier, aim.power, config)
    return splash ? { at: state.ball.pos, radius: splash.radius, color: tierColor(aim.tier) } : undefined
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

  /** Where the Ghost bounces off a structure or board, each marked with a ring. */
  get ghostBounces(): Point[] {
    return this.path?.contacts ?? []
  }

  /**
   * The Ghost as drawn: dots `visual.aim.ghost.dots.gap` apart from the Comet's tip to the path's end, shrinking and fading
   * toward the end, drifting forward with the clock (faster with more power). Larger for a Charged ball. The reach is still
   * measured from the ball, so a longer Comet covers more of it rather than showing more of the path.
   */
  get ghostDots(): GhostDot[] {
    const { path, aim, comet } = this
    if (!path || aim?.power === undefined || !comet) return []
    const { dots, drift, chargedScale } = visual.aim.ghost
    const { points } = path
    const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
    const total = lengths.reduce((a, b) => a + b, 0)
    const scale = this.charge ? chargedScale : 1
    const offset = ((this.clock / 1000) * (drift.speed + drift.perPower * aim.power)) % dots.gap
    const out: GhostDot[] = []
    // `from` is how far along the path segment `i` starts.
    let [i, from] = [0, 0]
    // The path starts at the ball's centre; the dots start at the Comet's tip.
    const start = Math.hypot(comet.tip.x - points[0].x, comet.tip.y - points[0].y)
    for (let d = start + offset; d < total; d += dots.gap) {
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

  /** The dashed Splash preview, then the Comet: its glowing spear, the arrowhead and the chevrons. */
  private drawComet(ctx: CanvasRenderingContext2D, comet: Comet, pxPerUnit: number): void {
    const { bend, gradient, glowPx, head, chevrons, splash } = visual.aim.comet
    const px = (n: number) => n / pxPerUnit
    const preview = this.splashPreview
    if (preview) {
      ctx.setLineDash(splash.dashPx.map(px))
      ctx.strokeStyle = withAlpha(preview.color, splash.alpha)
      ctx.lineWidth = px(splash.widthPx)
      ctx.beginPath()
      ctx.arc(preview.at.x, preview.at.y, preview.radius, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
    const { dir, base, end, tip, width, color } = comet
    const n = { x: -dir.y, y: dir.x }
    const along = (p: Point, d: number, side: number) => ({ x: p.x + dir.x * d + n.x * side, y: p.y + dir.y * d + n.y * side })
    // The sides curve in through a point `bend.at` of the way from the ball's edge to the end.
    const bendFrom = along(end, -comet.length * (1 - bend.at), 0)
    const fill = ctx.createLinearGradient(base.x, base.y, end.x, end.y)
    fill.addColorStop(0, withAlpha(color, 0))
    fill.addColorStop(gradient.mid, withAlpha(color, gradient.midAlpha))
    fill.addColorStop(1, withAlpha(gradient.ink, gradient.tipAlpha))
    ctx.save()
    // shadowBlur is in canvas pixels, which the transform does not scale: take the glow back through it.
    const m = ctx.getTransform()
    ctx.shadowColor = color
    ctx.shadowBlur = px(glowPx) * Math.hypot(m.a, m.b)
    ctx.fillStyle = fill
    ctx.beginPath()
    const [l, r] = [along(base, 0, width), along(bendFrom, 0, width * bend.width)]
    ctx.moveTo(l.x, l.y)
    ctx.quadraticCurveTo(r.x, r.y, end.x, end.y)
    const [r2, l2] = [along(bendFrom, 0, -width * bend.width), along(base, 0, -width)]
    ctx.quadraticCurveTo(r2.x, r2.y, l2.x, l2.y)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    const [hl, hr] = [along(end, 0, px(head.widthPx)), along(end, 0, -px(head.widthPx))]
    ctx.fillStyle = head.color
    ctx.beginPath()
    ctx.moveTo(tip.x, tip.y)
    ctx.lineTo(hl.x, hl.y)
    ctx.lineTo(hr.x, hr.y)
    ctx.closePath()
    ctx.fill()
    ctx.lineWidth = px(chevrons.widthPx)
    ctx.lineCap = 'round'
    for (const { at, size, alpha } of this.cometChevrons) {
      const [a, b] = [along(at, -size, size), along(at, -size, -size)]
      ctx.strokeStyle = withAlpha(chevrons.color, alpha)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(at.x, at.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
  }

  protected override render(ctx: CanvasRenderingContext2D): void {
    const { ghost, cancel, ghostColor, comet, aim } = this
    if (comet && aim) this.drawComet(ctx, comet, aim.pxPerUnit)
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
      for (const at of this.ghostBounces) {
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
