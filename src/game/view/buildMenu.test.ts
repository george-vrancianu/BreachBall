import { describe, expect, it } from 'vitest'
import { defaultConfig as c, initialState, step, type SimState } from '../../sim/step'
import { buildState, hseg } from '../../sim/testkit'
import type { WallSpec } from '../../sim/wall'
import { anchorOf, buildMenu, commit, landed, movedTo, edgeScrollDy, legal, pick, rotated, spawn, type BuildActions } from './buildMenu'

const noop = () => {}
const actions: BuildActions = { toggle: noop, spawn: noop, confirm: noop, cancel: noop, rotate: noop, remove: noop }
const wall: WallSpec = { kind: 'wall', owner: 1, ...hseg(10, 40) }
const placed = (): SimState => step(buildState(1), { placeWall: wall }, c).state
const labels = (s: SimState, v: Parameters<typeof buildMenu>[2]) => {
  const m = buildMenu(s, 1, v, actions)!
  return m.kind === 'menu' ? m.items.map((i) => i.label) : m.buttons.map((b) => b.label)
}

describe('spawn', () => {
  it('lands at the view centre, clamped to the owner\'s half', () => {
    expect(spawn('wall', 1, 80).spec).toEqual({ kind: 'wall', owner: 1, ...hseg(10, 40) })
    expect(spawn('wall', 1, 10).spec).toMatchObject({ a: { y: 54 }, b: { y: 54 } })
    expect(spawn('steal', 2, 100).spec).toEqual({ kind: 'tower', owner: 2, power: 'steal', at: { gx: 10, gy: 26 } })
  })
})

describe('dragging', () => {
  it('slides a wall freely, both ends together, and snaps a tower to the grid', () => {
    expect(movedTo(wall, { x: 21.3, y: 81.7 })).toEqual({ ...wall, a: { x: 21.3, y: 81.7 }, b: { x: 29.3, y: 81.7 } })
    expect(anchorOf(wall)).toEqual(wall.a)
    const t = spawn('steal', 1, 80).spec
    expect(movedTo(t, { x: 21.3, y: 81.7 })).toMatchObject({ at: { gx: 11, gy: 41 } })
    expect(anchorOf(t)).toEqual({ x: 20, y: 80 })
  })
})

describe('pick', () => {
  it('selects this turn\'s structure as movable, an older one as not, and misses beyond the tolerance', () => {
    const s = placed()
    expect(pick(s, 1, { x: 21, y: 80.5 }, 1)).toEqual({ spec: wall, id: 1, movable: true })
    expect(pick({ ...s, built: [] }, 1, { x: 21, y: 80.5 }, 1)?.movable).toBe(false)
    expect(pick(s, 1, { x: 21, y: 83 }, 1)).toBeUndefined()
    expect(pick(s, 2, { x: 21, y: 80.5 }, 1)).toBeUndefined()
  })
})

describe('selection', () => {
  it('moving is free; a new piece must be affordable', () => {
    const s = { ...placed(), credits: { 1: 0, 2: 0 } }
    const spec = { ...wall, ...hseg(4, 40) }
    expect(legal(s, { spec, id: 1, movable: true })).toBe(true)
    expect(legal(s, { spec, movable: true })).toBe(false)
  })
  it('✓ places a new piece or moves a structure; nothing for an older one', () => {
    expect(commit({ spec: wall, movable: true })).toEqual({ placeWall: wall })
    expect(commit({ spec: rotated({ spec: wall, movable: true }).spec, id: 1, movable: true })).toEqual({ moveStructure: { player: 1, id: 1, a: wall.a, b: expect.objectContaining({ x: expect.closeTo(wall.a.x + 8 * Math.SQRT1_2), y: expect.closeTo(wall.a.y + 8 * Math.SQRT1_2) }) } })
    expect(commit({ spec: wall, id: 1, movable: false })).toBeUndefined()
  })
})

describe('build menu', () => {
  it('lists pieces with costs and stock when nothing is selected', () => {
    expect(labels(buildState(1), { open: true })).toEqual(['Wall · 2/unit', 'Repulsor ×3', 'Steal ×3'])
  })
  it('a new wall gets Rotate, cancel and confirm; a new tower no Rotate', () => {
    expect(labels(buildState(1), { open: false, selection: { spec: wall, movable: true } })).toEqual(['↻', '✕', '✓'])
    expect(labels(buildState(1), { open: false, selection: spawn('steal', 1, 80) })).toEqual(['✕', '✓'])
  })
  it('a placed structure also gets the bin; an older one only bin and cancel', () => {
    expect(labels(placed(), { open: false, selection: { spec: wall, id: 1, movable: true } })).toEqual(['🗑', '↻', '✕', '✓'])
    expect(labels(placed(), { open: false, selection: { spec: wall, id: 1, movable: false } })).toEqual(['🗑', '✕'])
  })
})

describe('edge scroll', () => {
  // A 30-high view; builder 1 owns y 54..108, builder 2 y 0..54. The edge band is the outer tenth (3).
  it('does nothing in the middle of the view', () => {
    expect(edgeScrollDy(70, 30, 1, 70, 0.1)).toBe(0)
  })
  it('scrolls toward the off-screen part of the builder\'s half', () => {
    expect(edgeScrollDy(70, 30, 1, 84, 0.1)).toBeGreaterThan(0)
    expect(edgeScrollDy(40, 30, 2, 26, 0.1)).toBeLessThan(0)
  })
  it('never scrolls past the half\'s edge', () => {
    expect(edgeScrollDy(90, 30, 1, 104, 10)).toBe(3)
    expect(edgeScrollDy(30, 30, 2, 16, 10)).toBe(-15)
  })
  it('does nothing when that edge of the half is already in view', () => {
    expect(edgeScrollDy(69, 30, 1, 55, 0.1)).toBe(0)
    expect(edgeScrollDy(93, 30, 1, 107, 0.1)).toBe(0)
  })
})

describe('landing', () => {
  it('a new piece lands once it stands among this turn\'s, a move once it stands where it was put', () => {
    const s = placed()
    expect(landed(buildState(1), { spec: wall, movable: true })).toBe(false)
    expect(landed(s, { spec: wall, movable: true })).toBe(true)
    expect(landed({ ...s, built: [] }, { spec: wall, movable: true })).toBe(false)
    const moved = { spec: { ...wall, ...hseg(4, 40) }, id: 1, movable: true }
    expect(landed(s, moved)).toBe(false)
    expect(landed(step(s, { moveStructure: { player: 1, id: 1, a: moved.spec.a, b: moved.spec.b } }, c).state, moved)).toBe(true)
    expect(landed(s, rotated({ spec: wall, id: 1, movable: true }))).toBe(false)
  })
  it('✓ waits while a confirmed piece is landing', () => {
    const m = buildMenu(buildState(1), 1, { open: false, selection: { spec: wall, movable: true }, landing: true }, actions)!
    expect(m.kind === 'selected' && m.buttons.find((b) => b.label === '✓')?.disabled).toBe(true)
  })
})

describe('rearrange turn', () => {
  const siege = { ...c, mode: 'siege' as const }
  const base = initialState(1, siege)
  const s: SimState = { ...base, match: { ...base.match, builder: 1, opening: false } as SimState['match'], objects: [{ ...wall, id: 1, hp: 2 }], built: [1], credits: { 1: 0, 2: 0 } }
  it('has no palette when nothing is selected, and no demolish once a piece is', () => {
    expect(buildMenu(s, 1, { open: true }, actions)).toBeUndefined()
    const sel = pick(s, 1, { x: 21, y: 80.5 }, 1)!
    expect(sel.movable).toBe(true)
    expect(labels(s, { open: false, selection: sel })).toEqual(['↻', '✕', '✓'])
  })
})
