import { visual } from '../../config/visual'
import { rules } from '../../config/rules'
import { modeFor } from '../../sim/mode'
import { nearestOnWall } from '../../sim/near'
import { halfSpan, type PlayerId, type Point } from '../../sim/pitch'
import { UNITS } from '../../sim/settings'
import { canAffordTower, canEdit, canMove, canPlace, type SimInput, type SimState } from '../../sim/step'
import { rotatedWall, translatedWall, vertexToWorld, wallCost, type WallSpec, type StructureSpec, type TowerPower } from '../../sim/wall'
import type { ButtonSpec } from './hudModel'

/**
 * The builder's selection: a new piece (no `id`), or one of their structures (`id`). Only this turn's structures can be
 * dragged; an older one is selected just to demolish it.
 */
export type Selection = { spec: StructureSpec; id?: number; movable: boolean }

/** The Defence item armed for drawing. */
export type Item = 'wall' | TowerPower

/** The wall end nearest to `p` within `radius` among `owner`'s walls (never `excludeId`'s), with its distance. Only the owner's own walls attract: an opponent's end can be hidden by the blind opening's fog, and snapping to it would reveal it. */
export function nearestWallEnd(objects: SimState['objects'], p: Point, radius: number, { excludeId, owner }: { excludeId?: number; owner: PlayerId }): { p: Point; d: number } | undefined {
  let best: { p: Point; d: number } | undefined
  for (const o of objects) {
    if (o.kind !== 'wall' || o.id === excludeId || o.owner !== owner) continue
    for (const end of [o.a, o.b]) {
      const d = Math.hypot(end.x - p.x, end.y - p.y)
      if (d <= radius && (!best || d < best.d)) best = { p: end, d }
    }
  }
  return best
}

/** The start of a wall `owner` draws from `at`: the nearest of their own wall ends within `radius`, copied exactly so chained walls share a vertex; else `at` itself. */
export function snapStart(s: Pick<SimState, 'objects'>, owner: PlayerId, at: Point, radius: number): Point {
  const end = nearestWallEnd(s.objects, at, radius, { owner })?.p
  return end ? { x: end.x, y: end.y } : at
}

/** The tower build piece on the cell that contains `at`, so the piece is under the finger. */
export const towerAt = (power: TowerPower, owner: PlayerId, at: Point): StructureSpec => ({ kind: 'tower', owner, power, at: { gx: Math.floor(at.x / rules.cellSize), gy: Math.floor(at.y / rules.cellSize) } })

/** Where a fresh tower drag holds the piece: its cell's centre, so `movedTo` (which rounds the corner) keeps the cell under the finger. */
export const towerGrab: Point = { x: rules.cellSize / 2, y: rules.cellSize / 2 }

/** Whether `at` lands on `spec`, within `tolerance` world units of its segments. */
export const onPiece = (spec: StructureSpec, at: Point, tolerance: number) => nearestOnWall(spec, at).dist <= tolerance

/** The builder's own structure under `at`, nearest first, selected as it stands. */
export function pick(s: SimState, builder: PlayerId, at: Point, tolerance: number): Selection | undefined {
  const hits = s.objects.filter((o) => o.owner === builder).map((o) => ({ o, d: nearestOnWall(o, at).dist })).filter((h) => h.d <= tolerance)
  const near = hits.sort((a, b) => a.d - b.d)[0]?.o
  if (!near) return undefined
  const spec: StructureSpec = near.kind === 'wall' ? { kind: 'wall', owner: near.owner, a: near.a, b: near.b } : { kind: 'tower', owner: near.owner, power: near.power, at: near.at }
  return { spec, id: near.id, movable: s.built.includes(near.id) }
}

/** A wall turned to the next allowed angle (45 degrees) around its start; a tower stays. */
export const rotated = (sel: Selection): Selection => (sel.spec.kind === 'wall' ? { ...sel, spec: rotatedWall(sel.spec) } : sel)

/** The point a drag holds the piece by: a wall's start, a tower's top-left corner. */
export const anchorOf = (spec: StructureSpec): Point => (spec.kind === 'wall' ? spec.a : vertexToWorld(spec.at))

/** The piece with its anchor moved to `to`: a wall slides freely, both ends together; a tower snaps to the grid. */
export const movedTo = (spec: StructureSpec, to: Point): StructureSpec =>
  spec.kind === 'wall' ? translatedWall(spec, { x: to.x - spec.a.x, y: to.y - spec.a.y }) : { ...spec, at: { gx: Math.round(to.x / rules.cellSize), gy: Math.round(to.y / rules.cellSize) } }

/**
 * The wall translated so that whichever of its ends lies within `radius` of another of the owner's wall ends (not `selfId`'s own) sits exactly on it:
 * the nearest candidate wins. The target's coordinates are copied, so the touch is exact; the other end follows by the same delta.
 */
export function snapBody(w: WallSpec, objects: SimState['objects'], selfId: number | undefined, radius: number): WallSpec {
  let best: { end: 'a' | 'b'; to: Point; d: number } | undefined
  for (const end of ['a', 'b'] as const) {
    const hit = nearestWallEnd(objects, w[end], radius, { excludeId: selfId, owner: w.owner })
    if (hit && (!best || hit.d < best.d)) best = { end, to: hit.p, d: hit.d }
  }
  if (!best) return w
  const moved = translatedWall(w, { x: best.to.x - w[best.end].x, y: best.to.y - w[best.end].y })
  return { ...moved, [best.end]: { x: best.to.x, y: best.to.y } }
}

/** Legal where it stands (ignoring itself when moved) and affordable: the sim's own `canPlace` for a new piece, `canMove` for one of the builder's structures. */
export function legal(s: SimState, sel: Selection): boolean {
  return sel.id === undefined ? canPlace(s, sel.spec) : canMove(s, sel.id, sel.spec)
}

/** How far to pan while a piece is held near the top or bottom `edgeBand` of the view: toward any of the builder's half that is off screen, never past it. */
export function edgeScrollDy(camY: number, visibleHeight: number, builder: PlayerId, pointerY: number, dt: number): number {
  const [lo, hi] = halfSpan(builder)
  const [top, bottom] = [camY - visibleHeight / 2, camY + visibleHeight / 2]
  const margin = visibleHeight * visual.input.edgeBand
  return pointerY < top + margin && top > lo ? -Math.min(visual.input.edgeScrollSpeed * dt, top - lo) : pointerY > bottom - margin && bottom < hi ? Math.min(visual.input.edgeScrollSpeed * dt, hi - bottom) : 0
}

const near = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6
const sameSpec = (a: StructureSpec, b: StructureSpec) =>
  a.kind === b.kind && a.owner === b.owner && (a.kind === 'tower' ? (b as typeof a).power === a.power && a.at.gx === (b as typeof a).at.gx && a.at.gy === (b as typeof a).at.gy : near(a.a, (b as typeof a).a) && near(a.b, (b as typeof a).b))

/** The sim input a lift sends: place a new piece or move a structure. Undefined when there is nothing to send. */
export function commit(sel: Selection): SimInput | undefined {
  const { spec, id } = sel
  if (id === undefined) return { placeWall: spec }
  if (!sel.movable) return undefined
  return { moveStructure: spec.kind === 'wall' ? { player: spec.owner, id, a: spec.a, b: spec.b } : { player: spec.owner, id, at: spec.at } }
}

/** The Defence item of a selection the sim does not hold yet (being drawn, or unplaced and red); none for a placed structure. */
export const placingOf = (sel?: Selection): Item | undefined => (!sel || sel.id !== undefined ? undefined : sel.spec.kind === 'wall' ? 'wall' : sel.spec.power)

/** The structure the sim now holds in place of a landed selection, selected as it stands. */
export function landedAs(s: SimState, sel: Selection): Selection | undefined {
  const o = s.objects.find((o) => (sel.id === undefined ? s.built.includes(o.id) : o.id === sel.id) && sameSpec(o, sel.spec))
  return o && { spec: sel.spec, id: o.id, movable: true }
}

/** One Defence piece in the piece column: `disabled` greys it (no Credits, or no stock in Siege; Cannon is not built yet, `soon`), `pressed` marks the armed one. */
export type ItemSpec = { item: Item | 'cannon'; label: string; /** The short name on its dock tile. */ name: string; /** The tile's corner badge: the price in Credits (a wall's per unit), or what is left of a Siege tower's stock. */ badge?: string; disabled: boolean; pressed: boolean; soon?: boolean }

/** The builder's own balance, shown beside the priced items: Credits in Rounds, wall points in Siege. */
export type Balance = { amount: number; unit: string }

/** What the Defence circle shows (nothing when no build turn is running): the viewer's balance on their own spending build turn, whether the viewer is building, the pieces to offer, whether they can build now (else the circle is greyed), and the controls of the selected structure. */
export type DefenceCircle = { balance?: Balance; building: boolean; item?: Item; items: ItemSpec[]; available: boolean; selection?: { buttons: ButtonSpec[] } }

export type BuildActions = { toggle(): void; arm(item: Item): void; cancel(): void; rotate(): void; remove(): void }

/** Whether the menu item for `item` is greyed out: no Credits for a unit of wall or for the tower's price (Siege: no stock of the tower). */
export const itemDisabled = (s: SimState, b: PlayerId, item: Item): boolean => (item === 'wall' ? s.credits[b] < oneUnitCost() : !canAffordTower(s, b, item))

const oneUnitCost = () => wallCost({ a: { x: 0, y: 0 }, b: { x: rules.wall.unit * Math.min(...rules.wall.units), y: 0 } })

const POWER_NAME: Record<TowerPower, string> = { repulsor: 'Repulsor', steal: 'Steal' }

/** A tower's pill: `Repulsor · 3` with its price in Rounds, the bare name in Siege (stock, no price). */
const towerLabel = (s: SimState, power: TowerPower): string => (modeFor(s.match).paysTowers(s.match) ? `${POWER_NAME[power]} · ${rules.towerCost[power]}` : POWER_NAME[power])

export function defenceCircle(s: SimState, viewer: PlayerId, v: { /** The armed item; undefined outside build mode. */ item?: Item; selection?: Selection; /** A blocking hold or the map is up. */ blocked?: boolean; /** Whether this device plays a seat (hot-seat: every seat). */ mine(p: PlayerId): boolean }, a: Pick<BuildActions, 'cancel' | 'rotate' | 'remove'>): DefenceCircle | undefined {
  if (!s.match.builder) return undefined
  const builds = s.match.builder === viewer && v.mine(viewer)
  // A turn that may only move pieces (Rearrange) has no placing and no demolish.
  const edit = canEdit(s)
  const spending = builds && edit
  const sel = builds && !v.blocked ? v.selection : undefined
  // The price on the item is one unit's; a longer wall is drawn and costed live.
  const piece = (item: Item, label: string, name: string, badge: string): ItemSpec => ({ item, label, name, badge, disabled: itemDisabled(s, viewer, item), pressed: v.item === item })
  const pays = modeFor(s.match).paysTowers(s.match)
  const towerBadge = (power: TowerPower) => (pays ? String(rules.towerCost[power]) : `×${s.players[viewer].inventory[power]}`)
  return {
    ...(spending && { balance: { amount: s.credits[viewer], unit: UNITS[s.match.mode].long } }),
    building: v.item !== undefined,
    ...(v.item && { item: v.item }),
    items: [
      piece('wall', `Wall · ${rules.wall.unitCost}/unit`, 'Wall', String(rules.wall.unitCost)),
      ...(Object.keys(POWER_NAME) as TowerPower[]).map((power) => piece(power, towerLabel(s, power), POWER_NAME[power], towerBadge(power))),
      { item: 'cannon', label: 'Cannon', name: 'Cannon', disabled: true, pressed: false, soon: true },
    ],
    available: spending && !v.blocked,
    ...(sel && {
      selection: {
        buttons: [
          ...(sel.id !== undefined && edit ? [{ label: '🗑', disabled: !sel.movable && s.credits[viewer] < rules.demolishCost, onClick: a.remove }] : []),
          ...(sel.movable && sel.spec.kind === 'wall' ? [{ label: '↻', onClick: a.rotate }] : []),
          { label: '✕', onClick: a.cancel },
        ],
      },
    }),
  }
}
