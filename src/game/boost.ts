import { visual } from '../config/visual'
import { rules } from '../config/rules'
import { centreSpot, type BoostZone, type Point } from '../sim/pitch'
import { textRect, type Rect } from './layout'

/** The "×1.5" / "×2" text for a Charged `factor`. */
export const boostLabel = (factor: number): string => `×${factor}`

/** The colour of a Boost `zone`. */
export const boostColor = (zone: BoostZone): string => visual.pitch.boost.colors[zone]

/** A zone's label: its text, centre, font size (world units) and box. */
export type ZoneLabel = { zone: BoostZone; text: string; at: Point; size: number; rect: Rect }

/** The Boost zones, outer first so the Bullseye draws over the ring. */
export const boostZones: BoostZone[] = ['ring', 'bullseye']

/** The zones' labels, below the centre spot each inside its own zone. */
export function zoneLabels(): ZoneLabel[] {
  const { label } = visual.pitch.boost
  const c = centreSpot()
  return boostZones.map((zone) => {
    const { radius, factor } = rules.boost[zone]
    const text = boostLabel(factor)
    const at = { x: c.x, y: c.y + radius * label[`${zone}At`] }
    const size = label.px * visual.pitch.unit
    return { zone, text, at, size, rect: textRect(at, text, size, visual.text.glyphEm) }
  })
}
