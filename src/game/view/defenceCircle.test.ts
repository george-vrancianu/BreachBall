import { describe, expect, it } from 'vitest'
import { canEdit, defaultConfig as c, initialState, step, type SimState } from '../../sim/step'
import { rules } from '../../config/rules'
import { buildState, emptied, funded, hseg, siegeBuild } from '../../sim/testkit'
import type { PlayerId } from '../../sim/pitch'
import type { WallSpec } from '../../sim/wall'
import { anchorOf, defenceCircle, commit, placingOf, landedAs, movedTo, edgeScrollDy, legal, pick, rotated, snapBody, snapStart, towerAt, type BuildActions } from './defenceCircle'

const hotSeat = () => true
const menuOf = (s: SimState, viewer: PlayerId, v: Partial<Parameters<typeof defenceCircle>[2]>, a: typeof actions) => defenceCircle(s, viewer, { mine: hotSeat, ...v }, a)!
const noop = () => {}
const actions: Pick<BuildActions, 'cancel' | 'rotate' | 'remove'> = { cancel: noop, rotate: noop, remove: noop }
const wall: WallSpec = { kind: 'wall', owner: 1, ...hseg(10, 40) }
const placed = (): SimState => step(buildState(1), { placeWall: wall }, c).state
const labels = (s: SimState, v: Partial<Parameters<typeof defenceCircle>[2]>) => {
  return menuOf(s, 1, v, actions).selection?.buttons.map((b) => b.label)
}

describe('towerAt', () => {
  it('puts a tower on the cell that contains the finger', () => {
    expect(towerAt('steal', 2, { x: 20.4, y: 52.3 })).toEqual({ kind: 'tower', owner: 2, power: 'steal', at: { gx: 10, gy: 26 } })
    expect(towerAt('steal', 1, { x: 21.9, y: 81.9 })).toMatchObject({ at: { gx: 10, gy: 40 } })
  })
})

describe('snapStart', () => {
  const end = { x: 20.123, y: 80.456 }
  const s = { objects: [{ id: 1, kind: 'wall' as const, owner: 1 as const, hp: 3, a: { x: 12.123, y: 80.456 }, b: end }] }
  it('copies the nearest wall end within the radius exactly, else keeps the point', () => {
    expect(snapStart(s, 1, { x: 20.5, y: 80 }, 1)).toStrictEqual(end)
    expect(snapStart(s, 1, { x: 20.5, y: 80 }, 1)).not.toBe(end)
    expect(snapStart(s, 1, { x: 25, y: 80 }, 1)).toEqual({ x: 25, y: 80 })
  })
  it('ignores the opponent\'s wall ends, which the blind opening hides', () => {
    expect(snapStart(s, 2, { x: 20.5, y: 80 }, 1)).toEqual({ x: 20.5, y: 80 })
  })
})

describe('snapBody', () => {
  const w: WallSpec = { kind: 'wall', owner: 1, a: { x: 20.123, y: 80.456 }, b: { x: 28.123, y: 80.456 } }
  const other = (id: number, a: { x: number; y: number }, b: { x: number; y: number }, owner: 1 | 2 = 1) => ({ id, kind: 'wall' as const, owner, hp: 3, a, b })
  it('the nearest candidate wins, whichever end of the dragged wall it meets', () => {
    const far = other(2, { x: 20.6, y: 80.456 }, { x: 20.6, y: 90 })
    const near = other(3, { x: 28.3, y: 80.456 }, { x: 36, y: 80.456 })
    const snapped = snapBody(w, [far, near], undefined, 1)
    expect(snapped.b).toEqual({ x: 28.3, y: 80.456 })
    expect(snapped.a.x).toBeCloseTo(20.3, 12)
  })
  it('copies the target exactly and carries the other end by the same offset', () => {
    const target = { x: 12.5, y: 79.9 }
    const snapped = snapBody(w, [other(2, { x: 0, y: 70 }, target)], undefined, 20)
    const ends = [snapped.a, snapped.b]
    expect(ends).toContainEqual(target)
    expect(snapped.a).toEqual(target)
    expect(Math.abs(snapped.b.x - (target.x + (w.b.x - w.a.x)))).toBeLessThan(1e-12)
    expect(Math.abs(snapped.b.y - (target.y + (w.b.y - w.a.y)))).toBeLessThan(1e-12)
  })
  it('ignores the wall\'s own ends by selfId, and counts every wall without one', () => {
    const itself = { id: 1, kind: 'wall' as const, owner: 1 as const, hp: 3, a: w.a, b: w.b }
    expect(snapBody(w, [itself], 1, 1)).toBe(w)
    const nudged = other(1, { x: 20.5, y: 80.456 }, { x: 28.5, y: 80.456 })
    expect(snapBody(w, [nudged], undefined, 1).a).toEqual({ x: 20.5, y: 80.456 })
    expect(snapBody(w, [nudged], 1, 1)).toBe(w)
  })
  it('ignores the opponent\'s wall ends', () => {
    expect(snapBody(w, [other(2, { x: 20.5, y: 80.456 }, { x: 20.5, y: 90 }, 2)], undefined, 1)).toBe(w)
  })
  it('returns the wall itself when nothing is in radius', () => {
    expect(snapBody(w, [other(2, { x: 50, y: 50 }, { x: 58, y: 50 })], undefined, 1)).toBe(w)
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
  it('a new tower is illegal when its price is not affordable', () => {
    const sel = { spec: towerAt('steal', 1, { x: 20, y: 80 }), movable: true }
    expect(legal(buildState(1), sel)).toBe(true)
    expect(legal(funded(buildState(1), 1, rules.towerCost.steal), sel)).toBe(true)
    expect(legal(funded(buildState(1), 1, rules.towerCost.steal - 1), sel)).toBe(false)
  })
  it('a structure the sim no longer has is illegal', () => {
    expect(legal(buildState(1), { spec: wall, id: 99, movable: true })).toBe(false)
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
  it('commit places a new piece or moves a structure; nothing for an older one', () => {
    expect(commit({ spec: wall, movable: true })).toEqual({ placeWall: wall })
    expect(commit({ spec: rotated({ spec: wall, movable: true }).spec, id: 1, movable: true })).toEqual({ moveStructure: { player: 1, id: 1, a: wall.a, b: expect.objectContaining({ x: expect.closeTo(wall.a.x + 8 * Math.SQRT1_2), y: expect.closeTo(wall.a.y + 8 * Math.SQRT1_2) }) } })
    expect(commit({ spec: wall, id: 1, movable: false })).toBeUndefined()
  })
})

describe('Defence circle', () => {
  it('not building: four items, none pressed, Cannon soon, available on the build turn', () => {
    const m = menuOf(buildState(1), 1, {}, actions)
    expect(m).toMatchObject({ building: false, available: true })
    expect(m.item).toBeUndefined()
    expect(m.selection).toBeUndefined()
    expect(m.items.map((i) => [i.label, i.disabled, i.pressed])).toEqual([['Wall · 2/unit', false, false], ['Repulsor · 3', false, false], ['Steal · 2', false, false], ['Cannon', true, false]])
    expect(m.items[3]!.soon).toBe(true)
  })
  it('building: the armed item is pressed; a tower the builder cannot afford is disabled', () => {
    const m = menuOf(funded(buildState(1), 1, rules.towerCost.steal), 1, { item: 'steal' }, actions)
    expect(m).toMatchObject({ building: true, item: 'steal' })
    expect(m.items.map((i) => [i.item, i.pressed, i.disabled])).toEqual([['wall', false, false], ['repulsor', false, true], ['steal', true, false], ['cannon', false, true]])
  })
  it('everything but the soon item is disabled with no Credits', () => {
    expect(menuOf(funded(buildState(1), 1, 0), 1, {}, actions).items.map((i) => i.disabled)).toEqual([true, true, true, true])
  })
  it('Siege towers read their bare name and grey on stock, not Credits', () => {
    const s = siegeBuild(1)
    const stock = emptied(s, 1, 'steal')
    expect(menuOf(funded(stock, 1, 0), 1, {}, actions).items.map((i) => [i.label, i.disabled])).toEqual([['Wall · 2/unit', true], ['Repulsor', false], ['Steal', true], ['Cannon', true]])
  })
  it('is absent in play, when no build turn is running', () => {
    expect(defenceCircle(funded(buildState(1), 1, 0), 1, { mine: hotSeat }, actions)).toBeDefined()
    expect(defenceCircle({ ...buildState(1), match: { ...buildState(1).match, builder: null } }, 1, { mine: hotSeat }, actions)).toBeUndefined()
  })
  it('is unavailable to the other player, and while blocked', () => {
    expect(menuOf(buildState(1), 2, {}, actions).available).toBe(false)
    expect(menuOf(buildState(1), 1, { blocked: true }, actions).available).toBe(false)
  })
  it('is unavailable, with no selection controls, when this device does not play the builder (online)', () => {
    const m = menuOf(placed(), 1, { mine: (p) => p === 2, selection: { spec: wall, id: 1, movable: true } }, actions)
    expect(m.available).toBe(false)
    expect(m.selection).toBeUndefined()
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

describe('placingOf', () => {
  it('names the item of a piece the sim does not hold yet, and nothing for a placed one', () => {
    expect(placingOf({ spec: wall, movable: true })).toBe('wall')
    expect(placingOf({ spec: towerAt('repulsor', 1, { x: 20, y: 80 }), movable: true })).toBe('repulsor')
    expect(placingOf({ spec: wall, id: 1, movable: true })).toBeUndefined()
    expect(placingOf(undefined)).toBeUndefined()
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
  it('is unavailable when nothing is selected, and has no demolish once a piece is', () => {
    expect(menuOf(s, 1, {}, actions)).toMatchObject({ available: false, building: false })
    const sel = pick(s, 1, { x: 21, y: 80.5 }, 1)!
    expect(sel.movable).toBe(true)
    expect(labels(s, { selection: sel })).toEqual(['↻', '✕'])
  })
})
