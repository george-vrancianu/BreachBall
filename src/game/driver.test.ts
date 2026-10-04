import { describe, expect, it } from 'vitest'
import { defaultConfig, type SimEvent, type SimState } from '../sim/step'
import { LocalDriver } from './driver'

function setup(blocked = false) {
  const ticks: { state: SimState; events: SimEvent[] }[] = []
  const sink = { apply: (state: SimState, events: SimEvent[]) => ticks.push({ state, events }), simPaused: () => blocked }
  const driver = new LocalDriver(sink)
  const start = driver.start(defaultConfig, 1)
  return { driver, ticks, start }
}
const tick = 1 / defaultConfig.tickHz

describe('LocalDriver', () => {
  it('steps whole ticks at the sim tick rate and hands each to the sink', () => {
    const { driver, ticks } = setup()
    driver.update(tick * 3.5)
    expect(ticks.map((t) => t.state.tick)).toEqual([1, 2, 3])
    driver.update(tick * 0.5)
    expect(ticks).toHaveLength(4)
  })

  it('feeds a sent input into the next tick: Done ends the builder\'s turn', () => {
    const { driver, ticks, start } = setup()
    driver.send({ done: start.match.builder! })
    driver.update(tick)
    expect(ticks[0].state.match.builder).not.toBe(start.match.builder)
  })

  it('stops stepping while the sink is blocked and drops what was sent meanwhile', () => {
    const { driver, ticks } = setup(true)
    driver.send({ done: 1 })
    driver.update(tick * 5)
    expect(ticks).toHaveLength(0)
  })

  it('drops the held aim once the shot clock fires it: the next expiry burns', () => {
    const { driver, ticks, start } = setup()
    let s = start
    const last = () => (s = ticks.at(-1)?.state ?? s)
    while (last().match.builder) (driver.send({ done: s.match.builder! }), driver.update(tick))
    const me = s.possession.shooter
    if (s.possession.inHand) (driver.send({ placeBall: { player: me, at: { x: 20, y: me === 1 ? 80 : 28 } } }), driver.update(tick))
    driver.send({ aiming: { dir: { x: 1, y: 0 }, tier: 0, power: 0.3 } })
    const events = () => ticks.flatMap((t) => t.events)
    const shots = () => events().filter((e) => e.type === 'shot-fired')
    while (!shots().length) driver.update(tick)
    while (last().possession.live) driver.update(tick)
    for (let i = 0; i <= defaultConfig.shotClock * defaultConfig.tickHz; i++) driver.update(tick)
    expect(shots()).toHaveLength(1)
    expect(events().filter((e) => e.type === 'shot-clock-expired')).toHaveLength(2)
  })
})
