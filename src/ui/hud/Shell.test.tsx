// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HudModel } from '../../game/view/hudModel'
import { visual } from '../../config/visual'
import { Shell } from './Shell'

afterEach(cleanup)

const hud = (over: Partial<HudModel> = {}): HudModel => ({
  players: { 1: { digit: '3', inventory: { breaker: 1, repulsor: 0, steal: 2 } }, 2: { digit: '?', inventory: { breaker: 4, repulsor: 4, steal: 4 } } },
  active: 1, round: null, rounds: 3, clock: { seconds: 12, fraction: 0.5 }, shotsLeft: 2, shotsMax: 3, refundable: false, phase: 'Play', breaker: { armed: false, tappable: true }, ...over,
})
const props = () => ({ hud: hud(), confirm: false, mapOpen: false, flipped: false, onMap: vi.fn(), onRecenter: vi.fn(), onPowerUp: vi.fn(), onConfirm: vi.fn(), onMapStretch: vi.fn(), onMapClose: vi.fn(), onBuildToggle: vi.fn(), onRefund: vi.fn() })

describe('Shell', () => {
  describe('Move point dots', () => {
    afterEach(() => vi.useRealTimers())
    const dots = () => screen.queryAllByRole('button', { name: 'Refund a Move point' })

    it('a tap on a filled dot refunds one Move point', () => {
      const p = props()
      render(<Shell {...p} hud={hud({ refundable: true, shotsLeft: 3 })} />)
      expect(dots()).toHaveLength(3)
      fireEvent.pointerDown(dots()[0]!)
      fireEvent.pointerUp(dots()[0]!)
      expect(p.onRefund).toHaveBeenCalledWith(1)
    })

    it('a long-press refunds all but one', () => {
      vi.useFakeTimers()
      const p = props()
      render(<Shell {...p} hud={hud({ refundable: true, shotsLeft: 3 })} />)
      fireEvent.pointerDown(dots()[0]!)
      vi.advanceTimersByTime(visual.hud.longPressMs + 1)
      fireEvent.pointerUp(dots()[0]!)
      expect(p.onRefund).toHaveBeenCalledTimes(1)
      expect(p.onRefund).toHaveBeenCalledWith(2)
    })

    it('releasing just before the long-press refunds one', () => {
      vi.useFakeTimers()
      const p = props()
      render(<Shell {...p} hud={hud({ refundable: true, shotsLeft: 3 })} />)
      fireEvent.pointerDown(dots()[0]!)
      vi.advanceTimersByTime(visual.hud.longPressMs - 1)
      fireEvent.pointerUp(dots()[0]!)
      expect(p.onRefund).toHaveBeenCalledTimes(1)
      expect(p.onRefund).toHaveBeenCalledWith(1)
    })

    it('a long-press does not fire after the Move points change mid-hold', () => {
      vi.useFakeTimers()
      const p = props()
      const { rerender } = render(<Shell {...p} hud={hud({ refundable: true, shotsLeft: 3 })} />)
      fireEvent.pointerDown(dots()[0]!)
      rerender(<Shell {...p} hud={hud({ refundable: true, shotsLeft: 2 })} />)
      vi.advanceTimersByTime(visual.hud.longPressMs + 1)
      expect(p.onRefund).not.toHaveBeenCalled()
    })

    it('releasing after the Move points change mid-hold refunds nothing and leaves no dot pressed', () => {
      const p = props()
      const { rerender } = render(<Shell {...p} hud={hud({ refundable: true, shotsLeft: 3 })} />)
      fireEvent.pointerDown(dots()[0]!)
      rerender(<Shell {...p} hud={hud({ refundable: true, shotsLeft: 2 })} />)
      fireEvent.pointerUp(dots()[0]!)
      expect(p.onRefund).not.toHaveBeenCalled()
      expect(dots().some((d) => d.getAttribute('aria-pressed') === 'true')).toBe(false)
    })

    it('a held dot shows pressed until released', () => {
      render(<Shell {...props()} hud={hud({ refundable: true, shotsLeft: 3 })} />)
      fireEvent.pointerDown(dots()[1]!)
      expect(dots().map((d) => d.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
      fireEvent.pointerUp(dots()[1]!)
      expect(dots().every((d) => d.getAttribute('aria-pressed') === 'false')).toBe(true)
    })

    it('a long-press on the last Move point reports a refund of none', () => {
      vi.useFakeTimers()
      const p = props()
      render(<Shell {...p} hud={hud({ refundable: true, shotsLeft: 1 })} />)
      fireEvent.pointerDown(dots()[0]!)
      vi.advanceTimersByTime(visual.hud.longPressMs + 1)
      expect(p.onRefund).toHaveBeenCalledWith(0)
    })

    it('are not buttons when the Move points may not be refunded', () => {
      render(<Shell {...props()} hud={hud({ refundable: false, shotsLeft: 3 })} />)
      expect(dots()).toHaveLength(0)
    })
  })

  it('shows both structure counts, including a hidden opponent as ?', () => {
    render(<Shell {...props()} />)
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('?')).toBeTruthy()
  })

  it('offers only the active viewer power-ups, and the breaker taps through', () => {
    const p = props()
    render(<Shell {...p} />)
    expect(screen.getAllByRole('button', { name: /^[BRS]\d/ })).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: /^B\d/ }))
    expect(p.onPowerUp).toHaveBeenCalledWith('breaker')
  })

  it('disables the breaker when it may not be tapped', () => {
    render(<Shell {...props()} hud={hud({ breaker: { armed: false, tappable: false } })} />)
    expect((screen.getByRole('button', { name: /^B\d/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('runs map, recenter and phase buttons', () => {
    const p = props()
    const repair = vi.fn()
    render(<Shell {...p} hud={hud({ buttons: [{ label: 'Repair', onClick: repair }, { label: 'Rearrange', onClick: () => {} }] })} />)
    fireEvent.click(screen.getByText('Map'))
    fireEvent.click(screen.getByText('Recenter'))
    fireEvent.click(screen.getByText('Repair'))
    expect(p.onMap).toHaveBeenCalled()
    expect(p.onRecenter).toHaveBeenCalled()
    expect(repair).toHaveBeenCalled()
    expect(screen.getByText('Rearrange')).toBeTruthy()
  })

  it('shows Confirm, and Stretch and Close while the map is open, only when due', () => {
    const p = props()
    const { rerender } = render(<Shell {...p} />)
    expect(screen.queryByText('Confirm')).toBeNull()
    expect(screen.queryByText('Close')).toBeNull()
    rerender(<Shell {...p} confirm mapOpen />)
    fireEvent.click(screen.getByText('Confirm'))
    fireEvent.click(screen.getByText('Stretch'))
    fireEvent.click(screen.getByText('Close'))
    expect([p.onConfirm, p.onMapStretch, p.onMapClose].map((f) => f.mock.calls.length)).toEqual([1, 1, 1])
  })

  it('renders the build menu: the opener toggles, an open menu lists pieces', () => {
    const toggle = vi.fn()
    const pick = vi.fn()
    const { rerender } = render(<Shell {...props()} menu={{ kind: 'menu', open: false, items: [] }} onBuildToggle={toggle} />)
    fireEvent.click(screen.getByRole('button', { name: 'Build' }))
    expect(toggle).toHaveBeenCalled()
    rerender(<Shell {...props()} menu={{ kind: 'menu', open: true, items: [{ label: 'Straight', onClick: pick }] }} onBuildToggle={toggle} />)
    fireEvent.click(screen.getByText('Straight'))
    expect(pick).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Leave building' })).toBeTruthy()
  })

  it('names the demolish glyph button', () => {
    const del = vi.fn()
    render(<Shell {...props()} menu={{ kind: 'selected', buttons: [{ label: '🗑', onClick: del }] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Demolish' }))
    expect(del).toHaveBeenCalled()
  })

  it('only its controls take pointer input, so gestures pass through the gaps to the pitch', () => {
    const buttons = [{ label: 'Done', onClick: vi.fn() }]
    const { container } = render(<Shell {...props()} hud={hud({ buttons })} menu={{ kind: 'menu', open: false, items: [] }} confirm mapOpen><i>extra</i></Shell>)
    const shell = container.firstElementChild as HTMLElement
    expect(shell.style.pointerEvents).toBe('none')
    expect(shell.children.length).toBe(7)
    expect([...shell.children].every((c) => (c as HTMLElement).style.pointerEvents === 'auto')).toBe(true)
  })

  it('renders children', () => {
    render(<Shell {...props()}><i>extra</i></Shell>)
    expect(screen.getByText('extra')).toBeTruthy()
  })

  it('sits at the top of the stage when flipped, so the turned stage puts it at the screen bottom', () => {
    const { container, rerender } = render(<Shell {...props()} />)
    const shell = container.firstElementChild as HTMLElement
    expect(shell.style.bottom).toBe('0px')
    rerender(<Shell {...props()} flipped />)
    expect(shell.style.top).toBe('0px')
  })
})
