import { visual } from '../../config/visual'
import type { Ball as BallState } from '../../sim/ball'
import { isCharged, type BoostZone, type PlayerId, type Point } from '../../sim/pitch'
import { defaultConfig } from '../../sim/step'
import { boostColor, boostLabel } from '../boost'
import { tierClimbed } from '../feedback'
import type { AimView } from '../input/InputController'
import { tierColor } from './Aim'
import { Entity } from './Entity'
import { drawLabel } from './label'

/** Disc with a speed-scaled fading trail behind it and a dot that rolls with the distance travelled. */
export class Ball extends Entity {
  state: BallState = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, rolled: 0 }
  /** Ball-in-hand: where the ball would go, and whether that spot is legal. */
  placement?: { at: Point; legal: boolean; radius: number }
  /** The shooter whose ball gets the Breaker outline. */
  armed?: PlayerId
  /** The aim in progress: its phase and tier, the hold's climb to the next tier, its control radius in screen px, and how many screen px a world unit spans. */
  aim?: Pick<AimView, 'phase' | 'tier' | 'holdProgress' | 'radiusPx' | 'pxPerUnit'>
  /** Reduced motion: reaching a tier changes the hold ring's colour without the pulse. */
  reduced = false
  /** The factor the ball is Charged by (1 = not Charged): it wears a glow and a badge, which pop in when a shot brings it to rest in a ring. */
  charge = 1
  /** The zone the charge came from (colours the glow and badge); null when not Charged. */
  chargeZone: BoostZone | null = null
  /** The ball's radius in world units. */
  radius = defaultConfig.ballRadius
  /** Turns the badge upright for Player 2's view. */
  flipped = false
  /** The clock when a Repulsor fired (the trail runs bright for `visual.ball.trailMs`), and the steal sink in progress. */
  private pulsedAt?: number
  private sinking?: { from: Point; to: Point; age: number }
  // The clock when the ball came to rest Charged, and whether the shot in flight launched Charged (its trail runs bright until the ball stops).
  private poppedAt?: number
  private launched = false
  // The aim last seen, and the clock when the hold reached a higher tier.
  private lastAim?: Ball['aim']
  private reachedAt?: number

  sync(state: BallState): void {
    this.state = state
  }

  /** A Repulsor fired: the trail brightens for `visual.ball.trailMs`. */
  pulse(): void {
    this.pulsedAt = this.clock
  }

  get bright(): boolean {
    return this.pulsedAt !== undefined && this.clock - this.pulsedAt < visual.ball.trailMs
  }

  /** A shot came to rest in a ring: the badge pops in over `visual.ball.charged.popMs`. */
  pop(): void {
    this.poppedAt = this.clock
  }

  /** A Charged ball was shot: its trail runs bright until it comes to rest. */
  launch(): void {
    this.launched = true
  }

  /** The badge's scale: it grows from `popScale` to 1 as it pops in. */
  get badgeScale(): number {
    const { popMs, popScale } = visual.ball.charged
    const k = this.poppedAt === undefined ? 1 : Math.min((this.clock - this.poppedAt) / popMs, 1)
    return popScale + (1 - popScale) * k
  }

  /** A Steal tower caught the ball: it shrinks from `from` into `to` over `visual.ball.stealMs`. */
  steal(from: Point, to: Point): void {
    this.sinking = { from, to, age: 0 }
  }

  get stealing(): boolean {
    return !!this.sinking && this.sinking.age < visual.ball.stealMs
  }

  /** The faint ring around the ball showing how far the aim can drag, in world units. */
  get controlRing(): { at: Point; radius: number } | undefined {
    return this.aim && { at: this.state.pos, radius: this.aim.radiusPx / this.aim.pxPerUnit }
  }

  /** While holding still on the ball: the ring filling towards the next tier, in the tier's colour, pulsing (`scale` > 1) just after reaching one. */
  get holdRing(): { at: Point; radius: number; progress: number; color: string; scale: number } | undefined {
    const { aim } = this
    if (aim?.phase !== 'holding') return undefined
    const { radiusPx, pulseMs, grow } = visual.ball.hold
    const k = this.reachedAt === undefined ? 1 : (this.clock - this.reachedAt) / pulseMs
    const scale = !this.reduced && k < 1 ? 1 + grow * Math.sin(Math.PI * k) : 1
    return { at: this.state.pos, radius: radiusPx / aim.pxPerUnit, progress: aim.holdProgress, color: tierColor(aim.tier), scale }
  }

  /** A new match: no pulse, no steal sink, no ghost, no aim. */
  reset(): void {
    this.pulsedAt = this.sinking = this.placement = this.armed = this.aim = this.lastAim = this.reachedAt = this.poppedAt = undefined
    this.charge = 1
    this.chargeZone = null
    this.launched = false
  }

  override update(dt: number): void {
    if (tierClimbed(this.lastAim, this.aim)) this.reachedAt = this.clock
    this.lastAim = this.aim
    if (!this.state.vel.x && !this.state.vel.y) this.launched = false
    super.update(dt)
    if (this.sinking) this.sinking.age += dt * 1000
  }

  protected override render(ctx: CanvasRenderingContext2D): void {
    if (this.sinking && this.stealing) {
      const { from, to, age } = this.sinking
      const k = Math.min(age / visual.ball.stealMs, 1)
      this.drawDisc(ctx, { pos: { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }, vel: { x: 0, y: 0 }, rolled: this.state.rolled }, false, 1 - k)
    } else this.drawDisc(ctx, this.state, this.bright || this.launched, 1)
    if (this.chargeZone && isCharged(this.charge) && !this.stealing) this.drawCharge(ctx, this.chargeZone)
    if (this.armed) {
      const { radius, swing, periodMs, width } = visual.ball.armed
      ctx.beginPath()
      ctx.arc(this.state.pos.x, this.state.pos.y, radius + swing * Math.sin(this.clock / periodMs), 0, Math.PI * 2)
      ctx.strokeStyle = visual.player.colors[this.armed]
      ctx.lineWidth = width
      ctx.stroke()
    }
    const ring = this.controlRing
    if (ring) {
      const { color, alpha, width } = visual.ball.control
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.arc(ring.at.x, ring.at.y, ring.radius, 0, Math.PI * 2)
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    const hold = this.holdRing
    if (hold) {
      const { width, trackAlpha } = visual.ball.hold
      const r = hold.radius * hold.scale
      ctx.lineWidth = width
      ctx.strokeStyle = hold.color
      ctx.globalAlpha = trackAlpha
      ctx.beginPath()
      ctx.arc(hold.at.x, hold.at.y, r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.arc(hold.at.x, hold.at.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hold.progress)
      ctx.lineCap = 'round'
      ctx.stroke()
    }
    if (this.placement) {
      ctx.globalAlpha = visual.ball.placementAlpha
      ctx.beginPath()
      ctx.arc(this.placement.at.x, this.placement.at.y, this.placement.radius, 0, Math.PI * 2)
      ctx.fillStyle = this.placement.legal ? visual.ball.fill : visual.ball.illegal
      ctx.fill()
      ctx.globalAlpha = 1
    }
  }

  /** The Charged ball's glow ring (pulsing, but static under reduced motion) and its badge above. */
  private drawCharge(ctx: CanvasRenderingContext2D, zone: BoostZone): void {
    const { glow, badge } = visual.ball.charged
    const { x, y } = this.state.pos
    const color = boostColor(zone)
    ctx.beginPath()
    ctx.arc(x, y, this.radius + glow.offset + (this.reduced ? 0 : glow.swing * Math.sin((2 * Math.PI * this.clock) / glow.periodMs)), 0, Math.PI * 2)
    ctx.strokeStyle = color
    ctx.lineWidth = glow.width
    ctx.stroke()
    drawLabel(ctx, boostLabel(this.charge), { x, y: y + (this.flipped ? badge.offset : -badge.offset) }, { size: badge.size, weight: badge.weight, color, flipped: this.flipped, scale: this.reduced ? 1 : this.badgeScale })
  }

  private drawDisc(ctx: CanvasRenderingContext2D, { pos, vel, rolled }: BallState, bright: boolean, scale: number): void {
    const speed = Math.hypot(vel.x, vel.y)
    if (speed > 0) {
      const tail = { x: pos.x - vel.x * visual.ball.trailLength, y: pos.y - vel.y * visual.ball.trailLength }
      const g = ctx.createLinearGradient(pos.x, pos.y, tail.x, tail.y)
      g.addColorStop(0, bright ? visual.ball.trailBright : visual.ball.trail)
      g.addColorStop(1, visual.ball.trailClear)
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
      ctx.lineTo(tail.x, tail.y)
      ctx.lineCap = 'round'
      ctx.strokeStyle = g
      ctx.lineWidth = this.launched ? visual.ball.charged.trailWidth : bright ? visual.ball.trailWidthBright : visual.ball.trailWidth
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, this.radius * scale, 0, Math.PI * 2)
    ctx.fillStyle = visual.ball.fill
    ctx.fill()
    ctx.strokeStyle = visual.ball.outline
    ctx.lineWidth = visual.ball.outlineWidth
    ctx.stroke()
    const { offset, radius } = visual.ball.dot
    ctx.beginPath()
    ctx.arc(pos.x + Math.cos(rolled) * offset * scale, pos.y + Math.sin(rolled) * offset * scale, radius * scale, 0, Math.PI * 2)
    ctx.fillStyle = visual.ball.outline
    ctx.fill()
  }
}
