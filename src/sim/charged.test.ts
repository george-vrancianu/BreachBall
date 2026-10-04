import { describe, expect, it } from 'vitest'
import { rules } from '../config/rules'
import { boostAt, centreSpot, chargeAt, type BoostZone, type Charge, type Point } from './pitch'
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
const charged = (pos: Point, zone: BoostZone | null, shooter: 1 | 2 = 1): SimState => ({ ...resting(pos, { live: false }, shooter), charge: zone && { zone, factor: rules.boost[zone].factor } })
const up: NonNullable<SimInput['shot']> = { player: 1, dir: { x: 0, y: -1 }, tier: 0, power: 0.4 }

describe('Boost ring and Bullseye', () => {
  it('are centred on the centre spot, the ring as wide as the Centre zone', () => {
    expect(ring).toEqual({ radius: rules.centreZoneRadius, factor: 1.5 })
    expect(bullseye).toEqual({ radius: 2, factor: 2 })
  })
  it.each([
    [0, 'bullseye'],
    [bullseye.radius, 'bullseye'],
    [bullseye.radius + 0.01, 'ring'],
    [ring.radius, 'ring'],
    [ring.radius + 0.01, null],
  ])('boostAt %f from the centre spot is %s', (d, zone) => {
    expect(boostAt(above(d))).toBe(zone)
    expect(boostAt({ x: centre.x + d, y: centre.y })).toBe(zone)
  })
})

describe('A shot coming to rest', () => {
  it.each([
    ['the Bullseye', 1.5, 'bullseye'],
    ['the Boost ring', 4, 'ring'],
    ['neither', 7, null],
  ] as const)('in %s (%f from the centre spot) leaves the ball Charged in zone %s', (_, d, zone) => {
    const r = step(resting(below(d)), {}, c)
    const charge = zone && { zone, factor: rules.boost[zone].factor }
    expect(r.state.charge).toEqual(charge)
    expect(r.events.filter((e) => e.type === 'charged')).toEqual(charge ? [{ type: 'charged', ...charge, at: below(d) }] : [])
  })
  it('Charges the ball on the opponent half too, and the opponent holds it', () => {
    // P1's shot (3 Move points left) rests on P2's half: possession passes with the charge.
    const r = step(resting(above(4)), {}, c)
    expect(r.state.possession).toMatchObject({ shooter: 2, inHand: false, live: false })
    expect(r.state.ball.pos).toEqual(above(4))
    expect(r.state.charge).toEqual({ zone: 'ring', factor: ring.factor })
  })
  it('Charges a ball that stays with the shooter, who has Move points left', () => {
    const r = step(resting(below(4), { shots: 2 }), {}, c)
    expect(r.state.possession).toMatchObject({ shooter: 1, shots: 1 })
    expect(r.state.charge).toEqual({ zone: 'ring', factor: ring.factor })
  })
  it('does not Charge a ball passing through while still moving', () => {
    const s: SimState = { ...resting(below(8)), ball: { pos: below(8), vel: { x: 0, y: -60 }, rolled: 0 } }
    let r = step(s, {}, c)
    const seen: (Charge | null)[] = [r.state.charge]
    for (let i = 0; i < 60 && r.state.possession.live; i++) seen.push((r = step(r.state, {}, c)).state.charge)
    expect(boostAt(r.state.ball.pos)).toBeNull()
    expect(seen.every((charge) => charge === null)).toBe(true)
  })
  it('loses the charge when the last Move point is spent: the opponent restarts on the centre spot, uncharged', () => {
    const r = step(resting(below(4), { shots: 1 }), {}, c)
    expect(r.state.possession).toMatchObject({ shooter: 2, shots: c.shots })
    expect(r.state.ball.pos).toEqual(centre)
    expect(r.state.charge).toBeNull()
    expect(r.events.some((e) => e.type === 'charged')).toBe(false)
  })
  it('loses the charge when the Rounds shot cap ends the round: the next kick-off is uncharged', () => {
    const s = resting(below(1), { shots: 3 })
    const r = step({ ...s, match: { ...roundsMatch(s), roundShots: c.shotCap } }, {}, c)
    expect(roundsMatch(r.state).round).toBe(2)
    expect(r.state.charge).toBeNull()
    expect(r.events.some((e) => e.type === 'charged')).toBe(false)
  })
})

describe('Restarts never Charge the ball', () => {
  it('a Centre-spot restart puts the ball in the Bullseye uncharged (second shot-clock expiry)', () => {
    const s: SimState = { ...charged(below(4), 'ring'), clock: { left: 1, expiries: 1 } }
    const r = step(s, {}, c)
    expect(r.state.ball.pos).toEqual(centre)
    expect(boostAt(r.state.ball.pos)).toBe('bullseye')
    expect(r.state.charge).toBeNull()
  })
  it('a Centre-spot restart by refunding the last Move point is uncharged', () => {
    const s: SimState = { ...charged(below(4), 'ring'), possession: { shooter: 1, shots: 1, inHand: false, live: false } }
    const r = step(s, { refund: { player: 1, count: 1 } }, c)
    expect(r.state.ball.pos).toEqual(centre)
    expect(r.state.charge).toBeNull()
  })
  it('shooting from a Centre-spot restart is not x2: the restart ball is uncharged', () => {
    const restart = step({ ...resting(below(4), { shots: 1 }) }, {}, c).state
    const r = step(restart, { shot: { player: 2, dir: { x: 0, y: -1 }, tier: 0, power: 0.4 } }, c)
    expect(r.state.ball.vel.y).toBeCloseTo(-0.4 * c.maxSpeed)
  })
  it('a shot from the restart that rests in a ring Charges the ball by where it rests', () => {
    const restart = step(resting(below(4), { shots: 1 }), {}, c).state
    const fired = step(restart, { shot: { player: 2, dir: { x: 0, y: -1 }, tier: 0, power: 0.15 } }, c).state
    expect(fired.charge).toBeNull()
    const out = step({ ...fired, ball: { pos: above(4), vel: { x: 0, y: 0 }, rolled: 0 } }, {}, c)
    expect(out.state.charge).toEqual({ zone: 'ring', factor: ring.factor })
  })
})

describe('A Charged ball', () => {
  it.each([
    ['Boost ring', 'ring'],
    ['Bullseye', 'bullseye'],
  ] as const)('multiplies the launch speed of the next shot by the %s factor, for Touch and Power', (_, zone) => {
    const { factor } = rules.boost[zone]
    for (const [tier, power] of [[0, 0.4], [1, 0.8]] as const) {
      const r = step(charged(below(1), zone), { shot: { ...up, tier, power } }, c)
      expect(r.state.ball.vel.y).toBeCloseTo(-power * c.maxSpeed * factor)
      expect(r.events).toContainEqual(expect.objectContaining({ type: 'shot-fired', charge: factor }))
    }
  })
  it('has no cap on the speed', () => {
    const r = step(charged(below(1), 'bullseye'), { shot: { ...up, tier: 1, power: 1 } }, c)
    expect(r.state.ball.vel.y).toBeCloseTo(-c.maxSpeed * bullseye.factor)
  })
  it('does not multiply the Splash', () => {
    const plain = step(charged(below(1), null), { shot: { ...up, tier: 1, power: 0.8 } }, c)
    const fromCharged = step(charged(below(1), 'bullseye'), { shot: { ...up, tier: 1, power: 0.8 } }, c)
    expect(fromCharged.events.filter((e) => e.type !== 'shot-fired')).toEqual(plain.events.filter((e) => e.type !== 'shot-fired'))
  })
  it('is spent by the shot: it flies uncharged and the plain event omits the charge', () => {
    const fired = step(charged(below(1), 'ring'), { shot: up }, c)
    expect(fired.state.charge).toBeNull()
    const plain = step(charged(below(1), null), { shot: up }, c)
    expect(plain.events.find((e) => e.type === 'shot-fired')).not.toHaveProperty('charge')
  })
  it('is used by the opponent of whoever Charged it', () => {
    const shot = step(resting(above(1), { shots: 3 }, 1), {}, c).state
    expect(shot.possession.shooter).toBe(2)
    const r = step(shot, { shot: { player: 2, dir: { x: 0, y: 1 }, tier: 0, power: 0.4 } }, c)
    expect(r.state.ball.vel.y).toBeCloseTo(0.4 * c.maxSpeed * bullseye.factor)
  })
  it('keeps the charge through a shot burned by the shot clock', () => {
    const s: SimState = { ...charged(below(4), 'ring'), clock: { left: 1, expiries: 0 } }
    const r = step(s, {}, { ...c, expiry: 'burn' })
    expect(r.events).toContainEqual({ type: 'shot-clock-expired', player: 1 })
    expect(r.state.possession).toMatchObject({ shooter: 1, shots: 2 })
    expect(r.state.ball.pos).toEqual(below(4))
    expect(r.state.charge).toEqual({ zone: 'ring', factor: ring.factor })
  })
  it('is lost when the burned shot was the last Move point: the opponent restarts on the centre spot, uncharged', () => {
    const s: SimState = { ...charged(below(4), 'ring'), possession: { shooter: 1, shots: 1, inHand: false, live: false }, clock: { left: 1, expiries: 0 } }
    const r = step(s, {}, { ...c, expiry: 'burn' })
    expect(r.events).toContainEqual({ type: 'shot-clock-expired', player: 1 })
    expect(r.state.possession).toMatchObject({ shooter: 2, shots: c.shots })
    expect(r.state.ball.pos).toEqual(centre)
    expect(r.state.charge).toBeNull()
  })
  it('is lost when the ball is handed over and placed (a Steal gives ball-in-hand)', () => {
    const s: SimState = { ...charged(below(4), 'ring'), possession: { shooter: 1, shots: 3, inHand: true, live: false } }
    const r = step(s, { placeBall: { player: 1, at: { x: 20, y: 80 } } }, c)
    expect(r.state.ball.pos).toEqual({ x: 20, y: 80 })
    expect(r.state.charge).toBeNull()
  })
  it('starts a match uncharged', () => {
    expect(playState().charge).toBeNull()
  })
})

describe('The Ghost', () => {
  it('predicts with the multiplied speed, and leaves the real charge alone', () => {
    // Friction ends a plain 0.2 Touch shot short of the side board; at x2 it reaches it.
    const shot: NonNullable<SimInput['shot']> = { player: 1, dir: { x: 1, y: 0 }, tier: 0, power: 0.2 }
    const contacts = (s: SimState) => predictPath(s, shot, defaultConfig, { maxBounces: Infinity, maxLength: Infinity }).contacts.length
    const atBullseye = charged(below(1), 'bullseye')
    expect(contacts(charged(below(1), null))).toBe(0)
    expect(contacts(atBullseye)).toBeGreaterThan(0)
    expect(atBullseye.charge).toEqual(chargeAt(below(1)))
  })
})
