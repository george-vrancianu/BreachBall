import { visual } from '../../config/visual'
import { rules } from '../../config/rules'
import { modeFor } from '../../sim/mode'
import { nearestOnWall } from '../../sim/near'
import type { PalletSpot } from '../../sim/pallet'
import { halfSpan, type PlayerId, type Point } from '../../sim/pitch'
import { canAffordTower, canEdit, canMove, canPlayBuild, placeable, type SimInput, type SimState } from '../../sim/step'
import { distToSegment, rotatedWall, translatedWall, vertexToWorld, wallCost, type WallSpec, type StructureSpec, type TowerPower } from '../../sim/wall'
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
export const onPiece = (spec: StructureSpec, at: Point, tolerance: number) => footprintDist(spec, at) <= tolerance

/** How far `at` is from a piece: a wall's full footprint, from a to b with its Gaps (a Gap is still part of the wall for selecting it), a tower's edges. */
const footprintDist = (o: StructureSpec, at: Point): number => (o.kind === 'wall' ? distToSegment(o, at) : nearestOnWall(o, at).dist)

/** The builder's own structure under `at`, nearest first, selected as it stands. */
export function pick(s: SimState, builder: PlayerId, at: Point, tolerance: number): Selection | undefined {
  const hits = s.objects.filter((o) => o.owner === builder).map((o) => ({ o, d: footprintDist(o, at) })).filter((h) => h.d <= tolerance)
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

/** Legal where it stands (ignoring itself when moved) and affordable: the sim's own `placeable` for a new piece (a build turn's prices, or in-play prices), `canMove` for one of the builder's structures. */
export function legal(s: SimState, sel: Selection, pallets: readonly PalletSpot[]): boolean {
  return sel.id === undefined ? placeable(s, sel.spec, pallets) : canMove(s, sel.id, sel.spec, pallets)
}

/** Who builds now: the build turn's builder, else the shooter while an in-play build is open to them (Rounds, before the round's first shot). */
export const builderNow = (s: SimState): PlayerId | null => s.match.builder ?? (canPlayBuild(s, s.possession.shooter) ? s.possession.shooter : null)

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

/** The structure the sim now holds in place of a landed selection, selected as it stands: movable when it is this build turn's (an in-play build never is). */
export function landedAs(s: SimState, sel: Selection): Selection | undefined {
  // A build turn's new piece joins `built`; an in-play build never does, so in play any standing match is it (an identical older piece would have made it illegal).
  const o = s.objects.find((o) => (sel.id === undefined ? !s.match.builder || s.built.includes(o.id) : o.id === sel.id) && sameSpec(o, sel.spec))
  return o && { spec: sel.spec, id: o.id, movable: sel.id !== undefined || s.built.includes(o.id) }
}

/** One Defence piece in the piece column: `disabled` greys it (no Credits, or no stock in Siege; Cannon is not built yet, `soon`), `pressed` marks the armed one. */
export type ItemSpec = { item: Item | 'cannon'; label: string; /** The short name on its dock tile. */ name: string; /** The tile's corner badge: the price in Credits (a wall's per unit), or what is left of a Siege tower's stock. */ badge?: string; disabled: boolean; pressed: boolean; soon?: boolean }

/** What the build dock shows (nothing when no build turn is running): whether the viewer is building, the pieces to offer, whether they can build now (else the pieces are disabled), and the controls of the selected structure. */
export type DefenceCircle = { building: boolean; item?: Item; items: ItemSpec[]; available: boolean; selection?: { buttons: SelectionButton[] } }

/** What a selection control does: demolish the structure, rotate the wall, or let go of the selection. */
export type SelectionAction = 'demolish' | 'rotate' | 'deselect'

/** One control of the selected structure; the dock draws it by `action`. */
export type SelectionButton = ButtonSpec & { action: SelectionAction }

export type BuildActions = { toggle(): void; arm(item: Item): void; cancel(): void; rotate(): void; remove(): void }

/** Whether the menu item for `item` is greyed out: no Credits for a unit of wall or for the tower's price (Siege: no stock of the tower); in play, at the in-play prices. */
export const itemDisabled = (s: SimState, b: PlayerId, item: Item): boolean => {
  if (!s.match.builder) return s.credits[b] < (item === 'wall' ? rules.playBuild.wallUnitCost : rules.playBuild.towerCost[item])
  return item === 'wall' ? s.credits[b] < oneUnitCost() : !canAffordTower(s, b, item)
}

const oneUnitCost = () => wallCost({ a: { x: 0, y: 0 }, b: { x: rules.wall.unit * Math.min(...rules.wall.units), y: 0 } })

const POWER_NAME: Record<TowerPower, string> = { repulsor: 'Repulsor', steal: 'Steal' }

/** The Build tile in play: offered (with the in-play prices) while the viewer may build in play, else absent. Pieces built in play are final, so there are no selection controls. */
function playBuildCircle(s: SimState, viewer: PlayerId, v: { item?: Item; blocked?: boolean; mine(p: PlayerId): boolean }): DefenceCircle | undefined {
  if (!v.mine(viewer) || !canPlayBuild(s, viewer)) return undefined
  const { wallUnitCost, towerCost } = rules.playBuild
  const piece = (item: Item, price: number, name: string, unit = ''): ItemSpec => ({ item, label: `${name} · ${price}${unit}`, name, badge: String(price), disabled: itemDisabled(s, viewer, item), pressed: v.item === item })
  return {
    building: v.item !== undefined,
    ...(v.item && { item: v.item }),
    items: [piece('wall', wallUnitCost, 'Wall', '/unit'), piece('repulsor', towerCost.repulsor, 'Repulsor'), piece('steal', towerCost.steal, 'Steal'), { item: 'cannon', label: 'Cannon', name: 'Cannon', disabled: true, pressed: false, soon: true }],
    available: !v.blocked,
  }
}

/** A tower's pill: `Repulsor · 5` with its price in Rounds, the bare name in Siege (stock, no price). */
const towerLabel = (s: SimState, power: TowerPower): string => (modeFor(s.match).paysTowers(s.match) ? `${POWER_NAME[power]} · ${rules.towerCost[power]}` : POWER_NAME[power])

export function defenceCircle(s: SimState, viewer: PlayerId, v: { /** The armed item; undefined outside build mode. */ item?: Item; selection?: Selection; /** A blocking hold or the map is up. */ blocked?: boolean; /** Whether this device plays a seat (hot-seat: every seat). */ mine(p: PlayerId): boolean }, a: Pick<BuildActions, 'cancel' | 'rotate' | 'remove'>): DefenceCircle | undefined {
  if (!s.match.builder) return playBuildCircle(s, viewer, v)
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
          ...(sel.id !== undefined && edit ? [{ action: 'demolish' as const, label: 'Demolish', disabled: !sel.movable && s.credits[viewer] < rules.demolishCost, onClick: a.remove }] : []),
          ...(sel.movable && sel.spec.kind === 'wall' ? [{ action: 'rotate' as const, label: 'Rotate', onClick: a.rotate }] : []),
          { action: 'deselect', label: 'Deselect', onClick: a.cancel },
        ],
      },
    }),
  }
}
