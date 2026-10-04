// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DefenceCircle, ItemSpec } from '../../game/view/defenceCircle'
import type { OffenceCircle } from '../../game/view/offenceCircle'
import type { HudModel } from '../../game/view/hudModel'
import type { StrategyCard } from '../../game/view/strategies'
import { visual } from '../../config/visual'
import { Shell } from './Shell'

afterEach(cleanup)

const hud = (over: Partial<HudModel> = {}): HudModel => ({
  players: { 1: { digit: '3', inventory: { breaker: 1, repulsor: 0, steal: 2 } }, 2: { digit: '?', inventory: { breaker: 4, repulsor: 4, steal: 4 } } },
  defenceBar: { 1: { count: '3', segments: [true, true, true] }, 2: { count: '?', segments: [] } },
  resourceBar: null,
  active: 1, round: null, rounds: 3, clock: { seconds: 12, fraction: 0.5 }, shotsLeft: 2, shotsMax: 3, refundable: false, score: null, phase: 'Play',
  dock: 'play', balance: null, refundRate: null, ...over,
})
const offence = (over: Partial<OffenceCircle> = {}): OffenceCircle => ({ armed: false, available: true, shooter: 1, items: [{ item: 'breaker', label: 'Breaker · 2', name: 'Breaker', badge: '2', disabled: false, pressed: false }, { item: 'overdrive', label: 'Overdrive', name: 'Overdrive', disabled: true, pressed: false, soon: true }], ...over })
const items = (over: Record<string, Partial<ItemSpec>> = {}): ItemSpec[] => [
  { item: 'wall', label: 'Wall · 2/unit', name: 'Wall', badge: '2', disabled: false, pressed: true, ...over.wall },
  { item: 'repulsor', label: 'Repulsor · 3', name: 'Repulsor', badge: '3', disabled: false, pressed: false, ...over.repulsor },
  { item: 'steal', label: 'Steal · 2', name: 'Steal', badge: '2', disabled: false, pressed: false, ...over.steal },
  { item: 'cannon', label: 'Cannon', name: 'Cannon', disabled: true, pressed: false, soon: true },
]
const defence = (over: Partial<DefenceCircle> = {}): DefenceCircle => ({ building: true, item: 'wall', items: items(), available: true, ...over })
const props = () => ({ hud: hud(), offence: offence(), confirm: false, mapOpen: false, flipped: false, onRecenter: vi.fn(), onOffenceArm: vi.fn(), onConfirm: vi.fn(), onDefenceToggle: vi.fn(), onDefenceArm: vi.fn(), onSubterfuge: vi.fn(), onRefund: vi.fn(), onStrategies: vi.fn(), onStrategy: vi.fn() })
const buildHud = (over: Partial<HudModel> = {}) => hud({ dock: 'build', phase: 'Build phase', balance: { amount: 10, unit: 'CR' }, buttons: [{ label: 'Done', onClick: vi.fn() }], ...over })
const follows = (a: HTMLElement, b: HTMLElement) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('Shell', () => {
  it('has no score digit row: the score lives in the round line, the structure counts in the Defence bar', () => {
    render(<Shell {...props()} hud={hud({ round: 2, score: '1–0' })} />)
    expect(screen.getByText('Round 2/3 · 1–0')).toBeTruthy()
    expect(screen.queryByText('3')).toBeNull()
    expect(screen.queryAllByRole('img', { name: /^[RS]\d/ })).toHaveLength(0)
  })

  it('has no minimap chip: it sits at the top-left with ☰', () => {
    render(<Shell {...props()} />)
    expect(screen.queryByRole('button', { name: 'Map' })).toBeNull()
  })

  describe('status row', () => {
    it('shows the balance chip when there is one, and none without', () => {
      const { rerender } = render(<Shell {...props()} hud={hud({ balance: { amount: 7, unit: 'CR' } })} />)
      expect(screen.getByRole('status', { name: '7 CR' })).toBeTruthy()
      rerender(<Shell {...props()} />)
      expect(screen.queryByRole('status')).toBeNull()
    })

    it('reads the round and score over the phase label; Siege shows the phase label alone', () => {
      const { rerender } = render(<Shell {...props()} hud={hud({ round: 2, score: '1–0', phase: 'Play phase' })} />)
      expect(screen.getByText('Play phase')).toBeTruthy()
      rerender(<Shell {...props()} hud={hud({ phase: 'Play phase' })} />)
      expect(screen.queryByText(/^Round/)).toBeNull()
    })

    it('shows the clock only while one runs, and always the Recenter circle', () => {
      const p = props()
      const { rerender } = render(<Shell {...p} />)
      expect(screen.getByRole('timer', { name: '12 seconds left' })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Recenter' }))
      expect(p.onRecenter).toHaveBeenCalled()
      rerender(<Shell {...p} hud={hud({ clock: null })} />)
      expect(screen.queryByRole('timer')).toBeNull()
    })
  })

  describe('build dock', () => {
    it('shows Build on the left, the pieces beside it, and Strategies on the right; no Powerup or Subterfuge', () => {
      render(<Shell {...props()} hud={buildHud()} defence={defence()} subterfuge={{ available: true, queued: [], items: [] }} />)
      const build = screen.getByRole('button', { name: 'Leave building' })
      const wall = screen.getByRole('button', { name: 'Wall · 2/unit' })
      const plans = screen.getByRole('button', { name: 'Strategies' })
      expect(follows(build, wall) && follows(wall, plans)).toBe(true)
      expect(build.getAttribute('aria-pressed')).toBe('true')
      expect(screen.queryByRole('button', { name: /^Offence/ })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Subterfuge' })).toBeNull()
    })

    it('the Build tile toggles build mode; a piece tile arms it; a greyed or soon one does nothing', () => {
      const p = props()
      render(<Shell {...p} hud={buildHud()} defence={defence({ items: items({ steal: { disabled: true } }) })} />)
      fireEvent.click(screen.getByRole('button', { name: 'Leave building' }))
      expect(p.onDefenceToggle).toHaveBeenCalledTimes(1)
      fireEvent.click(screen.getByRole('button', { name: 'Repulsor · 3' }))
      expect(p.onDefenceArm).toHaveBeenCalledWith('repulsor')
      fireEvent.click(screen.getByRole('button', { name: 'Steal · 2' }))
      fireEvent.click(screen.getByRole('button', { name: 'Cannon · soon' }))
      expect(p.onDefenceArm).toHaveBeenCalledTimes(1)
    })

    it('marks the armed piece pressed and badges each piece with its price or stock', () => {
      render(<Shell {...props()} hud={buildHud()} defence={defence({ items: items({ repulsor: { badge: '×2' } }) })} />)
      expect(screen.getByRole('button', { name: 'Wall · 2/unit' }).getAttribute('aria-pressed')).toBe('true')
      expect(screen.getByRole('button', { name: 'Repulsor · 3' }).textContent).toContain('×2')
    })

    it('OK submits the build (the Done phase button) and greys while it may not', () => {
      const done = vi.fn()
      const { rerender } = render(<Shell {...props()} hud={buildHud({ buttons: [{ label: 'Done', onClick: done }] })} defence={defence()} />)
      const ok = () => screen.getByRole('button', { name: 'Done' })
      expect(ok().textContent).toContain('OK')
      fireEvent.click(ok())
      expect(done).toHaveBeenCalledTimes(1)
      rerender(<Shell {...props()} hud={buildHud({ buttons: [{ label: 'Done', onClick: done, disabled: true }] })} defence={defence()} />)
      expect((ok() as HTMLButtonElement).disabled).toBe(true)
    })

    it('the Strategies tile toggles the tray, whose cards drop a layout in; a card where nothing fits does nothing', () => {
      const p = props()
      const cards: StrategyCard[] = [
        { id: 'bulwark', name: 'Bulwark', pieces: [{ kind: 'wall', a: { x: 4, y: 88 }, b: { x: 20, y: 88 } }], cost: 10, placed: 3, total: 3, disabled: false },
        { id: 'turrets', name: 'Turrets', pieces: [{ kind: 'tower', power: 'repulsor', at: { gx: 4, gy: 41 } }], cost: 6, placed: 2, total: 4, disabled: false },
        { id: 'zigzag', name: 'Zigzag', pieces: [], cost: 0, placed: 0, total: 3, disabled: true },
      ]
      const { rerender } = render(<Shell {...p} hud={buildHud()} defence={defence()} />)
      expect(screen.queryByRole('menu', { name: 'Strategies' })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Strategies' }))
      expect(p.onStrategies).toHaveBeenCalledTimes(1)
      rerender(<Shell {...p} hud={buildHud()} defence={defence()} strategies={cards} />)
      expect(screen.getByRole('button', { name: 'Strategies' }).getAttribute('aria-pressed')).toBe('true')
      fireEvent.click(screen.getByRole('menuitem', { name: 'Bulwark, 10 CR' }))
      expect(p.onStrategy).toHaveBeenCalledWith('bulwark')
      expect(screen.getByRole('menuitem', { name: 'Turrets, 6 CR, 2 of 4 pieces fit' })).toBeTruthy()
      fireEvent.click(screen.getByRole('menuitem', { name: /^Zigzag/ }))
      expect(p.onStrategy).toHaveBeenCalledTimes(1)
    })

    it('floats the selected structure\'s controls over the pitch, named', () => {
      const del = vi.fn()
      render(<Shell {...props()} hud={buildHud()} defence={defence({ selection: { buttons: [{ action: 'demolish', label: 'Demolish', onClick: del }, { action: 'rotate', label: 'Rotate', onClick: vi.fn() }, { action: 'deselect', label: 'Deselect', onClick: vi.fn() }] } })} />)
      fireEvent.click(screen.getByRole('button', { name: 'Demolish' }))
      expect(del).toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Rotate' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Deselect' })).toBeTruthy()
    })

    it('on the opponent\'s build turn the tools are greyed and there are no Strategies', () => {
      const p = props()
      render(<Shell {...p} hud={buildHud({ buttons: undefined })} defence={defence({ building: false, available: false })} />)
      fireEvent.click(screen.getByRole('button', { name: 'Build' }))
      expect(p.onDefenceToggle).not.toHaveBeenCalled()
      expect(screen.queryByRole('button', { name: 'Strategies' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
    })
  })

  describe('in-game build docks', () => {
    it('a Rearrange turn shows a prompt and OK, no pieces', () => {
      render(<Shell {...props()} hud={hud({ dock: 'rearrange', phase: 'Rearrange', buttons: [{ label: 'Done', onClick: vi.fn() }] })} defence={defence({ building: false, available: false })} />)
      expect(screen.getByText(/Drag your pieces/)).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: /^Wall/ })).toBeNull()
    })

    it('a defence choice shows Repair and Rearrange side by side', () => {
      const repair = vi.fn()
      render(<Shell {...props()} hud={hud({ dock: 'choice', buttons: [{ label: 'Repair', onClick: repair }, { label: 'Rearrange', onClick: vi.fn() }] })} />)
      fireEvent.click(screen.getByRole('button', { name: 'Repair' }))
      expect(repair).toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Rearrange' })).toBeTruthy()
    })
  })

  describe('play dock', () => {
    afterEach(() => vi.useRealTimers())
    const refund = () => screen.getByRole('button', { name: 'Refund a shot for 2 Credits' })

    it('aligns the abilities left (Build, Powerup, Subterfuge) and the shots and Refund right', () => {
      render(<Shell {...props()} hud={hud({ refundRate: 2 })} subterfuge={{ available: true, queued: [], items: [] }} />)
      const build = screen.getByRole('button', { name: 'Build' })
      const power = screen.getByRole('button', { name: /^Offence/ })
      const trick = screen.getByRole('button', { name: 'Subterfuge' })
      const shots = screen.getByRole('img', { name: '2 of 3 shots left' })
      expect(follows(build, power) && follows(power, trick) && follows(trick, shots) && follows(shots, refund())).toBe(true)
    })

    it('makes the three ability tiles one width, whatever their labels', () => {
      render(<Shell {...props()} hud={hud({ refundRate: 2 })} subterfuge={{ available: true, queued: [], items: [] }} />)
      const widths = [screen.getByRole('button', { name: 'Build' }), screen.getByRole('button', { name: /^Offence/ }), screen.getByRole('button', { name: 'Subterfuge' })].map((b) => b.style.width)
      expect(widths).toEqual(Array(3).fill(`${visual.hud.dock.abilityPx}px`))
    })

    it('greys Build when the viewer cannot build in play (no model), and it does nothing', () => {
      const p = props()
      render(<Shell {...p} />)
      const build = screen.getByRole('button', { name: 'Build' })
      expect(build.getAttribute('aria-disabled')).toBe('true')
      fireEvent.click(build)
      expect(p.onDefenceToggle).not.toHaveBeenCalled()
    })

    it('an in-play build: Build opens (build mode), the other abilities fold away and the pieces take the row until Build is tapped again', () => {
      const p = props()
      const { rerender } = render(<Shell {...p} hud={hud({ refundRate: 2 })} defence={defence({ building: false, item: undefined })} />)
      fireEvent.click(screen.getByRole('button', { name: 'Build' }))
      expect(p.onDefenceToggle).toHaveBeenCalledTimes(1)
      rerender(<Shell {...p} hud={hud({ refundRate: 2 })} defence={defence()} />)
      expect(screen.getByRole('button', { name: 'Leave building' }).getAttribute('aria-expanded')).toBe('true')
      fireEvent.click(screen.getByRole('button', { name: 'Repulsor · 3' }))
      expect(p.onDefenceArm).toHaveBeenCalledWith('repulsor')
      // Folded away: out of the accessibility tree, and the shots and Refund step aside.
      expect(screen.queryByRole('button', { name: /^Offence/ })).toBeNull()
      expect(screen.queryByRole('button', { name: /^Refund/ })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Strategies' })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Leave building' }))
      expect(p.onDefenceToggle).toHaveBeenCalledTimes(2)
    })

    it('Subterfuge opens to its options (the Jam with its price, two locked); buying closes it; tapping it again closes it', () => {
      const p = props()
      const sub = { available: true, queued: [], items: [{ item: 'jam' as const, label: 'Jam · 2', name: 'Jam', badge: '2', when: 'next possession', disabled: false }, { item: 'soon1' as const, label: 'Soon', name: 'Soon', when: '', disabled: true as const, soon: true as const }, { item: 'soon2' as const, label: 'Soon', name: 'Soon', when: '', disabled: true as const, soon: true as const }] }
      render(<Shell {...p} subterfuge={sub} />)
      const tile = () => screen.getByRole('button', { name: 'Subterfuge' })
      expect(screen.queryByRole('button', { name: 'Jam · 2 · next possession' })).toBeNull()
      fireEvent.click(tile())
      expect(tile().getAttribute('aria-expanded')).toBe('true')
      expect(screen.getAllByRole('button', { name: 'Locked · soon' })).toHaveLength(2)
      expect(screen.queryByRole('button', { name: 'Build' })).toBeNull()
      fireEvent.click(tile())
      expect(screen.queryByRole('button', { name: 'Jam · 2 · next possession' })).toBeNull()
      fireEvent.click(tile())
      fireEvent.click(screen.getAllByRole('button', { name: 'Locked · soon' })[0]!)
      expect(p.onSubterfuge).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Jam · 2 · next possession' }))
      expect(p.onSubterfuge).toHaveBeenCalledWith('jam')
      expect(screen.queryByRole('button', { name: 'Jam · 2 · next possession' })).toBeNull()
    })

    it('a greyed Subterfuge still opens, its Jam greyed, and buys nothing', () => {
      const p = props()
      render(<Shell {...p} subterfuge={{ available: false, queued: [], items: [{ item: 'jam', label: 'Jam · 2', name: 'Jam', badge: '2', when: 'next possession', disabled: false }] }} />)
      fireEvent.click(screen.getByRole('button', { name: 'Subterfuge' }))
      const jam = screen.getByRole('button', { name: 'Jam · 2 · next possession' })
      expect(jam.getAttribute('aria-disabled')).toBe('true')
      fireEvent.click(jam)
      expect(p.onSubterfuge).not.toHaveBeenCalled()
    })

    it('has no Refund where refunds do not exist (Siege)', () => {
      render(<Shell {...props()} />)
      expect(screen.queryByRole('button', { name: /^Refund/ })).toBeNull()
    })

    it('a tap on Refund refunds one Move point', () => {
      const p = props()
      render(<Shell {...p} hud={hud({ refundRate: 2, refundable: true, shotsLeft: 3 })} />)
      fireEvent.pointerDown(refund())
      fireEvent.pointerUp(refund())
      expect(p.onRefund).toHaveBeenCalledWith(1)
    })

    it('a long-press refunds all but one, showing pressed while held', () => {
      vi.useFakeTimers()
      const p = props()
      render(<Shell {...p} hud={hud({ refundRate: 2, refundable: true, shotsLeft: 3 })} />)
      fireEvent.pointerDown(refund())
      expect(refund().getAttribute('aria-pressed')).toBe('true')
      act(() => void vi.advanceTimersByTime(visual.hud.longPressMs))
      fireEvent.pointerUp(refund())
      expect(p.onRefund).toHaveBeenCalledTimes(1)
      expect(p.onRefund).toHaveBeenCalledWith(2)
      expect(refund().getAttribute('aria-pressed')).toBe('false')
    })

    it('a long-press on the last Move point reports a refund of none', () => {
      vi.useFakeTimers()
      const p = props()
      render(<Shell {...p} hud={hud({ refundRate: 2, refundable: true, shotsLeft: 1 })} />)
      fireEvent.pointerDown(refund())
      act(() => void vi.advanceTimersByTime(visual.hud.longPressMs))
      expect(p.onRefund).toHaveBeenCalledWith(0)
    })

    it('a long-press does not fire after the Move points change mid-hold', () => {
      vi.useFakeTimers()
      const p = props()
      const { rerender } = render(<Shell {...p} hud={hud({ refundRate: 2, refundable: true, shotsLeft: 3 })} />)
      fireEvent.pointerDown(refund())
      rerender(<Shell {...p} hud={hud({ refundRate: 2, refundable: true, shotsLeft: 2 })} />)
      act(() => void vi.advanceTimersByTime(visual.hud.longPressMs))
      fireEvent.pointerUp(refund())
      expect(p.onRefund).not.toHaveBeenCalled()
    })

    it('is greyed and refunds nothing when a refund is not allowed', () => {
      const p = props()
      render(<Shell {...p} hud={hud({ refundRate: 2, refundable: false })} />)
      expect(refund().getAttribute('aria-disabled')).toBe('true')
      fireEvent.pointerDown(refund())
      fireEvent.pointerUp(refund())
      expect(p.onRefund).not.toHaveBeenCalled()
    })
  })

  describe('Powerup tile (the Offence circle)', () => {
    const circle = () => screen.getByRole('button', { name: /^Offence/ })

    it('a tap opens its options beside it and a second tap closes it', () => {
      render(<Shell {...props()} />)
      expect(screen.queryByRole('button', { name: 'Breaker · 2' })).toBeNull()
      fireEvent.click(circle())
      expect(circle().getAttribute('aria-expanded')).toBe('true')
      expect(screen.getByRole('button', { name: 'Breaker · 2' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Overdrive · soon' })).toBeTruthy()
      fireEvent.click(circle())
      expect(screen.queryByRole('button', { name: 'Breaker · 2' })).toBeNull()
    })

    it('names and badges each option as its model says (a Siege stock reads ×3)', () => {
      render(<Shell {...props()} offence={offence({ items: [{ item: 'breaker', label: 'Breaker · 3 left', name: 'Breaker', badge: '×3', disabled: false, pressed: false }, { item: 'overdrive', label: 'Overdrive', name: 'Overdrive', disabled: true, pressed: false, soon: true }] })} />)
      fireEvent.click(circle())
      expect(screen.getByRole('button', { name: 'Breaker · 3 left' }).textContent).toBe('Breaker×3')
      expect(screen.getByRole('button', { name: 'Overdrive · soon' }).textContent).toBe('Overdrive')
    })

    it('tapping the Breaker arms it and closes the options', () => {
      const p = props()
      render(<Shell {...p} />)
      fireEvent.click(circle())
      fireEvent.click(screen.getByRole('button', { name: 'Breaker · 2' }))
      expect(p.onOffenceArm).toHaveBeenCalledWith('breaker')
      expect(screen.queryByRole('button', { name: 'Breaker · 2' })).toBeNull()
    })

    it('a greyed item and the locked one arm nothing', () => {
      const p = props()
      render(<Shell {...p} offence={offence({ items: [{ item: 'breaker', label: 'Breaker · 2', name: 'Breaker', badge: '2', disabled: true, pressed: false }, { item: 'overdrive', label: 'Overdrive', name: 'Overdrive', disabled: true, pressed: false, soon: true }] })} />)
      fireEvent.click(circle())
      fireEvent.click(screen.getByRole('button', { name: 'Breaker · 2' }))
      fireEvent.click(screen.getByRole('button', { name: 'Overdrive · soon' }))
      expect(p.onOffenceArm).not.toHaveBeenCalled()
    })

    it('outside the viewer\'s possession it is greyed but still opens', () => {
      render(<Shell {...props()} offence={offence({ available: false })} />)
      expect(circle().getAttribute('aria-disabled')).toBe('true')
      fireEvent.click(circle())
      expect(screen.getByRole('button', { name: 'Breaker · 2' })).toBeTruthy()
    })

    it('shows the armed state, filled in the active player\'s colour', () => {
      const r = render(<Shell {...props()} />)
      expect(circle().getAttribute('aria-pressed')).toBe('false')
      r.rerender(<Shell {...props()} offence={offence({ armed: true })} />)
      expect(circle().getAttribute('aria-pressed')).toBe('true')
      const probe = document.createElement('div')
      probe.style.background = visual.player.colors[1]
      expect(circle().style.background).toBe(probe.style.background)
    })

    it('Escape closes it', () => {
      render(<Shell {...props()} />)
      fireEvent.click(circle())
      fireEvent.keyDown(circle(), { key: 'Escape' })
      expect(screen.queryByRole('button', { name: 'Breaker · 2' })).toBeNull()
    })
  })

  it('shows Confirm only when due', () => {
    const p = props()
    const { rerender } = render(<Shell {...p} />)
    expect(screen.queryByText('Confirm')).toBeNull()
    rerender(<Shell {...p} confirm />)
    fireEvent.click(screen.getByText('Confirm'))
    expect(p.onConfirm).toHaveBeenCalledTimes(1)
  })

  it('shows the map hint while the map is open', () => {
    const { rerender } = render(<Shell {...props()} />)
    expect(screen.queryByText('Tap to jump · tap ✕ to close')).toBeNull()
    rerender(<Shell {...props()} mapOpen />)
    expect(screen.getByText('Tap to jump · tap ✕ to close')).toBeTruthy()
  })

  it('only its controls take pointer input, so gestures pass through the gaps to the pitch', () => {
    const { container } = render(<Shell {...props()} hud={buildHud()} defence={defence({ selection: { buttons: [{ action: 'deselect', label: 'Deselect', onClick: vi.fn() }] } })} strategies={[]} confirm mapOpen><i>extra</i></Shell>)
    const shell = container.firstElementChild as HTMLElement
    expect(shell.style.pointerEvents).toBe('none')
    // The map's hint pill lets taps through to the map.
    const pill = screen.getByText('Tap to jump · tap ✕ to close')
    expect([...shell.children].filter((c) => c !== pill).every((c) => (c as HTMLElement).style.pointerEvents === 'auto')).toBe(true)
    expect(pill.style.pointerEvents).not.toBe('auto')
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
    expect(shell.style.flexDirection).toBe('column-reverse')
  })

  it('keeps the dock\'s inner edge padded when the turn flips, whichever side faces the screen edge', () => {
    const { rerender } = render(<Shell {...props()} />)
    const dock = () => screen.getByTestId('dock')
    expect(dock().style.paddingTop).toBe(`${visual.hud.dock.padPx}px`)
    rerender(<Shell {...props()} flipped />)
    expect(dock().style.paddingBottom).toBe(`${visual.hud.dock.padPx}px`)
    rerender(<Shell {...props()} />)
    expect(dock().style.paddingTop).toBe(`${visual.hud.dock.padPx}px`)
  })
})
