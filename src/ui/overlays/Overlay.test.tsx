// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { OverlayView } from '../../game/view/transition'
import { Overlay } from './Overlay'

afterEach(cleanup)
const view = (over: Partial<OverlayView> = {}): OverlayView => ({ kind: 'goal', placement: 'center', band: true, text: 'GOAL', color: '#fff', progress: 0, turn: 0, fades: true, ...over })

it('renders nothing without a view', () => {
  const { container } = render(<Overlay />)
  expect(container.firstChild).toBeNull()
})

it('shows the text of a hold and swallows taps meant for the pitch', () => {
  const { container } = render(<Overlay view={view()} />)
  expect(screen.getByText('GOAL')).toBeTruthy()
  expect((container.firstChild as HTMLElement).style.pointerEvents).toBe('auto')
})

it('lets taps through sweeps and the choosing notice', () => {
  const { container, rerender } = render(<Overlay view={view({ kind: 'sweep' })} />)
  expect((container.firstChild as HTMLElement).style.pointerEvents).toBe('none')
  rerender(<Overlay view={view({ kind: 'notice', text: 'Opponent is choosing' })} />)
  expect((container.firstChild as HTMLElement).style.pointerEvents).toBe('none')
  expect(screen.getByText('Opponent is choosing')).toBeTruthy()
})

it('sweeps in the incoming seat\'s direction when turned, and the other way when not', () => {
  const { container, rerender } = render(<Overlay view={view({ kind: 'sweep', progress: 0.25 })} />)
  expect((container.firstChild as HTMLElement).style.transform).toBe('translateX(50%)')
  rerender(<Overlay view={view({ kind: 'sweep', progress: 0.25, turn: 180 })} />)
  expect((container.firstChild as HTMLElement).style.transform).toBe('rotate(180deg) translateX(50%)')
})

it('clears the Defence bar at the far edge: the top when upright, the bottom when flipped', () => {
  const { container, rerender } = render(<Overlay view={view({ placement: 'top', text: 'Reveal' })} />)
  const label = () => screen.getByText('Reveal') as HTMLElement
  expect((container.firstChild as HTMLElement).style.justifyContent).toBe('flex-start')
  expect(label().style.marginTop).not.toBe('')
  expect(label().style.marginBottom).toBe('')
  rerender(<Overlay view={view({ placement: 'top', text: 'Reveal' })} flipped />)
  expect((container.firstChild as HTMLElement).style.justifyContent).toBe('flex-end')
  expect(label().style.marginBottom).not.toBe('')
  expect(label().style.marginTop).toBe('')
})

it('clears the Resource bar too, only when it is shown', () => {
  const { rerender } = render(<Overlay view={view({ placement: 'top', text: 'Choosing' })} />)
  const margin = () => parseInt((screen.getByText('Choosing') as HTMLElement).style.marginTop)
  const without = margin()
  rerender(<Overlay view={view({ placement: 'top', text: 'Choosing' })} resourceBar />)
  expect(margin()).toBe(without + 20)
})
