import { describe, expect, it } from 'vitest'
import { defaultConfig, initialState, step, type SimState } from '../../sim/step'
import { firstBuilder } from '../../sim/match'
import { opponent } from '../../sim/possession'
import type { TowerSpec, WallSpec } from '../../sim/wall'
import { playState, hseg } from '../../sim/testkit'
import { hudModel } from './hudModel'

const view = { active: 1 as const, viewer: 1 as const, armed: false, tappable: false }

describe('hudModel', () => {
  it('Rounds shows the score digit and the round label', () => {
    const m = hudModel(initialState(1), defaultConfig, view)
    expect(m.players[1].digit).toBe('0')
    expect(m.round).toBe(1)
  })
  it('Siege shows no round label', () => {
    const c = { ...defaultConfig, mode: 'siege' as const }
    const m = hudModel(initialState(1, c), c, view)
    expect(m.round).toBeNull()
  })
  describe('Move point dots', () => {
    const placed = (): SimState => {
      const s = playState()
      return { ...s, possession: { ...s.possession, inHand: false } }
    }
    it('are refundable for the shooter with the ball placed and no shot in flight', () => {
      const s = placed()
      const shooter = s.possession.shooter
      expect(hudModel(s, defaultConfig, { ...view, active: shooter }).refundable).toBe(true)
    })
    it('are not refundable for the other seat, in ball-in-hand, mid-shot or in Siege', () => {
      const s = placed()
      const shooter = s.possession.shooter
      const siege = { ...defaultConfig, mode: 'siege' as const }
      expect(hudModel(s, defaultConfig, { ...view, active: opponent(shooter) }).refundable).toBe(false)
      expect(hudModel({ ...s, possession: { ...s.possession, inHand: true } }, defaultConfig, { ...view, active: shooter }).refundable).toBe(false)
      expect(hudModel({ ...s, possession: { ...s.possession, live: true } }, defaultConfig, { ...view, active: shooter }).refundable).toBe(false)
      const sieged = { ...s, match: { mode: 'siege' as const, seed: 1, winner: null, builder: null, choosing: null, opening: false } }
      expect(hudModel(sieged, siege, { ...view, active: shooter }).refundable).toBe(false)
    })
  })
  describe('blind opening build', () => {
    const c = { ...defaultConfig, mode: 'siege' as const }
    const piece = (owner: 1 | 2): WallSpec => ({ kind: 'wall', owner, ...hseg(10, owner === 1 ? 40 : 10) })
    const steal = (owner: 1 | 2): TowerSpec => ({ kind: 'tower', owner, power: 'steal', at: { gx: 4, gy: owner === 1 ? 40 : 10 } })
    /** Drives the opening: the builder places a wall and a Steal tower (or just a wall). */
    const build = (s: SimState, spec: WallSpec | TowerSpec) => step(s, { placeWall: spec }, c).state
    const done = (s: SimState) => step(s, { done: s.match.builder! }, c).state
    const first = firstBuilder(1, 1)
    const second = opponent(first)
    const afterFirst = () => done(build(build(initialState(1, c), piece(first)), steal(first)))
    const afterSecond = () => done(build(afterFirst(), piece(second)))
    const digits = (s: SimState, viewer: 1 | 2, active: 1 | 2 = viewer) => {
      const m = hudModel(s, c, { ...view, active, viewer })
      return [m.players[1].digit, m.players[2].digit]
    }

    it('shows "?" for the viewer\'s opponent while a build is on, and the viewer\'s own count', () => {
      const s = afterFirst()
      expect(s.match.builder).toBe(second)
      expect(digits(s, second)).toEqual(second === 1 ? ['0', '?'] : ['?', '0'])
      expect(digits(s, first)).toEqual(first === 1 ? ['2', '?'] : ['?', '2'])
    })
    it('is decided by the viewer, not by whose strip is shown', () => {
      expect(digits(afterFirst(), first, second)).toEqual(first === 1 ? ['2', '?'] : ['?', '2'])
    })
    it('shows the number once the second Done starts play', () => {
      const s = afterSecond()
      expect(s.match.builder).toBeNull()
      expect(digits(s, 1)[first - 1]).toBe('2')
      expect(digits(s, 1)[second - 1]).toBe('1')
    })
    it('does not reveal the opponent\'s towers through their inventory badges', () => {
      const s = afterFirst()
      expect(s.players[first].inventory.steal).toBe(2)
      const m = hudModel(s, c, { ...view, viewer: second })
      expect(m.players[first].inventory).toEqual({ breaker: 3, repulsor: 3, steal: 3 })
      expect(hudModel(s, c, { ...view, viewer: first }).players[first].inventory.steal).toBe(2)
      expect(hudModel(afterSecond(), c, { ...view, viewer: second }).players[first].inventory.steal).toBe(2)
    })
    it('shows build points only for the viewer\'s own build', () => {
      const s = build(afterFirst(), piece(second))
      expect(hudModel(s, c, { ...view, viewer: second }).phase).toMatch(/^Build · \d+ pts$/)
      expect(hudModel(s, c, { ...view, viewer: first }).phase).toBe('Build')
    })
    it('Rounds build phases keep the score, the badges and the Credits', () => {
      let s = initialState(1)
      const b = s.match.builder!
      s = step(s, { placeWall: { kind: 'tower', owner: b, power: 'steal', at: { gx: 4, gy: b === 1 ? 40 : 10 } } }, defaultConfig).state
      const m = hudModel(s, defaultConfig, { ...view, viewer: opponent(b) })
      expect([m.players[1].digit, m.players[2].digit]).toEqual(['0', '0'])
      expect(m.players[b].inventory.steal).toBe(2)
      expect(m.phase).toBe('Build · 10 credits')
    })
    it('reads Placing … while the builder draws or holds an unplaced piece, else the Credits', () => {
      const s = initialState(1)
      const b = s.match.builder!
      const phase = (placing?: 'wall' | 'repulsor' | 'steal') => hudModel(s, defaultConfig, { ...view, viewer: b, placing }).phase
      expect(phase('wall')).toBe('Placing wall')
      expect(phase('repulsor')).toBe('Placing Repulsor')
      expect(phase('steal')).toBe('Placing Steal')
      expect(phase()).toBe('Build · 10 credits')
    })
  })
  it('Siege exposes each owner\'s structure count, towers included', () => {
    const c = { ...defaultConfig, mode: 'siege' as const }
    let s = initialState(1, c)
    expect(hudModel(s, c, view).players[1].digit).toBe('0')
    const wall = (id: number, owner: 1 | 2) => ({ id, hp: 3, kind: 'wall' as const, owner, ...hseg(2, id) })
    const tower = { id: 3, hp: 1, kind: 'tower' as const, owner: 1 as const, at: { gx: 8, gy: 22 }, power: 'repulsor' as const }
    s = { ...s, objects: [wall(1, 1), tower, wall(2, 2)], match: { ...s.match, builder: null } }
    const m = hudModel(s, c, view)
    expect([m.players[1].digit, m.players[2].digit]).toEqual(['2', '1'])
    s = { ...s, objects: s.objects.filter((o) => o.kind !== 'tower') }
    expect(hudModel(s, c, view).players[1].digit).toBe('1')
    expect(hudModel(initialState(1), defaultConfig, view).players[1].digit).toBe('0')
  })
  it('Siege count falls when the opponent\'s ball triggers a Steal tower', () => {
    const c = { ...defaultConfig, mode: 'siege' as const }
    const s0 = initialState(1, c)
    const tower = { id: 1, hp: 1, kind: 'tower' as const, owner: 1 as const, power: 'steal' as const, at: { gx: 10, gy: 40 } }
    // The tower spans x 20..22, y 80..82; P2's ball rolls in from the left.
    let s: SimState = { ...s0, nextId: 2, objects: [tower], match: { ...s0.match, builder: null }, ball: { ...s0.ball, pos: { x: 15, y: 81 }, vel: { x: 30, y: 0 } }, possession: { shooter: 2 as const, shots: 2, inHand: false, live: true } }
    expect(hudModel(s, c, view).players[1].digit).toBe('1')
    for (let i = 0; i < 30; i++) s = step(s, {}, c).state
    expect(hudModel(s, c, view).players[1].digit).toBe('0')
  })
})
