import { visual } from '../../config/visual'
import { rules } from '../../config/rules'
import { nearestOnWall } from '../../sim/near'
import { type PlayerId, type Point } from '../../sim/pitch'
import { canEdit, type SimInput, type SimState } from '../../sim/step'
import { isLegal, rotatedWall, structureCost, translatedWall, vertexToWorld, wallCost, type StructureSpec, type TowerPower } from '../../sim/wall'
import type { ButtonSpec } from './hudModel'

/**
 * The builder's selection: a new piece (no `id`), or one of their structures (`id`). Only this turn's structures can be
 * dragged; an older one is selected just to demolish it.
 */
export type Selection = { spec: StructureSpec; id?: number; movable: boolean }

/** The Defence item armed for drawing. */
export type Item = 'wall' | TowerPower

/** The start of a wall drawn from `at`: the nearest existing wall end (any owner) within `radius`, copied exactly so chained walls share a vertex; else `at` itself. */
export function snapStart(s: Pick<SimState, 'objects'>, at: Point, radius: number): Point {
  let best: { p: Point; d: number } | undefined
  for (const o of s.objects) {
    if (o.kind !== 'wall') continue
    for (const p of [o.a, o.b]) {
      const d = Math.hypot(p.x - at.x, p.y - at.y)
      if (d <= radius && (!best || d < best.d)) best = { p, d }
    }
  }
  return best ? { x: best.p.x, y: best.p.y } : at
}

/** The tower build piece under `at` (grid-snapped, as a drag holds it). */
export const towerAt = (power: TowerPower, owner: PlayerId, at: Point): StructureSpec => movedTo({ kind: 'tower', owner, power, at: { gx: 0, gy: 0 } }, at)

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

/** Legal where it stands (ignoring itself when moved) and, for a new piece, affordable. */
export function legal(s: SimState, sel: Selection): boolean {
  const others = s.objects.filter((o) => o.id !== sel.id)
  return isLegal(sel.spec, others) && (sel.id !== undefined || s.credits[sel.spec.owner] >= structureCost(sel.spec))
}

/** How far to pan while a piece is held near the top or bottom `edgeBand` of the view: toward any of the builder's half that is off screen, never past it. */
export function edgeScrollDy(camY: number, visibleHeight: number, builder: PlayerId, pointerY: number, dt: number): number {
  const [lo, hi] = builder === 1 ? [rules.halfHeight, rules.pitchHeight] : [0, rules.halfHeight]
  const [top, bottom] = [camY - visibleHeight / 2, camY + visibleHeight / 2]
  const margin = visibleHeight * visual.input.edgeBand
  return pointerY < top + margin && top > lo ? -Math.min(visual.input.edgeScrollSpeed * dt, top - lo) : pointerY > bottom - margin && bottom < hi ? Math.min(visual.input.edgeScrollSpeed * dt, hi - bottom) : 0
}

const near = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6
const sameSpec = (a: StructureSpec, b: StructureSpec) =>
  a.kind === b.kind && a.owner === b.owner && (a.kind === 'tower' ? (b as typeof a).power === a.power && a.at.gx === (b as typeof a).at.gx && a.at.gy === (b as typeof a).at.gy : near(a.a, (b as typeof a).a) && near(a.b, (b as typeof a).b))

/** A confirmed selection has reached the sim: the new piece stands among this turn's, or the moved one stands where it was put. */
export const landed = (s: SimState, sel: Selection): boolean =>
  s.objects.some((o) => (sel.id === undefined ? s.built.includes(o.id) : o.id === sel.id) && sameSpec(o, sel.spec))

/** The sim input a lift sends: place a new piece or move a structure. Undefined when there is nothing to send. */
export function commit(sel: Selection): SimInput | undefined {
  const { spec, id } = sel
  if (id === undefined) return { placeWall: spec }
  if (!sel.movable) return undefined
  return { moveStructure: spec.kind === 'wall' ? { player: spec.owner, id, a: spec.a, b: spec.b } : { player: spec.owner, id, at: spec.at } }
}

/** The structure the sim now holds in place of a landed selection, selected as it stands. */
export function landedAs(s: SimState, sel: Selection): Selection | undefined {
  const o = s.objects.find((o) => (sel.id === undefined ? s.built.includes(o.id) : o.id === sel.id) && sameSpec(o, sel.spec))
  return o && { spec: sel.spec, id: o.id, movable: true }
}

/** What the build menu shows: the closed or open icon, or the selection's controls. */
export type BuildMenu = { kind: 'menu'; open: boolean; /** The armed item while building. */ item?: Item; items: ButtonSpec[] } | { kind: 'selected'; buttons: ButtonSpec[] }

export type BuildActions = { toggle(): void; arm(item: Item): void; cancel(): void; rotate(): void; remove(): void }

const POWER_LABEL: Record<TowerPower, string> = { repulsor: 'Repulsor', steal: 'Steal' }

export function buildMenu(s: SimState, b: PlayerId, v: { /** The armed item; undefined outside build mode. */ item?: Item; selection?: Selection }, a: BuildActions): BuildMenu | undefined {
  const sel = v.selection
  // A turn that may only move pieces (Rearrange) has no palette and no demolish.
  const edit = canEdit(s)
  if (!sel && !edit) return undefined
  if (!sel) {
    const credits = s.credits[b]
    // The price on the item is one unit's; a longer wall is drawn and costed live.
    const oneUnit = wallCost({ a: { x: 0, y: 0 }, b: { x: rules.wall.unit * Math.min(...rules.wall.units), y: 0 } })
    return {
      kind: 'menu',
      open: v.item !== undefined,
      item: v.item,
      items: [
        { label: `Wall · ${rules.wall.unitCost}/unit`, disabled: credits < oneUnit, pressed: v.item === 'wall', onClick: () => a.arm('wall') },
        ...(Object.keys(POWER_LABEL) as TowerPower[]).map((power) => ({ label: `${POWER_LABEL[power]} ×${s.players[b].inventory[power]}`, disabled: s.players[b].inventory[power] < 1, pressed: v.item === power, onClick: () => a.arm(power) })),
      ],
    }
  }
  return {
    kind: 'selected',
    buttons: [
      ...(sel.id !== undefined && edit ? [{ label: '🗑', disabled: !sel.movable && s.credits[b] < rules.demolishCost, onClick: a.remove }] : []),
      ...(sel.movable && sel.spec.kind === 'wall' ? [{ label: '↻', onClick: a.rotate }] : []),
      { label: '✕', onClick: a.cancel },
    ],
  }
}
