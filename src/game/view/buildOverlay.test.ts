import { describe, expect, it } from 'vitest'
import { defaultConfig as c, playCost, step, type SimState } from '../../sim/step'
import { buildState, hseg, playState } from '../../sim/testkit'
import { structureCost, type StructureSpec, type TowerSpec, type WallSpec } from '../../sim/wall'
import { buildOverlay, noOverlay, type OverlayBuildPiece } from './buildOverlay'
import type { Selection } from './defenceCircle'

const wall: WallSpec = { kind: 'wall', owner: 1, ...hseg(10, 40) }
const tower: TowerSpec = { kind: 'tower', owner: 1, power: 'repulsor', at: { gx: 10, gy: 44 } }
/** Player 1's build turn with `spec` placed this turn: its id is movable. */
const placed = (spec: StructureSpec = wall): { s: SimState; id: number } => {
  const s = step(buildState(1), { placeWall: spec }, c).state
  return { s, id: s.objects[0].id }
}
const of = (s: SimState, selection?: Selection, landing?: Selection, mapOpen = false) => buildOverlay(s, { selection, landing, mapOpen })

describe('buildOverlay', () => {
  it('a selected movable wall is the build piece, with handles on its two ends and its id hidden', () => {
    const { s, id } = placed()
    const o = of(s, { spec: wall, id, movable: true })
    expect(o.piece).toMatchObject({ spec: wall, id, handles: { a: wall.a, b: wall.b }, blocked: false })
    expect(o.hidden).toEqual([id])
    expect(o.selected).toBeUndefined()
  })

  it('a selected tower is the build piece with no handles', () => {
    const { s, id } = placed(tower)
    expect(of(s, { spec: tower, id, movable: true }).piece?.handles).toBeUndefined()
    // The type keeps handles and a Credit cost on a Wall's branch: a tower piece cannot carry them.
    // @ts-expect-error a tower build piece has no handles
    const bad: OverlayBuildPiece = { spec: tower, blocked: false, handles: { a: wall.a, b: wall.b } }
    expect(bad.spec.kind).toBe('tower')
  })

  it('an older wall (not movable) is only selected: no build piece, no handles, nothing hidden', () => {
    const { s, id } = placed()
    const o = of({ ...s, built: [] }, { spec: wall, id, movable: false })
    expect([o.piece, o.selected, o.hidden, o.movable]).toEqual([undefined, id, [], []])
  })

  it('shows nothing with the Map view open, not even the movable outlines', () => {
    const { s, id } = placed()
    expect(of(s, { spec: wall, id, movable: true }, { spec: wall, id, movable: true }, true)).toBe(noOverlay)
    expect(noOverlay).toEqual({ hidden: [], movable: [] })
  })

  it('hides exactly the ids the build piece and the landing piece stand in for', () => {
    const { s, id } = placed()
    const t = step(s, { placeWall: tower }, c).state
    const towerId = t.objects[1].id
    const o = of(t, { spec: wall, id, movable: true }, { spec: tower, id: towerId, movable: true })
    expect(o.hidden).toEqual([id, towerId])
    expect(o.landing).toEqual({ spec: tower, id: towerId })
    // A new piece stands in for nothing.
    expect(of(t, { spec: wall, movable: true }).hidden).toEqual([])
  })

  it('shows a landing piece with its id, and a new one without', () => {
    const { s, id } = placed()
    expect(of(s, undefined, { spec: wall, id, movable: true }).landing).toEqual({ spec: wall, id })
    expect(of(buildState(1), undefined, { spec: wall, movable: true }).landing).toEqual({ spec: wall, id: undefined })
  })

  it('outlines this build turn\'s pieces as movable, and none in play', () => {
    const { s, id } = placed()
    expect(of(s).movable).toEqual([id])
    expect(of({ ...s, match: { ...s.match, builder: null } }).movable).toEqual([])
  })

  it('reads a Credit cost only on a new unplaced wall: a build turn\'s price, or the in-play price when no builder', () => {
    const { s, id } = placed()
    expect(of(buildState(1), { spec: wall, movable: true }).piece?.cost).toBe(structureCost(wall))
    expect(of(playState(), { spec: wall, movable: true }).piece?.cost).toBe(playCost(wall))
    expect(of(s, { spec: wall, id, movable: true }).piece?.cost).toBeUndefined()
    expect(of(buildState(1), { spec: tower, movable: true }).piece?.cost).toBeUndefined()
  })

  it('marks the build piece blocked when it fails the full legality check, Credits included', () => {
    expect(of(buildState(1), { spec: wall, movable: true }).piece?.blocked).toBe(false)
    expect(of({ ...buildState(1), credits: { 1: 0, 2: 0 } }, { spec: wall, movable: true }).piece?.blocked).toBe(true)
  })
})
