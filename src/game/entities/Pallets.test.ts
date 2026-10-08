import { describe, expect, it } from 'vitest'
import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import { initialPallets, type Pallet } from '../../sim/pallet'
import { Pallets } from './Pallets'

type Call = { fn: string; alpha: unknown; dash: number[]; width: unknown; args: unknown[] }

/** A canvas context that records the arcs, strokes, fills and rotations with the alpha, dash and line width at the time. */
function recorder() {
  const calls: Call[] = []
  const state: Record<string, unknown> = { globalAlpha: 1 }
  let dash: number[] = []
  const ctx = new Proxy(
    {},
    {
      get: (_t, k: string) => {
        if (k === 'setLineDash') return (d: number[]) => void (dash = d)
        if (k === 'createRadialGradient') return () => ({ addColorStop: () => {} })
        if (['stroke', 'fill', 'arc', 'rotate'].includes(k)) return (...args: unknown[]) => void calls.push({ fn: k, alpha: state.globalAlpha, dash, width: state.lineWidth, args })
        return state[k] ?? (() => {})
      },
      set: (_t, k: string, v) => ((state[k] = v), true),
    },
  ) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

const spots = [{ x: 6, y: 54 }, { x: 34, y: 54 }]
const made = (phases: Pallet['phase'][] = ['idle', 'idle'], swept = 0) => {
  const p = new Pallets()
  p.pallets = initialPallets(spots, 1).map((a, i) => ({ ...a, phase: phases[i], swept }))
  return p
}
const arcsOf = (calls: Call[], radius: number) => calls.filter((c) => c.fn === 'arc' && c.args[2] === radius)
/** The arm's own outline stroke, which follows its fill. */
const outlines = (calls: Call[]) => calls.filter((c) => c.fn === 'stroke' && c.width === visual.pallet.outlineWidth)

describe('Pallets', () => {
  it('draws each Activation ring dashed like the build-time ring, bright only for the tracking Pallet', () => {
    const { ctx, calls } = recorder()
    made(['track', 'idle']).draw(ctx)
    const rings = calls.filter((c) => c.fn === 'stroke' && c.dash.length > 0)
    expect(rings.map((c) => c.alpha)).toEqual([visual.pallet.ring.trackAlpha, visual.pallet.ring.idleAlpha])
    expect(rings[0].dash).toEqual(visual.pitch.palletRing.dashPx.map((d) => d * visual.pitch.unit))
    expect(arcsOf(calls, rules.pallet.ringRadius).map((c) => [c.args[0], c.args[1]])).toEqual([[6, 54], [34, 54]])
  })

  it('leaves its rings to the Pitch while a build ring is up', () => {
    const { ctx, calls } = recorder()
    const p = made()
    p.buildRing = true
    p.draw(ctx)
    expect(arcsOf(calls, rules.pallet.ringRadius)).toHaveLength(0)
    expect(arcsOf(calls, visual.pallet.pivot.radius)).toHaveLength(2)
  })

  it('turns each arm to its Pallet\'s angle and fills it at fillAlpha', () => {
    const { ctx, calls } = recorder()
    const p = made()
    p.draw(ctx)
    expect(calls.filter((c) => c.fn === 'rotate').map((c) => c.args[0])).toEqual(p.pallets.map((a) => a.angle))
    const fills = calls.filter((c) => c.fn === 'fill' && c.alpha === visual.pallet.fillAlpha)
    expect(fills).toHaveLength(2)
    expect(arcsOf(calls, visual.pallet.pivot.radius)).toHaveLength(2)
  })

  it('adds the swing ghosts, each turned behind the arm, only for a swinging Pallet', () => {
    const rest = recorder()
    made().draw(rest.ctx)
    const swing = recorder()
    const p = made(['swing', 'idle'], 10)
    p.draw(swing.ctx)
    expect(arcsOf(swing.calls, rules.pallet.tipRadius).length - arcsOf(rest.calls, rules.pallet.tipRadius).length).toBe(visual.pallet.ghosts)
    const turns = swing.calls.filter((c) => c.fn === 'rotate').map((c) => c.args[0] as number)
    expect(turns).toHaveLength(visual.pallet.ghosts + 2)
    expect(turns).toContain(p.pallets[0].angle)
  })

  it('widens only the swatted Pallet\'s arm stroke while it flashes', () => {
    const calm = recorder()
    made().draw(calm.ctx)
    const hit = recorder()
    const p = made()
    p.hit(1, { x: 33, y: 54 })
    p.draw(hit.ctx)
    const glows = (calls: Call[]) => calls.filter((c) => c.fn === 'stroke' && c.width === visual.pallet.flash.armGlow && c.alpha === visual.pallet.flash.armGlowAlpha)
    expect(glows(calm.calls)).toHaveLength(0)
    expect(glows(hit.calls)).toHaveLength(1)
    // Every arm still gets its outline.
    expect(outlines(hit.calls)).toHaveLength(2)
  })

  it('flashes a swat for flash.ms and then lets it go', () => {
    const p = made()
    p.hit(0, { x: 7, y: 54 })
    expect(p.flashCount).toBe(1)
    p.update(visual.pallet.flash.ms / 1000 - 0.001)
    expect(p.flashCount).toBe(1)
    p.update(0.002)
    expect(p.flashCount).toBe(0)
  })

  it('draws nothing of a flash once it is over', () => {
    const fresh = recorder()
    const p = made()
    p.hit(0, { x: 7, y: 54 })
    p.draw(fresh.ctx)
    const over = recorder()
    p.update(visual.pallet.flash.ms / 1000 + 0.01)
    p.draw(over.ctx)
    expect(arcsOf(fresh.calls, visual.pallet.flash.glowRadius)).toHaveLength(1)
    expect(arcsOf(over.calls, visual.pallet.flash.glowRadius)).toHaveLength(0)
  })

  it('forgets its Pallets and flashes on a new match', () => {
    const p = made()
    p.hit(0, { x: 7, y: 54 })
    p.reset()
    expect(p.flashCount).toBe(0)
    expect(p.pallets).toEqual([])
  })
})
