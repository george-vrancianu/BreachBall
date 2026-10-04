import { describe, expect, it } from 'vitest'
import { visual } from '../../config/visual'
import { Ball } from './Ball'

const ms = (b: Ball, n: number) => b.update(n / 1000)

describe('Ball', () => {
  it('brightens its trail for trailMs after a pulse', () => {
    const b = new Ball()
    expect(b.bright).toBe(false)
    b.pulse()
    ms(b, visual.ball.trailMs - 1)
    expect(b.bright).toBe(true)
    ms(b, 2)
    expect(b.bright).toBe(false)
  })

  it('sinks into a Steal tower for stealMs, then is a normal ball again', () => {
    const b = new Ball()
    b.steal({ x: 0, y: 0 }, { x: 5, y: 5 })
    ms(b, visual.ball.stealMs - 1)
    expect(b.stealing).toBe(true)
    ms(b, 2)
    expect(b.stealing).toBe(false)
  })
})

// Touch green, Power red; the hold ring sits 36 screen px out.
describe('Ball hold ring', () => {
  const green = '#4ade80'
  const red = '#f87171'
  const holding = (tier: number, holdProgress: number, phase: 'holding' | 'aiming' = 'holding') => ({ phase, tier, holdProgress, pxPerUnit: 10 })
  const ball = () => {
    const b = new Ball()
    b.sync({ pos: { x: 20, y: 80 }, vel: { x: 0, y: 0 }, rolled: 0 })
    return b
  }
  it('fills over the hold, in the Touch colour', () => {
    const b = ball()
    b.aim = holding(0, 0.4)
    expect(b.holdRing).toEqual({ at: { x: 20, y: 80 }, radius: 3.6, progress: 0.4, color: green, scale: 1 })
  })
  it('is gone once aiming', () => {
    const b = ball()
    b.aim = holding(0, 0.4, 'aiming')
    expect(b.holdRing).toBeUndefined()
  })
  it('turns red and full on reaching Power', () => {
    const b = ball()
    b.aim = holding(1, 1)
    expect(b.holdRing).toMatchObject({ progress: 1, color: red })
  })
  it('pulses on reaching Power, then settles', () => {
    const b = ball()
    b.aim = holding(0, 0.9)
    b.update(0.016)
    b.aim = holding(1, 1)
    b.update(visual.ball.hold.pulseMs / 2000)
    expect(b.holdRing!.scale).toBeGreaterThan(1)
    b.update(visual.ball.hold.pulseMs / 1000)
    expect(b.holdRing!.scale).toBe(1)
  })
})

describe('Ball reset', () => {
  it('forgets a pulse, a steal sink and an aim in progress', () => {
    const b = new Ball()
    b.pulse()
    b.steal({ x: 0, y: 0 }, { x: 5, y: 5 })
    b.aim = { phase: 'holding', tier: 0, holdProgress: 0.5, pxPerUnit: 10 }
    b.reset()
    expect([b.bright, b.stealing, b.holdRing]).toEqual([false, false, undefined])
  })
})
