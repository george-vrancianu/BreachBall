import type { Match } from '../../sim/match'

/** What the builder's balance is called in each mode, an exhaustive record a new mode must also edit: `menu` beside a number (Side menu), `chip` on the balance chip and the Strategy cards (upper case). Rounds banks Credits (ADR-0004), Siege keeps Wall points. It lives in `game/view` so the HUD model, the Side menu and the build model reach it without importing `src/sim`; `src/ui` does not import it, it gets the unit through `HudModel.balance.unit`. */
export const UNITS: Record<Match['mode'], { menu: string; chip: string }> = {
  rounds: { menu: 'credits', chip: 'CR' },
  siege: { menu: 'pts', chip: 'PTS' },
}
