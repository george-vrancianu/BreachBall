/** Settings that belong to this device, not the match: kept in localStorage, never sent to a peer or read by the sim (lockstep). */
const FLIP_KEY = 'breachball.flipOnTurn'

/** Flip on turn: whether the hot-seat stage turns 180 degrees at each handover. Off on a fresh device, and when storage is unavailable or holds anything else. */
export function loadFlipOnTurn(): boolean {
  try {
    return localStorage.getItem(FLIP_KEY) === 'true'
  } catch {
    return false
  }
}

export function saveFlipOnTurn(on: boolean): void {
  try {
    localStorage.setItem(FLIP_KEY, String(on))
  } catch {
    // Storage may be blocked (private mode); the setting then lasts the session only.
  }
}
