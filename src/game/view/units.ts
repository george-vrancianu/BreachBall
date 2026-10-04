import type { Match } from '../../sim/match'

/** What the builder's balance is called in each mode, an exhaustive record a new mode must also edit: `menu` beside a number (Side menu), `chip` on the balance chip and the Strategy cards (upper case). Rounds banks Credits (ADR-0004), Siege keeps Wall points. It lives in `game/view` so view strings stay out of the sim; the HUD model and the Side menu read it, and `src/ui` does not import it: the chip form reaches it through `HudModel.balance.unit`, and the menu form through the Side menu rows' pre-formatted text. */
export const UNITS: Record<Match['mode'], { menu: string; chip: string }> = {
  rounds: { menu: 'credits', chip: 'CR' },
  siege: { menu: 'pts', chip: 'PTS' },
}
