import { describe, expect, it } from 'vitest'
import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import { initialPallets, type Pallet } from '../../sim/pallet'
import { Camera } from './Camera'
import { Pallets } from './Pallets'

type Call = { fn: string; alpha: unknown; dash: number[]; args: unknown[] }

/** A canvas context that records the arcs, strokes and fills with the alpha and dash at the time. */
function recorder() {
  const calls: Call[] = []
  const state: Record<string, unknown> = { globalAlpha: 1, canvas: { width: 400, height: 640 } }
  let dash: number[] = []
  const ctx = new Proxy(
    {},
    {
      get: (_t, k: string) => {
        if (k === 'setLineDash') return (d: number[]) => void (dash = d)
        if (k === 'createRadialGradient') return () => ({ addColorStop: () => {} })
        if (['stroke', 'fill', 'arc'].includes(k)) return (...args: unknown[]) => void calls.push({ fn: k, alpha: state.globalAlpha, dash, args })
        return state[k] ?? (() => {})
      },
      set: (_t, k: string, v) => ((state[k] = v), true),
    },
  ) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

const spots = [{ x: 6, y: 54 }, { x: 34, y: 54 }]
const made = (phases: Pallet['phase'][] = ['idle', 'idle'], swept = 0) => {
  const p = new Pallets(() => new Camera(54), () => ({ x: 0, y: 0 }))
  p.pallets = initialPallets(spots, 1).map((a, i) => ({ ...a, phase: phases[i], swept }))
  return p
}
const arcsOf = (calls: Call[], radius: number) => calls.filter((c) => c.fn === 'arc' && c.args[2] === radius)

describe('Pallets', () => {
  it('draws each Activation ring dashed like the build-time ring, bright only for the tracking Pallet', () => {
    const { ctx, calls } = recorder()
    made(['track', 'idle']).draw(ctx)
    const rings = calls.filter((c) => c.fn === 'stroke' && c.dash.length > 0)
    expect(rings.map((c) => c.alpha)).toEqual([visual.pallet.ring.trackAlpha, visual.pallet.ring.idleAlpha])
    expect(rings[0].dash).toEqual(visual.pitch.palletRing.dashPx.map((d) => d * visual.pitch.unit))
    expect(arcsOf(calls, rules.pallet.ringRadius).map((c) => [c.args[0], c.args[1]])).toEqual([[6, 54], [34, 54]])
  })

  it('draws an arm and a pivot for every Pallet', () => {
    const { ctx, calls } = recorder()
    made().draw(ctx)
    expect(arcsOf(calls, visual.pallet.pivot.radius)).toHaveLength(2)
    expect(arcsOf(calls, rules.pallet.tipRadius)).toHaveLength(2)
  })

  it('adds the swing ghosts only for a swinging Pallet', () => {
    const rest = recorder()
    made().draw(rest.ctx)
    const swing = recorder()
    made(['swing', 'idle'], 10).draw(swing.ctx)
    expect(arcsOf(swing.calls, rules.pallet.tipRadius).length - arcsOf(rest.calls, rules.pallet.tipRadius).length).toBe(visual.pallet.ghosts)
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
