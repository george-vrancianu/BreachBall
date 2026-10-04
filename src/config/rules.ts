const cellSize = 2
const centreZoneRadius = 3 * cellSize

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
  /** Credits each tower costs in Rounds (Siege draws them from its stock instead). */
  towerCost: { repulsor: 5, steal: 4 },
  /**
   * Walls are drawn segments. `unit` is one unit's length in world units, end to end at any angle (4 cells);
   * `units` are the allowed lengths in units; `angles` the allowed directions in degrees (direction is modulo 180);
   * `unitCost` the Credits per unit, the same at any angle.
   */
  wall: { unit: 4 * cellSize, units: [1, 2], angles: [0, 45, 90, 135], unitCost: 1, shapeTol: 0.01 } as WallRules['wall'],
  /** Radius of the no-build circle around the centre spot, in world units (3 cells). */
  centreZoneRadius,
  /** The Boost ring (same radius as the Centre zone) and the Bullseye, both centred on the centre spot: a shot that comes to rest with the ball's centre inside Charges it, the Bullseye winning, and the next shot's speed is multiplied by `factor`. */
  boost: { ring: { radius: centreZoneRadius, factor: 1.5 }, bullseye: { radius: 2, factor: 2 } },
  /** Credits the shooter earns in Rounds when the ball enters the Bullseye from outside during a shot, once per shot (Siege has no Credits economy). */
  bullseyeCredits: 2,
  /** Distance in world units from a goal line to the Kick-off spot of the kicker defending it (inside their keep-out arc, so no wall can block the ball). */
  kickoffGap: 5,
  /** Half the drawn wall thickness; the ball cannot be placed on it. */
  wallHalf: 0.35,
  /**
   * An in-play build: in Rounds the shooter may place pieces in play before the round's first shot, at a premium over the build turn's prices.
   * Such a piece is final: it is never in `built`, so it cannot be moved or demolished.
   */
  playBuild: { wallUnitCost: 2, towerCost: { repulsor: 6, steal: 5 } },
  /** Credits it costs to demolish a piece placed in an earlier turn. */
  demolishCost: 1,
  /** Credits an armed Breaker shot costs when it fires (Rounds); Siege has no Credits economy and spends the stock instead. */
  breakerCost: 2,
  startInventory: 3,
  /** Credits a Jam costs (Subterfuge). */
  jamCost: 2,
  /** Where a timed-out blind opening build drops its 1-unit horizontal wall for P1: `gap` is the distance in world units from the goal no-build zone to its line; P2's mirrors across the halfway line. */
  fallbackPiece: { gap: 1 },
  /**
   * A Pallet (ADR-0009). `ringRadius` is its Activation ring and `length` the arm's reach from the pivot, in world units; the arm tapers from `rootRadius` to `tipRadius`.
   * `swingSpeed` and `aimRate` (the fast re-aim while tracking) and `idleSpin` are rad/s; `swingArc` is the swing's width in degrees.
   * `restitution` is the bounce off the arm; `cooldownTicks` is the pause after a swing; `substeps` splits a tick near a Pallet.
   * `sweetSpot` is where on the reach (a fraction) it plans to meet the ball; `trackSlack` is how far past the ring (world units) it keeps tracking.
   * `hitSpeed` is the relative normal speed (units/s, arm included) above which a contact is a swat (the prototype's 120 px/s at a 9 px ball, scaled to a 1-unit ball); slower is a plain bounce.
   * A swat's exit speed is clamped to `exitSpeed` times maxSpeed.
   * `ringRadius >= length + tipRadius + 2 * ballRadius` must hold: the ring is the no-build zone, so a ball pinned between the arm and a wall at its edge must not crush it.
   */
  pallet: { ringRadius: 5, length: 2.5, rootRadius: 0.5, tipRadius: 0.25, swingSpeed: 18, swingArc: 140, idleSpin: 0.8, aimRate: 30, restitution: 0.85, cooldownTicks: 7, substeps: 10, sweetSpot: 0.72, trackSlack: 1, hitSpeed: 13, exitSpeed: [1, 2] },
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
  /**
   * How far the Ghost reaches: it stops at `maxBounces` hits on a structure or board (those under the Comet count too), or
   * after `reach` world units of path past the Comet's tip, whichever comes first. `reach` runs from `min` for the tier's weakest shot to `max` for its strongest, by where the
   * power sits in `power`. A Charged ball's reach is the same.
   */
  ghost: { maxBounces: number; reach: readonly [min: number, max: number] }
  /** Fires a Splash at the ball's launch position. */
  splash: boolean
}

/** Tiers are data: a new tier is a new entry. Indexed by the Shot's `tier`. */
const tiers: readonly Tier[] = [
  { name: 'Touch', holdMs: 0, radiusPx: 150, curve: 'direct', power: [0.15, 0.45], ghost: { maxBounces: 3, reach: [25, 60] }, splash: false },
  { name: 'Power', holdMs: 1000, radiusPx: 84, curve: 'inverted', power: [0.5, 1], ghost: { maxBounces: 1, reach: [8, 20] }, splash: true },
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
