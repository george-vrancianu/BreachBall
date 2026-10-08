import type { Point } from '../../sim/pitch'
import { playCost, type SimState } from '../../sim/step'
import { structureCost, type StructureSpec } from '../../sim/wall'
import { legal, type Selection } from './defenceCircle'

/** A translucent piece drawn over the pitch: its spec, and the sim id it stands in for when it is a placed structure (so a damaged wall keeps its Wall segments, Gaps and cracks while it moves). */
export type OverlayPiece = { spec: StructureSpec; id?: number }

/**
 * The build piece the builder is dragging, with what is drawn on it. It exists only for a movable selection, so `handles` and `cost` can
 * only ever sit on a piece the builder may move: `handles` on a wall's two ends, `cost` on a new wall the sim does not hold yet.
 */
export type OverlayBuildPiece = OverlayPiece & {
  /** It fails the full legality check (the Credit balance too), which the piece's own geometry check cannot see: drawn red. */
  blocked: boolean
  /** The wall's two ends, which a finger or the mouse grabs to swing and resize it; none for a tower. */
  handles?: { a: Point; b: Point }
  /** The Credit cost read beside a new wall's midpoint, at the in-play price (`rules.playBuild`) for an In-play build. None for a placed wall or a tower (towers spend stock, or carry their price on the Dock). */
  cost?: number
}

/**
 * The Build overlay: everything the renderer draws over the pitch for the builder's own in-progress editing, as one plain value.
 * Its invariants hold by construction: `hidden` is exactly the ids the build piece and the landing piece stand in for (so a placed
 * structure is never drawn twice), `selected` is never one of them, and with the Map view open nothing is shown at all.
 */
export type BuildOverlay = {
  /** The piece being dragged: a movable selection (a new piece, or one placed this build turn). */
  piece?: OverlayBuildPiece
  /** A placed piece on its way to the sim, drawn until the sim holds it. */
  landing?: OverlayPiece
  /** Sim ids stood in for by `piece` or `landing`: their own fixtures are not drawn. */
  hidden: readonly number[]
  /** An older structure picked only to demolish it: marked, never dragged. */
  selected?: number
  /** The ids placed this build turn, outlined as movable; none in play (an In-play build is final) or with the Map view open. */
  movable: readonly number[]
}

/** Nothing to draw: no build turn, no selection, or a new match. */
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
  const fresh = id === undefined && spec.kind === 'wall'
  return {
    spec,
    id,
    blocked: !legal(s, sel),
    ...(spec.kind === 'wall' && { handles: { a: spec.a, b: spec.b } }),
    ...(fresh && { cost: s.match.builder ? structureCost(spec) : playCost(spec) }),
  }
}
