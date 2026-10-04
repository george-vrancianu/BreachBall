import { describe, expect, it } from 'vitest'
import { visual } from '../../config/visual'
import { advance, angle, blocking, choosingNotice, goalBall, handedOver, newTransition, overlayView, revealing, type Frame, type Transition } from './transition'

const base: Frame = { flip: true, active: 1, phase: 'Play', events: [], now: 0 }
/** A new match with Flip on turn on (the shell's default is off). */
const fresh = (a: 1 | 2) => newTransition(a, true)
const go = (t: Transition, o: Partial<Frame>) => advance(t, { ...base, ...o })
/** A started match whose opening hold has finished. */
const open = () => go(go(fresh(1), {}), { now: 400 })

describe('handover', () => {
  it('opens with a flip for the starting player blocking the sim only until the flip ends', () => {
    let t = go(fresh(2), { active: 2 })
    expect(t.overlay).toBeUndefined()
    expect(overlayView(t, 0)).toBeUndefined()
    expect(blocking(t)).toBe(true)
    expect(angle(t, 0)).toBe(180)
    t = go(t, { now: 400, active: 2 })
    expect(blocking(t)).toBe(false)
  })
  it('holds at match start with the starting player already at the bottom: a flip with no rotation', () => {
    const t = go(fresh(1), {})
    expect(t.flip).toMatchObject({ from: 1, to: 1, hudSeat: 1 })
    expect(angle(t, 200)).toBe(0)
    expect(blocking(t)).toBe(true)
    expect(blocking(go(t, { now: 400 }))).toBe(false)
  })
  it('flips 180 degrees over 400 ms on a possession change, with no overlay at all', () => {
    let t = open()
    t = go(t, { now: 2000, active: 2 })
    expect(angle(t, 2000)).toBe(0)
    expect(angle(t, 2200)).toBeCloseTo(90)
    expect(angle(t, 2400)).toBe(180)
    expect(overlayView(t, 2200)).toBeUndefined()
    expect(blocking(t)).toBe(true)
    t = go(t, { now: 2400, active: 2 })
    expect(t.shown).toBe(2)
    expect(blocking(t)).toBe(false)
  })
  it('never waits on a tap: the sim resumes the frame the flip ends', () => {
    const t = go(go(open(), { now: 2000, active: 2 }), { now: 2400, active: 2 })
    expect(t.flip).toBeUndefined()
    expect(t.overlay).toBeUndefined()
    expect(blocking(t)).toBe(false)
  })
  it('hands over with no flip at all when the ms is 0', () => {
    const { flipMs } = visual.transition
    ;(visual.transition as { flipMs: number }).flipMs = 0
    try {
      const t = go(open(), { now: 2000, active: 2 })
      expect(t.shown).toBe(2)
      expect(blocking(t)).toBe(false)
    } finally {
      ;(visual.transition as { flipMs: number }).flipMs = flipMs
    }
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
    expect(overlayView(t, 6500)).toBeUndefined()
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
    expect(blocking(t)).toBe(true) // the flip keeps holding it
    expect(t.flip).toBeDefined()
    expect(overlayView(t, 3000)).toBeUndefined()
  })
})

describe('online (no handover)', () => {
  const online = (t: Transition, o: Partial<Frame>) => go(t, { active: 2, handover: false, ...o })
  it('never flips, and the screen stays with the local player', () => {
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
    expect(overlayView(t, 6500)).toBeUndefined()
    expect(t.flip).toBeDefined()
    expect(blocking(t)).toBe(true)
  })
  it('pins its label to the top edge with no band, so the whole pitch stays visible', () => {
    const t = done(building())
    expect(overlayView(t, 5000)).toMatchObject({ placement: 'top', band: false })
    expect(overlayView(go(open(), { now: 2000, events: [{ type: 'goal', scorer: 1, at: { x: 20, y: 110 } }] }), 2000)).toMatchObject({ placement: 'center', band: true })
  })
  it('shows no PLAY sweep after the reveal', () => {
    const t = go(done(building()), { now: 6500, active: 2, phase: 'Play' })
    expect(t.overlay).toBeUndefined()
    expect(go(t, { now: 8000, active: 2, phase: 'Play' }).overlay).toBeUndefined()
  })
  it('fires once per opening, and not for builds that are not an opening', () => {
    // Rounds, or a Rearrange turn: `opening` was never true, so ending the build is just the PLAY sweep.
    const rounds = go(go(open(), { now: 2000, phase: 'Build' }), { now: 5000, phase: 'Play' })
    expect(revealing(rounds)).toBe(false)
    expect(rounds.overlay?.text).toBe('PLAY')
    const after = go(done(building()), { now: 6500, active: 2, phase: 'Play', opening: false })
    expect(revealing(go(after, { now: 7000, active: 2, phase: 'Play', opening: false }))).toBe(false)
  })
  it('online: no handover after it, the screen stays with the local player', () => {
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
    const t = go(open(), { now: 2000, phase: 'Build' })
    expect(overlayView(t, 2000, { player: 1, text: 'x' })?.kind).toBe('sweep')
  })
})

describe('flip off (hot-seat, the default)', () => {
  const settled = (flip: boolean) => go(go(newTransition(1, flip), { flip }), { flip, now: 400 })
  it('still holds at match start: a flip with no rotation, then the sim runs', () => {
    let t = go(newTransition(1, false), { flip: false })
    expect(t.flip).toMatchObject({ from: 1, to: 1, hudSeat: 1 })
    expect(angle(t, 200)).toBe(0)
    expect(blocking(t)).toBe(true)
    expect(t.overlay).toBeUndefined()
    t = go(t, { flip: false, now: 400 })
    expect(t.flip).toBeUndefined()
    expect(blocking(t)).toBe(false)
  })
  it('never rotates: the opponent plays from across the table, with no card', () => {
    let t = settled(false)
    t = go(t, { now: 2000, active: 2, flip: false })
    expect(t.flip).toMatchObject({ from: 1, to: 1, hudSeat: 2 })
    expect(angle(t, 2200)).toBe(0)
    expect(overlayView(t, 2000)).toBeUndefined()
    expect(blocking(t)).toBe(true)
    t = go(t, { now: 2400, active: 2, flip: false })
    expect(t.shown).toBe(1)
    expect(t.hudSeat).toBe(2)
    expect(blocking(t)).toBe(false)
  })
  it('opens a match for player 2 with the board still at the bottom', () => {
    const t = go(newTransition(2, false), { active: 2, flip: false })
    expect(angle(t, 0)).toBe(0)
    expect([t.shown, t.hudSeat]).toEqual([1, 2])
    expect(overlayView(t, 0)).toBeUndefined()
  })
  it('turning it on mid-match applies at the next handover, not before', () => {
    let t = settled(false)
    t = go(t, { now: 1100, flip: true })
    expect(t.flip).toBeUndefined()
    expect(angle(t, 1100)).toBe(0)
    t = go(t, { now: 2000, active: 2, flip: true })
    expect(t.flip).toMatchObject({ from: 1, to: 2 })
  })
  it('turning it off while turned applies at the next handover, which turns back once', () => {
    let t = go(settled(true), { now: 2000, active: 2 })
    t = go(t, { now: 2400, active: 2 })
    expect(t.shown).toBe(2)
    t = go(t, { now: 3500, active: 2, flip: false })
    expect(t.flip).toBeUndefined()
    t = go(t, { now: 4000, active: 1, flip: false })
    expect(t.flip).toMatchObject({ from: 2, to: 1 })
  })
  it('a flip under way is not changed by the toggle', () => {
    let t = go(settled(true), { now: 2000, active: 2 })
    t = go(t, { now: 2100, active: 2, flip: false })
    expect(t.flip).toMatchObject({ from: 1, to: 2 })
  })
})

describe('online', () => {
  it('ignores the toggle: no flip and no overlay, whichever way it is set', () => {
    for (const flip of [true, false]) {
      const t = go(go(fresh(1), { handover: false, flip }), { handover: false, flip, now: 2000, active: 2 })
      expect(t.flip).toBeUndefined()
      expect(t.overlay).toBeUndefined()
      expect(t.shown).toBe(1)
    }
  })
})

describe('handedOver', () => {
  it('is true when a flip starts, or the HUD seat changes with none under way', () => {
    const t = open()
    expect(handedOver(t, go(t, { active: 2, now: 500 }))).toBe(true)
    expect(handedOver(t, { ...t, hudSeat: 2 })).toBe(true)
  })

  it('is false with no change, and while a flip runs through to its end', () => {
    const t = open()
    expect(handedOver(t, go(t, { now: 500 }))).toBe(false)
    const flipping = go(t, { active: 2, now: 500 })
    expect(handedOver(flipping, go(flipping, { active: 2, now: 500 + visual.transition.flipMs }))).toBe(false)
  })
})
