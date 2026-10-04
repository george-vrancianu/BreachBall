// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { visual } from '../../config/visual'
import { QueuedIcons } from './QueuedIcons'

afterEach(cleanup)

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
