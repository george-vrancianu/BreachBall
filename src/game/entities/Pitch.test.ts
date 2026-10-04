import { describe, expect, it } from 'vitest'
import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import { Pitch } from './Pitch'

type Call = { fn: string; strokeStyle: unknown; dash: number[]; alpha: unknown; args: unknown[] }

/** A canvas context that records every draw call with the style state at the time. */
function recorder() {
  const calls: Call[] = []
  const state: Record<string, unknown> = { strokeStyle: '', globalAlpha: 1 }
  let dash: number[] = []
  const ctx = new Proxy(
    {},
    {
      get: (_t, k: string) => {
        if (k === 'setLineDash') return (d: number[]) => void (dash = d)
        if (['stroke', 'fill', 'fillRect'].includes(k)) return (...args: unknown[]) => void calls.push({ fn: k, strokeStyle: state.strokeStyle, dash, alpha: state.globalAlpha, args })
        return state[k] ?? (() => {})
      },
      set: (_t, k: string, v) => ((state[k] = v), true),
    },
  ) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

const { unit } = visual.pitch
const keepOut = (calls: Call[]) => calls.filter((c) => c.fn === 'stroke' && c.dash[0] === visual.pitch.keepOut.dashPx[0] * unit)
const buildEdges = (calls: Call[]) => calls.filter((c) => c.fn === 'stroke' && c.dash[0] === visual.pitch.buildEdge.dashPx[0] * unit)

describe('Pitch markings', () => {
  it('always draws both keep-out arcs, neutral outside a build, and no build edge', () => {
    const { ctx, calls } = recorder()
    new Pitch().draw(ctx)
    expect(keepOut(calls).map((c) => c.strokeStyle)).toEqual([visual.pitch.line, visual.pitch.line])
    expect(buildEdges(calls)).toHaveLength(0)
  })

  it('takes the builder colour on their keep-out arc and draws the dashed halfway edge during a build', () => {
    const { ctx, calls } = recorder()
    const pitch = new Pitch()
    pitch.builder = 1
    pitch.draw(ctx)
    // Ends are drawn P2 (top) first, then P1.
    expect(keepOut(calls).map((c) => c.strokeStyle)).toEqual([visual.pitch.line, visual.player.colors[1]])
    const edges = buildEdges(calls)
    expect(edges).toHaveLength(1)
    expect(edges[0].strokeStyle).toBe(visual.player.colors[1])
    expect(edges[0].alpha).toBe(visual.pitch.buildEdge.alpha)
  })

  it('draws a goal line across each mouth', () => {
    const { ctx, calls } = recorder()
    new Pitch().draw(ctx)
    expect(calls.filter((c) => c.fn === 'fillRect' && c.args[0] === rules.goalLeft)).toHaveLength(2)
  })
})
