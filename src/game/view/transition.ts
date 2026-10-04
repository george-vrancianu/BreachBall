import { visual } from '../../config/visual'
import type { PlayerId, Point } from '../../sim/pitch'
import type { Match } from '../../sim/match'
import type { SimEvent } from '../../sim/step'
import { isFirstRound } from './hudModel'

/** `holds` = the handover waits for this overlay and the sim is paused while it is up (the REPAIRED sweep; the goal, turn and reveal kinds always hold). */
type Overlay = { kind: 'turn' | 'goal' | 'sweep' | 'reveal'; at: number; player: PlayerId; text: string; hint?: string; ms: number; net?: Point; holds?: true }
/** `shown` is whose end of the pitch is at the bottom of the screen; `hudSeat` is whose turn the HUD shows (the same seat when the stage turns, but not when Flip on turn is off and seat 2 plays from across the table); `due` = a handover is waiting (e.g. for the goal hold to end); `opening` = the last frame saw a Siege opening build (the reveal fires when it ends). */
export type Transition = { shown: PlayerId; hudSeat: PlayerId; flip?: { at: number; ms: number; from: PlayerId; to: PlayerId; hudSeat: PlayerId }; overlay?: Overlay; due?: boolean; phase?: string; opening?: boolean }

/** `flip` false (Flip on turn off, the device default): seat 1's end is at the bottom whoever starts. Online passes false too, and `advance` ignores the flip there, so online never flips. */
export const newTransition = (active: PlayerId, flip = false): Transition => ({ shown: flip ? active : 1, hudSeat: active, due: true })

/** The HUD's seat sits across the table from the bottom end (Flip on turn off, seat 2 playing): the HUD and view face the bottom seat's way, not the active player's. */
export const acrossTable = (t: Transition) => t.hudSeat !== t.shown

const rot = (p: PlayerId) => (p === 1 ? 0 : 180)

/** `handover` false = online: each player always sits at the bottom, so no flip or turn card, and `flip` is ignored. `flip` false or missing = hot-seat with Flip on turn off (the device default): the stage never turns, seat 1's end stays at the bottom, and the turn card still names the player. Read at each handover; a flip already under way is not changed. */
export type Frame = { handover?: boolean; flip?: boolean; active: PlayerId; /** Round number for modes that have rounds; the first-play hints show on round 1. */ round?: number; inHand: boolean; phase: string; /** A Siege opening build is in progress (not a Rearrange turn); its end triggers the reveal. */ opening?: boolean; events: SimEvent[]; now: number }

/** Call each tick (with that tick's events) and once per frame. Pure; the sim never waits on it, the shell pauses `step` while `blocking`. */
export function advance(t: Transition, f: Frame): Transition {
  let { shown, hudSeat, flip, overlay, due } = t
  if (flip && f.now >= flip.at + flip.ms) (shown = flip.to), (hudSeat = flip.hudSeat), (flip = undefined)
  if (overlay && overlay.kind !== 'turn' && f.now >= overlay.at + overlay.ms) overlay = undefined
  for (const ev of f.events) {
    if (ev.type === 'goal') overlay = { kind: 'goal', at: f.now, player: ev.scorer, text: 'GOAL', ms: visual.transition.goalMs, net: ev.at }
    if (ev.type === 'round-ended') due = true
    if (ev.type === 'repaired') overlay = { kind: 'sweep', at: f.now, player: ev.player, text: 'REPAIRED', ms: visual.transition.sweepMs, holds: true }
  }
  // The second Done of a Siege opening build lifts the fog into a 1.5 s hold on the whole pitch.
  if (t.opening && !f.opening) (overlay = { kind: 'reveal', at: f.now, player: f.active, text: 'REVEAL', ms: visual.transition.revealMs }), (due = true)
  if (t.phase !== undefined && t.phase !== f.phase && overlay?.kind !== 'goal' && overlay?.kind !== 'reveal') overlay = { kind: 'sweep', at: f.now, player: f.active, text: f.phase.toUpperCase(), ms: visual.transition.sweepMs }
  // The handover waits for the REPAIRED sweep, so the flash and label are seen before the turn flips.
  const repairing = overlay?.kind === 'sweep' && !!overlay.holds
  if (f.handover === false) due = false
  else if ((due || f.active !== hudSeat) && !flip && !repairing && overlay?.kind !== 'goal' && overlay?.kind !== 'reveal' && overlay?.kind !== 'turn') {
    const ms = visual.transition.flipMs
    // With the toggle off the bottom seat is always 1: the stage turns back once if it was left turned.
    const to = f.flip ? f.active : 1
    // Even when `to` is already shown the flip runs (rotating 0 degrees), so the hold and the turn card's fade-in are the same as ever.
    if (ms) flip = { at: f.now, ms, from: shown, to, hudSeat: f.active }
    else (shown = to), (hudSeat = f.active)
    const hint = isFirstRound(f.round) ? (f.phase === 'Build' ? 'Tap the Defence circle, drag on your half to draw a wall, then Done' : f.inHand ? 'Tap to place the ball, then Confirm' : 'Drag back from the ball to shoot; hold first for Power') : undefined
    overlay = { kind: 'turn', at: f.now, player: f.active, text: `Player ${f.active}'s turn`, hint, ms }
    due = false
  }
  // A phase change during the goal hold is announced once the hold ends.
  return { shown, hudSeat, flip, overlay, due, opening: f.opening, phase: overlay?.kind === 'goal' ? t.phase : f.phase }
}

/** The shell stops stepping the sim while a flip, goal, turn, reveal or REPAIRED overlay is up: the conceder's clock and ball are out of reach until the handover is seen. */
export const blocking = (t: Transition) => !!t.flip || t.overlay?.kind === 'goal' || t.overlay?.kind === 'turn' || t.overlay?.kind === 'reveal' || (t.overlay?.kind === 'sweep' && !!t.overlay.holds)

/** The reveal hold is up: the shell shows the whole pitch through the map camera. */
export const revealing = (t: Transition) => t.overlay?.kind === 'reveal'

/** Tap on the turn overlay; ignored in its first second. */
export const dismiss = (t: Transition, now: number): Transition => (t.overlay?.kind === 'turn' && !t.flip && now - t.overlay.at >= visual.transition.dismissMs ? { ...t, overlay: undefined } : t)

/** Screen rotation in degrees (canvas and HUD together). */
export function angle(t: Transition, now: number): number {
  if (!t.flip) return rot(t.shown)
  const p = Math.min(1, (now - t.flip.at) / t.flip.ms)
  return rot(t.flip.from) + (rot(t.flip.to) - rot(t.flip.from)) * p
}

/** Where the ball rests in the net during the goal hold (the sim has already reset it). */
export const goalBall = (t: Transition) => (t.overlay?.kind === 'goal' ? t.overlay.net : undefined)

export type Notice = { player: PlayerId; text: string }

/** A label for the peer waiting on the scorer's defence choice (online only: `mine` is false for the chooser's seat), else undefined. The pitch stays visible and the sim keeps running. */
export const choosingNotice = (m: Match, mine: (p: PlayerId | null | undefined) => boolean): Notice | undefined => (m.choosing && !mine(m.choosing) ? { player: m.choosing, text: 'Opponent is choosing' } : undefined)

export type OverlayView = { kind: Overlay['kind'] | 'notice'; placement: 'top' | 'center'; band: boolean; text: string; hint?: string; color: string; opacity: number; progress: number; dismissable: boolean }

export function overlayView(t: Transition, now: number, notice?: Notice): OverlayView | undefined {
  const o = t.overlay
  if (!o) return notice && { kind: 'notice' as const, placement: 'top' as const, band: false, text: notice.text, hint: undefined, color: visual.player.colors[notice.player], opacity: 1, progress: 1, dismissable: false }
  const half = t.flip ? t.flip.ms / 2 : 0
  const opacity = o.kind === 'turn' && t.flip ? Math.max(0, Math.min(1, (now - t.flip.at - half) / half)) : 1
  return { kind: o.kind, placement: o.kind === 'reveal' ? ('top' as const) : ('center' as const), band: o.kind === 'goal' || o.kind === 'sweep', text: o.text, hint: o.hint, color: visual.player.colors[o.player], opacity, progress: Math.min(1, (now - o.at) / o.ms), dismissable: o.kind === 'turn' && !t.flip && now - o.at >= visual.transition.dismissMs }
}
