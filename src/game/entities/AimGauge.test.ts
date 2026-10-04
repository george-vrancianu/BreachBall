import { describe, expect, it } from 'vitest'
import { AimGauge, type GaugeAim } from './AimGauge'

// The ball at (20, 80); 10 screen px per world unit; Touch 150 px, Power 84 px.
const touch: GaugeAim = { phase: 'holding', tier: 0, radiusPx: 150, pxPerUnit: 10 }
const power: GaugeAim = { phase: 'holding', tier: 1, radiusPx: 84, pxPerUnit: 10 }
const about = (x: number, y: number) => ({ x: expect.closeTo(x), y: expect.closeTo(y) })
const gauge = (aim?: GaugeAim) => {
  const g = new AimGauge()
  g.at = { x: 20, y: 80 }
  g.aim = aim
  return g
}

describe('AimGauge radius', () => {
  it('shows nothing without an aim', () => {
    expect(gauge().radius).toBeUndefined()
  })
  it('rings the ball at the tier\'s control radius, converted from screen px to world units', () => {
    expect(gauge(touch).radius).toBe(15)
    expect(gauge(power).radius).toBe(8.4)
  })
})

describe('AimGauge limit', () => {
  it('shows only the Touch limit in Touch, chipped TOUCH LIMIT, in green', () => {
    expect(gauge(touch).limits).toEqual([{ tier: 'Touch', radius: 15, chip: 'TOUCH LIMIT', color: '#4ade80', chipAt: expect.anything() }])
  })
  it('shows only the Power limit in Power: no Touch limit', () => {
    expect(gauge(power).limits).toEqual([{ tier: 'Power', radius: 8.4, chip: 'POWER LIMIT', color: '#f87171', chipAt: expect.anything() }])
  })
  // At -45 degrees, up and to the right on screen, clear of the dock below: 15 / sqrt(2) = 10.61 units each way.
  it('chips the limit at the top right of the ring, clear of the dock', () => {
    expect(gauge(touch).limits[0].chipAt).toEqual(about(30.61, 69.39))
  })
  it('keeps the chip at the screen\'s top right on the flipped stage, where screen up is world down', () => {
    const g = gauge(touch)
    g.flipped = true
    expect(g.limits[0].chipAt).toEqual(about(9.39, 90.61))
  })
  it('shows no limit without an aim', () => {
    expect(gauge().limits).toEqual([])
  })
})

// Dragged straight down the screen: the shot goes up (dir (0, -1)), the finger is below the ball.
const pulled = (pullPx: number, base: GaugeAim = touch): GaugeAim => ({ ...base, phase: 'aiming', dir: { x: 0, y: -1 }, power: 0.3, pullPx })

describe('AimGauge knob', () => {
  it('sits at the finger, in world units', () => {
    expect(gauge(pulled(50)).knob).toEqual({ x: 20, y: 85 })
  })
  it('is clamped to the limit past it', () => {
    expect(gauge(pulled(300)).knob).toEqual({ x: 20, y: 95 })
    expect(gauge(pulled(300, power)).knob).toEqual({ x: 20, y: 88.4 })
  })
  it('is absent while holding, before the drag', () => {
    expect(gauge(touch).knob).toBeUndefined()
  })
})

// The readout sits 54 screen px (5.4 units) to the knob's screen right, 2 px lower, unless within 90 px (9 units) of the screen's right edge (the pitch is 40 units across).
describe('AimGauge readout', () => {
  it('reads the tier, the power and the lit meter segments (8 at the strong end of the scale)', () => {
    expect(gauge({ ...pulled(150), power: 0.45 }).readout).toMatchObject({ tier: 'TOUCH', percent: 45, lit: 8 })
    expect(gauge({ ...pulled(79), power: 0.225 }).readout).toMatchObject({ percent: 23, lit: 4 })
    expect(gauge({ ...pulled(300, power), power: 0.5 }).readout).toMatchObject({ tier: 'POWER', percent: 50, lit: 0 })
  })
  it('sits to the knob\'s screen right, or its left near the right edge', () => {
    expect(gauge(pulled(50)).readout!.at).toEqual(about(25.4, 85.2))
    const nearEdge = gauge(pulled(50))
    nearEdge.at = { x: 32, y: 80 }
    expect(nearEdge.readout!.at).toEqual(about(26.6, 85.2))
  })
  it('mirrors on the flipped stage, where screen right is world left', () => {
    const g = gauge(pulled(50))
    g.flipped = true
    expect(g.readout!.at).toEqual(about(14.6, 84.8))
    g.at = { x: 8, y: 80 }
    expect(g.readout!.at).toEqual(about(13.4, 84.8))
  })
  // The knob 5 units (50 px) below the ball at y 85; the readout reaches 22 px below it and keeps 24 px from the dock: it rises 34 px (3.4 units) above the knob within 46 px (4.6 units) of the dock.
  it('rises above the knob when it would land in the dock band, and stays put otherwise', () => {
    const g = gauge(pulled(50))
    g.dockEdge = 89
    expect(g.readout!.at).toEqual(about(25.4, 81.6))
    g.dockEdge = 90
    expect(g.readout!.at).toEqual(about(25.4, 85.2))
  })
  it('rises toward world down on the flipped stage, where the dock is at world up', () => {
    const g = gauge(pulled(50))
    g.flipped = true
    g.at = { x: 20, y: 90 }
    g.aim = { ...pulled(50), dir: { x: 0, y: 1 } }
    g.dockEdge = 81
    expect(g.readout!.at).toEqual(about(14.6, 88.4))
    g.dockEdge = 80
    expect(g.readout!.at).toEqual(about(14.6, 84.8))
  })
  it('is absent before the drag', () => {
    expect(gauge(touch).readout).toBeUndefined()
  })
})

describe('AimGauge flare past the limit', () => {
  it('stays out within the limit', () => {
    const g = gauge(pulled(149))
    g.update(1)
    expect(g.flare).toBe(0)
  })
  it('eases in past the limit, and back out on returning inside it', () => {
    const g = gauge(pulled(151))
    g.update(0.016)
    const early = g.flare
    expect(early).toBeGreaterThan(0)
    expect(early).toBeLessThan(1)
    g.update(1)
    expect(g.flare).toBeCloseTo(1)
    g.aim = pulled(100)
    g.update(0.016)
    expect(g.flare).toBeGreaterThan(0)
    expect(g.flare).toBeLessThan(1)
    g.update(1)
    expect(g.flare).toBeCloseTo(0)
  })
})

// The morph runs visual.aim.gauge.morph.ms (380); the pop visual.aim.gauge.pop.ms (700).
describe('AimGauge tier switch', () => {
  const climbed = () => {
    const g = gauge(touch)
    g.update(0.016)
    g.aim = power
    return g
  }
  it('is settled before any climb', () => {
    const g = gauge(touch)
    g.update(0.1)
    expect([g.morph, g.pop]).toEqual([1, undefined])
  })
  it('morphs from the Touch size to the Power size, overshooting on the way', () => {
    const g = climbed()
    g.update(0.19)
    expect(g.morph).toBeCloseTo(0.5)
    expect(g.radius).toBeLessThan(8.4)
    g.update(0.19)
    expect([g.morph, g.radius]).toEqual([1, 8.4])
  })
  it('cross-fades the colour from green to red', () => {
    const g = climbed()
    g.update(0.19)
    expect(g.color).not.toBe('#4ade80')
    expect(g.color).not.toBe('#f87171')
    g.update(0.19)
    expect(g.color).toBe('#f87171')
  })
  it('pops POWER! above the ring, then it is gone', () => {
    const g = climbed()
    g.update(0.35)
    expect(g.pop).toEqual({ text: 'POWER!', progress: 0.5 })
    g.update(0.35)
    expect(g.pop).toBeUndefined()
  })
  it('a new aim starts settled, with no morph or pop left over', () => {
    const g = climbed()
    g.update(0.1)
    g.aim = undefined
    g.update(0.016)
    g.aim = touch
    g.update(0.016)
    expect([g.morph, g.pop, g.radius, g.color]).toEqual([1, undefined, 15, '#4ade80'])
  })
})

describe('AimGauge end labels', () => {
  it('reads LOW near the ball and MAX at the limit in Touch, where a longer drag is stronger', () => {
    expect(gauge(touch).ends).toEqual({ near: 'LOW', limit: 'MAX' })
  })
  it('reads MAX near the ball and MIN at the limit in Power, where a shorter drag is stronger', () => {
    expect(gauge(power).ends).toEqual({ near: 'MAX', limit: 'MIN' })
  })
})
