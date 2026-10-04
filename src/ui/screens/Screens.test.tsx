// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { defaultSettings } from '../../game/view/settings'
import { HelpScreen, MatchEndScreen, SettingsScreen, TitleScreen } from './Screens'

afterEach(cleanup)

it('Title screen: Play, Online, settings and help each report their own tap', () => {
  const [play, online, settings, help] = [vi.fn(), vi.fn(), vi.fn(), vi.fn()]
  render(<TitleScreen onPlay={play} onOnline={online} onSettings={settings} onHelp={help} />)
  fireEvent.click(screen.getByRole('button', { name: 'Play' }))
  fireEvent.click(screen.getByRole('button', { name: 'Online' }))
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  fireEvent.click(screen.getByRole('button', { name: 'Help' }))
  expect([play, online, settings, help].map((f) => f.mock.calls.length)).toEqual([1, 1, 1, 1])
})

it('Title screen shows the wordmark and the tagline', () => {
  render(<TitleScreen onPlay={() => {}} onOnline={() => {}} onSettings={() => {}} onHelp={() => {}} />)
  expect(screen.getByRole('img', { name: 'BreachBall' })).toBeTruthy()
  expect(screen.getByText('Build · Shoot · Breach')).toBeTruthy()
})

it('help explains the game and goes back', () => {
  const back = vi.fn()
  render(<HelpScreen onBack={back} />)
  expect(screen.getByRole('heading', { name: 'How to play' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(back).toHaveBeenCalled()
})

it('settings: the mode picker and sliders report changes, and Start fires', () => {
  const [change, start] = [vi.fn(), vi.fn()]
  const { rerender } = render(<SettingsScreen settings={defaultSettings} onChange={change} tabletop={false} onTabletop={() => {}} onStart={start} />)
  expect(screen.getByText('Siege').getAttribute('aria-pressed')).toBe('true')
  expect(screen.queryByLabelText(/rounds/i)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Rounds' }))
  expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'rounds', openingCredits: 40 }))
  const settings = { ...defaultSettings, mode: 'rounds' as const }
  rerender(<SettingsScreen settings={settings} onChange={change} tabletop={false} onTabletop={() => {}} onStart={start} />)
  const rounds = screen.getByLabelText(/rounds/i) as HTMLInputElement
  fireEvent.change(rounds, { target: { value: rounds.max } })
  expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'rounds', rounds: Number(rounds.max) }))
  fireEvent.click(screen.getByRole('button', { name: 'Siege' }))
  expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'siege', openingCredits: 30 }))
  fireEvent.click(screen.getByText('Start'))
  expect(start).toHaveBeenCalled()
})

it('settings: the Tabletop mode device toggle shows its state and reports the flip', () => {
  const flip = vi.fn()
  render(<SettingsScreen settings={defaultSettings} onChange={() => {}} tabletop={false} onTabletop={flip} onStart={() => {}} />)
  const toggle = screen.getByRole('button', { name: 'Tabletop mode: Off' })
  expect(toggle.getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(toggle)
  expect(flip).toHaveBeenCalledWith(true)
})

it('settings: the On time out toggle shows in both modes and reports the choice', () => {
  for (const mode of ['siege', 'rounds'] as const) {
    const change = vi.fn()
    render(<SettingsScreen settings={{ ...defaultSettings, mode }} onChange={change} tabletop={false} onTabletop={() => {}} onStart={() => {}} />)
    expect(screen.getByText('On time out')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Shoot' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Burn' }).getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Burn' }))
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ mode, expiry: 'burn' }))
    cleanup()
  }
})

it('match end names the winner and offers rematch and menu', () => {
  const [rematch, menu] = [vi.fn(), vi.fn()]
  render(<MatchEndScreen winner={2} result="1 structure left" onRematch={rematch} onMenu={menu} />)
  expect(screen.getByText('Player 2 wins')).toBeTruthy()
  expect(screen.getByText('1 structure left')).toBeTruthy()
  fireEvent.click(screen.getByText('Rematch'))
  fireEvent.click(screen.getByText('Menu'))
  expect([rematch, menu].map((f) => f.mock.calls.length)).toEqual([1, 1])
})

it('Title screen runs the Attract loop behind the wordmark', () => {
  const raf = vi.spyOn(window, 'requestAnimationFrame')
  render(<TitleScreen onPlay={() => {}} onOnline={() => {}} onSettings={() => {}} onHelp={() => {}} />)
  expect(screen.getByRole('img', { name: 'BreachBall' })).toBeTruthy()
  expect(raf).toHaveBeenCalled()
  raf.mockRestore()
})
