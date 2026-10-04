import { describe, expect, it } from 'vitest'
import { rules } from '../config/rules'
import { splashDamage, splashOf, splashRadius } from './splash'
import { defaultConfig as c } from './step'
import { hseg } from './testkit'
import type { Structure, Wall } from './wall'

const wall = (id: number, owner: 1 | 2, gy: number): Wall => ({ kind: 'wall', owner, ...hseg(8, gy), id, hp: rules.wallHp })
const losses = (objects: Structure[], player: 1 | 2 = 1, origin = { x: 20, y: 79.5 }) => splashDamage(objects, origin, { power: 1, radius: 10 }, player).map((h) => [h.wall.id, h.loss])

describe('splash radius', () => {
  it('grows linearly from 1 to 5 ball diameters', () => {
    expect(splashRadius(0, c)).toBe(2)
    expect(splashRadius(0.5, c)).toBe(6)
    expect(splashRadius(1, c)).toBe(10)
  })
})

describe('splashOf', () => {
  it('a full Power shot is a full Splash; a mid-range one half; a Touch shot none', () => {
    expect(splashOf(1, 1, c)).toEqual({ power: 1, radius: 10 })
    expect(splashOf(1, 0.75, c)).toEqual({ power: 0.5, radius: 6 })
    expect(splashOf(0, 0.3, c)).toBeNull()
  })
})

describe('splash damage', () => {
  it('enemy loses 1 hp above 0.4 and 2 above 0.8; out of range is untouched', () => {
    // distances 5.5, 3.5, 1.5 -> pressure 0.45, 0.65, 0.85; 7.5 -> 0.25; 11.5 is outside the radius of 10.
    expect(losses([wall(1, 2, 37), wall(2, 2, 38), wall(3, 2, 39), wall(4, 2, 36), wall(5, 2, 34)])).toEqual([[1, 1], [2, 1], [3, 2], [4, 0]])
  })
  it('own structure loses 1 hp above 0.8 only', () => {
    expect(losses([wall(1, 1, 37), wall(2, 1, 38), wall(3, 1, 39)])).toEqual([[1, 0], [2, 0], [3, 1]])
  })
  it('the halfway line shields nothing', () => {
    expect(losses([wall(1, 2, 25), wall(2, 1, 28)], 2, { x: 20, y: 52.5 })).toEqual([[1, 0], [2, 1]])
  })
  it('a tower takes the same pressure rule: an enemy tower loses 1 hp above 0.4', () => {
    // Tower square y 48..50; origin 5 away at full power (radius 10) gives pressure 0.5.
    const tower: Structure = { kind: 'tower', owner: 2, power: 'repulsor', at: { gx: 10, gy: 24 }, id: 1, hp: rules.towerHp }
    expect(losses([tower], 1, { x: 21, y: 55 })).toEqual([[1, 1]])
  })
})
