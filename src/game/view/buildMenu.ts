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

export type Piece = 'wall' | TowerPower

/** Grid rows (vertices) a piece anchored on `owner`'s half may use. */
const rows = (owner: PlayerId) => (owner === 1 ? [rules.gridRows / 2, rules.gridRows - 1] : [0, rules.gridRows / 2 - 1])

/** A new piece at the vertex nearest the view centre, clamped to the owner's half; a wall starts as one horizontal unit running right from there. */
export function spawn(piece: Piece, owner: PlayerId, viewY: number): Selection {
  const [lo, hi] = rows(owner)
  const at = { gx: rules.gridCols / 2, gy: Math.min(Math.max(Math.round(viewY / rules.cellSize), lo), hi) }
  const a = vertexToWorld(at)
  const spec: StructureSpec = piece === 'wall' ? { kind: 'wall', owner, a, b: { x: a.x + rules.wall.unit, y: a.y } } : { kind: 'tower', owner, power: piece, at }
  return { spec, movable: true }
}

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

/** The sim input ✓ sends: place a new piece or move a structure. Undefined when there is nothing to send. */
export function commit(sel: Selection): SimInput | undefined {
  const { spec, id } = sel
  if (id === undefined) return { placeWall: spec }
  if (!sel.movable) return undefined
  return { moveStructure: spec.kind === 'wall' ? { player: spec.owner, id, a: spec.a, b: spec.b } : { player: spec.owner, id, at: spec.at } }
}

/** What the build menu shows: the closed or open icon, or the selection's controls. */
export type BuildMenu = { kind: 'menu'; open: boolean; items: ButtonSpec[] } | { kind: 'selected'; buttons: ButtonSpec[] }

export type BuildActions = { toggle(): void; spawn(p: Piece): void; confirm(): void; cancel(): void; rotate(): void; remove(): void }

const POWER_LABEL: Record<TowerPower, string> = { repulsor: 'Repulsor', steal: 'Steal' }

export function buildMenu(s: SimState, b: PlayerId, v: { open: boolean; selection?: Selection; /** A confirmed piece is still on its way to the sim. */ landing?: boolean }, a: BuildActions): BuildMenu | undefined {
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
      open: v.open,
      items: [
        { label: `Wall · ${rules.wall.unitCost}/unit`, disabled: credits < oneUnit, onClick: () => a.spawn('wall') },
        ...(Object.keys(POWER_LABEL) as TowerPower[]).map((power) => ({ label: `${POWER_LABEL[power]} ×${s.players[b].inventory[power]}`, disabled: s.players[b].inventory[power] < 1, onClick: () => a.spawn(power) })),
      ],
    }
  }
  return {
    kind: 'selected',
    buttons: [
      ...(sel.id !== undefined && edit ? [{ label: '🗑', disabled: !sel.movable && s.credits[b] < rules.demolishCost, onClick: a.remove }] : []),
      ...(sel.movable && sel.spec.kind === 'wall' ? [{ label: '↻', onClick: a.rotate }] : []),
      { label: '✕', onClick: a.cancel },
      ...(sel.movable ? [{ label: '✓', disabled: !!v.landing || !legal(s, sel), onClick: a.confirm }] : []),
    ],
  }
}
