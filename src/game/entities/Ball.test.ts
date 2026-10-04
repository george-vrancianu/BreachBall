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

describe('Ball control ring', () => {
  it('shows none without an aim', () => {
    expect(new Ball().controlRing).toBeUndefined()
  })
  it('rings the ball at the tier\'s control radius, converted from screen px to world units', () => {
    const b = new Ball()
    b.sync({ pos: { x: 20, y: 80 }, vel: { x: 0, y: 0 }, rolled: 0 })
    b.aim = { phase: 'aiming', tier: 0, holdProgress: 0, radiusPx: 220, pxPerUnit: 10 }
    expect(b.controlRing).toEqual({ at: { x: 20, y: 80 }, radius: 22 })
  })
})

// Touch green, Power red; the hold ring sits 36 screen px out.
describe('Ball hold ring', () => {
  const green = '#4ade80'
  const red = '#f87171'
  const holding = (tier: number, holdProgress: number, phase: 'holding' | 'aiming' = 'holding') => ({ phase, tier, holdProgress, radiusPx: tier ? 90 : 220, pxPerUnit: 10 })
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
  it('is gone once aiming, leaving the control ring', () => {
    const b = ball()
    b.aim = holding(0, 0.4, 'aiming')
    expect(b.holdRing).toBeUndefined()
    expect(b.controlRing).toBeDefined()
  })
  it('turns red and full on reaching Power, and the control ring shrinks to its radius', () => {
    const b = ball()
    b.aim = holding(1, 1)
    expect(b.holdRing).toMatchObject({ progress: 1, color: red })
    expect(b.controlRing?.radius).toBe(9)
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
    b.aim = { phase: 'aiming', tier: 0, holdProgress: 0, radiusPx: 220, pxPerUnit: 10 }
    b.reset()
    expect([b.bright, b.stealing, b.controlRing]).toEqual([false, false, undefined])
  })
})

// Touch green, Power red; at 10 screen px per world unit, a 5 px tail step is 0.5 units and a 14 px tail 1.4.
describe('Ball tracer', () => {
  const green = '#4ade80'
  const red = '#f87171'
  const at = (b: Ball, x: number, y: number, moving = true) => b.sync({ pos: { x, y }, vel: moving ? { x: 0, y: -30 } : { x: 0, y: 0 }, rolled: 0 })
  const fired = (tier: number) => {
    const b = new Ball()
    b.tracer.pxPerUnit = 10
    at(b, 20, 80, false)
    b.fire(tier, { x: 20, y: 80 })
    return b
  }

  it('starts its tail at the launch and fills the gap a fast frame leaves, one point per 5 px', () => {
    const b = fired(0)
    expect(b.tracer.points).toBe(1)
    at(b, 20, 70)
    expect(b.tracer.points).toBe(21)
  })

  it('drops tail points older than 520 ms', () => {
    const b = fired(0)
    at(b, 20, 70)
    ms(b, 519)
    expect(b.tracer.points).toBe(21)
    ms(b, 2)
    expect(b.tracer.points).toBe(0)
  })

  it('takes the colour of the tier that fired', () => {
    expect(fired(0).tracer.color).toBe(green)
    expect(fired(1).tracer.color).toBe(red)
  })

  it('loses its colour when the ball comes to rest', () => {
    const b = fired(1)
    at(b, 20, 70)
    at(b, 20, 70, false)
    expect(b.tracer.color).toBeUndefined()
  })

  it('draws a Power tail wider than a Touch tail', () => {
    expect(fired(0).tracer.width).toBe(1.4)
    expect(fired(1).tracer.width).toBe(2)
  })

  it('bursts sparks at launch, more for Power', () => {
    expect(fired(1).tracer.sparks).toBeGreaterThan(fired(0).tracer.sparks)
  })

  it('sheds sparks along its path', () => {
    const b = fired(0)
    const before = b.tracer.sparks
    at(b, 20, 60)
    expect(b.tracer.sparks).toBeGreaterThan(before)
  })

  it('flashes and sprays sparks at a bounce, the flash fading after its time', () => {
    const b = fired(0)
    const before = b.tracer.sparks
    b.bounce({ x: 0, y: 70 }, true)
    expect(b.tracer.flashes).toBe(1)
    expect(b.tracer.sparks).toBeGreaterThan(before)
    ms(b, visual.ball.tracer.flash.ms + 1)
    expect(b.tracer.flashes).toBe(0)
  })

  it('holds its sparks and flashes to their caps however many bounces land', () => {
    const b = fired(1)
    for (let i = 0; i < 100; i++) b.bounce({ x: 0, y: 70 }, i % 2 === 0)
    expect(b.tracer.sparks).toBe(visual.ball.tracer.sparks.max)
    expect(b.tracer.flashes).toBe(visual.ball.tracer.flash.max)
  })

  it('lets its sparks fade out', () => {
    const b = fired(1)
    ms(b, visual.ball.tracer.sparks.lifeMs[1] + 1)
    expect(b.tracer.sparks).toBe(0)
  })

  it('runs its white core bright after a Repulsor fires, and for a Charged shot until the ball stops', () => {
    const b = fired(0)
    expect(b.brightCore).toBe(false)
    b.pulse()
    expect(b.brightCore).toBe(true)
    ms(b, visual.ball.trailMs + 1)
    b.launch()
    at(b, 20, 70)
    ms(b, 16)
    expect(b.brightCore).toBe(true)
    at(b, 20, 70, false)
    ms(b, 16)
    expect(b.brightCore).toBe(false)
  })

  it('a new match forgets the tail, its colour, sparks and flashes', () => {
    const b = fired(1)
    at(b, 20, 70)
    b.bounce({ x: 0, y: 70 }, false)
    b.reset()
    expect([b.tracer.points, b.tracer.color, b.tracer.sparks, b.tracer.flashes]).toEqual([0, undefined, 0, 0])
  })
})
