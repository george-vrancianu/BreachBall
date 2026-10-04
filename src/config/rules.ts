const cellSize = 2

const base = {
  pitchWidth: 40,
  pitchHeight: 108,
  cellSize,
  goalWidth: 10,
  noBuildRadius: 15,
  /** Board and net thickness around the pitch. */
  board: 1,
  netDepth: 3,
  wallHp: 3,
  towerHp: 3,
  /** A Steal tower is fragile. */
  stealHp: 1,
  /** Credits a tower costs; it spends inventory instead. */
  towerCost: 0,
  /**
   * Walls are drawn segments. `unit` is one unit's length in world units, end to end at any angle (4 cells);
   * `units` are the allowed lengths in units; `angles` the allowed directions in degrees (direction is modulo 180);
   * `unitCost` the Credits per unit, the same at any angle.
   */
  wall: { unit: 4 * cellSize, units: [1, 2], angles: [0, 45, 90, 135], unitCost: 2, shapeTol: 0.01 } as WallRules['wall'],
  /** Radius of the no-build circle around the centre spot, in world units (3 cells). */
  centreZoneRadius: 3 * cellSize,
  /** Half the drawn wall thickness; the ball cannot be placed on it. */
  wallHalf: 0.35,
  /** Credits it costs to demolish a piece placed in an earlier turn. */
  demolishCost: 1,
  /** Credits an armed Breaker shot costs when it fires (Rounds); Siege has no Credits economy and spends the stock instead. */
  breakerCost: 2,
  startInventory: 3,
  /** Credits a Jam costs (Subterfuge). */
  jamCost: 2,
  /** Where a timed-out blind opening build drops its 1-unit horizontal wall for P1: `gap` is the distance in world units from the goal no-build zone to its line; P2's mirrors across the halfway line. */
  fallbackPiece: { gap: 1 },
  /** Splash radius is `radiusBase * ballRadius * (1 + radiusGrowth * power)`; pressure above `heavy` / `light` costs more hp. */
  splash: { radiusBase: 2, radiusGrowth: 4, heavy: 0.8, light: 0.4 },
} as const

/** The Shot tiers, by name; each needs a colour in `visual.aim.tierColors`. */
export type TierName = 'Touch' | 'Power'

/** A Shot tier. The sim reads only `power` and `splash`; the rest drives the aim gesture and the Ghost. */
export type Tier = {
  name: TierName
  /** Hold still on the ball this long to reach the tier. */
  holdMs: number
  /** Control radius around the ball, in screen pixels. */
  radiusPx: number
  /** `direct`: a longer drag is stronger; `inverted`: a shorter one is. */
  curve: 'direct' | 'inverted'
  /** Final power range, 0-1 of maxSpeed. */
  power: readonly [number, number]
  /** How far the Ghost reaches, and the share of that path drawn. */
  ghost: { until: { contacts: number } | 'rest'; scale: number }
  /** Fires a Splash at the ball's launch position. */
  splash: boolean
}

/** Tiers are data: a new tier is a new entry. Indexed by the Shot's `tier`. */
const tiers: readonly Tier[] = [
  { name: 'Touch', holdMs: 0, radiusPx: 220, curve: 'direct', power: [0.15, 0.45], ghost: { until: { contacts: 1 }, scale: 1 }, splash: false },
  { name: 'Power', holdMs: 1000, radiusPx: 90, curve: 'inverted', power: [0.5, 1], ghost: { until: { contacts: 1 }, scale: 0.3 }, splash: true },
]

const mapTop = -base.board - base.netDepth
const mapHeight = base.pitchHeight + 2 * (base.board + base.netDepth)

/** The wall settings the geometry helpers read; `rules` by default, so tests and tools can pass their own. */
export type WallRules = { /** Half a wall's thickness, world units. */ wallHalf: number; wall: { unit: number; units: readonly number[]; angles: readonly number[]; unitCost: number; shapeTol: number } }

/** Every rule and geometry value; derived values are computed from the base. */
export const rules = {
  ...base,
  halfHeight: base.pitchHeight / 2,
  /** Grid rows (vertices) from goal line to goal line. */
  gridRows: base.pitchHeight / base.cellSize,
  /** Grid columns (vertices) across the pitch. */
  gridCols: base.pitchWidth / base.cellSize,
  /** The middle of each player's half, where their ball goes and the build view starts. */
  halfCentre: { 1: (3 * base.pitchHeight) / 4, 2: base.pitchHeight / 4 } as Record<1 | 2, number>,
  goalLeft: (base.pitchWidth - base.goalWidth) / 2,
  goalRight: (base.pitchWidth + base.goalWidth) / 2,
  /** World y range of everything drawn: boards and nets included, and its centre. */
  mapTop,
  mapHeight,
  mapY: mapTop + mapHeight / 2,
  shot: { tiers },
} as const
