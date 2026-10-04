import { describe, expect, it } from 'vitest'
import type { Point } from '../../sim/pitch'
import { startsAtEdge, swipedIn } from './edgeSwipe'

const p = (x: number, y: number): Point => ({ x, y })

describe('Side menu edge swipe', () => {
  it('starts within 20 px of the viewer\'s left edge only', () => {
    expect([startsAtEdge(0), startsAtEdge(20), startsAtEdge(21)]).toEqual([true, true, false])
  })
  it('is made by a mostly-horizontal drag inward of 40 px', () => {
    expect([swipedIn(p(5, 300), p(44, 300)), swipedIn(p(5, 300), p(45, 300)), swipedIn(p(5, 300), p(60, 400)), swipedIn(p(5, 300), p(-30, 300))]).toEqual([false, true, false, false])
  })
})
