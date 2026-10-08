import { describe, expect, it } from 'vitest'
import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import { Camera, fogOf } from './Camera'
import { Entity } from './Entity'
import { Fog } from './Fog'

describe('blind fog', () => {
  const fog = (blind?: 1 | 2) => Object.assign(new Fog(() => new Camera(54), () => ({ x: 0, y: 0 })), { blind })

  it('covers the opponent\'s half, up to the halfway line', () => {
    expect(fog(1).covered).toEqual(fogOf(1))
    expect(fog(2).covered).toEqual(fogOf(2))
    expect(fogOf(1).bottom).toBe(rules.halfHeight)
  })

  it('covers nothing once the opening build is over (the reveal)', () => {
    expect(fog(undefined).covered).toBeUndefined()
  })

  it('draws an entity over itself clipped to the covered rect, and nothing when nothing is covered', () => {
    const log: unknown[][] = []
    const ctx = new Proxy({ canvas: { width: 400, height: 640 } }, { get: (t, k: string) => (k in t ? (t as never)[k] : (...a: unknown[]) => void log.push([k, ...a])), set: () => true }) as unknown as CanvasRenderingContext2D
    let drawn = 0
    const probe = new (class extends Entity {
      protected override render() {
        drawn++
        log.push(['probe'])
      }
    })()
    fog(undefined).drawOver(ctx, probe)
    expect(drawn).toBe(0)
    const { top, bottom } = fogOf(2)
    fog(2).drawOver(ctx, probe)
    const clip = log.findIndex((l) => l[0] === 'clip')
    expect(log.filter((l) => l[0] === 'rect').at(-1)).toEqual(['rect', -visual.fog.bleed, top, rules.pitchWidth + 2 * visual.fog.bleed, bottom - top])
    expect(clip).toBeGreaterThan(-1)
    expect(log.findIndex((l) => l[0] === 'probe')).toBeGreaterThan(clip)
  })
})
