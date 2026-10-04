// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DefenceCircle, ItemSpec } from '../../game/view/defenceCircle'
import type { OffenceCircle } from '../../game/view/offenceCircle'
import type { HudModel } from '../../game/view/hudModel'
import { visual } from '../../config/visual'
import { Shell } from './Shell'

afterEach(cleanup)

const hud = (over: Partial<HudModel> = {}): HudModel => ({
  players: { 1: { digit: '3', inventory: { breaker: 1, repulsor: 0, steal: 2 } }, 2: { digit: '?', inventory: { breaker: 4, repulsor: 4, steal: 4 } } },
  defenceBar: { 1: { count: '3', segments: [true, true, true] }, 2: { count: '?', segments: [] } },
  resourceBar: null,
  active: 1, round: null, rounds: 3, clock: { seconds: 12, fraction: 0.5 }, shotsLeft: 2, shotsMax: 3, refundable: false, score: null, phase: 'Play', ...over,
})
const offence = (over: Partial<OffenceCircle> = {}): OffenceCircle => ({ armed: false, available: true, shooter: 1, items: [{ item: 'breaker', label: 'Breaker · 2', disabled: false, pressed: false }, { item: 'overdrive', label: 'Overdrive', disabled: true, pressed: false, soon: true }], ...over })
const props = () => ({ hud: hud(), offence: offence(), confirm: false, mapOpen: false, flipped: false, onMap: vi.fn(), onRecenter: vi.fn(), onOffenceArm: vi.fn(), onConfirm: vi.fn(), onMapStretch: vi.fn(), onMapClose: vi.fn(), onDefenceToggle: vi.fn(), onDefenceArm: vi.fn(), onRefund: vi.fn() })

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

  describe('shared row', () => {
    it('reads the round and score over the phase label, and the score digit shows once', () => {
      render(<Shell {...props()} hud={hud({ round: 3, rounds: 7, score: '2–1', phase: 'Build phase', players: { 1: { digit: '2', inventory: { breaker: 5, repulsor: 6, steal: 7 } }, 2: { digit: '1', inventory: { breaker: 5, repulsor: 6, steal: 7 } } } })} />)
      expect(screen.getByText('Round 3/7 · 2–1')).toBeTruthy()
      expect(screen.getByText('Build phase')).toBeTruthy()
      expect(screen.getAllByText('2')).toHaveLength(1)
      expect(screen.queryByText('1')).toBeNull()
    })
    it('Siege shows the phase label alone', () => {
      render(<Shell {...props()} hud={hud({ round: null, phase: 'Play phase' })} />)
      expect(screen.queryByText(/Round/)).toBeNull()
      expect(screen.getByText('Play phase')).toBeTruthy()
    })
    it('holds the phase buttons, the Recenter circle and the Move points', () => {
      const p = props()
      const done = vi.fn()
      render(<Shell {...p} hud={hud({ buttons: [{ label: 'Done', onClick: done }] })} />)
      const row = screen.getByTestId('shared-row')
      expect(row.contains(screen.getByText('Done'))).toBe(true)
      expect(row.contains(screen.getByRole('button', { name: 'Recenter' }))).toBe(true)
      expect(row.contains(screen.getByText('12'))).toBe(true)
    })
    it('moves Siege\'s Repair and Rearrange above the row, which keeps Map and Done', () => {
      render(<Shell {...props()} hud={hud({ buttons: [{ label: 'Repair', onClick: vi.fn() }, { label: 'Rearrange', onClick: vi.fn() }] })} />)
      const row = screen.getByTestId('shared-row')
      expect(row.contains(screen.getByText('Repair'))).toBe(false)
      expect(row.contains(screen.getByText('Map'))).toBe(true)
    })
    it('keeps right padding clear for the minimap chip', () => {
      render(<Shell {...props()} />)
      expect(screen.getByTestId('shared-row').style.paddingRight).toBe(`${visual.hud.sharedRow.chipPadPx}px`)
    })
  })

  it('shows the active viewer the tower power-ups with counts; the Breaker is in the Offence circle', () => {
    render(<Shell {...props()} />)
    expect(screen.getAllByRole('img', { name: /^[RS]\d/ })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /^B\d/ })).toBeNull()
  })

  describe('Offence circle', () => {
    const circle = () => screen.getByRole('button', { name: /^Offence/ })

    it('a tap opens the column of items and a second tap closes it', () => {
      render(<Shell {...props()} />)
      expect(screen.queryByRole('button', { name: 'Breaker · 2' })).toBeNull()
      fireEvent.click(circle())
      expect(screen.getByRole('button', { name: 'Breaker · 2' })).toBeTruthy()
      expect(screen.getByText('Overdrive · soon')).toBeTruthy()
      fireEvent.click(circle())
      expect(screen.queryByRole('button', { name: 'Breaker · 2' })).toBeNull()
    })

    it('tapping the Breaker arms it and closes the column', () => {
      const p = props()
      render(<Shell {...p} />)
      fireEvent.click(circle())
      fireEvent.click(screen.getByRole('button', { name: 'Breaker · 2' }))
      expect(p.onOffenceArm).toHaveBeenCalledWith('breaker')
      expect(screen.queryByRole('button', { name: 'Breaker · 2' })).toBeNull()
    })

    it('a greyed item and the locked one arm nothing', () => {
      const p = props()
      render(<Shell {...p} offence={offence({ items: [{ item: 'breaker', label: 'Breaker · 2', disabled: true, pressed: false }, { item: 'overdrive', label: 'Overdrive', disabled: true, pressed: false, soon: true }] })} />)
      fireEvent.click(circle())
      fireEvent.click(screen.getByRole('button', { name: 'Breaker · 2' }))
      fireEvent.click(screen.getByRole('button', { name: 'Overdrive' }))
      expect(p.onOffenceArm).not.toHaveBeenCalled()
    })

    it('outside the viewer\'s possession it is greyed but its column still opens', () => {
      render(<Shell {...props()} offence={offence({ available: false })} />)
      expect(circle().getAttribute('aria-disabled')).toBe('true')
      fireEvent.click(circle())
      expect(screen.getByRole('button', { name: 'Breaker · 2' })).toBeTruthy()
    })

    it('shows the armed state on the circle', () => {
      const r = render(<Shell {...props()} />)
      expect(circle().getAttribute('aria-pressed')).toBe('false')
      r.rerender(<Shell {...props()} offence={offence({ armed: true })} />)
      expect(circle().getAttribute('aria-pressed')).toBe('true')
      // The fill is the active player's colour (read back through the DOM, which normalises it).
      const probe = document.createElement('div')
      probe.style.background = visual.player.colors[1]
      expect(circle().style.background).toBe(probe.style.background)
    })

    it('Escape closes the column', () => {
      render(<Shell {...props()} />)
      fireEvent.click(circle())
      fireEvent.keyDown(circle(), { key: 'Escape' })
      expect(screen.queryByRole('button', { name: 'Breaker · 2' })).toBeNull()
    })
  })

  it('runs map, recenter and phase buttons', () => {
    const p = props()
    const repair = vi.fn()
    render(<Shell {...p} hud={hud({ buttons: [{ label: 'Repair', onClick: repair }, { label: 'Rearrange', onClick: () => {} }] })} />)
    fireEvent.click(screen.getByText('Map'))
    fireEvent.click(screen.getByRole('button', { name: 'Recenter' }))
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

  describe('Defence circle', () => {
    beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false })))
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); delete (Element.prototype as { animate?: unknown }).animate; delete (document as { elementFromPoint?: unknown }).elementFromPoint })
    const items = (over: Record<string, Partial<ItemSpec>> = {}): ItemSpec[] => [
      { item: 'wall', label: 'Wall · 2', disabled: false, pressed: true, ...over.wall },
      { item: 'repulsor', label: 'Repulsor', disabled: false, pressed: false, ...over.repulsor },
      { item: 'steal', label: 'Steal', disabled: false, pressed: false, ...over.steal },
      { item: 'cannon', label: 'Cannon', disabled: true, pressed: false, soon: true },
    ]
    const model = (over: Partial<DefenceCircle> = {}): DefenceCircle => ({ building: false, items: items(), available: true, ...over })
    const circle = () => screen.getByRole('button', { name: /^(Build|Leave building)$/ })
    const setup = (m: DefenceCircle = model()) => {
      vi.useFakeTimers()
      const p = props()
      const r = render(<Shell {...p} defence={m} />)
      return { p, r }
    }
    const hold = () => { fireEvent.pointerDown(circle(), { clientX: 5, clientY: 5 }); act(() => { vi.advanceTimersByTime(visual.hud.holdMs + 1) }) }
    const over = (name: string) => { document.elementFromPoint = () => screen.getByRole('button', { name: new RegExp(name) }) }
    const tapCircle = () => { fireEvent.pointerDown(circle(), { clientX: 5, clientY: 5 }); fireEvent.pointerUp(circle(), { clientX: 5, clientY: 5 }) }

    it('draws an icon for every piece, armed or not, and no placeholder letter', () => {
      setup(model({ building: true, item: 'repulsor', items: items({ wall: { pressed: false }, repulsor: { pressed: true } }) }))
      hold()
      const icons = ['Repulsor', 'Steal', 'Cannon'].map((name) => {
        const b = screen.getByRole('button', { name: new RegExp(`^${name}`) })
        expect(b.firstElementChild?.tagName.toLowerCase()).toBe('svg')
        expect(b.firstChild?.nodeType).not.toBe(Node.TEXT_NODE)
        return b.firstElementChild!.innerHTML
      })
      expect(screen.getByRole('button', { name: /^Repulsor/ }).getAttribute('aria-pressed')).toBe('true')
      expect(new Set(icons).size).toBe(3)
    })

    it('dims the power-up circles while the column is open', () => {
      setup()
      const probe = document.createElement('i')
      probe.style.color = visual.tokens.dimOutline
      const dimmed = () => screen.getAllByRole('img', { name: /^[RS]\d/ }).map((b) => b.style.color === probe.style.color)
      expect(dimmed()).toEqual([false, false])
      hold()
      expect(dimmed()).toEqual([true, true])
      // Lifting off both the circle and the column closes it.
      fireEvent.pointerUp(circle(), { clientX: 5, clientY: 5 })
      expect(dimmed()).toEqual([false, false])
    })

    it('a tap toggles build mode, idle or building', () => {
      const { p, r } = setup()
      tapCircle()
      expect(p.onDefenceToggle).toHaveBeenCalledTimes(1)
      r.rerender(<Shell {...p} defence={model({ building: true, item: 'wall' })} />)
      tapCircle()
      expect(p.onDefenceToggle).toHaveBeenCalledTimes(2)
    })

    it('a hold opens the four pieces, Cannon greyed with soon, the armed one pressed', () => {
      const { p } = setup(model({ building: true, item: 'wall' }))
      hold()
      expect(screen.getByRole('button', { name: 'Wall · 2' }).getAttribute('aria-pressed')).toBe('true')
      expect(screen.getByRole('button', { name: 'Repulsor' }).getAttribute('aria-pressed')).toBe('false')
      expect(screen.getByRole('button', { name: 'Steal' })).toBeTruthy()
      const cannon = screen.getByRole('button', { name: 'Cannon' })
      expect(cannon.getAttribute('aria-disabled')).toBe('true')
      expect(cannon.textContent).toContain('soon')
      fireEvent.pointerUp(circle(), { clientX: 5, clientY: 5 })
      expect(p.onDefenceToggle).not.toHaveBeenCalled()
    })

    it('a hold that moves past the tap slop first does not open', () => {
      setup()
      fireEvent.pointerDown(circle(), { clientX: 5, clientY: 5 })
      fireEvent.pointerMove(circle(), { clientX: 5 + visual.input.tapSlopPx + 1, clientY: 5 })
      act(() => { vi.advanceTimersByTime(visual.hud.holdMs + 1) })
      expect(screen.queryByRole('button', { name: 'Steal' })).toBeNull()
    })

    it('sliding onto a piece and lifting arms it and closes the column', () => {
      const { p } = setup()
      hold()
      over('Repulsor')
      fireEvent.pointerUp(circle(), { clientX: 5, clientY: -80 })
      expect(p.onDefenceArm).toHaveBeenCalledWith('repulsor')
      expect(p.onDefenceToggle).not.toHaveBeenCalled()
      expect(screen.queryByRole('button', { name: 'Steal' })).toBeNull()
    })

    it('lifting elsewhere closes the column without arming', () => {
      const { p } = setup()
      hold()
      document.elementFromPoint = () => document.body
      fireEvent.pointerUp(circle(), { clientX: 200, clientY: 200 })
      expect(screen.queryByRole('button', { name: 'Steal' })).toBeNull()
      expect(p.onDefenceArm).not.toHaveBeenCalled()
    })

    it('lifting on the circle keeps the column open for a tap on a piece', () => {
      const { p } = setup()
      hold()
      document.elementFromPoint = () => circle()
      fireEvent.pointerUp(circle(), { clientX: 5, clientY: 5 })
      fireEvent.click(screen.getByRole('button', { name: 'Steal' }))
      expect(p.onDefenceArm).toHaveBeenCalledWith('steal')
      expect(screen.queryByRole('button', { name: 'Steal' })).toBeNull()
    })

    it('tapping the circle with the column open closes it without toggling', () => {
      const { p } = setup(model({ building: true, item: 'wall' }))
      hold()
      document.elementFromPoint = () => circle()
      fireEvent.pointerUp(circle(), { clientX: 5, clientY: 5 })
      tapCircle()
      expect(screen.queryByRole('button', { name: 'Steal' })).toBeNull()
      expect(p.onDefenceToggle).not.toHaveBeenCalled()
    })

    it('a disabled piece does nothing, tapped or slid onto', () => {
      const { p } = setup(model({ items: items({ steal: { disabled: true } }) }))
      hold()
      fireEvent.click(screen.getByRole('button', { name: 'Steal' }))
      fireEvent.click(screen.getByRole('button', { name: 'Cannon' }))
      over('Steal')
      fireEvent.pointerUp(circle(), { clientX: 5, clientY: -80 })
      expect(p.onDefenceArm).not.toHaveBeenCalled()
    })

    it('when the viewer cannot build, a hold pulses the circle once instead of opening, and a tap does nothing', () => {
      const animate = vi.fn()
      Element.prototype.animate = animate
      const { p } = setup(model({ available: false }))
      expect(circle().getAttribute('aria-disabled')).toBe('true')
      tapCircle()
      expect(p.onDefenceToggle).not.toHaveBeenCalled()
      hold()
      expect(screen.queryByRole('button', { name: 'Steal' })).toBeNull()
      expect(animate).toHaveBeenCalledTimes(1)
      expect(animate.mock.calls[0]![0].map((f: { transform: string }) => f.transform)).toEqual(['scale(1)', `scale(${visual.hud.defence.pulseScale})`, 'scale(1)'])
      expect(animate.mock.calls[0]![1]).toMatchObject({ duration: visual.hud.defence.pulseMs })
      fireEvent.pointerUp(circle(), { clientX: 5, clientY: 5 })
      expect(p.onDefenceToggle).not.toHaveBeenCalled()
      hold()
      expect(animate).toHaveBeenCalledTimes(2)
    })

    it('does not pulse under reduced motion', () => {
      const animate = vi.fn()
      Element.prototype.animate = animate
      vi.stubGlobal('matchMedia', () => ({ matches: true }))
      setup(model({ available: false }))
      hold()
      expect(animate).not.toHaveBeenCalled()
    })

    it('a long press does not open the context menu', () => {
      setup()
      expect(fireEvent.contextMenu(circle())).toBe(false)
      hold()
      expect(fireEvent.contextMenu(screen.getByRole('button', { name: 'Steal' }))).toBe(false)
    })

    it('a keyboard click toggles; a pointer click does not (the pointer path already did)', () => {
      const { p } = setup()
      fireEvent.click(circle(), { detail: 1 })
      expect(p.onDefenceToggle).not.toHaveBeenCalled()
      fireEvent.click(circle(), { detail: 0 })
      expect(p.onDefenceToggle).toHaveBeenCalledTimes(1)
    })

    it('ArrowUp opens the column (ArrowDown when flipped); picking returns focus to the circle', () => {
      const { p, r } = setup()
      expect(circle().getAttribute('aria-haspopup')).toBe('menu')
      fireEvent.keyDown(circle(), { key: 'ArrowDown' })
      expect(screen.queryByRole('button', { name: 'Steal' })).toBeNull()
      fireEvent.keyDown(circle(), { key: 'ArrowUp' })
      screen.getByRole('button', { name: 'Steal' }).focus()
      fireEvent.click(screen.getByRole('button', { name: 'Steal' }))
      expect(p.onDefenceArm).toHaveBeenCalledWith('steal')
      expect(document.activeElement).toBe(circle())
      r.rerender(<Shell {...p} flipped defence={model()} />)
      fireEvent.keyDown(circle(), { key: 'ArrowDown' })
      expect(screen.getByRole('button', { name: 'Steal' })).toBeTruthy()
      fireEvent.keyDown(circle(), { key: 'Escape' })
      expect(screen.queryByRole('button', { name: 'Steal' })).toBeNull()
      expect(document.activeElement).toBe(circle())
    })

    it('stays beside the selected structure\'s buttons, and still opens on a hold', () => {
      const { p } = setup(model({ building: true, item: 'wall', selection: { buttons: [{ label: '↻', onClick: vi.fn() }, { label: '✕', onClick: vi.fn() }] } }))
      expect(screen.getByRole('button', { name: '↻' })).toBeTruthy()
      hold()
      expect(screen.getByRole('button', { name: 'Steal' })).toBeTruthy()
      expect(p.onDefenceToggle).not.toHaveBeenCalled()
    })

    it('opens over the pitch for Player 2: above the HUD rows, and the circle row is the innermost', () => {
      vi.useFakeTimers()
      const { container } = render(<Shell {...props()} flipped defence={model()} confirm />)
      hold()
      const column = screen.getByRole('button', { name: 'Steal' }).parentElement as HTMLElement
      expect(column.style.zIndex).toBe(String(visual.hud.defence.columnZ))
      const shell = container.firstElementChild as HTMLElement
      expect(shell.style.flexDirection).toBe('column-reverse')
      expect(shell.firstElementChild!.contains(circle())).toBe(true)
    })

    it('renders no circle without a menu (the play phase)', () => {
      render(<Shell {...props()} />)
      expect(screen.queryByRole('button', { name: /^(Build|Leave building)$/ })).toBeNull()
    })

    it('stays, greyed, on the opponent\'s build turn', () => {
      setup(model({ available: false }))
      expect(circle().getAttribute('aria-disabled')).toBe('true')
    })

    it('a hold does not open when building became unavailable meanwhile', () => {
      const { p, r } = setup()
      fireEvent.pointerDown(circle(), { clientX: 5, clientY: 5 })
      r.rerender(<Shell {...p} defence={model({ available: false })} />)
      act(() => { vi.advanceTimersByTime(visual.hud.holdMs + 1) })
      expect(screen.queryByRole('button', { name: 'Steal' })).toBeNull()
    })

    it('a press outside the circle and its column closes the column', () => {
      setup()
      hold()
      document.elementFromPoint = () => circle()
      fireEvent.pointerUp(circle(), { clientX: 5, clientY: 5 })
      expect(screen.getByRole('button', { name: 'Steal' })).toBeTruthy()
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Steal' }))
      expect(screen.getByRole('button', { name: 'Steal' })).toBeTruthy()
      fireEvent.pointerDown(document.body)
      expect(screen.queryByRole('button', { name: 'Steal' })).toBeNull()
    })

    it('closes the open column when building becomes unavailable', () => {
      const { p, r } = setup()
      hold()
      r.rerender(<Shell {...p} defence={model({ available: false })} />)
      expect(screen.queryByRole('button', { name: 'Steal' })).toBeNull()
    })
  })

  it('names the demolish glyph button', () => {
    const del = vi.fn()
    render(<Shell {...props()} defence={{ building: false, items: [], available: true, selection: { buttons: [{ label: '🗑', onClick: del }] } }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Demolish' }))
    expect(del).toHaveBeenCalled()
  })

  it('only its controls take pointer input, so gestures pass through the gaps to the pitch', () => {
    const buttons = [{ label: 'Done', onClick: vi.fn() }]
    const { container } = render(<Shell {...props()} hud={hud({ buttons })} defence={{ building: false, items: [], available: true }} confirm mapOpen><i>extra</i></Shell>)
    const shell = container.firstElementChild as HTMLElement
    expect(shell.style.pointerEvents).toBe('none')
    expect(shell.children.length).toBe(6)
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
