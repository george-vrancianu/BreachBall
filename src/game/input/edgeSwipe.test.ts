import { describe, expect, it } from 'vitest'
import type { Point } from '../../sim/pitch'
import { startsAtEdge, swipedIn } from './edgeSwipe'

const p = (x: number, y: number): Point => ({ x, y })

describe('Side menu edge swipe', () => {
  it('starts within 20 px of the viewer\'s left edge only', () => {
    expect([startsAtEdge(0, 400), startsAtEdge(20, 400), startsAtEdge(21, 400)]).toEqual([true, true, false])
  })
  it('is made by a mostly-horizontal drag inward of 40 px', () => {
    expect([swipedIn(p(5, 300), p(44, 300)), swipedIn(p(5, 300), p(45, 300)), swipedIn(p(5, 300), p(60, 400)), swipedIn(p(5, 300), p(-30, 300))]).toEqual([false, true, false, false])
  })
})

describe('Side menu edge swipe across the table (Tabletop mode, seat 2: the HUD turned, the canvas not)', () => {
  it('starts within 20 px of the canvas\'s right edge, which is the HUD\'s left', () => {
    expect([startsAtEdge(400, 400, true), startsAtEdge(380, 400, true), startsAtEdge(379, 400, true), startsAtEdge(0, 400, true)]).toEqual([true, true, false, false])
  })
  it('is made by a mostly-horizontal drag of 40 px toward the canvas\'s left', () => {
    expect([swipedIn(p(395, 300), p(356, 300), true), swipedIn(p(395, 300), p(355, 300), true), swipedIn(p(395, 300), p(340, 400), true), swipedIn(p(395, 300), p(430, 300), true)]).toEqual([false, true, false, false])
  })
})
