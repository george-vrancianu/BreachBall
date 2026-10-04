import { describe, expect, it } from 'vitest'
import { visual } from '../../config/visual'
import { advance, angle, blocking, choosingNotice, dismiss, goalBall, newTransition, overlayView, revealing, type Frame, type Transition } from './transition'

const base: Frame = { flip: true, active: 1, round: 1, inHand: true, phase: 'Play', events: [], now: 0 }
/** A new match with Flip on turn on (the shell's default is off). */
const fresh = (a: 1 | 2) => newTransition(a, true)
const go = (t: Transition, o: Partial<Frame>) => advance(t, { ...base, ...o })
/** A started match whose opening turn overlay has been dismissed. */
const open = () => dismiss(go(go(fresh(1), {}), { now: 1000 }), 1000)

describe('handover', () => {
  it('opens with a turn overlay for the starting player, blocking the sim', () => {
    const t = go(fresh(2), { active: 2 })
    expect(overlayView(t, 0)?.text).toBe("Player 2's turn")
    expect(blocking(t)).toBe(true)
    expect(angle(t, 0)).toBe(180)
  })
  it('holds at match start with the starting player already at the bottom: a flip with no rotation, the card fading in', () => {
    const t = go(fresh(1), {})
    expect(t.flip).toMatchObject({ from: 1, to: 1, hudSeat: 1 })
    expect(angle(t, 200)).toBe(0)
    expect(blocking(t)).toBe(true)
    expect(overlayView(t, 100)!.opacity).toBe(0)
    expect(overlayView(t, 300)!.opacity).toBeCloseTo(0.5)
    expect(dismiss(t, 1000).overlay).toBeDefined()
  })
  it('flips 180 degrees over 400 ms on a possession change, overlay fading in the second half', () => {
    let t = open()
    t = go(t, { now: 2000, active: 2 })
    expect(angle(t, 2000)).toBe(0)
    expect(angle(t, 2200)).toBeCloseTo(90)
    expect(angle(t, 2400)).toBe(180)
    expect(overlayView(t, 2100)!.opacity).toBe(0)
    expect(overlayView(t, 2300)!.opacity).toBeCloseTo(0.5)
    t = go(t, { now: 2400, active: 2 })
    expect(t.shown).toBe(2)
  })
  it('only dismisses by tap after 1 s', () => {
    const t = go(go(fresh(1), {}), { now: 500 })
    expect(dismiss(t, 999).overlay).toBeDefined()
    expect(dismiss(t, 1000).overlay).toBeUndefined()
    expect(blocking(dismiss(t, 1000))).toBe(false)
  })
  it('carries hints in round 1 only', () => {
    expect(overlayView(go(fresh(1), { inHand: true }), 0)!.hint).toMatch(/ball/i)
    expect(overlayView(go(fresh(1), { phase: 'Build' }), 0)!.hint).toBe('Tap the Build tile, pick a piece and draw it on your half, then OK')
    expect(overlayView(go(fresh(1), { inHand: false }), 0)!.hint).toBe('Drag back from the ball to shoot; hold first for Power')
    expect(overlayView(go(fresh(1), { round: 2 }), 0)!.hint).toBeUndefined()
  })
})

describe('goal', () => {
  const scored = (now: number) =>
    go(open(), {
      now,
      active: 2,
      events: [
        { type: 'goal', scorer: 1, at: { x: 20, y: 110 } },
        { type: 'round-ended', round: 1, scorer: 1 },
      ],
    })
  it('holds 1.5 s with a banner and the ball in the net, then hands over', () => {
    let t = scored(5000)
    expect(overlayView(t, 5000)!.text).toBe('GOAL')
    expect(goalBall(t)).toEqual({ x: 20, y: 110 })
    expect(blocking(t)).toBe(true)
    t = go(t, { now: 6499, active: 2 })
    expect(overlayView(t, 6499)!.text).toBe('GOAL')
    t = go(t, { now: 6500, active: 2 })
    expect(overlayView(t, 6500)!.text).toBe("Player 2's turn")
    expect(goalBall(t)).toBeUndefined()
    expect(angle(t, 6700)).toBeCloseTo(90)
  })
})

describe('phase sweep', () => {
  it('sweeps a label for 1 s at a phase change without blocking', () => {
    let t = open()
    t = go(t, { now: 2000, phase: 'Build' })
    expect(overlayView(t, 2500)).toMatchObject({ text: 'BUILD', progress: 0.5 })
    expect(blocking(t)).toBe(false)
    t = go(t, { now: 3000, phase: 'Build' })
    expect(t.overlay).toBeUndefined()
  })
})

describe('repaired sweep', () => {
  it('sweeps REPAIRED once in the repairer\'s colour, however many structures were repaired, and holds the sim like the goal banner', () => {
    const t = go(open(), { now: 2000, events: [{ type: 'repaired', id: 1, player: 1 }, { type: 'repaired', id: 2, player: 1 }] })
    expect(overlayView(t, 2500)).toMatchObject({ kind: 'sweep', text: 'REPAIRED', progress: 0.5 })
    expect(overlayView(t, 2500)!.color).toBe(visual.player.colors[1])
    expect(blocking(t)).toBe(true)
    expect(blocking(go(t, { now: 3000 }))).toBe(false)
  })
})

describe('repaired sweep in hot-seat', () => {
  it('holds the handover until the sweep ends, even when the active player changes in the same frame', () => {
    let t = go(open(), { now: 2000, active: 2, events: [{ type: 'repaired', id: 1, player: 1 }] })
    expect(blocking(t)).toBe(true) // the conceder is already active, but the scorer's screen stays up and the sim holds
    expect(overlayView(t, 2500)).toMatchObject({ kind: 'sweep', text: 'REPAIRED' })
    expect(t.flip).toBeUndefined()
    t = go(t, { now: 2600, active: 2 })
    expect(overlayView(t, 2600)?.text).toBe('REPAIRED')
    t = go(t, { now: 3000, active: 2 })
    expect(blocking(t)).toBe(true) // the flip and turn card keep holding it
    expect(t.flip).toBeDefined()
    expect(overlayView(t, 3000)?.text).toBe("Player 2's turn")
  })
})

describe('online (no handover)', () => {
  const online = (t: Transition, o: Partial<Frame>) => go(t, { active: 2, handover: false, ...o })
  it('never flips or opens a turn card, and the screen stays with the local player', () => {
    let t = online(fresh(2), {})
    expect(t.overlay).toBeUndefined()
    expect(blocking(t)).toBe(false)
    t = online(t, { now: 100, events: [{ type: 'round-ended', round: 1, scorer: 1 }] })
    expect(t.flip).toBeUndefined()
    expect(angle(t, 100)).toBe(180)
  })
  it('still holds on a goal and sweeps on a phase change', () => {
    let t = online(fresh(2), { phase: 'Play' })
    t = online(t, { now: 10, phase: 'Build', events: [{ type: 'goal', scorer: 1, at: { x: 20, y: 0 } }] })
    expect(blocking(t)).toBe(true)
    t = online(t, { now: 1600, phase: 'Build' })
    expect(blocking(t)).toBe(false)
    expect(overlayView(t, 1600)?.text).toBe('BUILD')
  })
})

describe('rearrange', () => {
  it('sweeps a REARRANGE label when the turn opens' , () => {
    const t = go(open(), { now: 3000, phase: 'Rearrange' })
    expect(overlayView(t, 3000)).toMatchObject({ text: 'REARRANGE' })
  })
})

describe('reveal', () => {
  /** A Siege opening build in progress, then the second Done lands at `now`. */
  const building = () => go(open(), { now: 2000, phase: 'Build', opening: true })
  const done = (t: Transition, o: Partial<Frame> = {}) => go(t, { now: 5000, active: 2, phase: 'Play', opening: false, ...o })
  it('holds 1.5 s on the whole pitch after the opening build ends, blocking the sim, then hands over', () => {
    let t = done(building())
    expect(overlayView(t, 5000)).toMatchObject({ kind: 'reveal', text: 'REVEAL' })
    expect(revealing(t)).toBe(true)
    expect(blocking(t)).toBe(true)
    expect(t.flip).toBeUndefined()
    t = go(t, { now: 6499, active: 2, phase: 'Play' })
    expect(revealing(t)).toBe(true)
    t = go(t, { now: 6500, active: 2, phase: 'Play' })
    expect(revealing(t)).toBe(false)
    expect(overlayView(t, 6500)?.text).toBe("Player 2's turn")
    expect(blocking(t)).toBe(true)
  })
  it('pins its label to the top edge with no band, so the whole pitch stays visible', () => {
    const t = done(building())
    expect(overlayView(t, 5000)).toMatchObject({ placement: 'top', band: false })
    expect(overlayView(go(open(), { now: 2000, events: [{ type: 'goal', scorer: 1, at: { x: 20, y: 110 } }] }), 2000)).toMatchObject({ placement: 'center', band: true })
  })
  it('ignores taps while it holds', () => {
    const t = done(building())
    expect(dismiss(t, 9999)).toBe(t)
  })
  it('shows no PLAY sweep after the reveal', () => {
    const t = go(done(building()), { now: 6500, active: 2, phase: 'Play' })
    expect(t.overlay?.kind).toBe('turn')
    expect(go(t, { now: 8000, active: 2, phase: 'Play' }).overlay?.kind).not.toBe('sweep')
  })
  it('fires once per opening, and not for builds that are not an opening', () => {
    // Rounds, or a Rearrange turn: `opening` was never true, so ending the build is just the PLAY sweep.
    const rounds = go(go(open(), { now: 2000, phase: 'Build' }), { now: 5000, phase: 'Play' })
    expect(revealing(rounds)).toBe(false)
    expect(rounds.overlay?.text).toBe('PLAY')
    const after = go(done(building()), { now: 6500, active: 2, phase: 'Play', opening: false })
    expect(revealing(go(after, { now: 7000, active: 2, phase: 'Play', opening: false }))).toBe(false)
  })
  it('online: no turn card after it, the screen stays with the local player', () => {
    const on = { active: 2 as const, handover: false }
    let t = go(go(fresh(2), { ...on, opening: true, phase: 'Build', now: 0 }), { ...on, opening: false, phase: 'Play', now: 1000 })
    expect(revealing(t)).toBe(true)
    t = go(t, { ...on, opening: false, phase: 'Play', now: 2500 })
    expect(revealing(t)).toBe(false)
    expect(t.overlay).toBeUndefined()
    expect(t.shown).toBe(2)
  })
})

describe('opponent is choosing notice', () => {
  const siegeMatch = (choosing: 1 | 2 | null) => ({ mode: 'siege' as const, seed: 1, winner: null, builder: null, choosing, opening: false })
  const mineIs = (me: 1 | 2) => (p: 1 | 2 | null | undefined) => p === me
  it('shows to the peer waiting on the chooser, in the chooser colour, as a non-blocking label', () => {
    const n = choosingNotice(siegeMatch(1), mineIs(2))
    expect(n).toEqual({ player: 1, text: 'Opponent is choosing' })
    const v = overlayView(fresh(2), 0, n)
    expect(v).toMatchObject({ kind: 'notice', text: 'Opponent is choosing', color: visual.player.colors[1], placement: 'top', band: false })
  })
  it('does not show to the chooser, in hot-seat, or when nobody is choosing', () => {
    expect(choosingNotice(siegeMatch(1), mineIs(1))).toBeUndefined()
    expect(choosingNotice(siegeMatch(1), () => true)).toBeUndefined()
    expect(choosingNotice(siegeMatch(null), mineIs(2))).toBeUndefined()
  })
  it('never blocks the sim and yields to a real overlay', () => {
    expect(blocking(fresh(2))).toBe(false)
    const t = go(go(fresh(2), { active: 2 }), { now: 10, active: 2 })
    expect(overlayView(t, 10, { player: 1, text: 'x' })?.kind).toBe('turn')
  })
})

describe('flip off (hot-seat, the default)', () => {
  const dismissed = (flip: boolean) => dismiss(go(go(newTransition(1, flip), { flip }), { flip, now: 1000 }), 1000)
  it('still holds at match start: a flip with no rotation, the card fading in, tap-dismiss only after it', () => {
    let t = go(newTransition(1, false), { flip: false })
    expect(t.flip).toMatchObject({ from: 1, to: 1, hudSeat: 1 })
    expect(angle(t, 200)).toBe(0)
    expect(blocking(t)).toBe(true)
    expect(overlayView(t, 100)!.opacity).toBe(0)
    expect(overlayView(t, 300)!.opacity).toBeCloseTo(0.5)
    expect(dismiss(t, 300).overlay).toBeDefined()
    t = go(t, { flip: false, now: 400 })
    expect(t.flip).toBeUndefined()
    expect(dismiss(t, 1000).overlay).toBeUndefined()
  })
  it('never rotates: the opponent plays from across the table, behind a turn card', () => {
    let t = dismissed(false)
    t = go(t, { now: 2000, active: 2, flip: false })
    expect(t.flip).toMatchObject({ from: 1, to: 1, hudSeat: 2 })
    expect(angle(t, 2200)).toBe(0)
    expect(overlayView(t, 2000)?.text).toBe("Player 2's turn")
    expect(overlayView(t, 2000)!.opacity).toBe(0)
    expect(blocking(t)).toBe(true)
    t = go(t, { now: 2400, active: 2, flip: false })
    expect(t.shown).toBe(1)
    expect(t.hudSeat).toBe(2)
    expect(overlayView(t, 2400)!.opacity).toBe(1)
  })
  it('opens a match for player 2 with the board still at the bottom', () => {
    const t = go(newTransition(2, false), { active: 2, flip: false })
    expect(angle(t, 0)).toBe(0)
    expect([t.shown, t.hudSeat]).toEqual([1, 2])
    expect(overlayView(t, 0)?.text).toBe("Player 2's turn")
  })
  it('turning it on mid-match applies at the next handover, not before', () => {
    let t = dismissed(false)
    t = go(t, { now: 1100, flip: true })
    expect(t.flip).toBeUndefined()
    expect(angle(t, 1100)).toBe(0)
    t = go(t, { now: 2000, active: 2, flip: true })
    expect(t.flip).toMatchObject({ from: 1, to: 2 })
  })
  it('turning it off while turned applies at the next handover, which turns back once', () => {
    let t = go(dismissed(true), { now: 2000, active: 2 })
    t = go(t, { now: 2400, active: 2 })
    t = dismiss(t, 3400)
    expect(t.shown).toBe(2)
    t = go(t, { now: 3500, active: 2, flip: false })
    expect(t.flip).toBeUndefined()
    t = go(t, { now: 4000, active: 1, flip: false })
    expect(t.flip).toMatchObject({ from: 2, to: 1 })
  })
  it('a flip under way is not changed by the toggle', () => {
    let t = go(dismissed(true), { now: 2000, active: 2 })
    t = go(t, { now: 2100, active: 2, flip: false })
    expect(t.flip).toMatchObject({ from: 1, to: 2 })
  })
})

describe('online', () => {
  it('ignores the toggle: no flip and no turn card, whichever way it is set', () => {
    for (const flip of [true, false]) {
      const t = go(go(fresh(1), { handover: false, flip }), { handover: false, flip, now: 2000, active: 2 })
      expect(t.flip).toBeUndefined()
      expect(t.overlay).toBeUndefined()
      expect(t.shown).toBe(1)
    }
  })
})
