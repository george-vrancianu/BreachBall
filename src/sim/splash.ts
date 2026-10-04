import { rules } from '../config/rules'
import type { PlayerId, Point } from './pitch'
import { nearestOnWall } from './near'
import type { SimConfig } from './step'
import { nearestOnSegment, standingPieces, type Structure } from './wall'

/** The Splash power (0-1) a shot sets off: its power rescaled within its tier's range. Null for a tier that does not splash. */
export function splashPower(tier: number, power: number): number | null {
  const t = rules.shot.tiers[tier]
  if (!t?.splash) return null
  const [min, max] = t.power
  return max > min ? Math.min(1, Math.max(0, (power - min) / (max - min))) : 1
}

export const splashRadius = (power: number, c: SimConfig): number => rules.splash.radiusBase * c.ballRadius * (1 + rules.splash.radiusGrowth * power)

/** A Splash: its power (0-1) and radius in world units. */
export type Splash = { power: number; radius: number }

/** The Splash a shot of this tier and power sets off; null for a tier that does not splash. */
export function splashOf(tier: number, power: number, c: SimConfig): Splash | null {
  const p = splashPower(tier, power)
  return p === null ? null : { power: p, radius: splashRadius(p, c) }
}

/** Every structure piece within the Splash radius, with the health it loses (possibly 0) and its nearest point to the origin: one entry per standing wall segment (`segment` set), one per tower. The halfway line is not considered. */
export function splashDamage(objects: Structure[], origin: Point, { power, radius: r }: Splash, player: PlayerId): { wall: Structure; segment?: number; loss: number; at: Point }[] {
  /** The pieces judged separately: a tower is one, a placed wall one per standing segment (a bare spec, its whole length). */
  const pieces = (w: Structure) => (w.kind === 'tower' ? [{ index: undefined, ...nearestOnWall(w, origin) }] : standingPieces(w).map(({ index, seg }) => { const at = nearestOnSegment(seg, origin); return { index, at, dist: Math.hypot(at.x - origin.x, at.y - origin.y) } }))
  return objects.flatMap((wall) =>
    pieces(wall).flatMap(({ index, at, dist }) => {
      if (dist >= r) return []
      const pressure = power * (1 - dist / r)
      const loss = wall.owner === player ? (pressure > rules.splash.heavy ? 1 : 0) : pressure > rules.splash.heavy ? 2 : pressure > rules.splash.light ? 1 : 0
      return [{ wall, ...(index !== undefined && { segment: index }), loss, at }]
    }),
  )
}
