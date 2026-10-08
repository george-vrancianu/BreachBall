// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { DefenceBar as View } from '../../game/view/defenceBar'
import { DefenceBar } from './DefenceBar'

afterEach(cleanup)

const bar: View = { 1: { count: '2', segments: [true, false] }, 2: { count: '?', segments: [] } }

describe('DefenceBar', () => {
  it('shows each side\'s count and one segment per slot, empty ones marked', () => {
    render(<DefenceBar bar={bar} flipped={false} />)
    const p1 = screen.getByRole('img', { name: 'Player 1 structures: 2' })
    expect(p1.textContent).toBe('2')
    expect([...p1.querySelectorAll('[data-filled]')].map((e) => e.getAttribute('data-filled'))).toEqual(['true', 'false'])
    const p2 = screen.getByRole('img', { name: 'Player 2 structures: ?' })
    expect(p2.textContent).toBe('?')
    expect(p2.querySelectorAll('[data-filled]')).toHaveLength(0)
  })
  it('sits at the stage top, or its bottom when flipped, and never takes pointer input', () => {
    const { container, rerender } = render(<DefenceBar bar={bar} flipped={false} />)
    const el = container.firstElementChild as HTMLElement
    expect(el.style.top).toBe('calc(var(--safe-top, 0px) + 0px)')
    expect(el.style.pointerEvents).toBe('none')
    rerender(<DefenceBar bar={bar} flipped />)
    expect((container.firstElementChild as HTMLElement).style.bottom).toBe('calc(var(--safe-bottom, 0px) + 0px)')
  })
  it('draws Player 2 striped and Player 1 solid', () => {
    const { container } = render(<DefenceBar bar={{ 1: { count: '1', segments: [true] }, 2: { count: '1', segments: [true] } }} flipped={false} />)
    const segs = [...container.querySelectorAll<HTMLElement>('[data-filled]')]
    expect(segs[0]!.style.background).not.toContain('gradient')
    expect(segs[1]!.style.background).toContain('repeating-linear-gradient')
  })
})
