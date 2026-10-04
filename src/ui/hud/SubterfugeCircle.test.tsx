// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubterfugeCircle as View } from '../../game/view/subterfugeCircle'
import { visual } from '../../config/visual'
import { QueuedIcons, SubterfugeCircle } from './SubterfugeCircle'

beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false })))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const view = (over: Partial<View> = {}): View => ({
  available: true,
  queued: [],
  items: [
    { item: 'jam', label: 'Jam · 2', when: 'next possession', disabled: false },
    { item: 'soon1', label: 'Soon', when: '', disabled: true, soon: true },
    { item: 'soon2', label: 'Soon', when: '', disabled: true, soon: true },
  ],
  ...over,
})
const circle = () => screen.getByRole('button', { name: 'Subterfuge' })
const jam = () => screen.getByRole('button', { name: 'Jam · 2 · next possession' })

describe('SubterfugeCircle', () => {
  it('a tap opens the column with the Jam, its price and when it lands, and a locked placeholder', () => {
    render(<SubterfugeCircle subterfuge={view()} color="#fff" onBuy={vi.fn()} />)
    expect(screen.queryByText(/next possession/)).toBeNull()
    fireEvent.pointerDown(circle(), { clientX: 5, clientY: 5 })
    fireEvent.pointerUp(circle(), { clientX: 5, clientY: 5 })
    expect(screen.getByText('Jam · 2 · next possession')).toBeTruthy()
    expect(screen.getAllByText('Locked · soon')).toHaveLength(2)
  })

  it('tapping the Jam buys it and closes the column; a locked item does nothing', () => {
    const onBuy = vi.fn()
    render(<SubterfugeCircle subterfuge={view()} color="#fff" onBuy={onBuy} />)
    fireEvent.pointerDown(circle(), { clientX: 5, clientY: 5 })
    fireEvent.pointerUp(circle(), { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getAllByRole('button', { name: 'Locked' })[0]!)
    expect(onBuy).not.toHaveBeenCalled()
    fireEvent.click(jam())
    expect(onBuy).toHaveBeenCalledWith('jam')
    expect(screen.queryByText(/next possession/)).toBeNull()
  })

  it('a disabled Jam (no Credits) is not bought', () => {
    const onBuy = vi.fn()
    const v = view()
    render(<SubterfugeCircle subterfuge={{ ...v, items: [{ ...v.items[0]!, disabled: true }, ...v.items.slice(1)] }} color="#fff" onBuy={onBuy} />)
    fireEvent.pointerDown(circle(), { clientX: 5, clientY: 5 })
    fireEvent.pointerUp(circle(), { clientX: 5, clientY: 5 })
    fireEvent.click(jam())
    expect(onBuy).not.toHaveBeenCalled()
  })

  it('holding then sliding onto the Jam and lifting buys it', () => {
    vi.useFakeTimers()
    const onBuy = vi.fn()
    render(<SubterfugeCircle subterfuge={view()} color="#fff" onBuy={onBuy} />)
    fireEvent.pointerDown(circle(), { clientX: 5, clientY: 5 })
    act(() => { vi.advanceTimersByTime(visual.hud.holdMs + 1) })
    document.elementFromPoint = () => jam()
    fireEvent.pointerUp(circle(), { clientX: 5, clientY: -80 })
    expect(onBuy).toHaveBeenCalledWith('jam')
  })

  it('greyed out, it does not open and buys nothing', () => {
    const onBuy = vi.fn()
    render(<SubterfugeCircle subterfuge={view({ available: false })} color="#fff" onBuy={onBuy} />)
    expect(circle().getAttribute('aria-disabled')).toBe('true')
    fireEvent.pointerDown(circle(), { clientX: 5, clientY: 5 })
    fireEvent.pointerUp(circle(), { clientX: 5, clientY: 5 })
    expect(screen.queryByText(/next possession/)).toBeNull()
    expect(onBuy).not.toHaveBeenCalled()
  })
})

describe('QueuedIcons', () => {
  it('shows an icon per queued item, for the player it is against', () => {
    render(<QueuedIcons queued={[{ item: 'jam', by: 1, against: 2 }]} flipped={false} />)
    expect(screen.getByRole('img', { name: 'Jam queued against Player 2' })).toBeTruthy()
  })
  it('sits under the targeted half of the Defence bar, below the Resource bar row, on the far edge', () => {
    const { bar, queued } = visual.hud
    const offset = `${bar.heightPx + bar.resourceRowPx + queued.edgePx}px`
    const { container, rerender } = render(<QueuedIcons queued={[{ item: 'jam', by: 1, against: 2 }]} flipped={false} />)
    const root = container.firstChild as HTMLElement
    expect(root.style.top).toBe(offset)
    expect(root.children[0]!.querySelector('[role=img]')).toBeNull()
    expect(root.children[1]!.querySelector('[role=img]')).toBeTruthy()
    rerender(<QueuedIcons queued={[{ item: 'jam', by: 2, against: 1 }]} flipped />)
    const flipped = container.firstChild as HTMLElement
    expect(flipped.style.bottom).toBe(offset)
    expect(flipped.children[0]!.querySelector('[role=img]')).toBeTruthy()
  })
  it('shows nothing when nothing is queued', () => {
    const { container } = render(<QueuedIcons queued={[]} flipped={false} />)
    expect(container.firstChild).toBeNull()
  })
})
