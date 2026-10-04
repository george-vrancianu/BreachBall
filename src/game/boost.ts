import { rules } from '../config/rules'
import { visual } from '../config/visual'
import type { BoostZone } from '../sim/pitch'

/** The "×1.5" / "×2" text for a Charged `factor`. */
export const boostLabel = (factor: number): string => `×${factor}`

/** The colour of a Boost `zone`. */
export const boostColor = (zone: BoostZone): string => visual.pitch.boost.colors[zone]

/** The factor a Boost `zone` Charges the ball by. */
export const boostFactor = (zone: BoostZone): number => rules.boost[zone].factor
