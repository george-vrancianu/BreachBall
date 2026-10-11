// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { visual } from '../../config/visual'
import type { ResourceBar as View } from '../../game/view/resourceBar'
import { ResourceBar } from './ResourceBar'

afterEach(cleanup)

const bar: View = { 1: { credits: 6, share: 0.75, bullseyes: 0 }, 2: { credits: 2, share: 0.25, bullseyes: 0 } }
const fill = (id: 1 | 2) => document.querySelector<HTMLElement>(`[data-fill="${id}"]`)!

describe('ResourceBar', () => {
  it("shows each side's Credits and fills its share from its own side", () => {
    render(<ResourceBar bar={bar} flipped={false} />)
    expect(screen.getByRole('img', { name: 'Player 1 Credits: 6' }).textContent).toBe('6')
    expect(screen.getByRole('img', { name: 'Player 2 Credits: 2' }).textContent).toBe('2')
    expect([fill(1).style.width, fill(2).style.width]).toEqual(['75%', '25%'])
  })
  it('sits under the Defence bar, or above it from the bottom when flipped, and takes no pointer input', () => {
    const { container, rerender } = render(<ResourceBar bar={bar} flipped={false} />)
    const el = () => container.firstElementChild as HTMLElement
    expect(el().style.top).toBe('calc(var(--safe-top, 0px) + 28px)')
    expect(el().style.pointerEvents).toBe('none')
    rerender(<ResourceBar bar={bar} flipped />)
    expect(el().style.bottom).toBe('calc(var(--safe-bottom, 0px) + 28px)')
  })
  it("flashes a player's Credits when they earn a Bullseye Credit, and only theirs", () => {
    const animate = vi.fn()
    HTMLElement.prototype.animate = animate
    const { rerender } = render(<ResourceBar bar={bar} flipped={false} />)
    expect(animate).not.toHaveBeenCalled()
    rerender(<ResourceBar bar={{ ...bar, 2: { credits: 4, share: 0.4, bullseyes: 1 } }} flipped={false} />)
    expect(animate).toHaveBeenCalledTimes(1)
    expect(animate.mock.contexts[0]).toBe(screen.getByRole('img', { name: 'Player 2 Credits: 4' }))
    expect(animate.mock.calls[0][1]).toBe(visual.hud.bar.flash.ms)
    rerender(<ResourceBar bar={{ 1: { credits: 3, share: 0.3, bullseyes: 0 }, 2: { credits: 7, share: 0.7, bullseyes: 1 } }} flipped={false} />)
    expect(animate).toHaveBeenCalledTimes(1)
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate
  })
  it('animates a change in the shares', () => {
    render(<ResourceBar bar={bar} flipped={false} />)
    expect(fill(1).style.transition).toContain('width')
  })
})
