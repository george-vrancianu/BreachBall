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
        if (['stroke', 'fill', 'fillRect', 'arc', 'fillText', 'translate'].includes(k)) return (...args: unknown[]) => void calls.push({ fn: k, fillStyle: state.fillStyle, strokeStyle: state.strokeStyle, dash, alpha: state.globalAlpha, args })
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

describe('Boost ring and Bullseye', () => {
  const arcsAt = (calls: Call[], radius: number) => calls.filter((c) => c.fn === 'arc' && c.args[2] === radius)
  const fills = (pitch: Pitch, radius: number) => {
    const { ctx, calls } = recorder()
    pitch.draw(ctx)
    return arcsAt(calls, radius)
  }

  it('draws the Bullseye ring at the rules radius and the Boost ring at the Centre zone radius', () => {
    const { ctx, calls } = recorder()
    new Pitch().draw(ctx)
    expect(arcsAt(calls, rules.boost.bullseye.radius).length).toBeGreaterThan(0)
    expect(arcsAt(calls, rules.boost.ring.radius).length).toBeGreaterThan(0)
    expect(rules.boost.ring.radius).toBe(rules.centreZoneRadius)
  })

  it('tints each zone in its own colour', () => {
    const [ring] = fills(new Pitch(), rules.boost.ring.radius)
    const [bullseye] = fills(new Pitch(), rules.boost.bullseye.radius)
    expect([ring.fillStyle, bullseye.fillStyle]).toEqual([visual.pitch.boost.colors.ring, visual.pitch.boost.colors.bullseye])
  })

  it('pulses the tint slowly', () => {
    const alphaAt = (ms: number) => {
      const p = new Pitch()
      p.update(ms / 1000)
      return fills(p, rules.boost.ring.radius)[0].alpha
    }
    expect(alphaAt(0)).toBe(visual.pitch.boost.alpha)
    expect(alphaAt(visual.pitch.boost.pulse.periodMs / 4)).toBeCloseTo(visual.pitch.boost.alpha + visual.pitch.boost.pulse.alphaSwing)
  })

  it('tints the zone holding a Charged ball stronger, and only that one', () => {
    const p = new Pitch()
    p.charge = { zone: 'bullseye', factor: rules.boost.bullseye.factor }
    expect(fills(p, rules.boost.bullseye.radius)[0].alpha).toBe(visual.pitch.boost.litAlpha)
    expect(fills(p, rules.boost.ring.radius)[0].alpha).toBe(visual.pitch.boost.alpha)
  })

  it('animates an arrival for its time, flashing the zone and growing a ring out of it', () => {
    const p = new Pitch()
    p.arrive('ring')
    expect(p.arrivalCount).toBe(1)
    expect(fills(p, rules.boost.ring.radius)[0].alpha).toBe(visual.pitch.boost.arrive.flashAlpha)
    p.update((visual.pitch.boost.arrive.ms - 1) / 1000)
    expect(p.arrivalCount).toBe(1)
    p.update(0.002)
    expect(p.arrivalCount).toBe(0)
  })
})

describe('Bullseye credit', () => {
  const { credit } = visual.pitch.boost
  const bullseyeFlash = (p: Pitch) => {
    const { ctx, calls } = recorder()
    p.draw(ctx)
    return calls.filter((c) => c.fn === 'arc' && c.args[2] === rules.boost.bullseye.radius)[0].alpha as number
  }
  /** The y the "+Credits" label is drawn at, or undefined when none is. */
  const labelY = (p: Pitch) => {
    const { ctx, calls } = recorder()
    p.draw(ctx)
    const i = calls.findIndex((c) => c.fn === 'fillText' && String(c.args[0]).startsWith('+'))
    return i < 0 ? undefined : (calls[i - 1].args[1] as number)
  }

  it('flashes the Bullseye and floats the Credits up in the shooter\'s colour, for its time', () => {
    const p = new Pitch()
    p.credit(2, 2)
    expect(p.creditCount).toBe(1)
    const { ctx, calls } = recorder()
    p.draw(ctx)
    expect(calls.filter((c) => c.fn === 'arc' && c.args[2] === rules.boost.bullseye.radius)[0].alpha).toBe(credit.flashAlpha)
    expect(calls.filter((c) => c.fn === 'fillText').map((c) => [c.args[0], c.fillStyle])).toContainEqual(['+2', visual.player.colors[2]])
    p.update((credit.ms - 1) / 1000)
    expect(p.creditCount).toBe(1)
    p.update(0.002)
    expect(p.creditCount).toBe(0)
  })
  it('fades the flash over its time', () => {
    const p = new Pitch()
    p.credit(1, 2)
    p.update(credit.ms / 2000)
    expect(bullseyeFlash(p)).toBeLessThan(credit.flashAlpha)
    expect(bullseyeFlash(p)).toBeGreaterThan(visual.pitch.boost.alpha)
  })
  it('floats the label up the screen: toward -y for Player 1, +y for Player 2 whose canvas is rotated', () => {
    for (const [flipped, sign] of [[false, -1], [true, 1]] as const) {
      const p = new Pitch()
      p.flipped = flipped
      p.credit(1, 2)
      const start = labelY(p)!
      p.update(credit.ms / 2000)
      expect(Math.sign(labelY(p)! - start)).toBe(sign)
      expect(Math.sign(start - rules.halfHeight)).toBe(sign)
    }
  })
  it('clears the pending credits on reset', () => {
    const p = new Pitch()
    p.credit(1, 2)
    p.reset()
    expect(p.creditCount).toBe(0)
    expect(bullseyeFlash(p)).toBe(visual.pitch.boost.alpha)
    expect(labelY(p)).toBeUndefined()
  })
})
