/**
 * Settings that belong to this device, not the match: kept in localStorage, never sent to a peer or read by the sim (lockstep).
 * Lives beside Game, not in the pure `view/`, because it touches browser storage.
 */

const KEY = 'breachball.tabletop'
/** Tabletop mode's predecessor, Flip on turn. Read once to migrate, then deleted. */
const OLD_KEY = 'breachball.flipOnTurn'

/**
 * Tabletop mode: whether a hot-seat handover turns only the HUD (on) or the whole stage, pitch included (off). On for a fresh device, and when storage is unavailable or holds anything else.
 * A device that still holds the old Flip on turn key is migrated first: `true` keeps its screen flip (Tabletop off), anything else is on; the new key is written and the old one removed.
 */
export function loadTabletop(): boolean {
  try {
    if (localStorage.getItem(KEY) === null) {
      const old = localStorage.getItem(OLD_KEY)
      if (old !== null) {
        localStorage.setItem(KEY, String(old !== 'true'))
        localStorage.removeItem(OLD_KEY)
      }
    }
    return localStorage.getItem(KEY) !== 'false'
  } catch {
    return true
  }
}

/** Remember Tabletop mode on this device. Silently session-only when storage is blocked. */
export function saveTabletop(on: boolean): void {
  try {
    localStorage.setItem(KEY, String(on))
  } catch {
    // Storage may be blocked (private mode); the setting then lasts the session only.
  }
}
