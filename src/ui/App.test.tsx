// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, expect, it, vi, type Mock } from 'vitest'
import type { GameActions, HudView } from '../game/Game'

// Game needs a real canvas; the seam under test is how App creates, feeds and drives it.
const freshView = vi.hoisted(() => () => ({ angle: 0, flipped: false, confirm: false, mapOpen: false, minimap: { frame: { top: 0, height: 0.5 } }, result: '', hud: { players: { 1: { digit: '0', inventory: { breaker: 1, repulsor: 1, steal: 1 } }, 2: { digit: '0', inventory: { breaker: 1, repulsor: 1, steal: 1 } } }, active: 1, round: 1, rounds: 5, clock: null, shotsLeft: 3, shotsMax: 3, defenceBar: { 1: { count: '0', segments: [] }, 2: { count: '0', segments: [] } }, refundable: false, score: null, phase: 'Play' }, offence: { armed: false, available: false, shooter: 1, items: [] } }) as HudView)
const games = vi.hoisted(() => [] as { destroyed: boolean; onView: (v: HudView) => void; actions: { [K in 'start' | 'rematch' | 'map']: Mock<GameActions[K]> } }[])
vi.mock('../game/Game', () => ({
  Game: class {
    destroyed = false
    // Like the real Game, starting a match pushes its (winnerless) view at once.
    actions = { start: vi.fn(() => this.onView(freshView())), rematch: vi.fn(() => this.onView(freshView())), map: vi.fn() }
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

it('rotates the in-match stage with the view angle', () => {
  const { container } = render(<App />)
  act(() => games[0]!.onView(view({ angle: 180, flipped: true })))
  expect((container.querySelector('canvas')!.parentElement as HTMLElement).style.transform).toBe('rotate(180deg)')
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

it('draws the overlay under the shell, so the controls stay tappable during a card', () => {
  render(<App />)
  act(() => games[0]!.onView(view({ overlay: { kind: 'turn', placement: 'center', band: false, text: 'Player 2', color: '#fff', opacity: 1, progress: 0, dismissable: true } })))
  const card = screen.getByText('Player 2').parentElement!
  const map = screen.getByRole('button', { name: 'Map' })
  expect(card.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(map)
  expect(games[0]!.actions.map).toHaveBeenCalled()
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
