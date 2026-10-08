// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { GameActions, HudView } from '../game/Game'
import { visual } from '../config/visual'

// Game needs a real canvas; the seam under test is how App creates, feeds and drives it.
const freshView = vi.hoisted(() => () => ({ angle: 0, seatAngle: 0, slide: { dock: 0, chrome: 1 }, flipped: false, tabletop: true, confirm: false, mapOpen: false, minimap: { frame: { top: 0, height: 0.5 } }, menu: { open: false, hotSeat: true, settings: [{ label: 'Mode', value: 'Rounds' }, { label: 'Rounds', value: '5' }] }, result: '', hud: { players: { 1: { digit: '0', inventory: { breaker: 1, repulsor: 1, steal: 1 } }, 2: { digit: '0', inventory: { breaker: 1, repulsor: 1, steal: 1 } } }, active: 1, round: 1, rounds: 5, clock: null, shotsLeft: 3, shotsMax: 3, defenceBar: { 1: { count: '0', segments: [] }, 2: { count: '0', segments: [] } }, resourceBar: null, refundable: false, score: null, phase: 'Play', dock: 'play', balance: null, refundRate: null }, offence: { armed: false, available: false, shooter: 1, items: [] } }) as HudView)
const games = vi.hoisted(() => [] as { destroyed: boolean; onView: (v: HudView) => void; actions: { [K in 'start' | 'rematch' | 'map' | 'menu' | 'restart' | 'quit' | 'tabletop']: Mock<GameActions[K]> } }[])
vi.mock('../game/Game', () => ({
  Game: class {
    destroyed = false
    // Like the real Game, starting a match pushes its (winnerless) view at once.
    actions = { start: vi.fn(() => this.onView(freshView())), rematch: vi.fn(() => this.onView(freshView())), map: vi.fn(), menu: vi.fn(), restart: vi.fn(), quit: vi.fn(), tabletop: vi.fn() }
    constructor(_canvas: HTMLCanvasElement, _driver: unknown, public onView: (v: HudView) => void) {
      games.push(this)
    }
    destroy() {
      this.destroyed = true
    }
  },
}))

const connect = vi.hoisted(() => vi.fn())
vi.mock('../net/connectScreen', () => ({ showConnectScreen: connect }))

import { App } from './App'

const view = (over: Partial<HudView> = {}): HudView => ({ ...freshView(), ...over })

beforeEach(() => {
  games.length = 0
  connect.mockClear()
})
afterEach(cleanup)

it('mounting under StrictMode leaves one running Game, and unmounting stops it', () => {
  const { unmount } = render(<StrictMode><App /></StrictMode>)
  expect(games.filter((g) => !g.destroyed)).toHaveLength(1)
  unmount()
  expect(games.filter((g) => !g.destroyed)).toHaveLength(0)
})

it('Tabletop mode off: both layers turn with the stage angle', () => {
  render(<App />)
  act(() => games[0]!.onView(view({ tabletop: false, angle: 180, seatAngle: 180, flipped: true })))
  expect(screen.getByTestId('canvas-layer').style.transform).toBe('rotate(180deg)')
  expect(screen.getByTestId('hud-layer').style.transform).toBe('rotate(180deg)')
})

it('Tabletop mode on: only the HUD layer turns, to face its seat', () => {
  render(<App />)
  act(() => games[0]!.onView(view({ tabletop: true, angle: 0, seatAngle: 180 })))
  expect(screen.getByTestId('canvas-layer').style.transform).toBe('rotate(0deg)')
  expect(screen.getByTestId('hud-layer').style.transform).toBe('rotate(180deg)')
})

describe('safe-area insets', () => {
  const hudVar = (name: string) => screen.getByTestId('hud-layer').style.getPropertyValue(name)
  const dock = () => screen.getByTestId('dock')
  const inPlay = (over: Partial<HudView>) => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    fireEvent.click(screen.getByText('Start'))
    act(() => games[0]!.onView(view(over)))
  }

  it("Tabletop on, Player 1: the Dock pads by the device bottom and the far-edge strips and chips by the device top", () => {
    inPlay({ tabletop: true, seatAngle: 0 })
    expect([hudVar('--safe-top'), hudVar('--safe-bottom')]).toEqual(['env(safe-area-inset-top, 0px)', 'env(safe-area-inset-bottom, 0px)'])
    expect(dock().style.paddingBottom).toBe(`max(${visual.hud.dock.padPx}px, var(--safe-bottom, 0px))`)
  })

  it("Tabletop on, Player 2: the HUD layer's bottom is the device top, so the Dock pads by the top inset and the strips by the bottom one", () => {
    inPlay({ tabletop: true, seatAngle: 180 })
    expect([hudVar('--safe-top'), hudVar('--safe-bottom'), hudVar('--safe-left'), hudVar('--safe-right')]).toEqual(['env(safe-area-inset-bottom, 0px)', 'env(safe-area-inset-top, 0px)', 'env(safe-area-inset-right, 0px)', 'env(safe-area-inset-left, 0px)'])
    expect(dock().style.paddingBottom).toBe(`max(${visual.hud.dock.padPx}px, var(--safe-bottom, 0px))`)
    expect(screen.getByRole('button', { name: 'Menu' }).style.top).toBe('calc(var(--safe-top, 0px) + 36px)')
  })

  it("Tabletop off, Player 2: the stage is turned, the Dock is at the HUD layer's top (the device bottom) and the strips at its bottom (the device top)", () => {
    inPlay({ tabletop: false, angle: 180, seatAngle: 180, flipped: true })
    expect([hudVar('--safe-top'), hudVar('--safe-bottom')]).toEqual(['env(safe-area-inset-bottom, 0px)', 'env(safe-area-inset-top, 0px)'])
    expect(dock().style.paddingTop).toBe(`max(${visual.hud.dock.padPx}px, var(--safe-top, 0px))`)
    expect(screen.getByRole('button', { name: 'Menu' }).style.bottom).toBe('calc(var(--safe-bottom, 0px) + 36px)')
  })

  it('the insets swap with the HUD layer\'s turn, in the same render', () => {
    inPlay({ tabletop: true, seatAngle: 0 })
    act(() => games[0]!.onView(view({ tabletop: true, seatAngle: 180 })))
    expect(hudVar('--safe-bottom')).toBe('env(safe-area-inset-top, 0px)')
    act(() => games[0]!.onView(view({ tabletop: true, seatAngle: 0 })))
    expect(hudVar('--safe-bottom')).toBe('env(safe-area-inset-bottom, 0px)')
  })
})

it('the Tabletop slide moves the Dock off the layer bottom and fades the strips and chips, which take no taps meanwhile', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Play' }))
  fireEvent.click(screen.getByText('Start'))
  act(() => games[0]!.onView(view({ slide: { dock: 0.5, chrome: 0.25 } })))
  expect(screen.getByTestId('dock').parentElement!.style.transform).toBe('translateY(50%)')
  const menu = screen.getByRole('button', { name: 'Menu' })
  expect(menu.style.opacity).toBe('0.25')
  expect(menu.style.pointerEvents).toBe('none')
  act(() => games[0]!.onView(view()))
  expect(screen.getByTestId('dock').parentElement!.style.transform).toBe('')
  expect(screen.getByRole('button', { name: 'Menu' }).style.opacity).toBe('')
})

it('keeps the HUD layer out of the pitch input, while its controls still take clicks', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Play' }))
  fireEvent.click(screen.getByText('Start'))
  act(() => games[0]!.onView(view()))
  expect(screen.getByTestId('hud-layer').style.pointerEvents).toBe('none')
  fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
  expect(games[0]!.actions.menu).toHaveBeenCalledWith(true)
})

it('plays from title through settings into a match, then offers match end once and rematch', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Play' }))
  fireEvent.click(screen.getByText('Start'))
  const game = games[0]!
  expect(game.actions.start).toHaveBeenCalledWith(expect.objectContaining({ mode: 'siege' }))
  expect(screen.queryByText('Start')).toBeNull()

  act(() => game.onView(view({ winner: 1, result: '2 structures left' })))
  expect(screen.getByText('Player 1 wins')).toBeTruthy()
  fireEvent.click(screen.getByText('Rematch'))
  expect(game.actions.rematch).toHaveBeenCalled()
  expect(screen.queryByText('Player 1 wins')).toBeNull()
})

it('Menu returns to the title and the finished match does not pop the end screen back up', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Play' }))
  fireEvent.click(screen.getByText('Start'))
  act(() => games[0]!.onView(view({ winner: 2, result: 'x' })))
  fireEvent.click(screen.getByText('Menu'))
  expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
  act(() => games[0]!.onView(view({ winner: 2, result: 'x' })))
  expect(screen.queryByText('Player 2 wins')).toBeNull()
})

it('keeps the settings across Menu and Play', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Play' }))
  fireEvent.click(screen.getByRole('button', { name: 'Rounds' }))
  const rounds = screen.getByLabelText(/rounds/i) as HTMLInputElement
  fireEvent.change(rounds, { target: { value: '9' } })
  fireEvent.click(screen.getByText('Start'))
  act(() => games[0]!.onView(view({ winner: 1, result: 'x' })))
  fireEvent.click(screen.getByText('Menu'))
  fireEvent.click(screen.getByRole('button', { name: 'Play' }))
  expect(screen.getByRole('button', { name: 'Rounds' }).getAttribute('aria-pressed')).toBe('true')
  expect((screen.getByLabelText(/rounds/i) as HTMLInputElement).value).toBe('9')
})

it('draws the overlay under the shell, so the controls stay tappable during a hold', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Play' }))
  fireEvent.click(screen.getByText('Start'))
  act(() => games[0]!.onView(view({ overlay: { kind: 'goal', placement: 'center', band: true, text: 'Player 2', color: '#fff', progress: 0 } })))
  const card = screen.getByText('Player 2').parentElement!
  const map = screen.getByRole('button', { name: 'Map' })
  expect(card.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(map)
  expect(games[0]!.actions.map).toHaveBeenCalled()
})

it('the settings screen holds the Tabletop mode toggle, on for a fresh device', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Play' }))
  fireEvent.click(screen.getByRole('button', { name: 'Tabletop mode: On' }))
  expect(games[0]!.actions.tabletop).toHaveBeenCalledWith(false)
})

it('the Title screen opens the connect overlay, settings, and help and back', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Online' }))
  expect(connect).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Help' }))
  expect(screen.getByRole('heading', { name: 'How to play' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  expect(screen.getByText('Start')).toBeTruthy()
})

describe('Side menu', () => {
  const inMatch = (menu: Partial<HudView['menu']> = {}) => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    fireEvent.click(screen.getByText('Start'))
    act(() => games[0]!.onView(view({ menu: { ...freshView().menu, ...menu } })))
    return games[0]!
  }

  it('the ☰ button opens it, and Title screens have none', () => {
    render(<App />)
    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    fireEvent.click(screen.getByText('Start'))
    act(() => games[0]!.onView(view()))
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(games[0]!.actions.menu).toHaveBeenCalledWith(true)
  })

  it('the ☰ button sits just inside the Defence bar: below it, or above it when the bar is at the stage bottom', () => {
    inMatch()
    expect(screen.getByRole('button', { name: 'Menu' }).style.top).toBe('calc(var(--safe-top, 0px) + 36px)')
    act(() => games[0]!.onView(view({ flipped: true })))
    const flipped = screen.getByRole('button', { name: 'Menu' })
    expect(flipped.style.bottom).toBe('calc(var(--safe-bottom, 0px) + 36px)')
    expect(flipped.style.top).toBe('')
  })

  it('the ☰ button sits at the top-right, level with the minimap chip at the top-left, under the bars', () => {
    inMatch()
    const menu = screen.getByRole('button', { name: 'Menu' })
    const chip = screen.getByRole('button', { name: 'Map' })
    expect(chip.style.top).toBe(menu.style.top)
    expect([menu.style.right, menu.style.left]).toEqual(['calc(var(--safe-right, 0px) + 8px)', ''])
    expect(chip.style.left).toBe('calc(var(--safe-left, 0px) + 8px)')
    fireEvent.click(chip)
    expect(games[0]!.actions.map).toHaveBeenCalled()
  })

  it('the ☰ button moves down by the Resource bar\'s height when that bar is shown', () => {
    inMatch()
    const bar = { 1: { credits: 3, share: 0.5, bullseyes: 0 }, 2: { credits: 3, share: 0.5, bullseyes: 0 } }
    const hud = { ...freshView().hud, resourceBar: bar }
    act(() => games[0]!.onView(view({ hud })))
    expect(screen.getByRole('button', { name: 'Menu' }).style.top).toBe('calc(var(--safe-top, 0px) + 56px)')
    act(() => games[0]!.onView(view({ hud, flipped: true })))
    expect(screen.getByRole('button', { name: 'Menu' }).style.bottom).toBe('calc(var(--safe-bottom, 0px) + 56px)')
  })

  it('lists Resume, Help, the settings, Restart and Quit when open in hot-seat; Resume closes it', () => {
    const game = inMatch({ open: true })
    for (const name of ['Resume', 'Help', 'Restart', 'Quit to title']) expect(screen.getByRole('button', { name })).toBeTruthy()
    expect(screen.getByText('Mode')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(game.actions.menu).toHaveBeenCalledWith(false)
  })

  it('has no Restart online', () => {
    inMatch({ open: true, hotSeat: false })
    expect(screen.queryByRole('button', { name: 'Restart' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Quit to title' })).toBeTruthy()
  })

  it('Restart and Quit need a second tap', () => {
    const game = inMatch({ open: true })
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    expect(game.actions.restart).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Restart/ }))
    expect(game.actions.restart).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Quit to title' }))
    fireEvent.click(screen.getByRole('button', { name: /Quit to title/ }))
    expect(game.actions.quit).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
  })

  it('holds the Tabletop mode toggle, which shows its state and sets the device setting', () => {
    const game = inMatch({ open: true })
    const toggle = screen.getByRole('button', { name: 'Tabletop mode: On' })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(toggle)
    expect(game.actions.tabletop).toHaveBeenCalledWith(false)
    act(() => game.onView(view({ tabletop: false, menu: { ...freshView().menu, open: true } })))
    expect(screen.getByRole('button', { name: 'Tabletop mode: Off' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('has no Tabletop mode toggle online, which ignores it', () => {
    inMatch({ open: true, hotSeat: false })
    expect(screen.queryByRole('button', { name: /Tabletop mode/ })).toBeNull()
  })

  it('Help opens the how-to page and Back returns to the open menu, not the Title', () => {
    inMatch({ open: true })
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    expect(screen.getByRole('heading', { name: 'How to play' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy()
  })

  it('Esc resumes', () => {
    const game = inMatch({ open: true })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(game.actions.menu).toHaveBeenCalledWith(false)
  })

  it('turns with the HUD layer, so in Tabletop mode it faces the active player', () => {
    inMatch({ open: true })
    act(() => games[0]!.onView(view({ seatAngle: 180, menu: { ...freshView().menu, open: true } })))
    const hud = screen.getByTestId('hud-layer')
    expect(hud.style.transform).toBe('rotate(180deg)')
    expect(hud.contains(screen.getByRole('navigation', { name: 'Side menu' }))).toBe(true)
  })
})
