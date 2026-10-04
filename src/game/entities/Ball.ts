import { visual } from '../../config/visual'
import type { Ball as BallState } from '../../sim/ball'
import type { Charge, PlayerId, Point } from '../../sim/pitch'
import { defaultConfig } from '../../sim/step'
import { boostColor, boostLabel } from '../boost'
import { tierClimbed } from '../feedback'
import type { AimView } from '../input/InputController'
import { tierColor } from './Aim'
import { Entity } from './Entity'
import { drawLabel } from './label'
import { Tracer } from './Tracer'

/** Disc with the Tracer behind it (its glowing tail, sparks and bounce flashes) and a dot that rolls with the distance travelled. */
export class Ball extends Entity {
  state: BallState = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, rolled: 0 }
  /** The shot's glowing tail, sparks and bounce flashes; the game sets its `pxPerUnit` each frame. */
  readonly tracer = new Tracer()
  /** Ball-in-hand: where the ball would go, and whether that spot is legal. */
  placement?: { at: Point; legal: boolean; radius: number }
  /** The shooter whose ball gets the Breaker outline. */
  armed?: PlayerId
  /** The aim in progress: its phase and tier, the hold's climb to the next tier, its control radius in screen px, and how many screen px a world unit spans. */
  aim?: Pick<AimView, 'phase' | 'tier' | 'holdProgress' | 'radiusPx' | 'pxPerUnit'>
  /** The ball's charge, null when not Charged: it wears a glow and a badge in its zone's colour, which pop in when a shot brings it to rest in a ring. */
  charge: Charge | null = null
  /** The ball's radius in world units. */
  radius = defaultConfig.ballRadius
  /** Turns the badge upright for Player 2's view. */
  flipped = false
  /** The clock when a Repulsor fired (the tracer's core runs bright for `visual.ball.trailMs`), and the steal sink in progress. */
  private pulsedAt?: number
  private sinking?: { from: Point; to: Point; age: number }
  // The clock when the ball came to rest Charged, and whether the shot in flight launched Charged (the tracer's core runs bright until the ball stops).
  private poppedAt?: number
  private launched = false
  // The aim last seen, and the clock when the hold reached a higher tier.
  private lastAim?: Ball['aim']
  private reachedAt?: number

  /** The ball's state this frame: the tracer's tail follows it while it moves, and loses its colour once it rests. */
  sync(state: BallState): void {
    this.state = state
    if (state.vel.x || state.vel.y) this.tracer.follow(state.pos, this.clock)
    else this.tracer.rest()
  }

  /** A shot fired from `from` in tier `tier`: the tracer takes the tier's colour and bursts sparks there. */
  fire(tier: number, from: Point): void {
    this.tracer.fire(tier, from, this.clock)
  }

  /** The ball bounced at `at` off a wall or a board: the tracer flashes and sprays sparks there. */
  bounce(at: Point, wall: boolean): void {
    this.tracer.bounce(at, wall, this.clock)
  }

  /** Possession changed: the tracer loses its colour and its tail. */
  handOver(): void {
    this.tracer.handOver()
  }

  /** A Repulsor fired: the tracer's core runs bright for `visual.ball.trailMs`. */
  pulse(): void {
    this.pulsedAt = this.clock
  }

  get bright(): boolean {
    return this.pulsedAt !== undefined && this.clock - this.pulsedAt < visual.ball.trailMs
  }

  /** The tracer's white core runs wide: a Repulsor just fired, or a Charged shot is in flight. */
  get brightCore(): boolean {
    return this.bright || this.launched
  }

  /** A shot came to rest in a ring: the badge pops in over `visual.ball.charged.popMs`. */
  pop(): void {
    this.poppedAt = this.clock
  }

  /** A Charged ball was shot: the tracer's core runs bright until it comes to rest. */
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
    const scale = k < 1 ? 1 + grow * Math.sin(Math.PI * k) : 1
    return { at: this.state.pos, radius: radiusPx / aim.pxPerUnit, progress: aim.holdProgress, color: tierColor(aim.tier), scale }
  }

  /** A new match: no pulse, no steal sink, no ghost, no aim, no tracer. */
  reset(): void {
    this.pulsedAt = this.sinking = this.placement = this.armed = this.aim = this.lastAim = this.reachedAt = this.poppedAt = undefined
    this.charge = null
    this.launched = false
    this.tracer.clear()
  }

  override update(dt: number): void {
    if (tierClimbed(this.lastAim, this.aim)) this.reachedAt = this.clock
    this.lastAim = this.aim
    if (!this.state.vel.x && !this.state.vel.y) this.launched = false
    super.update(dt)
    this.tracer.update(this.clock, dt)
    if (this.sinking) this.sinking.age += dt * 1000
  }

  protected override render(ctx: CanvasRenderingContext2D): void {
    const { pos, vel } = this.state
    this.tracer.draw(ctx, this.clock, pos, Math.hypot(vel.x, vel.y), this.radius, this.brightCore)
    if (this.sinking && this.stealing) {
      const { from, to, age } = this.sinking
      const k = Math.min(age / visual.ball.stealMs, 1)
      this.drawDisc(ctx, { pos: { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }, vel: { x: 0, y: 0 }, rolled: this.state.rolled }, 1 - k)
    } else this.drawDisc(ctx, this.state, 1)
    if (this.charge && !this.stealing) this.drawCharge(ctx, this.charge)
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

  /** The Charged ball's glow ring (pulsing) and its badge above. */
  private drawCharge(ctx: CanvasRenderingContext2D, { zone, factor }: Charge): void {
    const { glow, badge } = visual.ball.charged
    const { x, y } = this.state.pos
    const color = boostColor(zone)
    ctx.beginPath()
    ctx.arc(x, y, this.radius + glow.offset + glow.swing * Math.sin((2 * Math.PI * this.clock) / glow.periodMs), 0, Math.PI * 2)
    ctx.strokeStyle = color
    ctx.lineWidth = glow.width
    ctx.stroke()
    drawLabel(ctx, boostLabel(factor), { x, y: y + (this.flipped ? badge.offset : -badge.offset) }, { size: badge.size, weight: badge.weight, color, flipped: this.flipped, scale: this.badgeScale })
  }

  private drawDisc(ctx: CanvasRenderingContext2D, { pos, rolled }: BallState, scale: number): void {
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
