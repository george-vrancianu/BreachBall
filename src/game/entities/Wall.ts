import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import type { Point } from '../../sim/pitch'
import { maxHp, segmentAt, segmentCount, segmentEnds, standingIn } from '../../sim/wall'
import { Fixture, type WallData } from './Fixture'
import { breachAlpha, breachSpecks, endKinds, gapsOf, hitMark, segmentLook, shinePos, showPips, type Ends, type HitMark, type SegmentLook } from './wallLook'
import { drawBreach, drawSegment } from './wallPaint'

const look = visual.wall.look

/** How long a flash lasts, ms: the dim one of a non-damaging hit, or the bright one. */
const flashMs = (dim: boolean): number => (dim ? visual.wall.dimFlashMs : visual.wall.flashMs)

/** What one Wall segment is showing right now: a flash, a jolt, where the last damaging hit landed, and whether it has broken (it stays drawn as a Gap, not as a body). */
type SegmentFx = { flash?: { dim: boolean; age: number }; joltAge?: number; hit?: HitMark; brokenAge?: number }

/**
 * A wall drawn as one bar per wall segment: each has its own look, flash, jolt and damage; a broken segment is a Gap with a Breach mark.
 * A build piece (a bare spec, no id or segments) draws clean Wall segments with their joints.
 */
export class Wall extends Fixture<WallData> {
  private fx = new Map<number, SegmentFx>()
  private looks = new Map<string, SegmentLook>()
  /** The clock when the sim removed the wall while its last segment was still shattering; its Breach marks fade from then. */
  private goneAt?: number

  /** The wall left the sim (its last segment broke): the Breach marks fade out. */
  markGone(): void {
    this.goneAt ??= this.clock
  }

  /** A flash on the Wall segment hit (`segment`, else the one `at` lies on, else every one); a damaging hit also jolts it and remembers where it landed, so the cracks start there. */
  override hit(dim: boolean, segment?: number, at?: Point): void {
    const i = segment ?? (at ? segmentAt(this.data, at) : undefined)
    for (const k of i === undefined ? this.standing() : [i]) {
      const f = this.of(k)
      f.flash ??= { dim, age: 0 }
      if (!dim) {
        f.joltAge = 0
        if (at && i !== undefined) {
          const { a, b } = segmentEnds(this.data, k)
          f.hit = hitMark(a, b, at)
        }
      }
    }
  }

  /** Wall segment `i` broke: it stops being drawn as a body, and the wall stays alive while its pieces are in the air. */
  breakSegment(i: number): void {
    this.of(i).brokenAge = 0
  }

  /** Whole-wall shatter: every standing Wall segment breaks. */
  override shatter(): void {
    for (const i of this.standing()) this.breakSegment(i)
  }

  /** A Wall segment's shatter is still running: the wall is kept (for its Breach marks to fade) while a destroyed wall's last pieces fly. */
  override get isShattering(): boolean {
    for (const f of this.fx.values()) if (f.brokenAge !== undefined && f.brokenAge < visual.wall.shatterMs) return true
    return false
  }

  /** Gone from the sim and its last shatter is over. */
  override get shattered(): boolean {
    return this.goneAt !== undefined && !this.isShattering
  }

  override update(dt: number): void {
    super.update(dt)
    const ms = dt * 1000
    for (const f of this.fx.values()) {
      if (f.flash && (f.flash.age += ms) >= flashMs(f.flash.dim)) f.flash = undefined
      if (f.joltAge !== undefined && (f.joltAge += ms) >= look.jolt.ms) f.joltAge = undefined
      if (f.brokenAge !== undefined) f.brokenAge += ms
    }
  }

  /** The Breach marks of this wall's Gaps, at pitch level: drawn under every wall and the ball. */
  drawBreach(ctx: CanvasRenderingContext2D): void {
    const { id, segments } = this.data
    const health = segments ?? []
    // A Wall segment mid-shatter is a Gap already (the sim has moved on), even before the data catches up.
    const gaps = new Set([...gapsOf(health), ...[...this.fx].filter(([, f]) => f.brokenAge !== undefined).map(([i]) => i)])
    const alpha = breachAlpha(this.goneAt === undefined ? undefined : this.clock - this.goneAt, visual.wall.shatterMs)
    for (const i of gaps) {
      const { a, b } = segmentEnds(this.data, i)
      drawBreach(ctx, this.data.owner, a, Math.atan2(b.y - a.y, b.x - a.x), rules.wall.unit, breachSpecks(id ?? 0, i, rules.wall.unit), alpha * this.alpha)
    }
  }

  protected drawBody(ctx: CanvasRenderingContext2D, fill?: string): void {
    const d = this.data
    const health = d.segments ?? Array<number>(segmentCount(d)).fill(maxHp(d))
    const max = maxHp(d)
    const angle = Math.atan2(d.b.y - d.a.y, d.b.x - d.a.x)
    const wallLen = segmentCount(d) * rules.wall.unit
    health.forEach((hp, i) => {
      const fx = this.fx.get(i)
      if (hp <= 0 || fx?.brokenAge !== undefined) return
      const { a } = segmentEnds(d, i)
      const ends = endKinds(health, i)
      const shown = this.lookOf(i, hp, ends, fx?.hit)
      const joltT = fx?.joltAge === undefined ? 0 : 1 - fx.joltAge / look.jolt.ms
      const flashT = fx?.flash ? 1 - fx.flash.age / flashMs(fx.flash.dim) : 0
      drawSegment(ctx, {
        owner: d.owner, from: a, angle, len: rules.wall.unit, hp, max, look: shown, ends, flipped: this.flipped, clock: this.clock, fill,
        flash: fx?.flash ? flashT * (fx.flash.dim ? visual.wall.dimFlashAlpha : look.flash.alpha) : 0,
        jolt: joltT * look.jolt.amp * Math.sin((fx?.joltAge ?? 0) / look.jolt.periodMs),
        shine: this.simplified || !!fill || d.id === undefined ? undefined : shinePos(this.clock, d.id, wallLen) - i * rules.wall.unit,
        pips: d.segments !== undefined && showPips(hp, max),
        simplified: this.simplified,
      })
    })
  }

  /** The full wall, Gaps included: the selection outline and handles cover all of it. */
  protected footprint() {
    return [{ a: this.data.a, b: this.data.b }]
  }

  /** A rectangle turned with the wall, `pad` clear of the drawn bar on every side (its rounded ends included). */
  protected override outlinePath(ctx: CanvasRenderingContext2D, pad: number): void {
    for (const { a, b } of this.footprint()) {
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const clear = pad + look.thickness / 2 - rules.wallHalf
      const [ux, uy] = [((b.x - a.x) / len) * (clear + look.thickness / 2), ((b.y - a.y) / len) * (clear + look.thickness / 2)]
      const [nx, ny] = [(-(b.y - a.y) / len) * clear, ((b.x - a.x) / len) * clear]
      ctx.moveTo(a.x - ux + nx, a.y - uy + ny)
      ctx.lineTo(b.x + ux + nx, b.y + uy + ny)
      ctx.lineTo(b.x + ux - nx, b.y + uy - ny)
      ctx.lineTo(a.x - ux - nx, a.y - uy - ny)
      ctx.closePath()
    }
  }

  private standing(): number[] {
    const health = this.data.segments
    return health ? standingIn(health) : Array.from({ length: segmentCount(this.data) }, (_, i) => i)
  }

  private of(i: number): SegmentFx {
    let f = this.fx.get(i)
    if (!f) this.fx.set(i, (f = {}))
    return f
  }

  /** A Wall segment's look, kept until its health, ends or hit point change. */
  private lookOf(i: number, hp: number, ends: Ends, hit?: HitMark): SegmentLook {
    const key = `${i}:${hp}:${ends.left}:${ends.right}:${hit ? `${hit.u.toFixed(2)}${hit.side}` : ''}`
    let l = this.looks.get(key)
    if (!l) {
      if (this.looks.size > look.cacheCap) this.looks.clear()
      this.looks.set(key, (l = segmentLook(this.data.id ?? 0, i, hp, ends, rules.wall.unit, hit)))
    }
    return l
  }
}
