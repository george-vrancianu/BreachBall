import { visual } from '../../config/visual'
import type { PlayerId, Point } from '../../sim/pitch'
import type { Match } from '../../sim/match'
import type { SimEvent } from '../../sim/step'

/** `holds` = the handover waits for this overlay and the sim is paused while it is up (the REPAIRED sweep; the goal and reveal kinds always hold). */
type Overlay = { kind: 'goal' | 'sweep' | 'reveal'; at: number; player: PlayerId; text: string; ms: number; net?: Point; holds?: true }
/** `shown` is whose end of the pitch is at the bottom of the screen; `hudSeat` is whose turn the HUD shows (the same seat when the stage turns, but not in Tabletop mode, where the pitch stays put and seat 2 plays from across the table); `due` = a handover is waiting (e.g. for the goal hold to end); `opening` = the last frame saw a Siege opening build (the reveal fires when it ends). */
export type Transition = { shown: PlayerId; hudSeat: PlayerId; flip?: { at: number; ms: number; from: PlayerId; to: PlayerId; hudSeat: PlayerId; /** Tabletop handover slide only: ms in at which the HUD seat swaps, while nothing shows. */ swapMs?: number }; overlay?: Overlay; due?: boolean; phase?: string; opening?: boolean }

/** `tabletop` (Tabletop mode, the device default): the pitch never turns, so seat 1's end is at the bottom whoever starts. Off, the stage turns to the starting player. Online passes true, and `advance` ignores the flip there, so online never flips. */
export const newTransition = (active: PlayerId, tabletop = true): Transition => ({ shown: bottomSeat(tabletop, active), hudSeat: active, due: true })

/** Whose end is at the bottom once the handover settles: always seat 1 in Tabletop mode, else the active seat. */
const bottomSeat = (tabletop: boolean, seat: PlayerId): PlayerId => (tabletop ? 1 : seat)

/** The HUD's seat sits across the table from the bottom end (Tabletop mode, seat 2 playing): the pitch and its camera keep the bottom seat's way, while the HUD layer faces the HUD seat. */
export const acrossTable = (t: Transition) => t.hudSeat !== t.shown

const rot = (p: PlayerId) => (p === 1 ? 0 : 180)

/** Degrees the HUD layer turns to face the HUD's seat: what Tabletop mode applies to the HUD layer alone (the canvas layer stays at `angle`, 0 there). */
export const seatAngle = (t: Transition): number => rot(t.hudSeat)

/** The seat whose frame the stage is laid out in (camera reserve and anchor, the lighting, the Dock's edge). Hot-seat: the HUD's seat. Online (`handover` false) each player sits at the bottom, so always the bottom seat, whoever has the turn. */
export const facing = (t: Transition, handover: boolean): PlayerId => (handover ? t.hudSeat : t.shown)

/** The setting changed mid-match: snap to the active seat's orientation with no animation. A flip under way lands first; the overlay and everything else stay. */
export function reorient(t: Transition, tabletop: boolean): Transition {
  const seat = t.flip ? t.flip.hudSeat : t.hudSeat
  return { ...t, shown: bottomSeat(tabletop, seat), hudSeat: seat, flip: undefined }
}

/** `handover` false = online: each player always sits at the bottom, so no flip, and `tabletop` is ignored. `tabletop` true = hot-seat with Tabletop mode on (the device default): the pitch never turns, seat 1's end stays at the bottom, and only the HUD layer faces the active seat (`seatAngle`). Off, the stage turns. Read at each handover; a flip already under way is not changed. */
export type Frame = { handover?: boolean; tabletop: boolean; active: PlayerId; phase: string; /** A Siege opening build is in progress (not a Rearrange turn); its end triggers the reveal. */ opening?: boolean; events: SimEvent[]; now: number }

/** Call each tick (with that tick's events) and once per frame. Pure; the sim never waits on it, the shell pauses `step` while `blocking`. */
export function advance(t: Transition, f: Frame): Transition {
  let { shown, hudSeat, flip, overlay, due } = t
  if (flip && f.now >= flip.at + flip.ms) (shown = flip.to), (hudSeat = flip.hudSeat), (flip = undefined)
  if (flip?.swapMs !== undefined && f.now >= flip.at + flip.swapMs) hudSeat = flip.hudSeat
  if (overlay && f.now >= overlay.at + overlay.ms) overlay = undefined
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
  else if ((due || f.active !== hudSeat) && !flip && !repairing && overlay?.kind !== 'goal' && overlay?.kind !== 'reveal') {
    const { flipMs, slide } = visual.transition
    // The Tabletop handover to another seat slides the Dock out and in (the seat swaps in between); anything else (the hold at a match's start, a hand-back to the same seat, the whole-stage flip) holds for `flipMs`.
    const sliding = f.tabletop && f.active !== hudSeat && slide.outMs + slide.gapMs + slide.inMs > 0
    const ms = sliding ? slide.outMs + slide.gapMs + slide.inMs : flipMs
    // In Tabletop mode the bottom seat is always 1: the stage turns back once if it was left turned.
    const to = bottomSeat(f.tabletop, f.active)
    // Even when `to` is already shown the flip runs (rotating 0 degrees), so the hold is the same as ever.
    if (ms) flip = { at: f.now, ms, from: shown, to, hudSeat: f.active, swapMs: sliding ? slide.outMs + slide.gapMs / 2 : undefined }
    else (shown = to), (hudSeat = f.active)
    due = false
  }
  // A phase change during the goal hold is announced once the hold ends.
  return { shown, hudSeat, flip, overlay, due, opening: f.opening, phase: overlay?.kind === 'goal' ? t.phase : f.phase }
}

/** A hot-seat handover began between two transitions: a flip started, or the HUD's seat changed with no flip under way (the flip's own end changes it too, which is not a new handover). */
export const handedOver = (before: Transition, after: Transition): boolean => !before.flip && (!!after.flip || after.hudSeat !== before.hudSeat)

/** The shell stops stepping the sim while a flip, goal, reveal or REPAIRED overlay is up: the conceder's clock and ball are out of reach until the handover is seen. */
export const blocking = (t: Transition) => !!t.flip || t.overlay?.kind === 'goal' || t.overlay?.kind === 'reveal' || (t.overlay?.kind === 'sweep' && !!t.overlay.holds)

/** The reveal hold is up: the shell shows the whole pitch through the map camera. */
export const revealing = (t: Transition) => t.overlay?.kind === 'reveal'

/** The whole-stage flip's rotation in degrees (canvas and HUD together; always 0 in Tabletop mode, where only the HUD layer turns, by `seatAngle`). */
export function angle(t: Transition, now: number): number {
  if (!t.flip) return rot(t.shown)
  const p = Math.min(1, (now - t.flip.at) / t.flip.ms)
  return rot(t.flip.from) + (rot(t.flip.to) - rot(t.flip.from)) * p
}

const easeIn = (p: number) => p ** visual.transition.slide.easeIn
const easeOut = (p: number) => 1 - (1 - p) ** visual.transition.slide.easeOut
const span = (now: number, from: number, ms: number) => (ms > 0 ? Math.min(1, Math.max(0, (now - from) / ms)) : now >= from ? 1 : 0)

/** The Tabletop handover slide at `now`: `dock` is how far the Dock is off the HUD layer's bottom (0 in place, 1 fully gone; the layer turns while it is 1, so it always leaves and returns by the layer's own bottom, the device's bottom for seat 1 and its top for seat 2); `chrome` is the opacity of the edge strips and corner chips, which fade rather than cross the pitch. At rest, and for the whole-stage flip, `{ dock: 0, chrome: 1 }`. */
export function slideAt(t: Transition, now: number): { dock: number; chrome: number } {
  const f = t.flip
  if (f?.swapMs === undefined) return { dock: 0, chrome: 1 }
  const { outMs, gapMs, inMs } = visual.transition.slide
  const out = span(now, f.at, outMs)
  const back = span(now, f.at + outMs + gapMs, inMs)
  return back > 0 ? { dock: 1 - easeOut(back), chrome: easeOut(back) } : { dock: easeIn(out), chrome: 1 - easeIn(out) }
}

/** Where the ball rests in the net during the goal hold (the sim has already reset it). */
export const goalBall = (t: Transition) => (t.overlay?.kind === 'goal' ? t.overlay.net : undefined)

export type Notice = { player: PlayerId; text: string }

/** A label for the peer waiting on the scorer's defence choice (online only: `mine` is false for the chooser's seat), else undefined. The pitch stays visible and the sim keeps running. */
export const choosingNotice = (m: Match, mine: (p: PlayerId | null | undefined) => boolean): Notice | undefined => (m.choosing && !mine(m.choosing) ? { player: m.choosing, text: 'Opponent is choosing' } : undefined)

export type OverlayView = { kind: Overlay['kind'] | 'notice'; placement: 'top' | 'center'; band: boolean; text: string; color: string; progress: number; /** Degrees the Overlay turns within the HUD layer: a sweep that begins with a Tabletop handover slide already faces the incoming seat, so it does not come back mirrored when the layer turns at the swap. */ turn: number; /** Whether the Overlay fades with the edge strips and corner chips during the slide (a sweep does not). */ fades: boolean }

/** The sweep's own turn inside the HUD layer while a Tabletop slide has yet to swap the HUD seat: the layer still faces the outgoing seat, so the sweep is turned to the incoming one. */
const sweepTurn = (t: Transition): number => (t.flip?.swapMs !== undefined ? (rot(t.flip.hudSeat) - rot(t.hudSeat) + 360) % 360 : 0)

export function overlayView(t: Transition, now: number, notice?: Notice): OverlayView | undefined {
  const o = t.overlay
  if (!o) return notice && { kind: 'notice' as const, placement: 'top' as const, band: false, text: notice.text, color: visual.player.colors[notice.player], progress: 1, turn: 0, fades: true }
  return { kind: o.kind, placement: o.kind === 'reveal' ? ('top' as const) : ('center' as const), band: o.kind === 'goal' || o.kind === 'sweep', text: o.text, color: visual.player.colors[o.player], progress: Math.min(1, (now - o.at) / o.ms), turn: o.kind === 'sweep' ? sweepTurn(t) : 0, fades: o.kind !== 'sweep' }
}
