import { describe, expect, it } from 'vitest'
import { defaultConfig as c, step, type SimState } from '../../sim/step'
import { buildState, funded, hseg, siegeBuild } from '../../sim/testkit'
import { kickoffSpot } from '../../sim/pitch'
import { distToSegment, isLegal, structureCost, wallSegments } from '../../sim/wall'
import { rules } from '../../config/rules'
import { piecesFor, planStrategy, STRATEGIES, strategyCards } from './strategies'

const apply = (s: SimState, inputs: ReturnType<typeof planStrategy>['inputs']) => inputs.reduce((st, i) => step(st, i, { ...c, buildTime: 0 }).state, s)

describe('Strategies', () => {
  it.each(STRATEGIES.map((st) => [st.name, st] as const))('%s is legal for both players on an empty half, piece by piece', (_, st) => {
    for (const owner of [1, 2] as const) {
      const placed: ReturnType<typeof piecesFor> = []
      for (const p of piecesFor(st, owner)) {
        expect(isLegal(p, placed)).toBe(true)
        placed.push(p)
      }
    }
  })

  it.each(STRATEGIES.map((st) => [st.name, st] as const))('%s fits the Opening Credits in Rounds, whole', (_, st) => {
    for (const owner of [1, 2] as const) {
      const plan = planStrategy(funded(buildState(owner), owner, c.openingCredits), owner, st, c)
      expect(plan.placed).toBe(plan.total)
      expect(plan.cost).toBeLessThanOrEqual(c.openingCredits)
    }
  })

  it.each(STRATEGIES.map((st) => [st.name, st] as const))('the core of %s fits one later round\'s Credits per round, for both players', (_, st) => {
    expect(st.core).toBeGreaterThan(0)
    expect(st.core).toBeLessThanOrEqual(st.pieces.length)
    for (const owner of [1, 2] as const) {
      const poor = funded(buildState(owner), owner, c.credits)
      const core = planStrategy(poor, owner, { ...st, pieces: st.pieces.slice(0, st.core) }, c)
      expect(core.placed).toBe(st.core)
      expect(core.cost).toBeLessThanOrEqual(c.credits)
      // Tapped whole in a poor round, the leading pieces still land.
      expect(planStrategy(poor, owner, st, c).placed).toBeGreaterThanOrEqual(st.core)
    }
  })

  it('Fortress is the fifth Strategy, spends nearly the whole opening budget and leaves the Kick-off spot clear', () => {
    const fortress = STRATEGIES[4]
    expect(fortress.id).toBe('fortress')
    for (const owner of [1, 2] as const) {
      const pieces = piecesFor(fortress, owner)
      const cost = pieces.reduce((n, p) => n + structureCost(p), 0)
      expect(cost).toBeGreaterThanOrEqual(35)
      expect(cost).toBeLessThanOrEqual(c.openingCredits)
      const spot = kickoffSpot(owner)
      const clear = pieces.every((p) => wallSegments(p).every((seg) => distToSegment(seg, spot) > c.ballRadius + rules.wallHalf))
      expect(clear).toBe(true)
    }
  })

  it('applying the plan places every piece and spends what it says', () => {
    const s = buildState(1)
    const plan = planStrategy(s, 1, STRATEGIES[0], c)
    const after = apply(s, plan.inputs)
    expect(after.objects.filter((o) => o.owner === 1)).toHaveLength(plan.total)
    expect(s.credits[1] - after.credits[1]).toBe(plan.cost)
  })

  it('clears this turn\'s own pieces first, refunded, so switching layouts costs nothing extra', () => {
    const s = buildState(1)
    const first = apply(s, planStrategy(s, 1, STRATEGIES[0], c).inputs)
    const plan = planStrategy(first, 1, STRATEGIES[1], c)
    const after = apply(first, plan.inputs)
    expect(after.objects.filter((o) => o.owner === 1)).toHaveLength(STRATEGIES[1].pieces.length)
    expect(s.credits[1] - after.credits[1]).toBe(planStrategy(s, 1, STRATEGIES[1], c).cost)
  })

  it('keeps pieces from earlier turns and skips what would cross them', () => {
    // A wall from an earlier turn (not in `built`) right where Bulwark's first wall goes.
    const s0 = buildState(1)
    const old = step(s0, { placeWall: { kind: 'wall', owner: 1, ...hseg(2, 44, 2) } }, c).state
    const s = { ...old, built: [] }
    const plan = planStrategy(s, 1, STRATEGIES[0], c)
    expect(plan.inputs.some((i) => i.demolish)).toBe(false)
    expect(plan.placed).toBeLessThan(plan.total)
  })

  it('skips what the builder cannot afford, and greys a card where nothing fits', () => {
    const broke = funded(buildState(1), 1, 0)
    const cards = strategyCards(broke, 1, c)
    expect(cards.every((card) => card.disabled && card.placed === 0)).toBe(true)
    const some = funded(buildState(1), 1, 3)
    const plan = planStrategy(some, 1, STRATEGIES[0], c)
    expect(plan.placed).toBe(1)
    expect(plan.cost).toBe(2)
  })

  it('in Siege towers come from the stock and walls from wall points', () => {
    const s = siegeBuild(1)
    const plan = planStrategy(s, 1, STRATEGIES.find((st) => st.id === 'turrets')!, c)
    expect(plan.placed).toBe(plan.total)
    expect(plan.cost).toBe(1)
  })
})
