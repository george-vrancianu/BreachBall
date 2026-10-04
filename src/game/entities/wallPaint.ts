import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import type { PlayerId, Point } from '../../sim/pitch'
import type { Particle } from './particles'
import { hexA, litSide, shade, shadeHex, shadowLocal, type EndKind, type SegmentLook } from './wallLook'

const look = visual.wall.look

/** CSS px a world unit spans under the current transform (the canvas is scaled by the device pixel ratio too). */
export const cssPxPerUnit = (ctx: CanvasRenderingContext2D): number => {
  const t = ctx.getTransform()
  return Math.hypot(t.a, t.b) / (globalThis.devicePixelRatio || 1)
}

/** What one wall segment is drawn from. */
export type SegmentPaint = {
  owner: PlayerId
  /** The segment's start and the direction it runs, world space; `len` is its length. */
  from: Point
  angle: number
  len: number
  hp: number
  max: number
  look: SegmentLook
  ends: { left: EndKind; right: EndKind }
  /** The stage is turned for the other seat: the light stays fixed on screen. */
  flipped: boolean
  clock: number
  /** A flat colour over the owner's (the Splash preview, an illegal piece). */
  fill?: string
  /** Alpha of a white flash (0 for none), and the sideways jolt in world units. */
  flash: number
  jolt: number
  /** The sheen's centre along the segment, local u; undefined for none. */
  shine?: number
  pips: boolean
  /** The map view: body, joints and gaps only. */
  simplified: boolean
}

/** Draws one wall segment: shadow, bevelled body, stripes, sheen, highlight, damage, flash, outline, joint and pips. */
export function drawSegment(ctx: CanvasRenderingContext2D, p: SegmentPaint): void {
  const col = p.fill ?? visual.player.colors[p.owner]
  const h = look.thickness / 2
  const lit = litSide(p.angle, p.flipped)
  const dmg = (p.max - p.hp) / p.max
  const { outline: P } = p.look
  ctx.save()
  ctx.translate(p.from.x, p.from.y)
  ctx.rotate(p.angle)
  ctx.translate(0, p.jolt)
  const path = () => {
    ctx.beginPath()
    ctx.moveTo(P[0].u, P[0].v)
    for (let i = 1; i < P.length; i++) ctx.lineTo(P[i].u, P[i].v)
    ctx.closePath()
  }
  // Shadow, always down-right on screen.
  const sh = shadowLocal(p.angle, p.flipped)
  ctx.save()
  ctx.translate(sh.u, sh.v)
  path()
  ctx.fillStyle = `rgba(0,0,0,${look.shadow.alpha})`
  ctx.fill()
  ctx.restore()
  // Body: bevelled across its thickness from the lit edge; darker as health drops.
  const { bevel } = look
  const g = ctx.createLinearGradient(0, lit * h, 0, -lit * h)
  g.addColorStop(0, shade(col, bevel.lit - dmg * bevel.damage.lit))
  g.addColorStop(bevel.midAt, shade(col, bevel.mid - dmg * bevel.damage.mid))
  g.addColorStop(1, shade(col, bevel.dark - dmg * bevel.damage.dark))
  path()
  ctx.fillStyle = g
  ctx.fill()
  ctx.save()
  path()
  ctx.clip()
  const reach = p.len + look.thickness
  if (p.owner === 2 && !p.fill) {
    const s = look.stripes
    ctx.strokeStyle = hexA(visual.wall.hatchStripe, s.alpha + dmg * s.damageAlpha)
    ctx.lineWidth = s.width
    ctx.beginPath()
    for (let x = -look.thickness; x < p.len + look.thickness; x += s.pitch) {
      ctx.moveTo(x, h)
      ctx.lineTo(x + look.thickness, -h)
    }
    ctx.stroke()
  }
  if (!p.simplified && p.shine !== undefined) {
    const { halfWidth, alpha } = look.shine
    const sheen = ctx.createLinearGradient(p.shine - halfWidth, 0, p.shine + halfWidth, 0)
    sheen.addColorStop(0, 'rgba(255,255,255,0)')
    sheen.addColorStop(0.5, `rgba(255,255,255,${alpha * (1 - dmg)})`)
    sheen.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = sheen
    ctx.fillRect(-h, -h, reach, look.thickness)
  }
  // Highlight on the lit edge.
  const hl = look.highlight
  ctx.fillStyle = `rgba(255,255,255,${hl.alpha - dmg * hl.damage})`
  ctx.fillRect(-h, lit < 0 ? -h : h - hl.width, reach, hl.width)
  if (!p.simplified) drawDamage(ctx, p, col)
  if (p.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${p.flash})`
    ctx.fillRect(-h, -h, reach, look.thickness)
  }
  ctx.restore()
  path()
  ctx.strokeStyle = visual.wall.outline
  ctx.lineWidth = look.outlineWidth
  ctx.stroke()
  // A dark joint with a small bolt where it meets a standing neighbour.
  if (p.ends.right === 'joint') {
    ctx.fillStyle = visual.wall.outline
    ctx.fillRect(p.len - look.jointWidth / 2, -h + look.outlineWidth / 2, look.jointWidth, look.thickness - look.outlineWidth)
    ctx.fillStyle = shade(col, -0.5)
    ctx.beginPath()
    ctx.arc(p.len, 0, look.boltRadius, 0, Math.PI * 2)
    ctx.fill()
  }
  if (p.pips && !p.simplified) drawPips(ctx, p)
  ctx.restore()
}

/** Cracks (a dark line with a thin bright edge, glowing and pulsing in the owner's colour at 1 health), pits and the scorch, in the segment's local frame and clipped to it. */
function drawDamage(ctx: CanvasRenderingContext2D, p: SegmentPaint, col: string): void {
  const { crack, pit } = look
  const h = look.thickness / 2
  const trace = (c: { u: number; v: number }[], du = 0) => {
    ctx.beginPath()
    c.forEach((q, k) => (k ? ctx.lineTo(q.u + du, q.v + du) : ctx.moveTo(q.u + du, q.v + du)))
    ctx.stroke()
  }
  ctx.lineJoin = ctx.lineCap = 'round'
  for (const c of p.look.cracks) {
    if (p.hp === 1) {
      ctx.strokeStyle = hexA(shadeHex(col, crack.glow.lighten), crack.glow.alpha + crack.glow.swing * Math.sin(p.clock / crack.glow.periodMs + c[0].u))
      ctx.lineWidth = crack.glow.width
      trace(c)
    }
    ctx.strokeStyle = crack.dark
    ctx.lineWidth = crack.width
    trace(c)
    ctx.strokeStyle = crack.edge
    ctx.lineWidth = crack.edgeWidth
    trace(c, crack.edgeOffset)
  }
  ctx.fillStyle = `rgba(5,7,13,${pit.alpha})`
  for (const q of p.look.pits) {
    ctx.beginPath()
    ctx.arc(q.u, q.v, q.r, 0, Math.PI * 2)
    ctx.fill()
  }
  if (p.look.scorch !== undefined) {
    const u = p.look.scorch
    const s = ctx.createRadialGradient(u, 0, 0, u, 0, pit.scorchRadius)
    s.addColorStop(0, `rgba(5,7,13,${pit.scorchAlpha})`)
    s.addColorStop(1, 'rgba(5,7,13,0)')
    ctx.fillStyle = s
    ctx.fillRect(u - pit.scorchRadius, -h, 2 * pit.scorchRadius, look.thickness)
  }
}

/** One mark per health point, centred on the segment: bright for health left, dark for health lost. */
function drawPips(ctx: CanvasRenderingContext2D, p: SegmentPaint): void {
  const { pitch, width, height, radius, on, off } = look.pips
  for (let k = 0; k < p.max; k++) {
    ctx.fillStyle = k < p.hp ? on : off
    ctx.beginPath()
    ctx.roundRect(p.len / 2 + (k - (p.max - 1) / 2) * pitch - width / 2, -height / 2, width, height, radius)
    ctx.fill()
  }
}

/** A Gap's Breach mark: a low-alpha dark smudge the size of the segment, with specks of rubble in the owner's colour. */
export function drawBreach(ctx: CanvasRenderingContext2D, owner: PlayerId, from: Point, angle: number, len: number, specks: { u: number; v: number; r: number }[], alpha: number): void {
  if (alpha <= 0) return
  const { breach } = look
  const h = look.thickness / 2
  ctx.save()
  ctx.translate(from.x, from.y)
  ctx.rotate(angle)
  ctx.globalAlpha *= alpha
  const g = ctx.createRadialGradient(len / 2, 0, 0, len / 2, 0, len / 2)
  g.addColorStop(0, hexA(breach.color, breach.alpha))
  g.addColorStop(1, hexA(breach.color, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(len / 2, 0, len / 2, h * 1.2, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = visual.player.colors[owner]
  ctx.globalAlpha *= breach.speckAlpha
  for (const s of specks) {
    ctx.beginPath()
    ctx.arc(s.u, s.v, s.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** A tower's body: its owner fill (or `fill`) under a bevel from the lit edge (screen-up), a drop shadow down-right on screen, and a top highlight. */
export function drawTowerBody(ctx: CanvasRenderingContext2D, x: number, y: number, fill: string | CanvasPattern, flipped: boolean): void {
  const size = rules.cellSize
  const sh = shadowLocal(0, flipped)
  ctx.fillStyle = `rgba(0,0,0,${look.shadow.alpha})`
  ctx.fillRect(x + sh.u, y + sh.v, size, size)
  ctx.fillStyle = fill
  ctx.fillRect(x, y, size, size)
  // The lit edge is the one on screen-top: the world's top edge, or its bottom edge when the stage is turned.
  const [top, bottom] = flipped ? [y + size, y] : [y, y + size]
  const g = ctx.createLinearGradient(0, top, 0, bottom)
  g.addColorStop(0, 'rgba(255,255,255,0.35)')
  g.addColorStop(look.bevel.midAt, 'rgba(255,255,255,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.35)')
  ctx.fillStyle = g
  ctx.fillRect(x, y, size, size)
  ctx.fillStyle = `rgba(255,255,255,${look.highlight.alpha})`
  ctx.fillRect(x, flipped ? y + size - look.highlight.width : y, size, look.highlight.width)
}

/** Draws one particle of the wall pool in world space. */
export function drawParticle(ctx: CanvasRenderingContext2D, p: Particle, sparkSize: number): void {
  const k = 1 - p.age / p.life
  ctx.save()
  if (p.kind === 'spark') {
    ctx.globalAlpha = k
    ctx.fillStyle = p.color
    ctx.fillRect(p.x - sparkSize / 2, p.y - sparkSize / 2, sparkSize, sparkSize)
  } else if (p.kind === 'chunk') {
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rot)
    ctx.globalAlpha = Math.min(1, k * 1.5)
    ctx.fillStyle = shade(p.color, -0.15)
    ctx.strokeStyle = visual.wall.outline
    ctx.lineWidth = look.outlineWidth * 0.6
    const s = p.size
    ctx.beginPath()
    ctx.moveTo(-s, -s * 0.6)
    ctx.lineTo(s * 0.8, -s * 0.4)
    ctx.lineTo(s * 0.5, s * 0.7)
    ctx.lineTo(-s * 0.6, s * 0.5)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  } else if (p.kind === 'dust') {
    const { from, to, alpha, color } = visual.wall.break.dust
    const t = 1 - k
    const r = from + (to - from) * t
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r)
    g.addColorStop(0, `${color},${alpha * k})`)
    g.addColorStop(1, `${color},0)`)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fill()
  } else {
    const { rx, ry, width, alpha } = visual.wall.break.ring
    const t = 1 - k
    ctx.strokeStyle = p.color
    ctx.globalAlpha = alpha * k
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.ellipse(p.x, p.y, rx[0] + (rx[1] - rx[0]) * t, ry[0] + (ry[1] - ry[0]) * t, p.ang, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}
