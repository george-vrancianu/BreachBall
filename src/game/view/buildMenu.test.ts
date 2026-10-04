import { describe, expect, it } from 'vitest'
import { canEdit, defaultConfig as c, initialState, step, type SimState } from '../../sim/step'
import { buildState, emptied, hseg } from '../../sim/testkit'
import type { WallSpec } from '../../sim/wall'
import { anchorOf, buildMenu, commit, landedAs, movedTo, edgeScrollDy, legal, pick, rotated, snapStart, towerAt, type BuildActions } from './buildMenu'

const noop = () => {}
const actions: BuildActions = { toggle: noop, arm: noop, cancel: noop, rotate: noop, remove: noop }
const wall: WallSpec = { kind: 'wall', owner: 1, ...hseg(10, 40) }
const placed = (): SimState => step(buildState(1), { placeWall: wall }, c).state
const labels = (s: SimState, v: Parameters<typeof buildMenu>[2]) => {
  const m = buildMenu(s, 1, v, actions)!
  return m.kind === 'menu' ? m.items.map((i) => i.label) : m.buttons.map((b) => b.label)
}

describe('towerAt', () => {
  it('puts a tower on the cell that contains the finger', () => {
    expect(towerAt('steal', 2, { x: 20.4, y: 52.3 })).toEqual({ kind: 'tower', owner: 2, power: 'steal', at: { gx: 10, gy: 26 } })
    expect(towerAt('steal', 1, { x: 21.9, y: 81.9 })).toMatchObject({ at: { gx: 10, gy: 40 } })
  })
})

describe('snapStart', () => {
  const end = { x: 20.123, y: 80.456 }
  const s = { objects: [{ id: 1, kind: 'wall' as const, owner: 2 as const, hp: 3, a: { x: 12.123, y: 80.456 }, b: end }] }
  it('copies the nearest wall end within the radius exactly, else keeps the point', () => {
    expect(snapStart(s, { x: 20.5, y: 80 }, 1)).toStrictEqual(end)
    expect(snapStart(s, { x: 20.5, y: 80 }, 1)).not.toBe(end)
    expect(snapStart(s, { x: 25, y: 80 }, 1)).toEqual({ x: 25, y: 80 })
  })
})

describe('dragging', () => {
  it('slides a wall freely, both ends together, and snaps a tower to the grid', () => {
    expect(movedTo(wall, { x: 21.3, y: 81.7 })).toEqual({ ...wall, a: { x: 21.3, y: 81.7 }, b: { x: 29.3, y: 81.7 } })
    expect(anchorOf(wall)).toEqual(wall.a)
    const t = towerAt('steal', 1, { x: 20, y: 80 })
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
  it('a new tower is illegal with no stock', () => {
    const sel = { spec: towerAt('steal', 1, { x: 20, y: 80 }), movable: true }
    expect(legal(buildState(1), sel)).toBe(true)
    expect(legal(emptied(buildState(1), 1, 'steal'), sel)).toBe(false)
  })
  it('moving is free; a new piece must be affordable', () => {
    const s = { ...placed(), credits: { 1: 0, 2: 0 } }
    const spec = { ...wall, ...hseg(4, 40) }
    expect(legal(s, { spec, id: 1, movable: true })).toBe(true)
    expect(legal(s, { spec, movable: true })).toBe(false)
  })
  it('a moved wall may not change length when the turn only rearranges, and must be affordable otherwise', () => {
    const longer = { ...wall, ...hseg(10, 40, 2) }
    const s = placed()
    expect(legal(s, { spec: longer, id: 1, movable: true })).toBe(true)
    expect(legal({ ...s, credits: { 1: 1, 2: 1 } }, { spec: longer, id: 1, movable: true })).toBe(false)
    const siege = { ...c, mode: 'siege' as const }
    const base = initialState(1, siege)
    const rearrange = { ...base, match: { ...base.match, builder: 1, opening: false } as SimState['match'], objects: s.objects, built: s.built }
    expect(canEdit(rearrange)).toBe(false)
    expect(legal(rearrange, { spec: longer, id: 1, movable: true })).toBe(false)
    expect(legal(rearrange, { spec: { ...wall, ...hseg(4, 40) }, id: 1, movable: true })).toBe(true)
  })
  it('✓ places a new piece or moves a structure; nothing for an older one', () => {
    expect(commit({ spec: wall, movable: true })).toEqual({ placeWall: wall })
    expect(commit({ spec: rotated({ spec: wall, movable: true }).spec, id: 1, movable: true })).toEqual({ moveStructure: { player: 1, id: 1, a: wall.a, b: expect.objectContaining({ x: expect.closeTo(wall.a.x + 8 * Math.SQRT1_2), y: expect.closeTo(wall.a.y + 8 * Math.SQRT1_2) }) } })
    expect(commit({ spec: wall, id: 1, movable: false })).toBeUndefined()
  })
})

describe('build menu', () => {
  it('lists pieces with costs and stock when nothing is selected', () => {
    expect(labels(buildState(1), { item: 'wall' })).toEqual(['Wall · 2/unit', 'Repulsor ×3', 'Steal ×3'])
  })
  it('a new wall gets Rotate and cancel; a new tower only cancel', () => {
    expect(labels(buildState(1), { selection: { spec: wall, movable: true } })).toEqual(['↻', '✕'])
    expect(labels(buildState(1), { selection: { spec: towerAt('steal', 1, { x: 20, y: 80 }), movable: true } })).toEqual(['✕'])
  })
  it('a placed structure also gets the bin; an older one only bin and cancel', () => {
    expect(labels(placed(), { selection: { spec: wall, id: 1, movable: true } })).toEqual(['🗑', '↻', '✕'])
    expect(labels(placed(), { selection: { spec: wall, id: 1, movable: false } })).toEqual(['🗑', '✕'])
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
    expect(!!landedAs(buildState(1), { spec: wall, movable: true })).toBe(false)
    expect(!!landedAs(s, { spec: wall, movable: true })).toBe(true)
    expect(!!landedAs({ ...s, built: [] }, { spec: wall, movable: true })).toBe(false)
    const moved = { spec: { ...wall, ...hseg(4, 40) }, id: 1, movable: true }
    expect(!!landedAs(s, moved)).toBe(false)
    expect(!!landedAs(step(s, { moveStructure: { player: 1, id: 1, a: moved.spec.a, b: moved.spec.b } }, c).state, moved)).toBe(true)
    expect(!!landedAs(s, rotated({ spec: wall, id: 1, movable: true }))).toBe(false)
  })
})

describe('rearrange turn', () => {
  const siege = { ...c, mode: 'siege' as const }
  const base = initialState(1, siege)
  const s: SimState = { ...base, match: { ...base.match, builder: 1, opening: false } as SimState['match'], objects: [{ ...wall, id: 1, hp: 2 }], built: [1], credits: { 1: 0, 2: 0 } }
  it('has no palette when nothing is selected, and no demolish once a piece is', () => {
    expect(buildMenu(s, 1, { item: 'wall' }, actions)).toBeUndefined()
    const sel = pick(s, 1, { x: 21, y: 80.5 }, 1)!
    expect(sel.movable).toBe(true)
    expect(labels(s, { selection: sel })).toEqual(['↻', '✕'])
  })
})
