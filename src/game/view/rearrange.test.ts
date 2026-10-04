import { describe, expect, it } from 'vitest'
import { defaultConfig, initialState, step, type SimEvent, type SimInput, type SimState } from '../../sim/step'
import { blindSeat, buildPhase, openingBuild } from '../../sim/mode'
import { whoActs } from '../../sim/possession'
import { hudModel } from './hudModel'
import { advance, blocking, newTransition, overlayView, revealing, type Transition } from './transition'
import { hseg } from '../../sim/testkit'

const siege = { ...defaultConfig, mode: 'siege' as const }
const w = (id: number, owner: 1 | 2, gx: number) => ({ kind: 'wall' as const, owner, ...hseg(gx, owner === 1 ? 40 : 10), id, segments: [2] })

/** Drives step and advance as the shell does: the view derivations are the ones Game uses, computed from the state after each tick. */
function play() {
  const init = initialState(1, siege)
  let s: SimState = { ...init, match: { ...init.match, builder: null, opening: false } as SimState['match'], objects: [w(1, 1, 2), w(2, 2, 2)], nextId: 3, ball: { ...init.ball, pos: { x: 20, y: 0.5 }, vel: { x: 0, y: -60 } }, possession: { shooter: 1, shots: 1, inHand: false, live: true } }
  let t: Transition = { ...newTransition(1), due: false, phase: 'Play', opening: false }
  let now = 0
  const log = { blind: 0, reveals: 0 }
  const frame = (events: SimEvent[] = []) => {
    t = advance(t, { handover: true, tabletop: true, active: whoActs(s), phase: buildPhase(s.match), opening: openingBuild(s.match), events, now })
    if (blindSeat(s.match, 1) || blindSeat(s.match, 2)) log.blind++
    if (revealing(t)) log.reveals++
    now += 2000
  }
  const tick = (input: SimInput = {}) => {
    const r = step(s, input, siege)
    s = r.state
    frame(r.events)
  }
  return { tick, frame, state: () => s, transition: () => t, log }
}

describe('goal, Rearrange, Done as the shell drives them', () => {
  it('is never fogged and never revealed', () => {
    const g = play()
    g.tick()
    g.tick({ defence: { player: 1, choice: 'rearrange' } })
    expect(g.state().match.builder).toBe(1)
    g.tick({ moveStructure: { player: 1, id: 1, a: { x: 12, y: 88 }, b: { x: 20, y: 88 } } })
    g.tick({ done: 1 })
    g.tick()
    expect(g.state().match.builder).toBeNull()
    expect(g.log.blind).toBe(0)
    expect(g.log.reveals).toBe(0)
  })

  it('hot-seat: the conceder gets a handover after Done, held until the flip ends', () => {
    const g = play()
    g.tick()
    g.tick({ defence: { player: 1, choice: 'rearrange' } })
    g.tick({ done: 1 })
    expect(g.transition().flip).toMatchObject({ hudSeat: 2 })
    expect(blocking(g.transition())).toBe(true)
    g.frame()
    expect(g.transition().hudSeat).toBe(2)
    expect(blocking(g.transition())).toBe(false)
  })

  it('the HUD says Rearrange during the turn', () => {
    const g = play()
    g.tick()
    g.tick({ defence: { player: 1, choice: 'rearrange' } })
    expect(hudModel(g.state(), siege, { active: 1, viewer: 1 }).phase).toBe('Rearrange')
  })
})
