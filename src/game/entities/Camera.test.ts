import { describe, expect, it } from 'vitest'
import { anchorY, Camera, clampY, fogOf, layout, viewOf, viewOutline } from './Camera'
import { rules } from '../../config/rules'

describe('manual pan', () => {
  it('moves the view and holds it until recentered', () => {
    const cam = new Camera(54)
    cam.pan(-10)
    expect([cam.y, cam.held]).toEqual([44, true])
    cam.recenter()
    expect(cam.held).toBe(false)
  })
  it('stays inside the boards', () => {
    const cam = new Camera(54)
    cam.pan(1000)
    expect(cam.y).toBe(77)
  })
})

describe('layout', () => {
  it('phone portrait: the pane fills the width, and the height above the HUD band shows more pitch', () => {
    const l = layout({ width: 400, height: 900 }, { top: 0, bottom: 120 })
    expect(l.scale).toBe(10)
    expect(l.visibleHeight).toBe(78)
    expect(l.pane).toEqual({ x: 0, y: 0, w: 400, h: 780 })
  })
  it('the HUD band is reserved on the side it sits (top when the stage is turned)', () => {
    expect(layout({ width: 400, height: 900 }, { top: 120, bottom: 0 }).pane).toEqual({ x: 0, y: 120, w: 400, h: 780 })
  })
  it('a very tall phone is capped at 80 units, the spare height on the far side', () => {
    const l = layout({ width: 400, height: 1200 }, { top: 0, bottom: 100 })
    expect(l.visibleHeight).toBe(80)
    expect(l.pane).toEqual({ x: 0, y: 300, w: 400, h: 800 })
  })
  it('3:4 tablet portrait gets side bands, 40 x 64 units', () => {
    const l = layout({ width: 600, height: 800 })
    expect(l.scale).toBe(12.5)
    expect(l.visibleHeight).toBe(64)
    expect(l.pane).toEqual({ x: 50, y: 0, w: 500, h: 800 })
  })
  it('wide screen keeps side bands rather than show fewer than 64 units', () => {
    const l = layout({ width: 1600, height: 800 })
    expect(l.scale).toBe(12.5)
    expect(l.pane).toEqual({ x: 550, y: 0, w: 500, h: 800 })
  })
})

describe('anchor', () => {
  it('holds the ball 70% down the screen for the bottom seat, so more pitch shows ahead of it', () => {
    expect(anchorY(80, 1, 80)).toBe(64)
  })
  it('for the top seat the stage is turned, so the view sits on the other side of the ball', () => {
    expect(anchorY(30, 2, 80)).toBe(46)
  })
})

describe('anchor across the table', () => {
  it('with the stage not turned for a seat-2 shooter, holds the ball 30% down so the pitch ahead (down the screen) shows', () => {
    expect(anchorY(30, 1, 80, false)).toBe(46)
  })
})

describe('anchored follow on a 400 x 900 phone (78 units shown)', () => {
  /** Where the ball sits down the screen of the bottom seat (0 top, 1 bottom) once the camera has settled on it. */
  const settled = (ballY: number) => {
    const cam = new Camera(54)
    cam.reserve = { top: 0, bottom: 120 }
    cam.fit({ width: 400, height: 900 })
    cam.follow(anchorY(ballY, 1, cam.visibleHeight), 10)
    return { cam, at: (ballY - (cam.y - cam.visibleHeight / 2)) / cam.visibleHeight }
  }
  it('at the centre spot the ball is 70% down', () => {
    expect(settled(54).at).toBeCloseTo(0.7)
  })
  it('on the own quarter line the ball is still 70% down', () => {
    expect(settled(81).at).toBeCloseTo(0.7)
  })
  it('near the own goal the clamp wins: the view rests on the near board and the ball drops below 70%', () => {
    const { cam, at } = settled(104)
    expect(cam.y + cam.visibleHeight / 2).toBe(rules.pitchHeight + rules.board)
    expect(at).toBeCloseTo(73 / 78)
  })
})

describe('fit', () => {
  it('pans and follows are clamped to the height the canvas shows', () => {
    const cam = new Camera(54)
    cam.reserve = { top: 0, bottom: 120 }
    cam.fit({ width: 400, height: 900 })
    cam.pan(1000)
    expect(cam.y).toBe(109 - 39)
  })
})

describe('follow', () => {
  it('moves about 63% of the way in 150 ms and settles at rest', () => {
    const t = new Camera(40)
    t.follow(70, 0.15)
    expect(t.y).toBeCloseTo(40 + 30 * 0.632, 1)
    for (let i = 0; i < 100; i++) t.follow(70, 1 / 60)
    expect(t.y).toBeCloseTo(70, 0)
  })
  it('never shows beyond the boards', () => {
    const t = new Camera(50)
    t.follow(-500, 10)
    expect(t.y).toBe(31)
    t.follow(900, 10)
    expect(t.y).toBe(77)
  })
})

describe('shake', () => {
  it('never exceeds its amplitude and is gone after 200 ms', () => {
    const cam = new Camera(54)
    cam.shake(4)
    for (let i = 0; i < 28; i++) {
      cam.update(0.007)
      expect(Math.abs(cam.shakeNow.x)).toBeLessThanOrEqual(4)
      expect(Math.abs(cam.shakeNow.y)).toBeLessThanOrEqual(4)
    }
    cam.update(0.01)
    expect(cam.shakeNow).toEqual({ x: 0, y: 0 })
  })
  it('decays linearly: 5% of the amplitude is left at 190 ms', () => {
    const cam = new Camera(54)
    cam.shake(4)
    cam.update(0.19)
    expect(Math.abs(cam.shakeNow.x)).toBeLessThanOrEqual(0.2 + 1e-9)
    expect(Math.abs(cam.shakeNow.y)).toBeLessThanOrEqual(0.2 + 1e-9)
  })
})

describe('map camera', () => {
  const canvas = { width: 400, height: 1200 }
  it('fits the whole pitch with its aspect ratio', () => {
    const v = viewOf(canvas, { y: rules.mapY, map: true })
    expect(v.sx).toBe(v.sy)
    expect(v.sx).toBe(10)
    expect(v.pane.w).toBe(400)
    expect(v.pane.h).toBeCloseTo(v.visibleHeight * 10)
  })
  it('fits above the HUD band, centred in what is left', () => {
    const v = viewOf({ width: 400, height: 1400 }, { y: rules.mapY, map: true, reserve: { top: 0, bottom: 200 } })
    expect(v.pane.y + v.pane.h / 2).toBeCloseTo(600)
    expect(v.pane.y + v.pane.h).toBeLessThanOrEqual(1200)
    const turned = viewOf({ width: 400, height: 1400 }, { y: rules.mapY, map: true, reserve: { top: 200, bottom: 0 } })
    expect(turned.pane.y + turned.pane.h / 2).toBeCloseTo(800)
  })
  it('scales the pitch down to the free height when the screen is short', () => {
    const v = viewOf({ width: 400, height: 700 }, { y: rules.mapY, map: true, reserve: { top: 0, bottom: 100 } })
    expect(v.sx).toBe(v.sy)
    expect(v.sy).toBeCloseTo(600 / rules.mapHeight)
  })
  it('outlines the game view: full width, as tall as the view shows (80 units here), positioned by camera y', () => {
    const map = { y: rules.mapY, map: true }
    const o = viewOutline(canvas, map, { y: rules.mapY })
    expect(o.w).toBe(400)
    expect(o.h).toBe(800)
    expect(o.y + o.h / 2).toBeCloseTo(600)
    expect(viewOutline(canvas, map, { y: rules.mapY + 10 }).y - o.y).toBeCloseTo(100)
  })
  it('converts canvas pixels back to world units', () => {
    const cam = new Camera(54)
    // A 400 x 1200 canvas shows 80 units in a pane on its bottom 800 px, centred at y 800.
    expect(cam.toWorld(canvas, 200, 800)).toEqual({ x: 20, y: 54 })
  })
  it('converts world units to canvas pixels', () => {
    const cam = new Camera(54)
    expect(cam.toCanvas(canvas, { x: 20, y: 54 })).toEqual({ x: 200, y: 800 })
    expect(cam.toCanvas(canvas, { x: 30, y: 64 })).toEqual({ x: 300, y: 900 })
  })
})

describe('blind build', () => {
  it('pan stays on the bottom viewer\'s half: the view bottom rests on the far board', () => {
    const cam = new Camera(77)
    cam.blind = 1
    cam.pan(-1000)
    expect(cam.y).toBe(77)
    cam.pan(1000)
    expect(cam.y).toBe(77)
  })
  it('pan stays on the top viewer\'s half: the view top rests on the far board', () => {
    const cam = new Camera(31)
    cam.blind = 2
    cam.pan(1000)
    expect(cam.y).toBe(31)
    cam.pan(-1000)
    expect(cam.y).toBe(31)
  })
  it('a view shorter than the half can move within it, never past the halfway line', () => {
    expect(clampY(0, 20, 1) - 10).toBe(54)
    expect(clampY(1000, 20, 1) + 10).toBe(109)
  })
  it('follow is clamped the same way', () => {
    const cam = new Camera(77)
    cam.blind = 1
    cam.follow(0, 10)
    expect(cam.y).toBe(77)
  })
  it('fogs the opponent\'s half up to the halfway line, boards and net included', () => {
    expect(fogOf(1)).toEqual({ top: -4, bottom: 54 })
    expect(fogOf(2)).toEqual({ top: 54, bottom: 112 })
  })
})

describe('reset', () => {
  it('ends a shake, the hold and the blind clamp', () => {
    const cam = new Camera(54)
    cam.shake(4)
    cam.pan(1)
    cam.blind = 1
    cam.reset()
    expect([cam.shakeNow, cam.held, cam.blind]).toEqual([{ x: 0, y: 0 }, false, undefined])
  })
})
