// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { visual } from '../../config/visual'
import { Minimap } from './Minimap'

afterEach(cleanup)

const props = () => ({ minimap: { frame: { top: 0.5, height: 0.5 } }, open: false, color: visual.player.colors[1], flipped: false, onToggle: vi.fn() })

describe('minimap chip', () => {
  it('opens the map, and while open is a filled close chip that closes it', () => {
    const p = props()
    const { rerender } = render(<Minimap {...p} />)
    fireEvent.click(screen.getByRole('button', { name: 'Map' }))
    rerender(<Minimap {...p} open />)
    const chip = screen.getByRole('button', { name: 'Close map' })
    expect(chip.textContent).toContain('✕')
    expect((chip.firstElementChild as HTMLElement).style.background).toBe('rgb(34, 211, 238)')
    fireEvent.click(chip)
    expect(p.onToggle).toHaveBeenCalledTimes(2)
  })

  it('has a tap area of at least 44px around the 30 x 74 chip', () => {
    render(<Minimap {...props()} />)
    const chip = screen.getByRole('button', { name: 'Map' })
    expect([chip.style.width, chip.style.height]).toEqual(['44px', '74px'])
    expect([(chip.firstElementChild as HTMLElement).style.width, (chip.firstElementChild as HTMLElement).style.height]).toEqual(['30px', '74px'])
  })

  it('draws the camera frame on the thumbnail where the camera looks', () => {
    const { rerender } = render(<Minimap {...props()} minimap={{ frame: { top: 0.25, height: 0.5 } }} />)
    const frame = () => screen.getByTestId('thumbnail-frame')
    expect([frame().style.top, frame().style.height]).toEqual(['17.5px', '35px'])
    rerender(<Minimap {...props()} minimap={{ frame: { top: 0.5, height: 0.5 } }} />)
    expect(frame().style.top).toBe('35px')
    expect(screen.queryByTestId('thumbnail-fog')).toBeNull()
  })

  it('fogs the thumbnail in a blind build', () => {
    render(<Minimap {...props()} minimap={{ frame: { top: 0, height: 0.5 }, fog: { top: 0, height: 0.5 } }} />)
    expect(screen.getByTestId('thumbnail-fog').style.height).toBe('35px')
  })

  it('sits at the top-left just inside the far-edge bars (the stage bottom when turned), lower when the Resource bar shows', () => {
    const { rerender } = render(<Minimap {...props()} />)
    const at = () => screen.getByRole('button', { name: 'Map' }).style
    expect([at().top, at().bottom, at().left]).toEqual(['36px', '', '8px'])
    rerender(<Minimap {...props()} resourceBar />)
    expect(at().top).toBe('56px')
    rerender(<Minimap {...props()} flipped />)
    expect([at().bottom, at().top]).toEqual(['36px', ''])
  })
})
