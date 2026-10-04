import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import type { Point } from '../../sim/pitch'
import { defaultConfig as c, initialState, step, type SimInput, type SimState } from '../../sim/step'
import { buildState, hseg } from '../../sim/testkit'
import type { Structure } from '../../sim/wall'
import { Camera } from '../entities/Camera'
import { InputController } from './InputController'

// No DOM: a canvas that is an EventTarget, driven by synthetic pointer events in canvas px.
class FakeCanvas extends EventTarget {
  width = 400
  height = 640
  clientWidth = 400
  clientHeight = 640
  setPointerCapture() {}
}

let canvas: FakeCanvas
let camera: Camera
let state: SimState
let sent: SimInput[]
let pending: SimInput[]
let ctl: InputController

const make = (s: SimState) => {
  state = s
  sent = []
  pending = []
  canvas = new FakeCanvas()
  camera = new Camera(80)
  ctl = new InputController({
    canvas: canvas as unknown as HTMLCanvasElement,
    camera,
    mapCam: new Camera(rules.mapY, { stretch: true }),
    state: () => state,
    config: () => c,
    shown: () => 1,
    mine: () => true,
    mapOpen: () => false,
    blocked: () => false,
    toggleMap() {},
    send: (i) => void (sent.push(i), pending.push(i)),
  })
}
beforeEach(() => {
  vi.stubGlobal('addEventListener', () => {})
  make(buildState(1))
})

/** The sim takes what was sent (a tick later, as online) and the controller settles. */
const tick = () => {
  for (const i of pending.splice(0)) state = step(state, i, c).state
  ctl.settle(state, false)
}
const px = (p: Point) => camera.toCanvas(canvas as unknown as HTMLCanvasElement, p)
const fire = (type: string, p: Point, id = 1) => {
  const at = px(p)
  canvas.dispatchEvent(Object.assign(new Event(type), { offsetX: at.x, offsetY: at.y, clientX: at.x, clientY: at.y, pointerId: id }))
}
const down = (p: Point, id = 1) => fire('pointerdown', p, id)
const move = (p: Point, id = 1) => fire('pointermove', p, id)
const up = (p: Point, id = 1) => fire('pointerup', p, id)
const drag = (from: Point, to: Point) => (down(from), move(to), up(to))
const unit = rules.wall.unit

describe('drawing a wall', () => {
  beforeEach(() => ctl.build.toggle())

  it('arms the wall on entering build mode', () => {
    expect(ctl.item).toBe('wall')
  })

  it('shows nothing under the drag slop, and places nothing for a drag under half a unit', () => {
    down({ x: 10, y: 80 })
    move({ x: 10 + visual.input.dragSlopPx / 100, y: 80 })
    expect(ctl.selection).toBeUndefined()
    move({ x: 12, y: 80 })
    expect(ctl.selection).toBeUndefined()
    up({ x: 12, y: 80 })
    expect(sent).toEqual([])
    expect(ctl.selection).toBeUndefined()
  })

  it('places a horizontal unit on lift, then selects the wall the sim took', () => {
    drag({ x: 10, y: 80 }, { x: 10 + unit + 0.7, y: 80.9 })
    expect(sent).toEqual([{ placeWall: { kind: 'wall', owner: 1, a: { x: 10, y: 80 }, b: { x: 10 + unit, y: 80 } } }])
    expect(ctl.landing).toBeDefined()
    expect(ctl.selection).toBeUndefined()
    tick()
    expect(ctl.landing).toBeUndefined()
    expect(ctl.selection).toMatchObject({ id: expect.any(Number), movable: true, spec: { a: { x: 10, y: 80 } } })
  })

  it('snaps a diagonal drag to 45 degrees and the nearest unit, live', () => {
    down({ x: 10, y: 70 })
    move({ x: 21, y: 80.5 })
    const spec = ctl.selection!.spec
    expect(spec.kind === 'wall' && spec.b.x).toBeCloseTo(10 + (2 * unit) / Math.SQRT2)
    expect(spec.kind === 'wall' && spec.b.y).toBeCloseTo(70 + (2 * unit) / Math.SQRT2)
    up({ x: 21, y: 80.5 })
    expect(sent).toHaveLength(1)
  })

  it('starts exactly on a nearby wall end of either owner', () => {
    const end = { x: 20.123, y: 20.456 }
    state = { ...state, objects: [{ id: 7, kind: 'wall', owner: 2, hp: 3, a: { x: 12.123, y: 20.456 }, b: end } as Structure] }
    down({ x: end.x + 0.3, y: end.y })
    move({ x: end.x + 0.3 + unit, y: end.y })
    expect(ctl.selection!.spec).toMatchObject({ a: end })
    expect(ctl.selection!.spec).toHaveProperty('a', { x: 20.123, y: 20.456 })
  })

  it('leaves an illegal piece selected and unplaced, and a legal translate then commits it', () => {
    // Running up from y 60 to 52 crosses the halfway line.
    drag({ x: 20, y: 60 }, { x: 20, y: 60 - unit })
    expect(sent).toEqual([])
    expect(ctl.selection).toMatchObject({ movable: true })
    expect(ctl.selection!.id).toBeUndefined()
    drag({ x: 20, y: 56 }, { x: 20, y: 68 })
    expect(sent).toEqual([{ placeWall: { kind: 'wall', owner: 1, a: { x: 20, y: 72 }, b: { x: 20, y: 64 } } }])
  })

  it('commits an unplaced piece when a rotate leaves it legal', () => {
    drag({ x: 20, y: 62 }, { x: 20, y: 62 - unit })
    expect(sent).toEqual([])
    ctl.build.rotate()
    ctl.build.rotate()
    expect(sent).toHaveLength(1)
  })

  it('discards an unplaced piece on a tap on empty pitch', () => {
    drag({ x: 20, y: 60 }, { x: 20, y: 60 - unit })
    expect(ctl.selection).toBeDefined()
    down({ x: 30, y: 95 })
    up({ x: 30, y: 95 })
    expect(ctl.selection).toBeUndefined()
    expect(sent).toEqual([])
  })

  it('ignores a second finger during a draw: it neither cancels nor pans', () => {
    const y = camera.y
    down({ x: 10, y: 80 })
    move({ x: 14, y: 80 })
    down({ x: 30, y: 90 }, 2)
    move({ x: 30, y: 100 }, 2)
    move({ x: 10 + unit, y: 80 })
    expect(camera.y).toBe(y)
    expect(ctl.selection!.spec).toMatchObject({ b: { x: 10 + unit } })
    up({ x: 30, y: 100 }, 2)
    up({ x: 10 + unit, y: 80 })
    expect(sent).toHaveLength(1)
  })

  it('pans with two fingers when no draw is showing yet', () => {
    const y = camera.y
    down({ x: 10, y: 80 })
    down({ x: 30, y: 80 }, 2)
    canvas.dispatchEvent(Object.assign(new Event('pointermove'), { offsetX: 0, offsetY: 0, clientX: 10, clientY: 40, pointerId: 1 }))
    expect(camera.y).not.toBe(y)
    expect(ctl.selection).toBeUndefined()
  })

  it('a one-finger drag draws instead of panning', () => {
    const y = camera.y
    drag({ x: 10, y: 80 }, { x: 10, y: 90 })
    expect(camera.y).toBe(y)
  })

  it('leaving build mode by the Build button discards an unplaced piece and disarms', () => {
    drag({ x: 20, y: 60 }, { x: 20, y: 60 - unit })
    ctl.build.toggle()
    expect(ctl.item).toBeUndefined()
    expect(ctl.selection).toBeUndefined()
  })

  it('arms another item from the palette', () => {
    ctl.build.arm('steal')
    expect(ctl.item).toBe('steal')
  })
})

describe('not building', () => {
  it('a one-finger drag on empty pitch pans', () => {
    const y = camera.y
    down({ x: 10, y: 80 })
    canvas.dispatchEvent(Object.assign(new Event('pointermove'), { offsetX: 10, offsetY: 100, clientX: 10, clientY: 100, pointerId: 1 }))
    expect(camera.y).not.toBe(y)
    expect(ctl.selection).toBeUndefined()
  })
})

describe('towers', () => {
  it('a tap places the armed tower under the finger on the grid', () => {
    ctl.build.toggle()
    ctl.build.arm('repulsor')
    down({ x: 20.4, y: 80.3 })
    expect(ctl.selection!.spec).toMatchObject({ kind: 'tower', power: 'repulsor', at: { gx: 10, gy: 40 } })
    up({ x: 20.4, y: 80.3 })
    expect(sent).toEqual([{ placeWall: { kind: 'tower', owner: 1, power: 'repulsor', at: { gx: 10, gy: 40 } } }])
  })

  it('follows the drag and places where it is lifted', () => {
    ctl.build.toggle()
    ctl.build.arm('steal')
    drag({ x: 20, y: 80 }, { x: 12, y: 70 })
    expect(sent).toEqual([{ placeWall: expect.objectContaining({ kind: 'tower', at: { gx: 6, gy: 35 } }) }])
  })

  it('an illegal spot leaves a red unplaced tower, and a tap on empty pitch only discards it', () => {
    ctl.build.toggle()
    ctl.build.arm('steal')
    down({ x: 20, y: 40 })
    up({ x: 20, y: 40 })
    expect(sent).toEqual([])
    expect(ctl.selection).toBeDefined()
    down({ x: 30, y: 90 })
    up({ x: 30, y: 90 })
    expect(ctl.selection).toBeUndefined()
    expect(sent).toEqual([])
  })
})

describe('rearrange turn', () => {
  const siege = { ...c, mode: 'siege' as const }
  const base = initialState(1, siege)
  const wall: Structure = { id: 1, kind: 'wall', owner: 1, ...hseg(10, 40), hp: 3 }
  beforeEach(() => {
    make({ ...base, match: { ...base.match, builder: 1, opening: false } as SimState['match'], objects: [wall], built: [1] })
  })

  it('has no item to arm', () => {
    ctl.build.toggle()
    expect(ctl.item).toBeUndefined()
  })

  it('selects an own structure, translates it and commits a move on lift', () => {
    drag({ x: 24, y: 80 }, { x: 24, y: 70 })
    expect(sent).toEqual([{ moveStructure: { player: 1, id: 1, a: { x: 20, y: 70 }, b: { x: 28, y: 70 } } }])
  })

  it('pans on empty pitch', () => {
    const y = camera.y
    down({ x: 10, y: 100 })
    canvas.dispatchEvent(Object.assign(new Event('pointermove'), { offsetX: 10, offsetY: 120, clientX: 10, clientY: 120, pointerId: 1 }))
    expect(camera.y).not.toBe(y)
  })
})
