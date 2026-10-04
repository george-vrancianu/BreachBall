import { describe, expect, it } from 'vitest'
import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import { Pitch } from './Pitch'

type Call = { fn: string; fillStyle: unknown; strokeStyle: unknown; dash: number[]; alpha: unknown; args: unknown[] }

/** A canvas context that records every draw call with the style state at the time. */
function recorder() {
  const calls: Call[] = []
  const state: Record<string, unknown> = { fillStyle: '', strokeStyle: '', globalAlpha: 1 }
  let dash: number[] = []
  const ctx = new Proxy(
    {},
    {
      get: (_t, k: string) => {
        if (k === 'setLineDash') return (d: number[]) => void (dash = d)
        if (['stroke', 'fill', 'fillRect', 'arc'].includes(k)) return (...args: unknown[]) => void calls.push({ fn: k, fillStyle: state.fillStyle, strokeStyle: state.strokeStyle, dash, alpha: state.globalAlpha, args })
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
const snapDots = (calls: Call[]) => calls.filter((c) => c.fn === 'fillRect' && c.alpha === visual.pitch.snapGrid.alpha && c.args[2] === visual.pitch.snapGrid.dotPx * unit)

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

  it('draws the centre dot at the handoff radius', () => {
    const { ctx, calls } = recorder()
    new Pitch().draw(ctx)
    const dot = calls.find((c) => c.fn === 'arc' && c.args[2] === visual.pitch.centre.dotRadiusPx * unit)
    expect(dot?.args.slice(0, 2)).toEqual([rules.pitchWidth / 2, rules.halfHeight])
  })

  describe('snap grid', () => {
    const centres = (calls: Call[]) => snapDots(calls).map((c) => [(c.args[0] as number) + (c.args[2] as number) / 2, (c.args[1] as number) + (c.args[3] as number) / 2])

    it('is not drawn outside a build', () => {
      const { ctx, calls } = recorder()
      new Pitch().draw(ctx)
      expect(snapDots(calls)).toHaveLength(0)
    })

    it.each([
      [1, rules.halfHeight, rules.pitchHeight],
      [2, 0, rules.halfHeight],
    ] as const)("covers only player %i's half, one dot per cell corner", (builder, top, bottom) => {
      const { ctx, calls } = recorder()
      const pitch = new Pitch()
      pitch.builder = builder
      pitch.draw(ctx)
      const dots = centres(calls)
      const cols = rules.pitchWidth / rules.cellSize + 1
      const rows = (bottom - top) / rules.cellSize + 1
      expect(dots).toHaveLength(cols * rows)
      for (const [x, y] of dots) {
        expect(x % rules.cellSize).toBeCloseTo(0)
        expect(y % rules.cellSize).toBeCloseTo(0)
        expect(y).toBeGreaterThanOrEqual(top)
        expect(y).toBeLessThanOrEqual(bottom)
      }
    })

    it('is faint, sized in handoff px, drawn over the ground dots and under the markings', () => {
      const { ctx, calls } = recorder()
      const pitch = new Pitch()
      pitch.builder = 1
      pitch.draw(ctx)
      const dot = snapDots(calls)[0]
      expect(dot.alpha).toBe(visual.pitch.snapGrid.alpha)
      expect(dot.args[2]).toBeCloseTo(visual.pitch.snapGrid.dotPx * unit)
      const kinds = calls.map((c) => (c.fn === 'fillRect' ? c.fillStyle : c.fn))
      const { dot: ground } = visual.pitch
      expect(calls.indexOf(snapDots(calls)[0])).toBeGreaterThan(kinds.lastIndexOf(ground))
      expect(calls.lastIndexOf(snapDots(calls).at(-1)!)).toBeLessThan(calls.findIndex((c) => c.fn === 'stroke'))
    })
  })
})
