import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { visual } from '../config/visual'
import { defaultSettings } from '../sim/settings'
import { LocalDriver, type Driver } from './driver'
import type { Structure } from '../sim/wall'
import { Game, type HudView } from './Game'
import { hseg } from '../sim/testkit'

// No DOM in the test run: a canvas that is an EventTarget, a window that is one, a context that swallows every call.
class FakeCanvas extends EventTarget {
  width = 400
  height = 640
  clientWidth = 400
  clientHeight = 640
  setPointerCapture() {}
  getContext() {
    const ctx: unknown = new Proxy({ canvas: this }, { get: (t, k) => (k in t ? (t as never)[k] : () => ({ addColorStop() {} })), set: () => true })
    return ctx
  }
}

let frames: Map<number, (t: number) => void>
let nextId: number
let win: EventTarget
beforeEach(() => {
  frames = new Map()
  nextId = 1
  win = new EventTarget()
  vi.stubGlobal('addEventListener', win.addEventListener.bind(win))
  vi.stubGlobal('requestAnimationFrame', (f: (t: number) => void) => (frames.set(nextId, f), nextId++))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  vi.stubGlobal('window', { devicePixelRatio: 1 })
})
afterEach(() => vi.unstubAllGlobals())

const frame = (t: number) => {
  const [id, f] = [...frames][0]
  frames.delete(id)
  f(t)
}
const make = (onView?: (v: HudView) => void) => new Game(new FakeCanvas() as unknown as HTMLCanvasElement, (sink) => new LocalDriver(sink), onView)
const press = (key: string) => win.dispatchEvent(Object.assign(new Event('keydown'), { key, code: key }))

describe('Game', () => {
  it('calls onView only when the view changes', () => {
    const onView = vi.fn()
    make(onView)
    const t = performance.now()
    // The constructor pushes the first view; a frame may move time-driven parts (the card's progress).
    expect(onView).toHaveBeenCalledTimes(1)
    frame(t)
    const settled = onView.mock.calls.length
    expect(settled).toBeLessThanOrEqual(2)
    frame(t)
    frame(t)
    expect(onView).toHaveBeenCalledTimes(settled)
    press('m')
    frame(t)
    expect(onView).toHaveBeenCalledTimes(settled + 1)
    expect(onView.mock.lastCall![0].mapOpen).toBe(true)
  })

  it('destroy stops the loop and removes every listener', () => {
    const onView = vi.fn()
    const game = make(onView)
    frame(performance.now())
    expect(frames.size).toBe(1)
    game.destroy()
    expect(frames.size).toBe(0)
    onView.mockClear()
    press('m')
    game.actions.recenter()
    expect(game['mapOpen']).toBe(false)
    expect(onView).not.toHaveBeenCalled()
  })

  it('opens and closes the map through its actions', () => {
    const onView = vi.fn()
    const game = make(onView)
    const t = performance.now()
    frame(t)
    game.actions.map(true)
    frame(t)
    expect(onView.mock.lastCall![0].mapOpen).toBe(true)
    game.actions.map(false)
    frame(t)
    expect(onView.mock.lastCall![0].mapOpen).toBe(false)
  })

  it('ticks the entity clocks before the sim, and flags the entities before drawing, so effects keep their first frame', () => {
    const game = make()
    const order: string[] = []
    const spy = <T extends object>(o: T, k: keyof T, tag: string) => {
      const orig = (o[k] as (...a: unknown[]) => unknown).bind(o)
      ;(o[k] as unknown) = (...a: unknown[]) => (order.push(tag), orig(...a))
    }
    spy(game.camera, 'update', 'camera.update')
    spy(game['driver'], 'update', 'driver.update')
    spy(game.structures, 'mark', 'mark')
    spy(game.camera, 'draw', 'draw')
    frame(performance.now())
    expect(order).toEqual(['camera.update', 'driver.update', 'mark', 'draw'])
  })

  it('draws the open map with the main camera\'s shake', () => {
    const game = make()
    const t = performance.now()
    frame(t)
    game.actions.map(true)
    const draw = vi.spyOn(game.mapCam, 'draw')
    game.camera.shake(4)
    frame(t + 16)
    expect(draw.mock.lastCall![2]).toEqual(game.camera.shakeNow)
  })

  it('a Siege opening build is blind: the camera clamps to the builder\'s half and the fog hides the other', () => {
    const game = make()
    game.actions.start({ ...defaultSettings, mode: 'siege' })
    const builder = game.state.match.builder!
    expect([game.camera.blind, game.fog.blind]).toEqual([builder, builder])
    game.actions.start({ ...defaultSettings, mode: 'rounds' })
    expect(game.fog.blind).toBeUndefined()
  })

  it('draws the fx layer last, above the ball and aim', () => {
    const game = make()
    expect(game.camera.children.slice(-3)).toEqual([game.ball, game.aim, game.structures.fx])
  })

  it('the reveal shows the whole pitch through the map camera with the fog lifted, then returns to the main camera', () => {
    const game = make()
    game.actions.start({ ...defaultSettings, mode: 'siege' })
    const t = performance.now()
    frame(t)
    const { match } = game.state
    if (match.mode !== 'siege') throw new Error('expected siege')
    game.apply({ ...game.state, match: { ...match, builder: null, opening: false } }, [])
    const map = vi.spyOn(game.mapCam, 'draw')
    const main = vi.spyOn(game.camera, 'draw')
    frame(t)
    expect(map).toHaveBeenCalledTimes(1)
    expect(main).not.toHaveBeenCalled()
    expect(game.fog.blind).toBeUndefined()
    frame(t + visual.transition.revealMs)
    expect(main).toHaveBeenCalledTimes(1)
    expect(map).toHaveBeenCalledTimes(1)
  })

  it('a new match forgets the last one\'s visual state', () => {
    const game = make()
    game.camera.shake(4)
    game.structures.burst({ x: 0, y: 0 }, 'red', 3)
    game.actions.rematch()
    expect(game.camera.shakeNow).toEqual({ x: 0, y: 0 })
  })

  it('starting a match pushes its view at once, so a finished match\'s winner never lingers', () => {
    const onView = vi.fn()
    const game = make(onView)
    frame(performance.now())
    const { match } = game.state
    game.apply({ ...game.state, match: { ...match, winner: 1 } }, [])
    frame(performance.now())
    expect(onView.mock.lastCall![0].winner).toBe(1)
    game.actions.rematch()
    expect(onView.mock.lastCall![0].winner).toBeUndefined()
  })

  it('runs on whatever driver it is given: it starts, steps and sends through that driver alone', () => {
    const calls: string[] = []
    const fake: Driver = {
      start: (config, seed) => (calls.push('start'), new LocalDriver({ apply() {}, blocked: () => false }).start(config, seed)),
      send: (input) => void calls.push(`send ${Object.keys(input)}`),
      update: () => void calls.push('update'),
    }
    const canvas = new FakeCanvas()
    const game = new Game(canvas as unknown as HTMLCanvasElement, () => fake)
    expect(calls).toEqual(['start'])
    frame(performance.now())
    expect(calls).toContain('update')
    // Let the opening card pass, then draw a one-unit wall across the middle of the builder's half.
    const later = performance.now() + 60_000
    frame(later)
    vi.spyOn(performance, 'now').mockReturnValue(later)
    game.actions.dismiss()
    game.actions.build.toggle()
    const at = (type: string, offsetX: number) => canvas.dispatchEvent(Object.assign(new Event(type), { offsetX, offsetY: 320, clientX: offsetX, clientY: 320, pointerId: 1 }))
    at('pointerdown', 100)
    at('pointermove', 190)
    at('pointerup', 190)
    expect(calls).toContain('send placeWall')
    vi.restoreAllMocks()
    game.destroy()
  })

  it('routes a tick\'s destroy events before syncing structures, so a destroyed wall shatters instead of being dropped', () => {
    const game = make()
    const wall: Structure = { id: 99, kind: 'wall', owner: 1, ...hseg(10, 40), hp: 3 }
    game.apply({ ...game.state, objects: [wall] }, [])
    expect(game.structures.count).toBe(1)
    game.apply({ ...game.state, objects: [] }, [{ type: 'wall-destroyed', wall: { ...wall, hp: 0 }, at: { x: 20, y: 40 } }])
    expect(game.structures.count).toBe(1)
    expect(game.structures.get(99)!.isShattering).toBe(true)
  })
})
