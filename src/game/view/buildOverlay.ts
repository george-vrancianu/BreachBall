import type { Point } from '../../sim/pitch'
import { playCost, type SimState } from '../../sim/step'
import { structureCost, type StructureSpec, type TowerSpec, type WallSpec } from '../../sim/wall'
import { legal, type Selection } from './defenceCircle'

/** A translucent piece drawn over the pitch: its spec, and the sim id it stands in for when it is a placed structure (so a damaged wall keeps its Wall segments, Gaps and cracks while it moves). */
export type OverlayPiece = { readonly spec: StructureSpec; readonly id?: number }

/** What every build piece carries: it fails the full legality check (the Credit balance too), which the piece's own geometry check cannot see, so it is drawn red. */
type Blocked = { readonly blocked: boolean }

/**
 * The build piece the builder is dragging, with what is drawn on it. The type keeps `handles` and `cost` on a Wall's branch only: a tower
 * piece cannot carry either, and neither can exist without a build piece. That the piece is a movable selection and that `cost` sits only
 * on a new Wall (no `id`) is `buildOverlay`'s guarantee, not the type's.
 */
export type OverlayBuildPiece =
  | (Blocked & {
      readonly spec: WallSpec
      readonly id?: number
      /** The Wall's two ends, which a finger or the mouse grabs to swing and resize it. */
      readonly handles: { readonly a: Point; readonly b: Point }
      /** The Credit cost read beside a new Wall's midpoint, at the in-play price (`rules.playBuild`) for an In-play build; none for a placed Wall. */
      readonly cost?: number
    })
  | (Blocked & { readonly spec: TowerSpec; readonly id?: number; readonly handles?: never; readonly cost?: never })

/**
 * The Build overlay: everything the renderer draws over the pitch for the builder's own in-progress editing, as one plain, read-only value.
 * `buildOverlay` guarantees that `hidden` is exactly the ids the build piece and the landing piece stand in for (so a placed structure is
 * never drawn twice), that `selected` is set only when there is no build piece, and that with the Map view open nothing is shown at all.
 */
export type BuildOverlay = {
  /** The piece being dragged: a movable selection (a new piece, or one placed this build turn). */
  readonly piece?: OverlayBuildPiece
  /** A placed piece on its way to the sim, drawn until the sim holds it. */
  readonly landing?: OverlayPiece
  /** Sim ids stood in for by `piece` or `landing`: their own fixtures are not drawn. */
  readonly hidden: readonly number[]
  /** An older structure picked only to demolish it: marked, never dragged. */
  readonly selected?: number
  /** The ids placed this build turn, outlined as movable; none in play (an In-play build is final) or with the Map view open. */
  readonly movable: readonly number[]
}

/** Nothing to draw: no build turn, no selection, or a new match. Shared by every holder, so its type is read-only throughout (nothing freezes it at runtime). */
export const noOverlay: BuildOverlay = { hidden: [], movable: [] }

/**
 * The Build overlay for this frame, from the sim state, the builder's `selection` and `landing` (as `InputController` holds them) and
 * whether the Map view is open. A movable selection becomes the build piece; an older one is only `selected`. Pure: same inputs, same value.
 */
export function buildOverlay(s: SimState, v: { selection?: Selection; landing?: Selection; mapOpen: boolean }): BuildOverlay {
  if (v.mapOpen) return noOverlay
  const sel = v.selection
  const piece = sel?.movable ? pieceOf(s, sel) : undefined
  const landing = v.landing && { spec: v.landing.spec, id: v.landing.id }
  return {
    piece,
    landing,
    hidden: [piece?.id, landing?.id].filter((id) => id !== undefined),
    selected: sel && !sel.movable ? sel.id : undefined,
    movable: s.match.builder ? s.built : [],
  }
}

/** The build piece of a movable selection: grab handles on a wall, the live Credit cost on a new wall (in-play prices when no build turn is running). */
function pieceOf(s: SimState, sel: Selection): OverlayBuildPiece {
  const { spec, id } = sel
  const blocked = !legal(s, sel)
  if (spec.kind === 'tower') return { spec, id, blocked }
  return { spec, id, blocked, handles: { a: spec.a, b: spec.b }, ...(id === undefined && { cost: s.match.builder ? structureCost(spec) : playCost(spec) }) }
}
