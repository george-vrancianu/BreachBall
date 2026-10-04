import { visual } from '../../config/visual'
import type { Point } from '../../sim/pitch'

const look = visual.wall.look

/** Which long edge of a wall segment: `1` is the +v side of its local frame (u along the wall from its start, v across it, turned a quarter revolution from u), `-1` the other. */
export type Side = 1 | -1
/** A point in a wall segment's local frame, world units. */
export type LP = { u: number; v: number }
/** What a segment has at each end: a rounded cap (the wall's real end), a joint with a standing neighbour, or a jagged break where the neighbour is a Gap. */
export type EndKind = 'cap' | 'joint' | 'broken'

/** A seeded generator of numbers in [0, 1): the same seed always gives the same sequence, so every peer draws the same cracks. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The seed of a segment's look: its wall's id, its index and its health, so each health state has its own cracks. */
export const segmentSeed = (id: number, segment: number, hp: number): number => (Math.imul(id + 1, 73856093) ^ Math.imul(segment + 1, 19349663) ^ Math.imul(hp + 1, 83492791)) >>> 0

/**
 * The long edge that is lit for a segment running along `angle` (radians, in world space): the one facing screen-up, or the left one for an exactly vertical wall.
 * `flipped` is the hot-seat half turn of the stage, so the same physical edge stays lit on screen whichever seat looks.
 */
export function litSide(angle: number, flipped: boolean): Side {
  const k = flipped ? -1 : 1
  // Screen direction of the +v side (the wall's direction turned a quarter revolution): the stage turn negates it.
  const [nx, ny] = [-Math.sin(angle) * k, Math.cos(angle) * k]
  if (Math.abs(ny) > 1e-9) return ny < 0 ? 1 : -1
  return nx < 0 ? 1 : -1
}

/** The drop shadow's offset in a segment's local frame: down-right on screen, which is up-left in world space when `flipped`. */
export function shadowLocal(angle: number, flipped: boolean): LP {
  const k = flipped ? -1 : 1
  const [dx, dy] = [look.shadow.dx * k, look.shadow.dy * k]
  return { u: dx * Math.cos(angle) + dy * Math.sin(angle), v: -dx * Math.sin(angle) + dy * Math.cos(angle) }
}

/** Where the sheen centre is along a wall of length `len` (world units, may lie outside it while it rests), `clock` ms in; each wall id starts at its own offset. */
export function shinePos(clock: number, id: number, len: number): number {
  const { speed, gap, halfWidth, phase } = look.shine
  const cycle = len + 2 * halfWidth + gap
  return ((((clock / 1000) * speed + id * phase) % cycle) + cycle) % cycle - halfWidth
}

/** What each end of segment `i` is, given every segment's health. */
export function endKinds(segments: readonly number[], i: number): { left: EndKind; right: EndKind } {
  const kind = (j: number): EndKind => (j < 0 || j >= segments.length ? 'cap' : segments[j] > 0 ? 'joint' : 'broken')
  return { left: kind(i - 1), right: kind(i + 1) }
}

/** Whether a segment shows its health pips: only when damaged and still standing, and the config flag is on. */
export const showPips = (hp: number, max: number, flag: boolean = visual.wall.showPips): boolean => flag && hp > 0 && hp < max

/** Where a hit landed on a segment: along it and on which long edge. */
export type HitMark = { u: number; side: Side }

/** The hit mark for a point `at` on a segment from `a` to `b`: kept clear of the ends (caps and joints), on the edge `at` lies towards (the +v side when it is on the line). */
export function hitMark(a: Point, b: Point, at: Point): HitMark {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const [dx, dy] = [(b.x - a.x) / len, (b.y - a.y) / len]
  const [px, py] = [at.x - a.x, at.y - a.y]
  const { margin } = look.crack
  return { u: Math.max(margin, Math.min(len - margin, px * dx + py * dy)), side: -dy * px + dx * py < 0 ? -1 : 1 }
}

/** A bite out of a long edge. */
export type Chip = { u: number; side: Side; w: number; depth: number }
/** A dark pit in the body. */
export type Pit = { u: number; v: number; r: number }

/** Everything a segment's body is drawn from: its outline, and the damage on it. */
export type SegmentLook = { outline: LP[]; chips: Chip[]; cracks: LP[][]; pits: Pit[]; scorch?: number; origin: HitMark }

const between = (r: () => number, [lo, hi]: readonly number[]): number => lo + r() * (hi - lo)

/**
 * A segment's look at `hp` health, `len` long: deterministic in (id, segment, hp). Cracks start at `origin` (the hit this client saw) when given, else at a spot seeded from the same triple;
 * the chips, pits and jagged ends are always seeded. A segment at full health has no cracks, chips or pits.
 */
export function segmentLook(id: number, segment: number, hp: number, ends: { left: EndKind; right: EndKind }, len: number, origin?: HitMark, thickness = look.thickness): SegmentLook {
  const r = seeded(segmentSeed(id, segment, hp))
  const h = thickness / 2
  const { margin } = look.crack
  const seeded0: HitMark = { u: margin + r() * (len - 2 * margin), side: r() < 0.5 ? -1 : 1 }
  const at = origin ?? seeded0
  const clampU = (u: number) => Math.max(margin, Math.min(len - margin, u))
  const rung = look.ladder[hp]
  // Cracks: jagged lines from the hit point across the segment.
  const cracks: LP[][] = []
  for (let k = 0; k < (rung?.cracks ?? 0); k++) {
    const pts: LP[] = [{ u: at.u, v: at.side * h }]
    let [cu, cv] = [at.u, at.side * h]
    let dir = (r() - 0.5) * look.crack.heading
    const run = rung.len + r() * look.crack.lenRange
    for (let st = 0; st < look.crack.steps; st++) {
      cu += (Math.sin(dir) * run) / look.crack.steps + (r() - 0.5) * look.crack.jitter
      cv -= at.side * (thickness / look.crack.steps) * (0.7 + r() * 0.5)
      pts.push({ u: Math.max(0.1, Math.min(len - 0.1, cu)), v: Math.max(-h, Math.min(h, cv)) })
      dir += (r() - 0.5) * look.crack.bend
    }
    cracks.push(pts)
  }
  // Chips: one bitten out of the hit edge below full health, a second on the far edge at 1.
  const chips: Chip[] = []
  const edge = seeded0
  if (hp <= 2) chips.push({ u: edge.u, side: edge.side, w: between(r, look.chip.width), depth: look.chip.depth[hp === 2 ? 2 : 1] })
  if (hp <= 1) chips.push({ u: clampU(edge.u + (r() - 0.5) * look.chip.far.spread), side: -edge.side as Side, w: between(r, look.chip.far.width), depth: look.chip.far.depth })
  // Pits and a scorch around the worst of it at 1.
  const pits: Pit[] = []
  if (hp <= 1) for (let k = 0; k < look.pit.count; k++) pits.push({ u: look.pit.margin + r() * (len - 2 * look.pit.margin), v: (r() - 0.5) * thickness * 0.7, r: between(r, look.pit.radius) })
  return { outline: outlineOf(id, segment, hp, ends, len, chips, thickness), chips, cracks, pits, scorch: hp <= 1 ? chips[0]?.u : undefined, origin: at }
}

/** The segment's closed outline: rounded at a wall's real ends, narrowed at a joint, jagged beside a Gap, with its chips bitten out of the long edges. */
function outlineOf(id: number, segment: number, hp: number, { left, right }: { left: EndKind; right: EndKind }, len: number, chips: Chip[], thickness: number): LP[] {
  const h = thickness / 2
  const [u0, u1] = [left === 'joint' ? look.jointWidth / 2 : 0, len - (right === 'joint' ? look.jointWidth / 2 : 0)]
  const edge = (side: Side): LP[] => {
    const pts: LP[] = [{ u: u0, v: side * h }]
    for (const c of chips.filter((c) => c.side === side).sort((p, q) => p.u - q.u)) {
      pts.push({ u: c.u - c.w, v: side * h }, { u: c.u - c.w * 0.3, v: side * (h - c.depth) }, { u: c.u + c.w * 0.4, v: side * (h - c.depth * 0.7) }, { u: c.u + c.w, v: side * h })
    }
    pts.push({ u: u1, v: side * h })
    return pts
  }
  // Each jagged end has its own seed, so a neighbour breaking never reshapes the other end.
  const jag = (u: number, dir: 1 | -1, salt: number): LP[] => {
    const r = seeded(segmentSeed(id, segment, hp) ^ salt)
    return Array.from({ length: look.jag.points + 1 }, (_, k) => ({ u: u + dir * (r() * look.jag.reach - (k % 2 ? look.jag.notch : 0)), v: h - (thickness * k) / look.jag.points }))
  }
  const cap = (cu: number, from: number): LP[] => Array.from({ length: look.capSteps + 1 }, (_, k) => ({ u: cu + h * Math.cos(from + (Math.PI * k) / look.capSteps), v: h * Math.sin(from + (Math.PI * k) / look.capSteps) }))
  // Top edge, right end, bottom edge back, left end.
  const P = edge(-1)
  if (right === 'broken') P.push(...jag(u1, -1, 0x51).reverse())
  else if (right === 'cap') P.push(...cap(len, -Math.PI / 2))
  P.push(...edge(1).reverse())
  if (left === 'broken') P.push(...jag(u0, 1, 0xa7))
  else if (left === 'cap') P.push(...cap(0, Math.PI / 2))
  return P
}

/** A speck of rubble in a Breach mark. */
export type Speck = { u: number; v: number; r: number }

/** The rubble specks of a Gap's Breach mark: 4 to 6, deterministic in (id, segment), spread over a segment `len` long. */
export function breachSpecks(id: number, segment: number, len: number, thickness = look.thickness): Speck[] {
  const r = seeded(segmentSeed(id, segment, 0xb2))
  const n = Math.floor(between(r, [look.breach.specks[0], look.breach.specks[1] + 1]))
  return Array.from({ length: n }, () => ({ u: look.breach.margin + r() * (len - 2 * look.breach.margin), v: (r() - 0.5) * thickness * 0.9, r: between(r, look.breach.speckRadius) }))
}

/** The indices of a wall's Gaps: the segments with no health left, each of which carries a Breach mark. */
export const gapsOf = (segments: readonly number[]): number[] => segments.flatMap((hp, i) => (hp > 0 ? [] : [i]))

/** A Breach mark's strength: full while its wall stands, fading to nothing over `fadeMs` after the wall is destroyed (`goneFor` ms ago). */
export const breachAlpha = (goneFor: number | undefined, fadeMs: number): number => (goneFor === undefined ? 1 : Math.max(0, 1 - goneFor / fadeMs))

const hexOf = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16)
  return [n >> 16, (n >> 8) & 255, n & 255]
}
/** `hex` as an rgba() string at `alpha`. */
export const hexA = (hex: string, alpha: number): string => {
  const [r, g, b] = hexOf(hex)
  return `rgba(${r},${g},${b},${alpha})`
}
const shaded = (hex: string, k: number): [number, number, number] => {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)))
  const [r, g, b] = hexOf(hex)
  return [f(r), f(g), f(b)]
}
/** `hex` shifted towards black (`k` below 0) or white (`k` above 0) by that fraction, as an rgb() string. */
export const shade = (hex: string, k: number): string => `rgb(${shaded(hex, k).join(',')})`
/** The same shift as `shade`, as a `#rrggbb` string, for `hexA`. */
export const shadeHex = (hex: string, k: number): string => `#${shaded(hex, k).map((v) => v.toString(16).padStart(2, '0')).join('')}`
