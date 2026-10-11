import { describe, expect, it } from 'vitest'
import { rules } from './rules'

describe('rules', () => {
  it('derives the halfway line, goal mouth and map extents from the base geometry', () => {
    expect(rules.halfHeight).toBe(54)
    expect([rules.gridCols, rules.gridRows]).toEqual([20, 54])
    expect(rules.kickoffGap).toBe(5)
    expect(rules.halfCentre).toEqual({ 1: 81, 2: 27 })
    expect([rules.goalLeft, rules.goalRight]).toEqual([15, 25])
    expect([rules.mapTop, rules.mapHeight, rules.mapY]).toEqual([-4, 116, 54])
  })
  it('puts the default Pallets on the halfway line, each Activation ring a unit clear of a side board', () => {
    expect(rules.pallet.spots).toEqual([{ x: 6, y: 54 }, { x: 34, y: 54 }])
  })
  it('sizes the Shot tiers\' control radii to fit a phone: Touch 150 px, Power 84 px', () => {
    expect(rules.shot.tiers.map((t) => [t.name, t.radiusPx])).toEqual([['Touch', 150], ['Power', 84]])
  })
})
