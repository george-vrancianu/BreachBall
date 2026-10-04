import { describe, expect, it } from 'vitest'
import { defaultConfig, initialState, step, type SimState } from '../../sim/step'
import { firstBuilder } from '../../sim/match'
import { opponent } from '../../sim/possession'
import type { TowerSpec, WallSpec } from '../../sim/wall'
import { playState, hseg } from '../../sim/testkit'
import { hudModel } from './hudModel'

const view = { active: 1 as const, viewer: 1 as const }

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
  describe('Defence bar', () => {
    const w = (owner: 1 | 2): WallSpec => ({ kind: 'wall', owner, ...hseg(10, owner === 1 ? 40 : 10) })
    it('counts structures in Rounds as well as Siege, not the score', () => {
      const s = { ...initialState(1), objects: [{ ...w(1), id: 1, hp: 3 }, { ...w(1), id: 2, hp: 1 }, { ...w(2), id: 3, hp: 3 }] }
      const bar = hudModel(s, defaultConfig, view).defenceBar
      expect([bar[1].count, bar[2].count]).toEqual(['2', '1'])
    })
    it('keeps an empty segment for a structure destroyed in play', () => {
      const bar = hudModel(initialState(1), defaultConfig, { ...view, destroyed: { 1: 2, 2: 0 } }).defenceBar
      expect(bar[1]).toEqual({ count: '0', segments: [false, false] })
    })
  })
  describe('Resource bar', () => {
    it('shows the banked Credits split in Rounds and is hidden in Siege', () => {
      const s = { ...initialState(1), credits: { 1: 3, 2: 1 } }
      expect(hudModel(s, defaultConfig, view).resourceBar?.[1].share).toBe(0.75)
      const c = { ...defaultConfig, mode: 'siege' as const }
      expect(hudModel(initialState(1, c), c, view).resourceBar).toBeNull()
    })
  })
  describe('score line', () => {
    it('Rounds gives the score once, the active player first', () => {
      const s = { ...initialState(1), match: { ...initialState(1).match, score: { 1: 2, 2: 1 } } }
      expect(hudModel(s, defaultConfig, view).score).toBe('2–1')
      expect(hudModel(s, defaultConfig, { ...view, active: 2 }).score).toBe('1–2')
    })
    it('Siege has none', () => {
      const c = { ...defaultConfig, mode: 'siege' as const }
      expect(hudModel(initialState(1, c), c, view).score).toBeNull()
    })
  })
  describe('phase label', () => {
    const play = () => {
      const s = playState()
      return { ...s, possession: { ...s.possession, inHand: false, shots: defaultConfig.shots } }
    }
    it('reads Play phase, with the aim hint in round 1 until the first shot of the possession', () => {
      const s = play()
      expect(s.match.mode === 'rounds' && s.match.round).toBe(1)
      expect(hudModel(s, defaultConfig, view).phase).toBe('Play phase · Drag to aim')
      expect(hudModel({ ...s, possession: { ...s.possession, shots: defaultConfig.shots - 1 } }, defaultConfig, view).phase).toBe('Play phase')
      expect(hudModel({ ...s, possession: { ...s.possession, live: true } }, defaultConfig, view).phase).toBe('Play phase')
    })
    it('has no hint in ball-in-hand, after round 1 or in Siege', () => {
      const s = play()
      expect(hudModel({ ...s, possession: { ...s.possession, inHand: true } }, defaultConfig, view).phase).toBe('Play phase')
      expect(hudModel({ ...s, match: { ...s.match, round: 2 } as typeof s.match }, defaultConfig, view).phase).toBe('Play phase')
      const c = { ...defaultConfig, mode: 'siege' as const }
      const sieged = { ...s, match: { mode: 'siege' as const, seed: 1, winner: null, builder: null, choosing: null, opening: false } }
      expect(hudModel(sieged, c, view).phase).toBe('Play phase')
    })
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
    it('puts "?" on the Defence bar for the opponent too, until play starts', () => {
      const s = afterFirst()
      const bar = hudModel(s, c, { ...view, viewer: second, destroyed: { 1: 5, 2: 5 } }).defenceBar
      expect(bar[first]).toEqual({ count: '?', segments: [] })
      expect(bar[second].count).toBe('0')
      expect(hudModel(afterSecond(), c, { ...view, viewer: second }).defenceBar[first].count).toBe('2')
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
      expect(hudModel(s, c, { ...view, viewer: first }).players[first].inventory!.steal).toBe(2)
      expect(hudModel(afterSecond(), c, { ...view, viewer: second }).players[first].inventory!.steal).toBe(2)
    })
    it('reads Build phase for both viewers, so the label gives nothing of a blind build away', () => {
      const s = build(afterFirst(), piece(second))
      expect(hudModel(s, c, { ...view, viewer: second }).phase).toBe('Build phase')
      expect(hudModel(s, c, { ...view, viewer: first }).phase).toBe('Build phase')
    })
    it('Rounds build phases keep the score and the Credits, and show no tower stock badges', () => {
      let s = initialState(1)
      const b = s.match.builder!
      s = step(s, { placeWall: { kind: 'tower', owner: b, power: 'steal', at: { gx: 4, gy: b === 1 ? 40 : 10 } } }, defaultConfig).state
      const m = hudModel(s, defaultConfig, { ...view, viewer: opponent(b) })
      expect([m.players[1].digit, m.players[2].digit]).toEqual(['0', '0'])
      expect(m.players[b].inventory).toBeNull()
      expect(m.phase).toBe('Build phase')
    })
    it('reads Placing … while the builder draws or holds an unplaced piece, else Build phase', () => {
      const s = initialState(1)
      const b = s.match.builder!
      const phase = (placing?: 'wall' | 'repulsor' | 'steal') => hudModel(s, defaultConfig, { ...view, viewer: b, placing }).phase
      expect(phase('wall')).toBe('Placing wall')
      expect(phase('repulsor')).toBe('Placing Repulsor')
      expect(phase('steal')).toBe('Placing Steal')
      expect(phase()).toBe('Build phase')
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
  describe('dock', () => {
    const siege = { ...defaultConfig, mode: 'siege' as const }
    it('is the build dock in a build turn that places pieces, and play once the build is done', () => {
      expect(hudModel(initialState(1), defaultConfig, view).dock).toBe('build')
      expect(hudModel(playState(), defaultConfig, view).dock).toBe('play')
    })
    it('is the rearrange dock in a Siege Rearrange turn, and the choice dock while a defence choice is owed', () => {
      const s = initialState(1, siege)
      const rearrange = { ...s, match: { mode: 'siege' as const, seed: 1, winner: null, builder: 1 as const, choosing: null, opening: false } }
      const choosing = { ...s, match: { mode: 'siege' as const, seed: 1, winner: null, builder: null, choosing: 1 as const, opening: false } }
      expect(hudModel(rearrange, siege, view).dock).toBe('rearrange')
      expect(hudModel(choosing, siege, view).dock).toBe('choice')
    })
    it('shows the active player\'s Credits in Rounds, wall points in a Siege opening build, and no balance in Siege play', () => {
      const s = { ...playState(), credits: { 1: 7, 2: 4 } }
      expect(hudModel(s, defaultConfig, view).balance).toEqual({ amount: 7, unit: 'CR' })
      expect(hudModel(s, defaultConfig, { ...view, active: 2 }).balance).toEqual({ amount: 4, unit: 'CR' })
      const opening = initialState(1, siege)
      expect(hudModel(opening, siege, { ...view, active: opening.match.builder! }).balance).toMatchObject({ unit: 'PTS' })
      const play = { ...opening, match: { mode: 'siege' as const, seed: 1, winner: null, builder: null, choosing: null, opening: false } }
      expect(hudModel(play, siege, view).balance).toBeNull()
    })
    it('shows the amount the state holds for the active player, never the opponent\'s, in both modes', () => {
      const s = { ...playState(), credits: { 1: 14, 2: 99 } }
      expect(hudModel(s, defaultConfig, view).balance?.amount).toBe(14)
      const opening = initialState(1, siege)
      const builder = opening.match.builder!
      const funded = { ...opening, credits: { ...opening.credits, [builder]: 14 } }
      expect(hudModel(funded, siege, { ...view, active: builder }).balance).toEqual({ amount: 14, unit: 'PTS' })
    })
    it('gives the refund rate where refunds exist, none in Siege', () => {
      expect(hudModel(playState(), { ...defaultConfig, refundRate: 4 }, view).refundRate).toBe(4)
      const s = initialState(1, siege)
      expect(hudModel({ ...s, match: { mode: 'siege' as const, seed: 1, winner: null, builder: null, choosing: null, opening: false } }, siege, view).refundRate).toBeNull()
    })
  })
})
