import { describe, expect, it } from 'vitest'
import { defaultConfig as c, type SimInput, type SimState } from '../../sim/step'
import { initialState } from '../../sim/step'
import { buildState } from '../../sim/testkit'
import { phaseButtons } from './phaseButtons'

/** Hot-seat: one device, so every seat is "mine". */
const hotSeat = () => true

describe('phase buttons in hot-seat', () => {
  it('Done sends the current builder even when the button was created for the previous one', () => {
    let state: SimState = buildState(1)
    const sent: SimInput[] = []
    // The HUD only rebuilds its row when a label or disabled flag changes, so this first row keeps serving clicks.
    const [done] = phaseButtons(state, c, { mine: hotSeat, current: () => state, send: (i) => sent.push(i) })!
    done!.onClick()
    expect(sent).toEqual([{ done: 1 }])

    state = buildState(2)
    expect(state.match.builder).toBe(2)
    done!.onClick()
    expect(sent.at(-1)).toEqual({ done: 2 })
  })
})

describe('Done with an unplaced piece', () => {
  it('is disabled while the builder holds a piece not yet in the sim, so finishing never silently discards it', () => {
    const state = { ...buildState(1), objects: [{ id: 1, kind: 'tower' as const, owner: 1 as const, power: 'steal' as const, hp: 3, at: { gx: 4, gy: 40 } }] }
    const done = (unplaced?: boolean) => phaseButtons(state, c, { mine: hotSeat, current: () => state, send: () => {}, unplaced })![0]!
    expect(done().disabled).toBe(false)
    expect(done(true).disabled).toBe(true)
  })
})

describe('Done behind a hold', () => {
  it('is disabled and sends nothing while an overlay or hold hides the board', () => {
    const state = buildState(1)
    const sent: SimInput[] = []
    const [done] = phaseButtons(state, c, { mine: hotSeat, current: () => state, send: (i) => sent.push(i), choosable: false })!
    expect(done!.disabled).toBe(true)
    done!.onClick()
    expect(sent).toEqual([])
  })
})

describe('defence choice buttons', () => {
  const owing = (player: 1 | 2): SimState => {
    const s = initialState(1, { ...c, mode: 'siege' })
    return { ...s, match: { ...s.match, builder: null, opening: false, choosing: player } as SimState['match'] }
  }
  it('offer Repair and Rearrange, and Rearrange sends the chooser at click time', () => {
    let state = owing(1)
    const sent: SimInput[] = []
    const row = phaseButtons(state, c, { mine: hotSeat, current: () => state, send: (i) => sent.push(i) })!
    expect(row.map((b) => b.label)).toEqual(['Repair', 'Rearrange'])
    row[1]!.onClick()
    expect(sent).toEqual([{ defence: { player: 1, choice: 'rearrange' } }])
    state = owing(2)
    row[1]!.onClick()
    row[0]!.onClick()
    expect(sent.slice(1)).toEqual([{ defence: { player: 2, choice: 'rearrange' } }, { defence: { player: 2, choice: 'repair' } }])
  })
  it('send nothing for a seat this device does not play', () => {
    const state = owing(1)
    const sent: SimInput[] = []
    const row = phaseButtons(state, c, { mine: (p) => p === 1, current: () => ({ ...state, match: { ...state.match, choosing: 2 } }), send: (i) => sent.push(i) })!
    row[1]!.onClick()
    expect(sent).toEqual([])
  })
})

describe('phase buttons gating', () => {
  const owing = (player: 1 | 2): SimState => {
    const s = initialState(1, { ...c, mode: 'siege' })
    return { ...s, match: { ...s.match, builder: null, opening: false, choosing: player } as SimState['match'] }
  }
  const seam = (state: SimState, over: Partial<Parameters<typeof phaseButtons>[2]> = {}) => ({ mine: hotSeat, current: () => state, send: () => {}, ...over })
  it('Repair sends the chooser at click time, and nothing once the choice has passed', () => {
    let state = owing(1)
    const sent: SimInput[] = []
    const row = phaseButtons(state, c, seam(state, { current: () => state, send: (i) => sent.push(i) }))!
    row[0]!.onClick()
    state = { ...state, match: { ...state.match, choosing: null } }
    row[0]!.onClick()
    expect(sent).toEqual([{ defence: { player: 1, choice: 'repair' } }])
  })
  it('offers no defence choice online to the peer who is not choosing', () => {
    expect(phaseButtons(owing(1), c, seam(owing(1), { mine: (p) => p === 2 }))).toBeUndefined()
    expect(phaseButtons(owing(1), c, seam(owing(1), { mine: (p) => p === 1 }))!.map((b) => b.label)).toEqual(['Repair', 'Rearrange'])
  })
  it('offers no defence choice while an overlay hides the board', () => {
    expect(phaseButtons(owing(1), c, seam(owing(1), { choosable: false }))).toBeUndefined()
  })
  it('offers no Done online to the peer who is not building', () => {
    const s = buildState(1)
    expect(phaseButtons(s, c, seam(s, { mine: (p) => p === 2 }))).toBeUndefined()
  })
})

