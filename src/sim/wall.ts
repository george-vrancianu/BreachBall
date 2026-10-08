import { rules, type WallRules } from '../config/rules'
import { centreSpot, halfOf, type PlayerId, type Point } from './pitch'
import { inActivationRing, type PalletSpot } from './pallet'
import type { SimEvent } from './step'

/** A grid vertex: world position is (gx, gy) * rules.cellSize. */
export type Vertex = { gx: number; gy: number }
/** World position of a grid vertex. */
export const vertexToWorld = ({ gx, gy }: Vertex): Point => ({ x: gx * rules.cellSize, y: gy * rules.cellSize })
export type Segment = { a: Point; b: Point }

/** A wall is a drawn segment: `a` to `b` in free world units, at an allowed angle and a whole number of units long. */
export type WallSpec = { kind: 'wall'; owner: PlayerId; a: Point; b: Point }
/** A placed wall: a stable id assigned by the sim, and one health per wall segment (one per unit, index 0 at `a`); a segment at 0 is a Gap (ADR-0007). */
export type Wall = WallSpec & { id: number; segments: number[] }

/** A one-cell obstacle; `at` is the cell's top-left grid vertex. Follows every wall rule. */
export type TowerSpec = { kind: 'tower'; owner: PlayerId; at: Vertex; /** Which tower: its Credit price in Rounds, the stock it spends in Siege. */ power: 'repulsor' | 'steal' }
/** `spent`: a Repulsor that has fired this shot; cleared when the ball rests. */
export type Tower = TowerSpec & { id: number; hp: number; spent?: boolean }
/** Anything placeable, and its placed form; walls and towers share legality, collision and damage. */
export type StructureSpec = WallSpec | TowerSpec
export type Structure = Wall | Tower

export type TowerPower = TowerSpec['power']

const POWER_HP: Record<TowerPower, number> = { repulsor: rules.towerHp, steal: rules.stealHp }
/** The structures `p` owns, towers included: the HUD count, the end screen and the Siege wipe-out all read this. */
export const structuresOf = (objects: readonly Structure[], p: PlayerId): Structure[] => objects.filter((o) => o.owner === p)
/** Full health: a tower's, or one wall segment's. */
export const maxHp = (s: StructureSpec): number => (s.kind === 'tower' ? POWER_HP[s.power] : rules.wallHp)

export type { WallRules }

const EPS = 1e-6
const toDeg = (r: number) => (r * 180) / Math.PI
const toRad = (d: number) => (d * Math.PI) / 180
const norm360 = (d: number) => ((d % 360) + 360) % 360
const lengthOf = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)

/** How many units long the wall is (its length over `wall.unit`, rounded). */
export const wallUnits = (w: Pick<WallSpec, 'a' | 'b'>, r: WallRules = rules): number => Math.round(lengthOf(w.a, w.b) / r.wall.unit)
/** How many wall segments the wall has: one per unit. */
export const segmentCount = (w: Pick<WallSpec, 'a' | 'b'>): number => wallUnits(w)
/** The index of the wall segment `at` projects onto along the wall, clamped to the wall's ends. */
export function segmentAt(w: Pick<WallSpec, 'a' | 'b'>, at: Point): number {
  const [vx, vy] = [w.b.x - w.a.x, w.b.y - w.a.y]
  const len2 = vx * vx + vy * vy
  const n = segmentCount(w)
  const t = len2 === 0 ? 0 : ((at.x - w.a.x) * vx + (at.y - w.a.y) * vy) / len2
  return Math.max(0, Math.min(n - 1, Math.floor(t * n)))
}
/** The two ends of wall segment `i`: the wall cut into equal pieces from `a`. */
export function segmentEnds(w: Pick<WallSpec, 'a' | 'b'>, i: number): Segment {
  const n = segmentCount(w)
  const at = (k: number): Point => (k <= 0 ? w.a : k >= n ? w.b : { x: w.a.x + ((w.b.x - w.a.x) * k) / n, y: w.a.y + ((w.b.y - w.a.y) * k) / n })
  return { a: at(i), b: at(i + 1) }
}
/** The indices of the wall's standing segments (health above 0). */
export const standing = (w: Pick<Wall, 'segments'>): number[] => standingIn(w.segments)
/** The indices of `segments` (health per Wall segment) that still stand, or with `up` false the Gaps (health 0). */
export const standingIn = (segments: readonly number[], up = true): number[] => segments.flatMap((hp, i) => (hp > 0 === up ? [i] : []))
/** A fresh structure from its spec: a wall with every segment at full health, a tower at full hp. */
export const newStructure = (spec: StructureSpec, id: number): Structure =>
  spec.kind === 'wall' ? { ...spec, id, segments: Array<number>(segmentCount(spec)).fill(maxHp(spec)) } : { ...spec, id, hp: maxHp(spec) }

/** Credits a wall costs: units times the per-unit price, whatever the angle. */
export const wallCost = (w: Pick<WallSpec, 'a' | 'b'>, r: WallRules = rules): number => wallUnits(w, r) * r.wall.unitCost
/** A structure's price in Credits: a wall's units, a tower's `rules.towerCost`. Siege spends tower stock instead (see `chargeOf` in step.ts). */
export const structureCost = (s: StructureSpec): number => (s.kind === 'wall' ? wallCost(s) : rules.towerCost[s.power])

/** Every allowed direction in degrees, `[0, 360)` and ascending: each allowed angle and its opposite (a wall from a to b at 225 degrees is the same set as 45). */
const directions = (r: WallRules): number[] => [...new Set(r.wall.angles.flatMap((d) => [norm360(d), norm360(d + 180)]))].sort((p, q) => p - q)
/**
 * The allowed direction nearest to `heading` (degrees, `[0, 360)`). A wall's line is chosen first, modulo 180 (an exact tie takes the lower angle), then the
 * way along it that lies on the heading's side, so a heading and its opposite always give opposite directions of the same line.
 */
function nearestDirection(heading: number, r: WallRules): number {
  const dirs = directions(r)
  const gap = (d: number, mod: number) => { const x = Math.abs(d - heading) % mod; return Math.min(x, mod - x) }
  const line = (d: number) => d % 180
  const least = Math.min(...dirs.map((d) => gap(d, 180)))
  const near = dirs.filter((d) => gap(d, 180) <= least + 1e-9).map(line)
  const lineOf = near.reduce((best, l) => ((l || 180) < (best || 180) ? l : best))
  return dirs.filter((d) => line(d) === lineOf).reduce((best, d) => (gap(d, 360) < gap(best, 360) ? d : best))
}
/** The point `len` from `a` along `deg`; components that should be exactly 0 (multiples of 90 degrees) or equal (odd multiples of 45) come out so. */
function along(a: Point, deg: number, len: number): Point {
  let [c, s] = [Math.cos(toRad(deg)), Math.sin(toRad(deg))]
  if (Math.abs(c) < 1e-12) c = 0
  if (Math.abs(s) < 1e-12) s = 0
  if (c !== 0 && s !== 0 && Math.abs(Math.abs(c) - Math.abs(s)) < 1e-12) [c, s] = [Math.sign(c) * Math.SQRT1_2, Math.sign(s) * Math.SQRT1_2]
  return { x: a.x + c * len, y: a.y + s * len }
}
/** The allowed unit count nearest to `len` world units. */
const nearestUnits = (len: number, r: WallRules): number => r.wall.units.reduce((best, u) => (Math.abs(u - len / r.wall.unit) < Math.abs(best - len / r.wall.unit) ? u : best))

/**
 * The wall end for a drag from `a` to `pointer`: the direction snapped to the nearest allowed angle, the length to the nearest allowed unit count.
 * Null when the drag is shorter than half a unit (nothing is placed).
 */
export function snapWallEnd(a: Point, pointer: Point, r: WallRules = rules): Point | null {
  const len = lengthOf(a, pointer)
  if (len < r.wall.unit / 2) return null
  const heading = norm360(toDeg(Math.atan2(pointer.y - a.y, pointer.x - a.x)))
  const dir = nearestDirection(heading, r)
  return along(a, dir, nearestUnits(len, r) * r.wall.unit)
}

/**
 * The wall two fingers hold, one on each end: its midpoint is the fingers' midpoint, its direction the fingers' vector snapped to the nearest allowed angle,
 * its length the fingers' distance snapped to the nearest allowed unit count. `a` is the end nearer `f1`. Null when the fingers are under half a unit apart.
 */
export function snapWallBetween(f1: Point, f2: Point, r: WallRules = rules): { a: Point; b: Point } | null {
  const len = lengthOf(f1, f2)
  if (len < r.wall.unit / 2) return null
  const heading = norm360(toDeg(Math.atan2(f2.y - f1.y, f2.x - f1.x)))
  const dir = nearestDirection(heading, r)
  const span = nearestUnits(len, r) * r.wall.unit
  // `b` is found from `a` by the same `along` as every drawn wall, so the shape is exact.
  const a = along({ x: (f1.x + f2.x) / 2, y: (f1.y + f2.y) / 2 }, dir + 180, span / 2)
  return { a, b: along(a, dir, span) }
}

/** The wall turned to the next allowed direction (45 degrees by default) around `a`, stepping from the nearest allowed direction and snapping the length to the nearest allowed unit count. */
export function rotatedWall<W extends Pick<WallSpec, 'a' | 'b'>>(w: W, r: WallRules = rules): W {
  const heading = norm360(toDeg(Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x)))
  const dirs = directions(r)
  const nearest = dirs.indexOf(nearestDirection(heading, r))
  return { ...w, b: along(w.a, dirs[(nearest + 1) % dirs.length], nearestUnits(lengthOf(w.a, w.b), r) * r.wall.unit) }
}

/** The wall moved by `delta`, both ends together. */
export const translatedWall = <W extends Pick<WallSpec, 'a' | 'b'>>(w: W, delta: Point): W => ({ ...w, a: { x: w.a.x + delta.x, y: w.a.y + delta.y }, b: { x: w.b.x + delta.x, y: w.b.y + delta.y } })

/** The point of the segment nearest to `p`; a zero-length segment is its one point. */
export function nearestOnSegment({ a, b }: Segment, p: Point): Point {
  const [vx, vy] = [b.x - a.x, b.y - a.y]
  const len2 = vx * vx + vy * vy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2))
  return { x: a.x + t * vx, y: a.y + t * vy }
}

/** Shortest distance from `p` to the segment. */
export function distToSegment(s: Segment, p: Point): number {
  const at = nearestOnSegment(s, p)
  return Math.hypot(at.x - p.x, at.y - p.y)
}

/**
 * Whether two segments only touch or stay apart: false when they cross (a point interior to both) or run collinear over a positive length.
 * Meeting end to end, or one's end lying on the other's body (a T), is fine. `eps` is the tolerance in world units.
 */
export function segmentsTouchOnly(s1: Segment, s2: Segment, eps = EPS): boolean {
  const [d1x, d1y, d2x, d2y] = [s1.b.x - s1.a.x, s1.b.y - s1.a.y, s2.b.x - s2.a.x, s2.b.y - s2.a.y]
  const [l1, l2] = [Math.hypot(d1x, d1y), Math.hypot(d2x, d2y)]
  if (l1 === 0 || l2 === 0) return true
  const cross = d1x * d2y - d1y * d2x
  const [ox, oy] = [s2.a.x - s1.a.x, s2.a.y - s1.a.y]
  if (Math.abs(cross) > 1e-9 * l1 * l2) {
    const t = (ox * d2y - oy * d2x) / cross
    const u = (ox * d1y - oy * d1x) / cross
    return !(t * l1 > eps && (1 - t) * l1 > eps && u * l2 > eps && (1 - u) * l2 > eps)
  }
  // Parallel: only collinear segments can overlap.
  if (Math.abs(ox * d1y - oy * d1x) / l1 > eps) return true
  const ts = [(ox * d1x + oy * d1y) / (l1 * l1), ((s2.b.x - s1.a.x) * d1x + (s2.b.y - s1.a.y) * d1y) / (l1 * l1)]
  const overlap = Math.min(1, Math.max(...ts)) - Math.max(0, Math.min(...ts))
  return overlap * l1 <= eps
}

/**
 * Whether two walls cross or overlap (touching end to end or in a T is fine). Walls have thickness: parallel or collinear walls
 * closer than `2 * wallHalf` whose lengths overlap along their direction also count as overlapping.
 */
export function wallsOverlap(w1: Pick<WallSpec, 'a' | 'b'>, w2: Pick<WallSpec, 'a' | 'b'>, eps = EPS, r: WallRules = rules): boolean {
  if (!segmentsTouchOnly(w1, w2, eps)) return true
  const [d1x, d1y, d2x, d2y] = [w1.b.x - w1.a.x, w1.b.y - w1.a.y, w2.b.x - w2.a.x, w2.b.y - w2.a.y]
  const [l1, l2] = [Math.hypot(d1x, d1y), Math.hypot(d2x, d2y)]
  if (l1 === 0 || l2 === 0 || Math.abs(d1x * d2y - d1y * d2x) > 1e-9 * l1 * l2) return false
  const [ox, oy] = [w2.a.x - w1.a.x, w2.a.y - w1.a.y]
  if (Math.abs(ox * d1y - oy * d1x) / l1 >= 2 * r.wallHalf) return false
  const ts = [(ox * d1x + oy * d1y) / l1, ((w2.b.x - w1.a.x) * d1x + (w2.b.y - w1.a.y) * d1y) / l1]
  return Math.min(l1, Math.max(...ts)) - Math.max(0, Math.min(...ts)) > eps
}

/** A tower's four edges, in world units. */
const towerEdges = (w: TowerSpec): Segment[] => {
  const { gx, gy } = w.at
  const [p, q, r, s] = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => vertexToWorld({ gx: gx + x, gy: gy + y }))
  return [{ a: p, b: q }, { a: q, b: r }, { a: r, b: s }, { a: s, b: p }]
}

/** The length of `s` that lies strictly inside the tower's cell (Liang-Barsky clip against the open square). */
function lengthInside(s: Segment, tower: TowerSpec): number {
  const [min, max] = [vertexToWorld(tower.at), vertexToWorld({ gx: tower.at.gx + 1, gy: tower.at.gy + 1 })]
  const [dx, dy] = [s.b.x - s.a.x, s.b.y - s.a.y]
  let [t0, t1] = [0, 1]
  for (const [p, q] of [[-dx, s.a.x - min.x], [dx, max.x - s.a.x], [-dy, s.a.y - min.y], [dy, max.y - s.a.y]]) {
    if (p === 0) { if (q <= EPS) return 0 } else {
      const t = q / p
      if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t)
    }
  }
  return Math.max(0, t1 - t0) * Math.hypot(dx, dy)
}

const centre = centreSpot()
const distToBox = (min: Point, max: Point, p: Point): number => Math.hypot(Math.max(min.x - p.x, 0, p.x - max.x), Math.max(min.y - p.y, 0, p.y - max.y))

/** Whether the wall is one of the allowed shapes: a whole allowed number of units long, along an allowed angle (within a hundredth of a world unit at its far end). */
export function isDrawable(w: Pick<WallSpec, 'a' | 'b'>, r: WallRules = rules): boolean {
  const len = lengthOf(w.a, w.b)
  const heading = toDeg(Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x))
  const offAngle = (d: number) => {
    const diff = (((heading - d) % 180) + 180) % 180
    return Math.min(diff, 180 - diff)
  }
  return r.wall.units.some((u) => Math.abs(len - u * r.wall.unit) <= r.wall.shapeTol) && r.wall.angles.some((d) => len * Math.sin(toRad(offAngle(d))) <= r.wall.shapeTol)
}

/**
 * Legal when the wall is an allowed shape (a tower always is), the whole structure lies inside the pitch, on the owner's half (a segment lying on the halfway line belongs to neither),
 * outside the owner's goal no-build zone, the Centre zone and the Activation ring of each Pallet at `pallets`, and, against `existing`, crosses no wall, overlaps no wall and
 * passes through no tower's cell. Touching (end to end, or an end on another wall's body) is fine.
 */
export function isLegal(w: StructureSpec, existing: readonly StructureSpec[] = [], pallets: readonly PalletSpot[] = [], r: WallRules = rules): boolean {
  const goal: Point = { x: rules.pitchWidth / 2, y: w.owner === 2 ? 0 : rules.pitchHeight }
  // A tower is judged as its whole square, so an edge resting on the halfway line is fine.
  const [p, q] = w.kind === 'tower' ? [vertexToWorld(w.at), vertexToWorld({ gx: w.at.gx + 1, gy: w.at.gy + 1 })] : [w.a, w.b]
  const [min, max] = [{ x: Math.min(p.x, q.x), y: Math.min(p.y, q.y) }, { x: Math.max(p.x, q.x), y: Math.max(p.y, q.y) }]
  const side = (y: number) => (w.owner === 1 ? y >= rules.halfHeight : y <= rules.halfHeight)
  const dist = (at: Point) => (w.kind === 'tower' ? distToBox(min, max, at) : distToSegment(w, at))
  const placed = min.x >= 0 && max.x <= rules.pitchWidth && min.y >= 0 && max.y <= rules.pitchHeight && side(min.y) && side(max.y) && halfOf((min.y + max.y) / 2) === w.owner
  if (!placed || (w.kind === 'wall' && !isDrawable(w, r)) || dist(goal) <= rules.noBuildRadius || dist(centre) <= rules.centreZoneRadius) return false
  // Walls and towers must stay wholly outside the ring: a wall's body reaches `wallHalf` past its centreline.
  if (inActivationRing(pallets, dist, w.kind === 'wall' ? r.wallHalf : 0)) return false
  return existing.every((o) => {
    if (w.kind === 'wall') return o.kind === 'wall' ? !wallsOverlap(w, o, EPS, r) : lengthInside(w, o) <= EPS
    return o.kind === 'wall' ? lengthInside(o, w) <= EPS : o.at.gx !== w.at.gx || o.at.gy !== w.at.gy
  })
}

/** A placed wall's standing segments with their index; a bare spec or a tower has no index (a bare spec is its one whole segment). */
export function standingPieces(w: StructureSpec): { index?: number; seg: Segment }[] {
  if (w.kind === 'tower') return towerEdges(w).map((seg) => ({ seg }))
  if (!('segments' in w)) return [{ seg: { a: w.a, b: w.b } }]
  return standing(w as Wall).map((index) => ({ index, seg: segmentEnds(w, index) }))
}

/** Zero-thickness collision segments in world units: a placed wall's standing segments (Gaps have none), a bare wall spec its one segment, a tower its four edges. */
export const wallSegments = (w: StructureSpec): Segment[] => standingPieces(w).map((p) => p.seg)

/**
 * Removes `by` health (1 unless a Breaker) from wall segment `segment` (a tower: 1 hp); the damage path every source ends in. Unknown ids and segments already a Gap are ignored.
 * A segment that survives is `wall-cracked`; one that breaks leaves a Gap (`segment-broken`), or is the wall's last and removes it (`wall-destroyed`).
 */
export function damageSegment(objects: Structure[], id: number, segment: number, at: Point, by = 1): { objects: Structure[]; events: SimEvent[] } {
  const target = objects.find((w) => w.id === id)
  if (!target) return { objects, events: [] }
  if (target.kind === 'tower') {
    const hp = target.hp - 1
    return hp > 0
      ? { objects: objects.map((w) => (w === target ? { ...target, hp } : w)), events: [{ type: 'wall-cracked', id, hp, at }] }
      : { objects: objects.filter((w) => w !== target), events: [{ type: 'wall-destroyed', wall: { ...target, hp }, at }] }
  }
  if (!(target.segments[segment] > 0)) return { objects, events: [] }
  const hp = Math.max(0, target.segments[segment] - by)
  const segments = target.segments.map((h, i) => (i === segment ? hp : h))
  const wall: Wall = { ...target, segments }
  if (hp > 0) return { objects: objects.map((w) => (w === target ? wall : w)), events: [{ type: 'wall-cracked', id, hp, segment, at }] }
  if (standing(wall).length > 0) return { objects: objects.map((w) => (w === target ? wall : w)), events: [{ type: 'segment-broken', id, segment, wall, at }] }
  return { objects: objects.filter((w) => w !== target), events: [{ type: 'wall-destroyed', wall, segment, at }] }
}

/** Damages the segment `at` lands on (a tower: its one pool). Unknown ids are ignored. */
export function damageWall(objects: Structure[], id: number, at: Point): { objects: Structure[]; events: SimEvent[] } {
  const target = objects.find((w) => w.id === id)
  return damageSegment(objects, id, target?.kind === 'wall' ? segmentAt(target, at) : 0, at)
}
