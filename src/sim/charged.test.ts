import { describe, expect, it } from 'vitest'
import { rules } from '../config/rules'
import { boostAt, centreSpot, type Point } from './pitch'
import { predictPath } from './predict'
import { defaultConfig, step, type SimConfig, type SimInput, type SimState } from './step'
import { playState, roundsMatch } from './testkit'

/** No friction, so the velocity after one tick is the launch velocity. */
const c: SimConfig = { ...defaultConfig, halfLife: Infinity }
const { ring, bullseye } = rules.boost
const centre = centreSpot()
/** A point `d` above the centre spot (on player 2's half). */
const above = (d: number): Point => ({ x: centre.x, y: centre.y - d })
const below = (d: number): Point => ({ x: centre.x, y: centre.y + d })

/** A shot by `shooter` that has just stopped at `pos`: the next step is its rest. */
const resting = (pos: Point, over: Partial<SimState['possession']> = {}, shooter: 1 | 2 = 1): SimState => ({ ...playState(), possession: { shooter, shots: 3, inHand: false, live: true, ...over }, ball: { pos, vel: { x: 0, y: 0 }, rolled: 0 } })
/** A ball sitting charged at `pos` for `shooter`, waiting for a shot. */
const charged = (pos: Point, factor: number, shooter: 1 | 2 = 1): SimState => ({ ...resting(pos, { live: false }, shooter), charge: factor })
const up: NonNullable<SimInput['shot']> = { player: 1, dir: { x: 0, y: -1 }, tier: 0, power: 0.4 }

describe('Boost ring and Bullseye', () => {
  it('are centred on the centre spot, the ring as wide as the Centre zone', () => {
    expect(ring).toEqual({ radius: rules.centreZoneRadius, factor: 1.5 })
    expect(bullseye).toEqual({ radius: 2, factor: 2 })
  })
  it.each([
    [0, 2],
    [bullseye.radius, 2],
    [bullseye.radius + 0.01, 1.5],
    [ring.radius, 1.5],
    [ring.radius + 0.01, 1],
  ])('boostAt %f from the centre spot is x%f', (d, factor) => {
    expect(boostAt(above(d))).toBe(factor)
    expect(boostAt({ x: centre.x + d, y: centre.y })).toBe(factor)
  })
})

describe('A shot coming to rest', () => {
  it.each([
    ['the Bullseye', 1.5, 2],
    ['the Boost ring', 4, 1.5],
    ['neither', 7, 1],
  ])('in %s (%f from the centre spot) leaves the ball Charged x%f', (_, d, factor) => {
    const r = step(resting(below(d)), {}, c)
    expect(r.state.charge).toBe(factor)
    expect(r.events.filter((e) => e.type === 'charged')).toEqual(factor > 1 ? [{ type: 'charged', factor, at: below(d) }] : [])
  })
  it('Charges the ball on the opponent half too, and the opponent holds it', () => {
    // P1's shot (3 Move points left) rests on P2's half: possession passes with the charge.
    const r = step(resting(above(4)), {}, c)
    expect(r.state.possession).toMatchObject({ shooter: 2, inHand: false, live: false })
    expect(r.state.ball.pos).toEqual(above(4))
    expect(r.state.charge).toBe(ring.factor)
  })
  it('Charges a ball that stays with the shooter, who has Move points left', () => {
    const r = step(resting(below(4), { shots: 2 }), {}, c)
    expect(r.state.possession).toMatchObject({ shooter: 1, shots: 1 })
    expect(r.state.charge).toBe(ring.factor)
  })
  it('does not Charge a ball passing through while still moving', () => {
    const s: SimState = { ...resting(below(8)), ball: { pos: below(8), vel: { x: 0, y: -60 }, rolled: 0 } }
    let r = step(s, {}, c)
    const seen: number[] = [r.state.charge]
    for (let i = 0; i < 60 && r.state.possession.live; i++) seen.push((r = step(r.state, {}, c)).state.charge)
    expect(boostAt(r.state.ball.pos)).toBe(1)
    expect(seen.every((f) => f === 1)).toBe(true)
  })
  it('loses the charge when the last Move point is spent: the opponent restarts on the centre spot, uncharged', () => {
    const r = step(resting(below(4), { shots: 1 }), {}, c)
    expect(r.state.possession).toMatchObject({ shooter: 2, shots: c.shots })
    expect(r.state.ball.pos).toEqual(centre)
    expect(r.state.charge).toBe(1)
    expect(r.events.some((e) => e.type === 'charged')).toBe(false)
  })
  it('loses the charge when the Rounds shot cap ends the round: the next kick-off is uncharged', () => {
    const s = resting(below(1), { shots: 3 })
    const r = step({ ...s, match: { ...roundsMatch(s), roundShots: c.shotCap } }, {}, c)
    expect(roundsMatch(r.state).round).toBe(2)
    expect(r.state.charge).toBe(1)
    expect(r.events.some((e) => e.type === 'charged')).toBe(false)
  })
})

describe('Restarts never Charge the ball', () => {
  it('a Centre-spot restart puts the ball in the Bullseye uncharged (second shot-clock expiry)', () => {
    const s: SimState = { ...charged(below(4), 1.5), clock: { left: 1, expiries: 1 } }
    const r = step(s, {}, c)
    expect(r.state.ball.pos).toEqual(centre)
    expect(boostAt(r.state.ball.pos)).toBe(bullseye.factor)
    expect(r.state.charge).toBe(1)
  })
  it('a Centre-spot restart by refunding the last Move point is uncharged', () => {
    const s: SimState = { ...charged(below(4), 1.5), possession: { shooter: 1, shots: 1, inHand: false, live: false } }
    const r = step(s, { refund: { player: 1, count: 1 } }, c)
    expect(r.state.ball.pos).toEqual(centre)
    expect(r.state.charge).toBe(1)
  })
  it('shooting from a Centre-spot restart is not x2: the restart ball is uncharged', () => {
    const restart = step({ ...resting(below(4), { shots: 1 }) }, {}, c).state
    const r = step(restart, { shot: { player: 2, dir: { x: 0, y: -1 }, tier: 0, power: 0.4 } }, c)
    expect(r.state.ball.vel.y).toBeCloseTo(-0.4 * c.maxSpeed)
  })
  it('a shot from the restart that rests in a ring Charges the ball by where it rests', () => {
    const restart = step(resting(below(4), { shots: 1 }), {}, c).state
    const fired = step(restart, { shot: { player: 2, dir: { x: 0, y: -1 }, tier: 0, power: 0.15 } }, c).state
    expect(fired.charge).toBe(1)
    const out = step({ ...fired, ball: { pos: above(4), vel: { x: 0, y: 0 }, rolled: 0 } }, {}, c)
    expect(out.state.charge).toBe(ring.factor)
  })
})

describe('A Charged ball', () => {
  it.each([
    ['Boost ring', ring.factor],
    ['Bullseye', bullseye.factor],
  ])('multiplies the launch speed of the next shot by the %s factor (x%f), for Touch and Power', (_, factor) => {
    for (const [tier, power] of [[0, 0.4], [1, 0.8]] as const) {
      const r = step(charged(below(1), factor), { shot: { ...up, tier, power } }, c)
      expect(r.state.ball.vel.y).toBeCloseTo(-power * c.maxSpeed * factor)
      expect(r.events).toContainEqual(expect.objectContaining({ type: 'shot-fired', charge: factor }))
    }
  })
  it('has no cap on the speed', () => {
    const r = step(charged(below(1), bullseye.factor), { shot: { ...up, tier: 1, power: 1 } }, c)
    expect(r.state.ball.vel.y).toBeCloseTo(-c.maxSpeed * bullseye.factor)
  })
  it('does not multiply the Splash', () => {
    const plain = step(charged(below(1), 1), { shot: { ...up, tier: 1, power: 0.8 } }, c)
    const boosted = step(charged(below(1), bullseye.factor), { shot: { ...up, tier: 1, power: 0.8 } }, c)
    expect(boosted.events.filter((e) => e.type !== 'shot-fired')).toEqual(plain.events.filter((e) => e.type !== 'shot-fired'))
  })
  it('is spent by the shot: it flies uncharged and the plain event omits the charge', () => {
    const fired = step(charged(below(1), ring.factor), { shot: up }, c)
    expect(fired.state.charge).toBe(1)
    const plain = step(charged(below(1), 1), { shot: up }, c)
    expect(plain.events.find((e) => e.type === 'shot-fired')).not.toHaveProperty('charge')
  })
  it('is used by the opponent of whoever Charged it', () => {
    const shot = step(resting(above(1), { shots: 3 }, 1), {}, c).state
    expect(shot.possession.shooter).toBe(2)
    const r = step(shot, { shot: { player: 2, dir: { x: 0, y: 1 }, tier: 0, power: 0.4 } }, c)
    expect(r.state.ball.vel.y).toBeCloseTo(0.4 * c.maxSpeed * bullseye.factor)
  })
  it('keeps the charge through a shot burned by the shot clock', () => {
    const s: SimState = { ...charged(below(4), ring.factor), clock: { left: 1, expiries: 0 } }
    const r = step(s, {}, { ...c, expiry: 'burn' })
    expect(r.events).toContainEqual({ type: 'shot-clock-expired', player: 1 })
    expect(r.state.possession).toMatchObject({ shooter: 1, shots: 2 })
    expect(r.state.ball.pos).toEqual(below(4))
    expect(r.state.charge).toBe(ring.factor)
  })
  it('is lost when the ball is handed over and placed (a Steal gives ball-in-hand)', () => {
    const s: SimState = { ...charged(below(4), ring.factor), possession: { shooter: 1, shots: 3, inHand: true, live: false } }
    const r = step(s, { placeBall: { player: 1, at: { x: 20, y: 80 } } }, c)
    expect(r.state.ball.pos).toEqual({ x: 20, y: 80 })
    expect(r.state.charge).toBe(1)
  })
  it('starts a match uncharged', () => {
    expect(playState().charge).toBe(1)
  })
})

describe('The Ghost', () => {
  it('predicts with the multiplied speed, and leaves the real charge alone', () => {
    // Friction ends a plain 0.2 Touch shot short of the side board; at x2 it reaches it.
    const shot: NonNullable<SimInput['shot']> = { player: 1, dir: { x: 1, y: 0 }, tier: 0, power: 0.2 }
    const contacts = (s: SimState) => predictPath(s, shot, defaultConfig, 'rest').contacts.length
    const boosted = charged(below(1), bullseye.factor)
    expect(contacts(charged(below(1), 1))).toBe(0)
    expect(contacts(boosted)).toBeGreaterThan(0)
    expect(boosted.charge).toBe(bullseye.factor)
  })
})
