import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import type { PlayerId, Point } from '../../sim/pitch'
import { defaultConfig as c, initialState, step, type SimInput, type SimState } from '../../sim/step'
import { buildState, emptied, hseg, playState } from '../../sim/testkit'
import type { Structure } from '../../sim/wall'
import { Camera } from '../entities/Camera'
import { InputController } from './InputController'

// No DOM: a canvas that is an EventTarget, driven by synthetic pointer events in canvas px.
class FakeCanvas extends EventTarget {
  width = 400
  height = 640
  clientWidth = 400
  clientHeight = 640
  style = { cursor: '' }
  setPointerCapture() {}
}

let canvas: FakeCanvas
let camera: Camera
let state: SimState
let sent: SimInput[]
let pending: SimInput[]
let ctl: InputController
let keydown: (e: unknown) => void

const make = (s: SimState, mine: (p: PlayerId) => boolean = () => true) => {
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
    mine,
    mapOpen: () => false,
    blocked: () => false,
    toggleMap() {},
    send: (i) => void (sent.push(i), pending.push(i)),
  })
}
beforeEach(() => {
  keydown = () => {}
  vi.stubGlobal('addEventListener', (type: string, fn: (e: unknown) => void) => void (type === 'keydown' && (keydown = fn)))
  make(buildState(1))
})

/** The sim takes what was sent (a tick later, as online) and the controller settles. */
const tick = () => {
  for (const i of pending.splice(0)) state = step(state, i, c).state
  ctl.settle(state, false)
}
const px = (p: Point) => camera.toCanvas(canvas as unknown as HTMLCanvasElement, p)
const fire = (type: string, p: Point, id = 1, extra: object = {}) => {
  const at = px(p)
  canvas.dispatchEvent(Object.assign(new Event(type), { offsetX: at.x, offsetY: at.y, clientX: at.x, clientY: at.y, pointerId: id, pointerType: 'mouse', button: 0, ...extra }))
}
const down = (p: Point, id = 1) => fire('pointerdown', p, id)
const move = (p: Point, id = 1) => fire('pointermove', p, id)
const up = (p: Point, id = 1) => fire('pointerup', p, id)
const drag = (from: Point, to: Point) => (down(from), move(to), up(to))
const cancel = (p: Point, id = 1) => fire('pointercancel', p, id)
const touch = (type: 'pointerdown' | 'pointermove' | 'pointerup', p: Point, id = 1) => fire(type, p, id, { pointerType: 'touch' })
/** A finger's jitter: past the mouse drag slop, inside the touch tap slop. */
const jitter = (p: Point): Point => ({ x: p.x, y: p.y + 9 / Math.abs(camera.view(canvas as unknown as HTMLCanvasElement).sy) })
const key = (k: string) => keydown({ key: k, code: k })
const unit = rules.wall.unit

describe('drawing a wall', () => {
  beforeEach(() => ctl.build.toggle())

  it('in a Siege blind opening, an opponent wall end on the halfway line does not attract the start', () => {
    const siege = initialState(1, { ...c, mode: 'siege' })
    const hidden: Structure = { kind: 'wall', owner: 2, id: 9, hp: 3, a: { x: 10, y: rules.halfHeight }, b: { x: 10 + unit, y: rules.halfHeight } }
    make({ ...siege, match: { ...siege.match, builder: 1 }, objects: [hidden], nextId: 10 })
    ctl.build.toggle()
    const start = { x: 10.5, y: rules.halfHeight + 0.2 }
    down(start)
    move({ x: 10.5 + unit, y: start.y })
    expect(ctl.selection?.spec).toMatchObject({ a: start })
  })

  it('a cancelled pointer aborts the draw and never places', () => {
    down({ x: 10, y: 80 })
    move({ x: 10 + unit, y: 80 })
    expect(ctl.selection).toBeDefined()
    cancel({ x: 10 + unit, y: 80 })
    expect(sent).toEqual([])
    expect(ctl.selection).toBeUndefined()
  })

  it('rotate during a live draw does not place a second piece', () => {
    down({ x: 10, y: 80 })
    move({ x: 10 + unit, y: 80 })
    ctl.build.rotate()
    move({ x: 10 + 2 * unit, y: 80 })
    up({ x: 10 + 2 * unit, y: 80 })
    expect(sent).toEqual([{ placeWall: { kind: 'wall', owner: 1, a: { x: 10, y: 80 }, b: { x: 10 + 2 * unit, y: 80 } } }])
    expect(ctl.selection).toBeUndefined()
  })

  it('Esc during a draw stops it', () => {
    down({ x: 10, y: 80 })
    move({ x: 10 + unit, y: 80 })
    key('Escape')
    move({ x: 10 + 2 * unit, y: 80 })
    up({ x: 10 + 2 * unit, y: 80 })
    expect(sent).toEqual([])
    expect(ctl.selection).toBeUndefined()
  })

  it('ignores a non-primary mouse button', () => {
    fire('pointerdown', { x: 10, y: 80 }, 1, { pointerType: 'mouse', button: 2 })
    move({ x: 10 + unit, y: 80 })
    up({ x: 10 + unit, y: 80 })
    expect(sent).toEqual([])
    expect(ctl.selection).toBeUndefined()
  })

  it('a lift while the last one is still landing commits when it settles', () => {
    drag({ x: 10, y: 80 }, { x: 10 + unit, y: 80 })
    drag({ x: 10, y: 90 }, { x: 10 + unit, y: 90 })
    expect(sent).toHaveLength(1)
    tick()
    expect(sent).toHaveLength(2)
    expect(sent[1]).toEqual({ placeWall: { kind: 'wall', owner: 1, a: { x: 10, y: 90 }, b: { x: 10 + unit, y: 90 } } })
  })

  it('a landing the sim never reports is dropped after the timeout', () => {
    drag({ x: 10, y: 80 }, { x: 10 + unit, y: 80 })
    pending.length = 0
    for (let i = 0; i < visual.input.landingTimeoutTicks; i++) ctl.settle(state, false)
    expect(ctl.landing).toBeUndefined()
  })

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

  it('starts exactly on a nearby end of the builder own wall', () => {
    const end = { x: 20.123, y: 20.456 }
    state = { ...state, objects: [{ id: 7, kind: 'wall', owner: 1, hp: 3, a: { x: 12.123, y: 20.456 }, b: end } as Structure] }
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
    expect(sent).toEqual([{ placeWall: { kind: 'wall', owner: 1, a: { x: 20, y: 62 }, b: { x: 28, y: 62 } } }])
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

  it('a second finger down and up during a live draw leaves it to place on lift', () => {
    down({ x: 10, y: 80 })
    move({ x: 10 + unit, y: 80 })
    down({ x: 30, y: 90 }, 2)
    up({ x: 30, y: 90 }, 2)
    expect(ctl.selection).toBeDefined()
    up({ x: 10 + unit, y: 80 })
    expect(sent).toEqual([{ placeWall: { kind: 'wall', owner: 1, a: { x: 10, y: 80 }, b: { x: 10 + unit, y: 80 } } }])
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

  it('leaving build mode deselects a placed wall too', () => {
    make({ ...buildState(1), objects: [{ id: 1, kind: 'wall', owner: 1, ...hseg(10, 40), hp: 3 } as Structure], built: [1] })
    ctl.build.toggle()
    down({ x: 24, y: 80 })
    up({ x: 24, y: 80 })
    expect(ctl.selection).toMatchObject({ id: 1 })
    ctl.build.toggle()
    expect(ctl.selection).toBeUndefined()
  })

  it('arms another item', () => {
    ctl.build.arm('steal')
    expect(ctl.item).toBe('steal')
  })
})

describe('online, the other peer\'s build turn', () => {
  // Player 1 builds; this device plays only player 2.
  const theirs: Structure = { kind: 'wall', owner: 1, id: 1, hp: 3, ...hseg(10, 40) }
  beforeEach(() => make({ ...buildState(1), objects: [theirs], built: [1], nextId: 2 }, (p) => p === 2))

  it('toggle and arm do not enter build mode', () => {
    ctl.build.toggle()
    ctl.build.arm('repulsor')
    expect(ctl.item).toBeUndefined()
  })
  it('a draw sends nothing and selects nothing', () => {
    ctl.item = 'wall'
    drag({ x: 10, y: 90 }, { x: 10 + unit, y: 90 })
    expect(sent).toEqual([])
    expect(ctl.selection).toBeUndefined()
  })
  it('a tap on the builder\'s wall selects nothing', () => {
    const mid = { x: (theirs.a.x + theirs.b.x) / 2, y: theirs.a.y }
    down(mid), up(mid)
    expect(ctl.selection).toBeUndefined()
  })
  it('rotate, remove and the R key send nothing and keep the selection', () => {
    const sel = { spec: theirs, id: 1, movable: true }
    ctl.selection = sel
    ctl.build.rotate()
    key('r')
    ctl.build.remove()
    expect(sent).toEqual([])
    expect(ctl.selection).toBe(sel)
  })
  it('Esc leaves the selection alone', () => {
    const sel = { spec: theirs, id: 1, movable: true }
    ctl.selection = sel
    key('Escape')
    expect(ctl.selection).toBe(sel)
  })
})

describe('arm from not building', () => {
  it('enters build mode with that item', () => {
    expect(ctl.item).toBeUndefined()
    ctl.build.arm('repulsor')
    expect(ctl.item).toBe('repulsor')
  })
  it('ignores a disabled item', () => {
    make(emptied(buildState(1), 1, 'steal'))
    ctl.build.arm('steal')
    expect(ctl.item).toBeUndefined()
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
    // Nothing changes on the press itself: the tower goes down on the lift.
    expect(ctl.selection).toBeUndefined()
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

describe('drawing details', () => {
  beforeEach(() => ctl.build.toggle())

  it('a draw of exactly half a unit places a one-unit wall', () => {
    drag({ x: 10, y: 80 }, { x: 10 + unit / 2, y: 80 })
    expect(sent).toEqual([{ placeWall: { kind: 'wall', owner: 1, a: { x: 10, y: 80 }, b: { x: 10 + unit, y: 80 } } }])
  })

  it('toggling Build mid-draw does nothing: the item stays and the lift still places the wall', () => {
    down({ x: 10, y: 80 })
    move({ x: 10 + unit, y: 80 })
    ctl.build.toggle()
    expect(ctl.item).toBe('wall')
    up({ x: 10 + unit, y: 80 })
    expect(sent).toEqual([{ placeWall: { kind: 'wall', owner: 1, a: { x: 10, y: 80 }, b: { x: 10 + unit, y: 80 } } }])
  })

  describe.each([['blocked'], ['mapOpen']] as const)('while %s', (flag) => {
    beforeEach(() => {
      ctl.build.arm('wall')
      ;(ctl as unknown as { host: Record<string, () => boolean> }).host[flag] = () => true
    })
    it('toggle leaves the armed item', () => {
      ctl.build.toggle()
      expect(ctl.item).toBe('wall')
    })
    it('arm leaves the armed item', () => {
      ctl.build.arm('steal')
      expect(ctl.item).toBe('wall')
    })
  })

  it('a refused landing clears and leaves no selection', () => {
    drag({ x: 10, y: 80 }, { x: 10 + unit, y: 80 })
    expect(ctl.landing).toBeDefined()
    ctl.settle(state, true)
    expect(ctl.landing).toBeUndefined()
    expect(ctl.selection).toBeUndefined()
  })

  it('edge scroll while drawing moves the end without a pointer move', () => {
    down({ x: 10, y: 90 })
    move({ x: 10, y: 90 + unit })
    const before = (ctl.selection!.spec as { b: Point }).b
    // Park the pointer in the lower edge band of the view, off the builder's visible half edge.
    const view = camera.view(canvas as unknown as HTMLCanvasElement)
    const bottom = camera.y + view.visibleHeight / 2
    const at = { x: 10, y: bottom - 0.5 }
    move(at)
    camera.pan(-5)
    const y = camera.y
    ctl.edgeScroll(0.1)
    expect(camera.y).not.toBe(y)
    expect((ctl.selection?.spec as { b: Point } | undefined)?.b).not.toEqual(before)
  })

  it('rotating a placed wall in a Rearrange turn emits one move with the rotated end', () => {
    const siege = { ...c, mode: 'siege' as const }
    const base = initialState(1, siege)
    make({ ...base, match: { ...base.match, builder: 1, opening: false } as SimState['match'], objects: [{ id: 1, kind: 'wall', owner: 1, ...hseg(10, 40), hp: 3 } as Structure], built: [1] })
    down({ x: 24, y: 80 })
    up({ x: 24, y: 80 })
    expect(ctl.selection).toMatchObject({ id: 1 })
    ctl.build.rotate()
    expect(sent).toHaveLength(1)
    const m = (sent[0] as { moveStructure: { a: Point; b: Point } }).moveStructure
    expect(m.a).toEqual({ x: 20, y: 80 })
    expect(m.b.x).toBeCloseTo(20 + unit / Math.SQRT2)
    expect(m.b.y).toBeCloseTo(80 + unit / Math.SQRT2)
  })
})

describe('tower stock', () => {
  it('arm ignores a tower with no stock', () => {
    make(emptied(buildState(1), 1, 'steal'))
    ctl.build.toggle()
    ctl.build.arm('steal')
    expect(ctl.item).toBe('wall')
  })

  it('placing the last one re-arms the wall on settle', () => {
    const s = buildState(1)
    make({ ...s, players: { ...s.players, 1: { ...s.players[1], inventory: { ...s.players[1].inventory, steal: 1 } } } })
    ctl.build.toggle()
    ctl.build.arm('steal')
    expect(ctl.item).toBe('steal')
    down({ x: 20.4, y: 80.3 })
    up({ x: 20.4, y: 80.3 })
    expect(sent).toHaveLength(1)
    tick()
    expect(ctl.item).toBe('wall')
  })

  it('an illegal tower, then a drag to a legal cell, places it there', () => {
    ctl.build.toggle()
    ctl.build.arm('steal')
    down({ x: 20, y: 40 })
    up({ x: 20, y: 40 })
    expect(sent).toEqual([])
    down({ x: 20, y: 40 })
    move({ x: 20.9, y: 80.9 })
    up({ x: 20.9, y: 80.9 })
    expect(sent).toEqual([{ placeWall: { kind: 'tower', owner: 1, power: 'steal', at: { gx: 10, gy: 40 } } }])
  })

  it('a cancelled tower press leaves nothing', () => {
    ctl.build.toggle()
    ctl.build.arm('steal')
    down({ x: 20.4, y: 80.3 })
    cancel({ x: 20.4, y: 80.3 })
    expect(sent).toEqual([])
    expect(ctl.selection).toBeUndefined()
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

  it('selects an own structure on a tap, then translates it and commits a move on lift', () => {
    down({ x: 24, y: 80 })
    up({ x: 24, y: 80 })
    expect(ctl.selection).toMatchObject({ id: 1, movable: true })
    drag({ x: 24, y: 80 }, { x: 24, y: 70 })
    expect(sent).toEqual([{ moveStructure: { player: 1, id: 1, a: { x: 20, y: 70 }, b: { x: 28, y: 70 } } }])
  })

  it('a cancelled drag sends no move', () => {
    down({ x: 24, y: 80 })
    up({ x: 24, y: 80 })
    down({ x: 24, y: 80 })
    move({ x: 24, y: 70 })
    cancel({ x: 24, y: 70 })
    expect(sent).toEqual([])
  })

  it('pans on empty pitch', () => {
    const y = camera.y
    down({ x: 10, y: 100 })
    canvas.dispatchEvent(Object.assign(new Event('pointermove'), { offsetX: 10, offsetY: 120, clientX: 10, clientY: 120, pointerId: 1 }))
    expect(camera.y).not.toBe(y)
  })
})

describe('the press model', () => {
  const older: Structure = { id: 5, kind: 'wall', owner: 1, ...hseg(10, 40), hp: 3 }
  const turns = (...walls: Structure[]) => make({ ...buildState(1), objects: walls, built: walls.filter((w) => w.owner === 1 && w.id !== 5).map((w) => w.id) })
  const at = { x: 24, y: 80 }
  const pan = (to: Point, id: number) => fire('pointermove', to, id)
  beforeEach(() => turns(older))
  const build = () => ctl.build.toggle()

  it('tapping an older own wall while building selects it, not movable, and 🗑 then demolishes it', () => {
    build()
    down(at)
    up(at)
    expect(ctl.selection).toMatchObject({ id: 5, movable: false })
    expect(sent).toEqual([])
    ctl.build.remove()
    expect(sent).toEqual([{ demolish: { player: 1, wall: 5 } }])
  })

  it('a finger that jitters on an older own wall still selects it', () => {
    build()
    touch('pointerdown', at)
    touch('pointermove', jitter(at))
    touch('pointerup', jitter(at))
    expect(ctl.selection).toMatchObject({ id: 5, movable: false })
  })

  it('tapping this turn\'s wall selects it, movable', () => {
    turns({ ...older, id: 1 })
    build()
    down(at)
    up(at)
    expect(ctl.selection).toMatchObject({ id: 1, movable: true })
  })

  it('tapping the selected structure changes nothing', () => {
    turns({ ...older, id: 1 })
    build()
    down(at)
    up(at)
    const sel = ctl.selection
    down({ x: 22, y: 80 })
    up({ x: 22, y: 80 })
    expect(ctl.selection).toBe(sel)
    expect(sent).toEqual([])
  })

  it('a press that a second finger takes over selects nothing, before or after both lift', () => {
    build()
    down(at)
    expect(ctl.selection).toBeUndefined()
    down({ x: 35, y: 95 }, 2)
    up(at)
    up({ x: 35, y: 95 }, 2)
    expect(ctl.selection).toBeUndefined()
    expect(sent).toEqual([])
  })

  it('a two-finger pan keeps a red unplaced piece', () => {
    build()
    drag({ x: 20, y: 60 }, { x: 20, y: 60 - unit })
    const piece = ctl.selection
    expect(piece).toBeDefined()
    const y = camera.y
    down({ x: 30, y: 95 })
    down({ x: 35, y: 95 }, 2)
    pan({ x: 30, y: 85 }, 1)
    expect(camera.y).not.toBe(y)
    expect(ctl.selection).toBe(piece)
    up({ x: 30, y: 85 })
    up({ x: 35, y: 95 }, 2)
    expect(ctl.selection).toBe(piece)
    expect(sent).toEqual([])
  })

  it('a pinch with a tower armed leaves no stray tower', () => {
    build()
    ctl.build.arm('steal')
    down({ x: 30, y: 95 })
    down({ x: 35, y: 95 }, 2)
    pan({ x: 30, y: 85 }, 1)
    up({ x: 30, y: 85 })
    up({ x: 35, y: 95 }, 2)
    expect(ctl.selection).toBeUndefined()
    expect(sent).toEqual([])
  })

  describe('dragging a placed wall', () => {
    const mine: Structure = { ...older, id: 1 }
    beforeEach(() => {
      turns(mine)
      build()
      down(at)
      up(at)
    })

    it('commits one move at the drop when it is legal', () => {
      drag(at, { x: 24, y: 70 })
      expect(sent).toEqual([{ moveStructure: { player: 1, id: 1, a: { x: 20, y: 70 }, b: { x: 28, y: 70 } } }])
    })

    it('goes back to where it stood when dropped illegal, and sends nothing', () => {
      const origin = ctl.selection!.spec
      drag(at, { x: 24, y: 50 })
      expect(ctl.selection).toMatchObject({ id: 1, spec: origin })
      expect(sent).toEqual([])
    })

    it('a finger that jitters past the mouse slop on the selected wall is still a tap: no move, selection kept', () => {
      const origin = ctl.selection!.spec
      touch('pointerdown', at)
      touch('pointermove', jitter(at))
      touch('pointerup', jitter(at))
      expect(sent).toEqual([])
      expect(ctl.selection!.spec).toEqual(origin)
    })

    it('the same jitter with a mouse is a drag and commits a move', () => {
      fire('pointerdown', at)
      fire('pointermove', jitter(at))
      fire('pointerup', jitter(at))
      expect(sent).toEqual([{ moveStructure: expect.objectContaining({ player: 1, id: 1 }) }])
    })

    it('a body lift while a landing is in flight is sent when it settles', () => {
      drag({ x: 10, y: 90 }, { x: 10 + unit, y: 90 })
      expect(sent).toHaveLength(1)
      down(at)
      up(at)
      drag(at, { x: 24, y: 70 })
      expect(sent).toHaveLength(1)
      tick()
      expect(sent[1]).toEqual({ moveStructure: { player: 1, id: 1, a: { x: 20, y: 70 }, b: { x: 28, y: 70 } } })
    })

    it('rotating a placed wall into the Centre zone sends nothing and leaves it where it stood', () => {
      const spec = { a: { x: 26, y: 62 }, b: { x: 18, y: 62 } }
      turns({ ...older, id: 1, ...spec })
      build()
      down({ x: 22, y: 62 })
      up({ x: 22, y: 62 })
      expect(ctl.selection).toMatchObject({ id: 1 })
      const before = ctl.selection!.spec
      ctl.build.rotate()
      expect(sent).toEqual([])
      expect(ctl.selection!.spec).toEqual(before)
    })

    it('rotating a placed wall while a landing is in flight is sent when it settles', () => {
      drag({ x: 10, y: 90 }, { x: 10 + unit, y: 90 })
      expect(sent).toHaveLength(1)
      down(at)
      up(at)
      ctl.build.rotate()
      expect(sent).toHaveLength(1)
      tick()
      expect(sent).toHaveLength(2)
      expect(sent[1]).toHaveProperty('moveStructure')
    })

    it('a cancelled body drag of a red unplaced piece keeps the piece where it stood', () => {
      turns(older)
      build()
      drag({ x: 20, y: 60 }, { x: 20, y: 60 - unit })
      const before = ctl.selection!.spec
      expect(ctl.selection!.id).toBeUndefined()
      down({ x: 20, y: 56 })
      move({ x: 20, y: 50 })
      cancel({ x: 20, y: 50 })
      expect(ctl.selection!.spec).toEqual(before)
      expect(sent).toEqual([])
    })

    it('a second finger is ignored while it is dragged: no pan, and the drop still commits', () => {
      const y = camera.y
      down(at)
      move({ x: 24, y: 70 })
      down({ x: 35, y: 95 }, 2)
      move({ x: 35, y: 85 }, 2)
      expect(camera.y).toBe(y)
      up({ x: 35, y: 85 }, 2)
      up({ x: 24, y: 70 })
      expect(sent).toEqual([{ moveStructure: { player: 1, id: 1, a: { x: 20, y: 70 }, b: { x: 28, y: 70 } } }])
    })

    it('a cancelled pointer after a second finger leaves it at its origin and sends nothing', () => {
      const origin = ctl.selection!.spec
      down(at)
      move({ x: 24, y: 70 })
      down({ x: 35, y: 95 }, 2)
      cancel({ x: 24, y: 70 })
      expect(ctl.selection).toMatchObject({ id: 1, spec: origin })
      expect(sent).toEqual([])
    })

    it('Esc mid-drag puts it back', () => {
      const origin = ctl.selection!.spec
      down(at)
      move({ x: 24, y: 70 })
      key('Escape')
      expect(ctl.selection).toMatchObject({ id: 1, spec: origin })
      up({ x: 24, y: 70 })
      expect(sent).toEqual([])
    })

    it('an end that comes within the snap radius of another wall\'s end lands exactly on it', () => {
      turns(mine, { ...older, id: 7, ...hseg(2, 35) })
      build()
      down(at)
      up(at)
      // The wall's start would land 0.8 right and 0.5 below the other wall's end (12, 70).
      drag(at, { x: 16.8, y: 70.5 })
      const m = (sent[0] as { moveStructure: { a: Point; b: Point } }).moveStructure
      expect(m.a).toEqual({ x: 12, y: 70 })
      expect(m.b.x).toBeCloseTo(20)
      expect(m.b.y).toBeCloseTo(70)
    })

    it('a lone wall far from any end moves freely', () => {
      drag(at, { x: 24.4, y: 70.3 })
      const m = (sent[0] as { moveStructure: { a: Point } }).moveStructure
      expect(m.a.x).toBeCloseTo(20.4)
    })
  })

  describe('end handles', () => {
    const mine: Structure = { ...older, id: 1 }
    const a0 = { x: 20, y: 80 }
    const b0 = { x: 28, y: 80 }
    const D = unit * Math.SQRT1_2
    const select = (...more: Structure[]) => {
      turns(mine, ...more)
      build()
      down(at)
      up(at)
    }
    beforeEach(() => select())
    const moved = (i: SimInput | undefined) => (i as { moveStructure: { a: Point; b: Point } }).moveStructure

    it('grabbing a swings it around b: a snaps from b, b stays, and one move is sent on lift', () => {
      down(a0)
      move({ x: 20, y: 72 })
      const { spec } = ctl.selection!
      expect(spec).toMatchObject({ b: b0 })
      expect((spec as { a: Point }).a.x).toBeCloseTo(28 - D, 6)
      expect((spec as { a: Point }).a.y).toBeCloseTo(80 - D, 6)
      expect(sent).toEqual([])
      up({ x: 20, y: 72 })
      expect(sent).toHaveLength(1)
      expect(moved(sent[0]).b).toEqual(b0)
      expect(moved(sent[0]).a.x).toBeCloseTo(28 - D, 6)
    })

    it('grabbing b keeps a where it is', () => {
      drag(b0, { x: 28, y: 88 })
      expect(moved(sent[0]).a).toEqual(a0)
      expect(moved(sent[0]).b.x).toBeCloseTo(20 + D, 6)
      expect(moved(sent[0]).b.y).toBeCloseTo(80 + D, 6)
    })

    it('under half a unit from the other end keeps the last valid shape', () => {
      down(b0)
      move({ x: 28, y: 88 })
      const last = ctl.selection!.spec
      move({ x: 21, y: 80 })
      expect(ctl.selection!.spec).toEqual(last)
    })

    it('lengthening to 2 units spends the difference in Credits', () => {
      const before = state.credits[1]
      drag(b0, { x: 36, y: 80 })
      expect(sent).toEqual([{ moveStructure: { player: 1, id: 1, a: a0, b: { x: 36, y: 80 } } }])
      tick()
      expect(state.credits[1]).toBe(before - rules.wall.unitCost)
    })

    it('goes back to where it stood when the Credits will not cover the longer wall', () => {
      state = { ...state, credits: { ...state.credits, 1: 0 } }
      const origin = ctl.selection!.spec
      drag(b0, { x: 36, y: 80 })
      expect(sent).toEqual([])
      expect(ctl.selection).toMatchObject({ id: 1, spec: origin })
    })

    it('Esc and a cancelled pointer put it back, sending nothing', () => {
      const origin = ctl.selection!.spec
      down(b0)
      move({ x: 36, y: 80 })
      key('Escape')
      up({ x: 36, y: 80 })
      expect(ctl.selection).toMatchObject({ id: 1, spec: origin })
      down(a0)
      move({ x: 20, y: 72 })
      cancel({ x: 20, y: 72 })
      expect(ctl.selection).toMatchObject({ id: 1, spec: origin })
      expect(sent).toEqual([])
    })

    it('an end lifted while a landing is in flight is sent when it settles', () => {
      drag({ x: 10, y: 90 }, { x: 10 + unit, y: 90 })
      drag(b0, { x: 36, y: 80 })
      expect(sent).toHaveLength(1)
      down(at)
      up(at)
      drag(b0, { x: 36, y: 80 })
      expect(sent).toHaveLength(1)
      tick()
      expect(sent[1]).toEqual({ moveStructure: { player: 1, id: 1, a: a0, b: { x: 36, y: 80 } } })
    })

    it('a handle wins over another own wall whose body lies under the same press', () => {
      select({ ...older, id: 7, ...hseg(14, 41) }) // body 2 units below b, nearer to the press than b is
      down({ x: 28, y: 81.5 })
      move({ x: 28, y: 90 })
      expect(ctl.selection).toMatchObject({ id: 1 })
      expect((ctl.selection!.spec as { a: Point }).a).toEqual(a0)
    })

    describe('the mouse cursor', () => {
      const cursor = () => (canvas as unknown as { style: { cursor: string } }).style.cursor

      it('is a grab hand over a handle and clears elsewhere', () => {
        move({ x: 28.5, y: 80 })
        expect(cursor()).toBe('grab')
        move({ x: 24, y: 80 })
        expect(cursor()).toBe('')
        move({ x: 20, y: 80.5 })
        expect(cursor()).toBe('grab')
        move({ x: 20, y: 95 })
        expect(cursor()).toBe('')
      })

      it('is a closed hand during an end drag or a body drag, then the default again', () => {
        down(b0)
        move({ x: 36, y: 80 })
        expect(cursor()).toBe('grabbing')
        key('Escape')
        expect(cursor()).toBe('')
        down({ x: 24, y: 80 })
        move({ x: 24, y: 75 })
        expect(cursor()).toBe('grabbing')
        up({ x: 24, y: 75 })
        expect(cursor()).toBe('')
      })

      it('clears when the press is cancelled from outside, however it ends', () => {
        down(b0)
        move({ x: 36, y: 80 })
        expect(cursor()).toBe('grabbing')
        ctl.cancelGestures()
        expect(cursor()).toBe('')
        down(a0)
        move({ x: 20, y: 72 })
        expect(cursor()).toBe('grabbing')
        cancel({ x: 20, y: 72 })
        expect(cursor()).toBe('')
      })

      it('is a grab hand again when the sim takes the move and re-selects the wall under a still mouse', () => {
        drag(b0, { x: 36, y: 80 })
        move({ x: 20, y: 80.5 })
        expect(sent).toHaveLength(1)
        expect(cursor()).toBe('')
        tick()
        expect(ctl.selection).toMatchObject({ id: 1 })
        expect(cursor()).toBe('grab')
      })

      it('stays default with nothing selected, and for touch', () => {
        key('Escape')
        move(b0)
        expect(cursor()).toBe('')
        down(at)
        up(at)
        touch('pointermove', b0)
        expect(cursor()).toBe('')
      })
    })

    describe('two fingers, one on each end', () => {
      const f2 = { x: 28, y: 80 }
      const grab = () => {
        touch('pointerdown', a0, 1)
        touch('pointerdown', f2, 2)
      }
      const span = () => {
        touch('pointermove', { x: 12, y: 70 }, 1)
        touch('pointermove', { x: 28, y: 70 }, 2)
      }

      const px1 = () => 1 / Math.abs(camera.view(canvas as unknown as HTMLCanvasElement).sy)
      const add = (p: Point, dx: number, dy: number) => ({ x: p.x + dx, y: p.y + dy })

      it('two fingers landing together start the edit: the wall follows both and the camera does not pan', () => {
        const y = camera.y
        touch('pointerdown', a0, 1)
        touch('pointerdown', f2, 2)
        touch('pointermove', { x: 12, y: 70 }, 1)
        touch('pointermove', { x: 28, y: 70 }, 2)
        expect(ctl.selection!.spec).toMatchObject({ a: { x: 12, y: 70 }, b: { x: 28, y: 70 } })
        expect(camera.y).toBe(y)
        touch('pointerup', { x: 12, y: 70 }, 1)
        touch('pointerup', { x: 28, y: 70 }, 2)
        expect(sent).toEqual([{ moveStructure: { player: 1, id: 1, a: { x: 12, y: 70 }, b: { x: 28, y: 70 } } }])
      })

      it('fingers landing anywhere in the handles keep a 1 unit wall until they really move it', () => {
        const origin = ctl.selection!.spec
        const fa = add(a0, 1.5, 1.2)
        const fb = add(b0, -1.5, -1.2)
        touch('pointerdown', fa, 1)
        touch('pointerdown', fb, 2)
        touch('pointermove', add(fa, px1(), 0), 1)
        touch('pointermove', add(fb, -px1(), 0), 2)
        expect(ctl.selection!.spec).toEqual(origin)
        touch('pointerup', add(fa, px1(), 0), 1)
        touch('pointerup', add(fb, -px1(), 0), 2)
        expect(sent).toEqual([])
        expect(ctl.selection).toMatchObject({ id: 1, spec: origin })
      })

      it('fingers on the outer edges of the handles keep the wall 1 unit', () => {
        const origin = ctl.selection!.spec
        const fa = add(a0, -1.5, -1.2)
        const fb = add(b0, 1.5, 1.2)
        touch('pointerdown', fa, 1)
        touch('pointerdown', fb, 2)
        touch('pointermove', add(fa, px1(), 0), 1)
        touch('pointermove', add(fb, -px1(), 0), 2)
        expect(ctl.selection!.spec).toEqual(origin)
      })

      it('one finger already dragging does not jump the wall when the second lands inside its handle', () => {
        touch('pointerdown', add(a0, 1.5, 1.2), 1)
        touch('pointermove', add(a0, 1.5, 1.2 + 3 * px1()), 1)
        const before = ctl.selection!.spec
        touch('pointerdown', add(b0, -1.5, -1.2), 2)
        touch('pointermove', add(b0, -1.5, -1.2), 2)
        expect(ctl.selection!.spec).toEqual(before)
      })

      it('a single end grabbed off-centre does not jump when it starts moving', () => {
        touch('pointerdown', add(b0, -1.5, -1.2))
        touch('pointermove', add(b0, -1.5, -1.2 + 2 * px1()))
        const { a, b } = ctl.selection!.spec as { a: Point; b: Point }
        expect(a).toEqual(a0)
        expect(b.x).toBeCloseTo(28, 6)
        expect(b.y).toBeCloseTo(80, 6)
      })

      it('both ends follow the fingers: midpoint, angle and length from the pair', () => {
        grab()
        span()
        expect(ctl.selection!.spec).toMatchObject({ a: { x: 12, y: 70 }, b: { x: 28, y: 70 } })
        expect(sent).toEqual([])
      })

      it('commits one move when the last finger lifts, not when the first does', () => {
        grab()
        span()
        touch('pointerup', { x: 12, y: 70 }, 1)
        expect(sent).toEqual([])
        touch('pointerup', { x: 28, y: 70 }, 2)
        expect(sent).toEqual([{ moveStructure: { player: 1, id: 1, a: { x: 12, y: 70 }, b: { x: 28, y: 70 } } }])
      })

      it('the finger left carries on as an end drag of the end it held', () => {
        grab()
        span()
        touch('pointerup', { x: 12, y: 70 }, 1)
        touch('pointermove', { x: 28, y: 78 }, 2)
        // Finger 2 holds b: a stays at (12, 70) and b swings round it.
        expect(ctl.selection!.spec).toMatchObject({ a: { x: 12, y: 70 } })
        expect((ctl.selection!.spec as { b: Point }).b.x).toBeCloseTo(12 + 2 * unit * Math.SQRT1_2, 6)
        touch('pointerup', { x: 28, y: 78 }, 2)
        expect(sent).toHaveLength(1)
      })

      it('fingers closer than half a unit keep the last valid shape', () => {
        grab()
        span()
        touch('pointermove', { x: 20, y: 70 }, 1)
        const last = ctl.selection!.spec
        touch('pointermove', { x: 21, y: 70 }, 2)
        expect(ctl.selection!.spec).toEqual(last)
      })

      it('an illegal pair reverts to the origin on the last lift', () => {
        const origin = ctl.selection!.spec
        grab()
        touch('pointermove', { x: 12, y: 50 }, 1)
        touch('pointermove', { x: 28, y: 50 }, 2)
        touch('pointerup', { x: 12, y: 50 }, 1)
        touch('pointerup', { x: 28, y: 50 }, 2)
        expect(sent).toEqual([])
        expect(ctl.selection).toMatchObject({ id: 1, spec: origin })
      })

      it('a cancel mid-way puts the wall back and sends nothing', () => {
        const origin = ctl.selection!.spec
        grab()
        span()
        fire('pointercancel', { x: 12, y: 70 }, 1, { pointerType: 'touch' })
        expect(ctl.selection).toMatchObject({ id: 1, spec: origin })
        touch('pointerup', { x: 28, y: 70 }, 2)
        expect(sent).toEqual([])
      })

      it('lifting finger 2 leaves finger 1 dragging a with b fixed; the last lift sends one move', () => {
        grab()
        span()
        touch('pointerup', { x: 28, y: 70 }, 2)
        touch('pointermove', { x: 16, y: 81 }, 1)
        const { a, b } = ctl.selection!.spec as { a: Point; b: Point }
        expect(b).toEqual({ x: 28, y: 70 })
        expect(a.x).toBeCloseTo(28 - 2 * D, 6)
        expect(a.y).toBeCloseTo(70 + 2 * D, 6)
        expect(sent).toEqual([])
        touch('pointerup', { x: 16, y: 81 }, 1)
        expect(sent).toHaveLength(1)
        expect(moved(sent[0]).b).toEqual({ x: 28, y: 70 })
      })

      it('a cancelled finger 2 puts the wall back; finger 1 then moves and lifts without effect', () => {
        const origin = ctl.selection!.spec
        grab()
        span()
        fire('pointercancel', { x: 28, y: 70 }, 2, { pointerType: 'touch' })
        expect(ctl.selection).toMatchObject({ id: 1, spec: origin })
        touch('pointermove', { x: 12, y: 60 }, 1)
        touch('pointerup', { x: 12, y: 60 }, 1)
        expect(ctl.selection).toMatchObject({ id: 1, spec: origin })
        expect(sent).toEqual([])
      })

      it('a third finger mid-edit is no takeover and no pan, and its lift does not end the edit', () => {
        grab()
        span()
        const [y, spec] = [camera.y, ctl.selection!.spec]
        touch('pointerdown', { x: 20, y: 90 }, 3)
        touch('pointermove', { x: 20, y: 80 }, 3)
        expect(camera.y).toBe(y)
        expect(ctl.selection!.spec).toEqual(spec)
        touch('pointerup', { x: 20, y: 80 }, 3)
        expect(sent).toEqual([])
        touch('pointermove', { x: 12, y: 72 }, 1)
        expect((ctl.selection!.spec as { a: Point }).a).toEqual({ x: 12, y: 71 })
        touch('pointerup', { x: 12, y: 72 }, 1)
        touch('pointerup', { x: 28, y: 70 }, 2)
        expect(sent).toHaveLength(1)
      })

      it('fingers pinched under half a unit lift to the last valid shape, committed when legal', () => {
        grab()
        span()
        touch('pointermove', { x: 20, y: 70 }, 1)
        touch('pointermove', { x: 21, y: 70 }, 2)
        touch('pointerup', { x: 20, y: 70 }, 1)
        touch('pointerup', { x: 21, y: 70 }, 2)
        expect(sent).toEqual([{ moveStructure: { player: 1, id: 1, a: { x: 20, y: 70 }, b: { x: 28, y: 70 } } }])
      })

      it('fingers pinched under half a unit lift to the last valid shape, reverted when illegal', () => {
        const origin = ctl.selection!.spec
        grab()
        touch('pointermove', { x: 20, y: 50 }, 1)
        touch('pointermove', { x: 28, y: 50 }, 2)
        touch('pointermove', { x: 21, y: 50 }, 2)
        touch('pointerup', { x: 20, y: 50 }, 1)
        touch('pointerup', { x: 21, y: 50 }, 2)
        expect(sent).toEqual([])
        expect(ctl.selection).toMatchObject({ id: 1, spec: origin })
      })

      it('Esc mid-way puts the wall back too', () => {
        const origin = ctl.selection!.spec
        grab()
        span()
        key('Escape')
        expect(ctl.selection).toMatchObject({ id: 1, spec: origin })
      })
    })

    describe('an unplaced red piece', () => {
      const cross = { x: 24, y: 72 }
      beforeEach(() => {
        turns(older)
        build()
      })

      it('stays red and unsent while its end drag is illegal, and is placed when the end is dragged to a legal spot', () => {
        drag(cross, { x: 24, y: 88 })
        expect(ctl.selection).toMatchObject({ movable: true })
        expect(ctl.selection!.id).toBeUndefined()
        expect(sent).toEqual([])
        drag({ x: 24, y: 88 }, { x: 24, y: 90 })
        expect(sent).toEqual([])
        expect(ctl.selection!.id).toBeUndefined()
        drag({ x: 24, y: 88 }, { x: 36, y: 88 })
        expect(sent).toHaveLength(1)
        expect(sent[0]).toMatchObject({ placeWall: { kind: 'wall', owner: 1, a: cross } })
      })
    })

    it('shortening a placed wall from 2 units to 1 commits and refunds the difference', () => {
      turns({ ...older, id: 1, b: { x: 36, y: 80 } })
      build()
      down({ x: 28, y: 80 })
      up({ x: 28, y: 80 })
      const before = state.credits[1]
      drag({ x: 36, y: 80 }, b0)
      expect(sent).toEqual([{ moveStructure: { player: 1, id: 1, a: a0, b: b0 } }])
      tick()
      expect(state.credits[1]).toBe(before + rules.wall.unitCost)
    })

    it('a second finger off the other handle is ignored mid-drag', () => {
      touch('pointerdown', b0)
      touch('pointermove', { x: 28, y: 88 })
      const y = camera.y
      touch('pointerdown', { x: 40, y: 95 }, 2)
      touch('pointermove', { x: 40, y: 85 }, 2)
      touch('pointermove', { x: 28, y: 90 })
      expect(camera.y).toBe(y)
      touch('pointerup', { x: 40, y: 85 }, 2)
      touch('pointerup', { x: 28, y: 90 })
      expect(sent).toHaveLength(1)
      expect(moved(sent[0]).a).toEqual(a0)
    })
  })

  describe('chaining from a wall\'s end', () => {
    const placeOne = () => {
      build()
      drag({ x: 10, y: 80 }, { x: 10 + unit, y: 80 })
      tick()
    }

    it('the wall just placed is selected, so dragging from its end swings it until the builder taps off', () => {
      turns()
      placeOne()
      expect(ctl.selection).toMatchObject({ id: 1, movable: true })
      drag({ x: 10 + unit, y: 80 }, { x: 10 + unit, y: 90 })
      expect(sent[1]).toMatchObject({ moveStructure: { id: 1, a: { x: 10, y: 80 } } })
    })

    it('after a tap off, dragging from its end draws a new wall starting exactly on that end', () => {
      turns()
      placeOne()
      down({ x: 30, y: 95 })
      up({ x: 30, y: 95 })
      expect(ctl.selection).toBeUndefined()
      drag({ x: 10 + unit + 0.4, y: 80.2 }, { x: 10 + unit + 0.4, y: 88.2 })
      expect(sent[1]).toEqual({ placeWall: { kind: 'wall', owner: 1, a: { x: 10 + unit, y: 80 }, b: { x: 10 + unit, y: 88 } } })
    })
  })

  it('a drag that starts on an opponent wall draws when the wall is armed', () => {
    turns({ ...older, id: 9, owner: 2 })
    build()
    down(at)
    move({ x: 24, y: 88 })
    expect(ctl.selection).toMatchObject({ movable: true, spec: { kind: 'wall', owner: 1, a: { x: 24, y: 80 } } })
    expect(ctl.selection!.id).toBeUndefined()
    up({ x: 24, y: 88 })
    expect(sent).toEqual([{ placeWall: { kind: 'wall', owner: 1, a: { x: 24, y: 80 }, b: { x: 24, y: 88 } } }])
  })

  describe('a Rearrange turn', () => {
    const siege = { ...c, mode: 'siege' as const }
    const base = initialState(1, siege)
    beforeEach(() => make({ ...base, match: { ...base.match, builder: 1, opening: false } as SimState['match'], objects: [{ ...older, id: 1 }], built: [1] }))

    it('a drag on empty pitch pans', () => {
      const y = camera.y
      down({ x: 10, y: 100 })
      fire('pointermove', { x: 10, y: 90 })
      expect(camera.y).not.toBe(y)
    })

    it('a finger that jitters on an own wall still selects it', () => {
      touch('pointerdown', at)
      touch('pointermove', jitter(at))
      touch('pointerup', jitter(at))
      expect(ctl.selection).toMatchObject({ id: 1, movable: true })
      expect(sent).toEqual([])
    })

    it('an end drag that changes the length reverts, one that keeps it commits', () => {
      down(at)
      up(at)
      const origin = ctl.selection!.spec
      drag({ x: 28, y: 80 }, { x: 36, y: 80 })
      expect(sent).toEqual([])
      expect(ctl.selection).toMatchObject({ id: 1, spec: origin })
      drag({ x: 28, y: 80 }, { x: 28, y: 88 })
      expect(sent).toEqual([{ moveStructure: { player: 1, id: 1, a: { x: 20, y: 80 }, b: { x: 20 + unit * Math.SQRT1_2, y: 80 + unit * Math.SQRT1_2 } } }])
    })

    it('a tap selects an own wall and a body drag then commits a move', () => {
      down(at)
      up(at)
      expect(ctl.selection).toMatchObject({ id: 1, movable: true })
      drag(at, { x: 24, y: 70 })
      expect(sent).toEqual([{ moveStructure: { player: 1, id: 1, a: { x: 20, y: 70 }, b: { x: 28, y: 70 } } }])
    })
  })
})

describe('the Breaker from the Offence circle', () => {
  const ready = (): SimState => {
    const s = playState()
    return { ...s, possession: { ...s.possession, inHand: false } }
  }
  /** Press the ball and release in the edge cancel zone, which is where an aim is cancelled. */
  const cancelAim = () => {
    const ball = state.ball.pos
    down(ball)
    const at = px(ball)
    canvas.dispatchEvent(Object.assign(new Event('pointermove'), { offsetX: 4, offsetY: at.y, clientX: 4, clientY: at.y, pointerId: 1, pointerType: 'mouse', button: 0 }))
    canvas.dispatchEvent(Object.assign(new Event('pointerup'), { offsetX: 4, offsetY: at.y, clientX: 4, clientY: at.y, pointerId: 1, pointerType: 'mouse', button: 0 }))
  }

  it('arms with Credits to cover it', () => {
    make(ready())
    ctl.toggleArm()
    expect(ctl.armed).toBe(true)
  })
  it('stays unarmed when the shooter cannot afford it', () => {
    const s = ready()
    make({ ...s, credits: { ...s.credits, [s.possession.shooter]: rules.breakerCost - 1 } })
    ctl.toggleArm()
    expect(ctl.armed).toBe(false)
  })
  it('a cancelled aim disarms it and sends no shot', () => {
    make(ready())
    ctl.toggleArm()
    expect(ctl.armed).toBe(true)
    cancelAim()
    expect(ctl.armed).toBe(false)
    expect(sent.some((i) => i.shot)).toBe(false)
  })
})
