import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { minimapOf } from './view/minimap'
import { rules } from '../config/rules'
import { visual } from '../config/visual'
import { defaultSettings, withMode } from '../sim/settings'
import { LocalDriver, type Driver } from './driver'
import type { Structure } from '../sim/wall'
import { Game, type HudView } from './Game'
import { hseg } from '../sim/testkit'
import { STRATEGIES } from './view/strategies'
import type { Transition } from './view/transition'

// No DOM in the test run: a canvas that is an EventTarget, a window that is one, a context that swallows every call.
class FakeCanvas extends EventTarget {
  width = 400
  height = 640
  clientWidth = 400
  clientHeight = 640
  style = { cursor: '' }
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

  describe('build dock', () => {
    afterEach(() => vi.restoreAllMocks())
    /** A Siege (or Rounds) match with Player 1's opening build turn up; `step` advances the clock and runs a frame. */
    const opened = (mode: 'siege' | 'rounds' = 'siege') => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      let t = 1000
      vi.spyOn(performance, 'now').mockImplementation(() => t)
      let view: HudView | undefined
      const game = new Game(new FakeCanvas() as unknown as HTMLCanvasElement, (sink) => new LocalDriver(sink), (v) => (view = v))
      game.actions.start(withMode(defaultSettings, mode))
      frame(t)
      t += 1500
      frame(t)
      frame(t)
      const step = (ms = 100) => ((t += ms), frame(t))
      return { game, step, view: () => view! }
    }

    it('a build turn that places pieces opens in build mode with the Wall armed', () => {
      const { view } = opened()
      expect(view().defence).toMatchObject({ building: true, item: 'wall' })
      expect(view().hud.dock).toBe('build')
    })

    it('the first-round hint rides the HUD and clears at the player\'s first action', () => {
      const { game, step, view } = opened('rounds')
      expect(view().hud.hint).toMatch(/draw a wall/)
      expect(view().overlay).toBeUndefined()
      game.actions.strategies.toggle()
      step()
      game.actions.strategies.apply('chevron')
      step()
      expect(view().hud.hint).toBeUndefined()
    })

    const { outMs, gapMs, inMs } = visual.transition.slide
    const slideMs = outMs + gapMs + inMs
    const flip = (game: Game) => (game as unknown as { transition: Transition }).transition.flip

    it('the hint returns for the next player after a handover, and is hidden while the flip runs', () => {
      const { game, step, view } = opened('rounds')
      const builder = game.state.match.builder!
      game.actions.strategies.toggle()
      step()
      game.actions.strategies.apply('chevron')
      step()
      expect(view().hud.hint).toBeUndefined()
      view().hud.buttons!.find((b) => b.label === 'Done')!.onClick()
      step()
      expect(flip(game)).toBeDefined()
      expect(view().hud.hint).toBeUndefined()
      // Past the swap the incoming player's hint slides in with their Dock, while the sim and input are still held.
      step(outMs + gapMs)
      expect(flip(game)).toBeDefined()
      expect(view().hud.hint).toMatch(/draw a wall/)
      expect(view().slide.dock).toBeGreaterThan(0)
      step(slideMs + 100)
      expect(flip(game)).toBeUndefined()
      expect(view().slide).toEqual({ dock: 0, chrome: 1 })
      expect(game.state.match.builder).not.toBe(builder)
      expect(view().hud.hint).toMatch(/draw a wall/)
    })

    it('an input sent behind the handover hold does not count as the incoming player acting', () => {
      const { game, step, view } = opened('rounds')
      view().hud.buttons!.find((b) => b.label === 'Done')!.onClick()
      step()
      expect(flip(game)).toBeDefined()
      // Stands in for the drop of a half-made aim that the hold forces: it goes through the same send, while the board is blocked.
      game.actions.subterfuge('jam')
      step(slideMs + 100)
      expect(flip(game)).toBeUndefined()
      expect(view().hud.hint).toMatch(/draw a wall/)
    })

    it('the Strategies tray opens and closes, with a card per layout', () => {
      const { game, step, view } = opened()
      expect(view().strategies).toBeUndefined()
      game.actions.strategies.toggle()
      step()
      expect(view().strategies?.map((c) => c.id)).toEqual(['bulwark', 'fortress', 'honeycomb', 'bastion', 'layers', 'labyrinth', 'chevron', 'zigzag', 'net', 'pinball', 'wings', 'gauntlet', 'spider', 'turrets', 'crossfire', 'watchtowers'])
      game.actions.strategies.toggle()
      step()
      expect(view().strategies).toBeUndefined()
    })

    it('a Strategy goes down a piece a tick, closes the tray, and a second one replaces it at its own card cost', () => {
      const { game, step, view } = opened('rounds')
      const builder = game.state.match.builder!
      const credits = game.state.credits[builder]
      const pieces = (id: string) => STRATEGIES.find((st) => st.id === id)!.pieces.length
      game.actions.strategies.toggle()
      step()
      const bulwarkCost = view().strategies!.find((k) => k.id === 'bulwark')!.cost
      game.actions.strategies.apply('chevron')
      for (let i = 0; i < 60; i++) step()
      expect(game.state.objects.filter((o) => o.owner === builder)).toHaveLength(pieces('chevron'))
      expect(view().strategies).toBeUndefined()
      game.actions.strategies.toggle()
      game.actions.strategies.apply('bulwark')
      for (let i = 0; i < 60; i++) step()
      expect(game.state.objects.filter((o) => o.owner === builder)).toHaveLength(pieces('bulwark'))
      expect(credits - game.state.credits[builder]).toBe(bulwarkCost)
    })

    it('the tray does not open outside a build turn', () => {
      const { game, step, view } = opened()
      const builder = game.state.match.builder!
      game.state = { ...game.state, match: { ...game.state.match, builder: null } }
      game.actions.strategies.toggle()
      step()
      expect(view().strategies).toBeUndefined()
      expect(builder).toBeDefined()
    })
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

  it('the minimap thumbnail tracks the live camera', () => {
    // Seat 1 at the bottom with the HUD on it: the thumbnail is not mirrored, so a pan toward the far end moves the frame up.
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const onView = vi.fn()
    const game = make(onView)
    game.actions.start(withMode(defaultSettings, 'rounds'))
    expect(game.state.match.builder ?? game.state.possession.shooter).toBe(1)
    const t = performance.now()
    frame(t)
    // The opening hold has passed.
    frame(t + 5000)
    // Start held at mid-pitch, clear of both clamps wherever the follow had settled, so the pan below always moves the view.
    game.camera.pan(rules.pitchHeight / 2 - game.camera.y)
    frame(t + 5016)
    const before = onView.mock.lastCall![0].minimap.frame
    game.camera.pan(10)
    frame(t + 5032)
    const after = onView.mock.lastCall![0].minimap.frame
    // The pan is 10 of the map's units, and it moves the frame the same way as the camera: down the thumbnail.
    expect(after.top - before.top).toBeCloseTo(10 / rules.mapHeight, 2)
    expect(after.height).toBe(before.height)
    vi.restoreAllMocks()
  })

  it('the map camera fits above the HUD band the main camera keeps clear', () => {
    const game = make()
    game.actions.map(true)
    frame(performance.now())
    expect(game.mapCam.reserve).toEqual(game.camera.reserve)
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
    game.actions.start(withMode(defaultSettings, 'siege'))
    const builder = game.state.match.builder!
    expect([game.camera.blind, game.fog.blind]).toEqual([builder, builder])
    game.actions.start(withMode(defaultSettings, 'rounds'))
    expect(game.fog.blind).toBeUndefined()
  })

  it('draws the fx layer last, above the ball and aim', () => {
    const game = make()
    expect(game.camera.children.slice(-3)).toEqual([game.ball, game.aim, game.structures.fx])
  })

  it('draws the aim gauge under the ball', () => {
    const game = make()
    expect(game.camera.children.slice(-4, -2)).toEqual([game.gauge, game.ball])
  })

  it('the reveal shows the whole pitch through the map camera with the fog lifted, then returns to the main camera', () => {
    const game = make()
    game.actions.start(withMode(defaultSettings, 'siege'))
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
      start: (config, seed) => (calls.push('start'), new LocalDriver({ apply() {}, simPaused: () => false }).start(config, seed)),
      send: (input) => void calls.push(`send ${Object.keys(input)}`),
      update: () => void calls.push('update'),
    }
    const canvas = new FakeCanvas()
    const game = new Game(canvas as unknown as HTMLCanvasElement, () => fake)
    expect(calls).toEqual(['start'])
    frame(performance.now())
    expect(calls).toContain('update')
    // Let the opening hold pass, then draw a one-unit wall across the middle of the builder's half.
    const later = performance.now() + 60_000
    frame(later)
    vi.spyOn(performance, 'now').mockReturnValue(later)
    // The build turn opened in build mode with the Wall armed: a drag draws.
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
    const wall: Structure = { id: 99, kind: 'wall', owner: 1, ...hseg(10, 40), segments: [3] }
    game.apply({ ...game.state, objects: [wall] }, [])
    expect(game.structures.count).toBe(1)
    game.apply({ ...game.state, objects: [] }, [{ type: 'wall-destroyed', wall: { ...wall, segments: [0] }, at: { x: 20, y: 40 } }])
    expect(game.structures.count).toBe(1)
    expect(game.structures.get(99)!.isShattering).toBe(true)
  })

  it('counts Bullseye Credits per player for the Resource bar, from zero again on a rematch', () => {
    const onView = vi.fn()
    const game = make(onView)
    const t = performance.now()
    game.actions.start(withMode(defaultSettings, 'rounds'))
    game.apply(game.state, [{ type: 'bullseye-credited', player: 2, credits: 2 }])
    frame(t)
    const bar = () => onView.mock.lastCall![0].hud.resourceBar
    expect([bar()[1].bullseyes, bar()[2].bullseyes]).toEqual([0, 1])
    game.actions.rematch()
    frame(t)
    expect(bar()[2].bullseyes).toBe(0)
    game.destroy()
  })

  describe('Tabletop mode', () => {
    afterEach(() => vi.restoreAllMocks())
    const store = new Map<string, string>()
    beforeEach(() => {
      store.clear()
      vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) })
    })
    /** A Rounds match in its opening hold, the given seat to act (some seeds open for Player 2). */
    const opened = (seat: 1 | 2) => {
      const onView = vi.fn()
      vi.spyOn(performance, 'now').mockReturnValue(1000)
      const game = make(onView)
      for (const r of [0, 0.3, 0.6, 0.9]) {
        vi.spyOn(Math, 'random').mockReturnValue(r)
        game.actions.start(withMode(defaultSettings, 'rounds'))
        if ((game.state.match.builder ?? game.state.possession.shooter) === seat) break
      }
      expect(game.state.match.builder ?? game.state.possession.shooter).toBe(seat)
      // The opening build turn may turn the stage over its first 400 ms.
      frame(1000)
      vi.spyOn(performance, 'now').mockReturnValue(1500)
      frame(1500)
      return { game, view: () => onView.mock.lastCall![0] as HudView }
    }

    it('is on for a fresh device: the pitch stays put and only the HUD turns to player 2', () => {
      const { view } = opened(2)
      expect(view().tabletop).toBe(true)
      expect(view()).toMatchObject({ angle: 0, flipped: false, seatAngle: 180 })
      expect(view().hud.active).toBe(2)
      expect(view().overlay).toBeUndefined()
    })
    it('the minimap thumbnail is mirrored for player 2 across the table, and not when the stage turns with it', () => {
      const on = opened(2)
      const { camera } = on.game
      expect(on.view().minimap.frame).toEqual(minimapOf(camera.y, camera.visibleHeight, camera.blind, true).frame)
      store.set('breachball.tabletop', 'false')
      const off = opened(2)
      expect(off.view().minimap.frame).toEqual(minimapOf(off.game.camera.y, off.game.camera.visibleHeight, off.game.camera.blind).frame)
    })
    it('the handover holds the sim and swaps the HUD seat, the minimap mirror and the layer angle only while the strips are faded out', () => {
      const { game, view } = opened(1)
      expect(view().hud.active).toBe(1)
      const { outMs, gapMs, inMs } = visual.transition.slide
      // Let the opening hold pass, then hand the turn over by finishing the opening build.
      frame(2000)
      frame(2000 + visual.transition.flipMs)
      view().hud.buttons!.find((b) => b.label === 'Done')?.onClick()
      let t = 3000
      frame(t)
      expect(view().slide).toEqual({ dock: 0, chrome: 1 })
      expect(view().seatAngle).toBe(0)
      t += outMs + gapMs / 2
      frame(t)
      // Half way through the gap: nothing shows, the seat has swapped (the layer is turned, the thumbnail mirrored).
      expect(view().slide).toEqual({ dock: 1, chrome: 0 })
      expect(view()).toMatchObject({ seatAngle: 180, angle: 0 })
      expect(game.simPaused()).toBe(true)
      t += gapMs / 2 + inMs - 1
      frame(t)
      expect(game.simPaused()).toBe(true)
      t += 1
      frame(t)
      expect(game.simPaused()).toBe(false)
      expect(view().slide).toEqual({ dock: 0, chrome: 1 })
    })
    it('an edge swipe from the right opens the Side menu for player 2 across the table', () => {
      const { game, view } = opened(2)
      const canvas = (game as unknown as { canvas: FakeCanvas }).canvas
      const at = (type: string, x: number) => canvas.dispatchEvent(Object.assign(new Event(type), { offsetX: x, offsetY: 300, clientX: x, clientY: 300, pointerId: 1, pointerType: 'touch', button: 0 }))
      at('pointerdown', 396)
      at('pointermove', 340)
      at('pointerup', 340)
      frame(1600)
      expect(view().menu.open).toBe(true)
    })
    it('turned off (an old Flip on turn "true" migrates to it), player 2 turns the whole stage to the bottom', () => {
      store.set('breachball.flipOnTurn', 'true')
      const { view } = opened(2)
      expect(view().tabletop).toBe(false)
      expect(view()).toMatchObject({ angle: 180, flipped: true, seatAngle: 180 })
    })
    it('the action saves the choice on the device and shows in the view', () => {
      const { game, view } = opened(1)
      game.actions.tabletop(false)
      frame(1000)
      expect(store.get('breachball.tabletop')).toBe('false')
      expect(view().tabletop).toBe(false)
    })
    it('changing it mid-match snaps to the active player at once, once the Side menu is closed', () => {
      const { game, view } = opened(2)
      game.actions.menu(true)
      game.actions.tabletop(false)
      frame(1600)
      expect(view()).toMatchObject({ angle: 0, flipped: false })
      game.actions.menu(false)
      frame(1700)
      expect(view()).toMatchObject({ angle: 180, flipped: true, seatAngle: 180 })
      game.actions.tabletop(true)
      frame(1800)
      expect(view()).toMatchObject({ angle: 0, flipped: false, seatAngle: 180 })
    })
  })

  describe('Side menu', () => {
    afterEach(() => vi.restoreAllMocks())
    /** A Rounds match past its opening hold, with the sim running. */
    const running = () => {
      let t = 1000
      vi.spyOn(performance, 'now').mockImplementation(() => t)
      const game = make()
      game.actions.start(withMode(defaultSettings, 'rounds'))
      frame(t)
      t += 1500
      frame(t)
      frame(t)
      return { game, advance: (ms: number) => ((t += ms), frame(t)) }
    }

    it('pauses the sim and its clock in hot-seat while open, and resumes on Resume', () => {
      const { game, advance } = running()
      advance(500)
      const ticked = game.state.tick
      const left = game.state.clock.left
      game.actions.menu(true)
      advance(2000)
      expect(game.state.tick).toBe(ticked)
      expect(game.state.clock.left).toBe(left)
      game.actions.menu(false)
      advance(500)
      expect(game.state.tick).toBeGreaterThan(ticked)
    })

    it('reports open and hot-seat in the view', () => {
      const onView = vi.fn()
      const game = make(onView)
      expect(onView.mock.lastCall![0].menu).toMatchObject({ open: false, hotSeat: true })
      game.actions.menu()
      frame(performance.now())
      expect(onView.mock.lastCall![0].menu.open).toBe(true)
    })

    it('Restart re-runs the same settings in a fresh match and closes the menu', () => {
      const { game } = running()
      game.actions.start({ ...withMode(defaultSettings, 'rounds'), rounds: 7 })
      game.actions.menu(true)
      game.actions.restart()
      expect(game.state.match.mode).toBe('rounds')
      expect(game.state.tick).toBe(0)
      expect((game as unknown as { menuOpen: boolean }).menuOpen).toBe(false)
      
    })

    it('Quit tears the match down to a default one and closes the menu', () => {
      const onView = vi.fn()
      const game = make(onView)
      game.actions.start({ ...withMode(defaultSettings, 'rounds'), rounds: 7 })
      game.actions.menu(true)
      game.actions.quit()
      frame(performance.now())
      const { menu } = onView.mock.lastCall![0]
      expect(menu.open).toBe(false)
      expect(menu.settings).toEqual(expect.arrayContaining([{ label: 'Rounds', value: '5' }]))
    })

    it('opening it keeps a ball-in-hand placement through Resume and drops live gestures', () => {
      const { game } = running()
      const input = (game as unknown as { input: { placement?: { x: number; y: number }; dropLive(): void } }).input
      const dropLive = vi.spyOn(input, 'dropLive')
      input.placement = { x: 3, y: 4 }
      game.actions.menu(true)
      frame(performance.now())
      expect(dropLive).toHaveBeenCalled()
      expect(input.placement).toEqual({ x: 3, y: 4 })
      game.actions.menu(false)
      frame(performance.now())
      expect(input.placement).toEqual({ x: 3, y: 4 })
    })

    it('an edge swipe on the canvas opens it', () => {
      // Tabletop mode off, so whoever kicks off the viewer's left is the canvas's left (with it on, Player 2's is the right).
      vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'breachball.tabletop' ? 'false' : null), setItem: () => {}, removeItem: () => {} })
      const canvas = new FakeCanvas()
      const onView = vi.fn()
      new Game(canvas as unknown as HTMLCanvasElement, (sink) => new LocalDriver(sink), onView)
      const at = (type: string, x: number) => canvas.dispatchEvent(Object.assign(new Event(type), { offsetX: x, offsetY: 300, clientX: x, clientY: 300, pointerId: 1, pointerType: 'touch', button: 0 }))
      at('pointerdown', 4)
      at('pointermove', 60)
      at('pointerup', 60)
      frame(performance.now())
      expect(onView.mock.lastCall![0].menu.open).toBe(true)
    })
  })
})
