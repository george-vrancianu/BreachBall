import type { Match } from '../../sim/match'

/** What the builder's balance is called in each mode, an exhaustive record a new mode must also edit: `short` beside a number (Side menu), `chip` on the balance chip and the Strategy cards (upper case). Rounds banks Credits (ADR-0004), Siege keeps Wall points. It lives in `game/view` so the HUD model, the Side menu and the build model share it without `src/ui` reaching into `src/sim`. */
export const UNITS: Record<Match['mode'], { short: string; chip: string }> = {
  rounds: { short: 'credits', chip: 'CR' },
  siege: { short: 'pts', chip: 'PTS' },
}
