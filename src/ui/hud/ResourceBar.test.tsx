// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ResourceBar as View } from '../../game/view/resourceBar'
import { ResourceBar } from './ResourceBar'

afterEach(cleanup)

const bar: View = { 1: { credits: 6, share: 0.75 }, 2: { credits: 2, share: 0.25 } }
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
    expect(el().style.top).toBe('28px')
    expect(el().style.pointerEvents).toBe('none')
    rerender(<ResourceBar bar={bar} flipped />)
    expect(el().style.bottom).toBe('28px')
  })
  it('animates a change in the shares', () => {
    render(<ResourceBar bar={bar} flipped={false} />)
    expect(fill(1).style.transition).toContain('width')
  })
})
