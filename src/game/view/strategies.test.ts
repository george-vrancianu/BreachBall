import { describe, expect, it } from 'vitest'
import { defaultConfig as c, step, type SimState } from '../../sim/step'
import { buildState, funded, hseg, siegeBuild } from '../../sim/testkit'
import { kickoffSpot, type Point } from '../../sim/pitch'
import { distToSegment, isLegal, wallSegments, structureCost, type TowerPower } from '../../sim/wall'
import { sliderDefault } from '../../sim/settings'
import { rules } from '../../config/rules'
import { piecesFor, planStrategy, STRATEGIES, strategyCards, type StrategyPiece } from './strategies'

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

  it.each(STRATEGIES.map((st) => [st.name, st] as const))('Player 2\'s copy of %s is Player 1\'s point-reflected through the centre spot', (_, st) => {
    const { pitchWidth: W, pitchHeight: H, gridCols, gridRows } = rules
    const p1 = piecesFor(st, 1)
    const p2 = piecesFor(st, 2)
    expect(p2).toHaveLength(p1.length)
    p1.forEach((a, i) => {
      const b = p2[i]
      expect([a.owner, b.owner, b.kind]).toEqual([1, 2, a.kind])
      if (a.kind === 'wall' && b.kind === 'wall') {
        expect(b.a).toEqual({ x: W - a.a.x, y: H - a.a.y })
        expect(b.b).toEqual({ x: W - a.b.x, y: H - a.b.y })
      } else if (a.kind === 'tower' && b.kind === 'tower') {
        expect(b.power).toBe(a.power)
        expect(b.at).toEqual({ gx: gridCols - 1 - a.at.gx, gy: gridRows - 1 - a.at.gy })
      }
    })
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

  it.each(STRATEGIES.map((st) => [st.name, st] as const))('the core of %s fits the Siege Wall points and tower stock, for both players', (_, st) => {
    for (const owner of [1, 2] as const) {
      const core = planStrategy(siegeBuild(owner), owner, { ...st, pieces: st.pieces.slice(0, st.core) }, c)
      expect(core.placed).toBe(st.core)
      expect(core.cost).toBeLessThanOrEqual(sliderDefault('siege', 'openingCredits'))
    }
  })

  it.each(STRATEGIES.map((st) => [st.name, st] as const))('%s spends nearly the whole opening budget, and its card shows the plan\'s net cost, whole', (_, st) => {
    for (const owner of [1, 2] as const) {
      const s = funded(buildState(owner), owner, c.openingCredits)
      const plan = planStrategy(s, owner, st, c)
      expect(plan.cost).toBeGreaterThanOrEqual(c.openingCredits - 5)
      expect(plan.cost).toBeLessThanOrEqual(c.openingCredits)
      const card = strategyCards(s, owner, c).find((k) => k.id === st.id)!
      expect(card).toMatchObject({ cost: plan.cost, placed: card.total, disabled: false })
    }
  })

  it.each(STRATEGIES.map((st) => [st.name, st] as const))('%s leaves a path from the Kick-off spot to the halfway line and from there to the goal mouth, for both players', (_, st) => {
    for (const owner of [1, 2] as const) {
      const segs = piecesFor(st, owner).flatMap(wallSegments)
      const { pitchWidth: W, pitchHeight: H, halfHeight, goalLeft, goalRight } = rules
      const clear = c.ballRadius + rules.wallHalf
      const [y0, y1] = owner === 1 ? [halfHeight, H] : [0, halfHeight]
      const goalY = owner === 1 ? H : 0
      const step = 0.5
      const free = (x: number, y: number) => x >= c.ballRadius && x <= W - c.ballRadius && segs.every((g) => distToSegment(g, { x, y }) > clear)
      const key = (x: number, y: number) => `${x},${y}`
      // 4-connected flood over the owner's half in 0.5 steps from `starts`; true when it reaches a cell satisfying `goal`.
      const reaches = (starts: { x: number; y: number }[], goal: (x: number, y: number) => boolean) => {
        const seen = new Set(starts.map((p) => key(p.x, p.y)))
        const queue = [...starts]
        for (let p = queue.shift(); p; p = queue.shift()) {
          if (goal(p.x, p.y)) return true
          for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
            const [x, y] = [p.x + dx, p.y + dy]
            if (y < y0 || y > y1 || seen.has(key(x, y)) || !free(x, y)) continue
            seen.add(key(x, y))
            queue.push({ x, y })
          }
        }
        return false
      }
      const halfway = Array.from({ length: W / step + 1 }, (_, i) => ({ x: i * step, y: halfHeight })).filter((p) => free(p.x, p.y))
      const spot = kickoffSpot(owner)
      expect(free(spot.x, spot.y)).toBe(true)
      expect(reaches([spot], (_x, y) => y === halfHeight)).toBe(true)
      expect(reaches(halfway, (x, y) => y === goalY && x >= goalLeft && x <= goalRight)).toBe(true)
    }
  })

  // The archetype of each Strategy (not a tag on it), and the band each holds: walls are cheap, so wall-heavy Strategies are mostly walls.
  const archetype: Record<string, 'wall' | 'hybrid' | 'tower'> = {
    bulwark: 'wall', fortress: 'wall', honeycomb: 'wall', bastion: 'wall', layers: 'wall', labyrinth: 'wall',
    chevron: 'hybrid', zigzag: 'hybrid', net: 'hybrid', pinball: 'hybrid', wings: 'hybrid', gauntlet: 'hybrid', spider: 'hybrid',
    turrets: 'tower', crossfire: 'tower', watchtowers: 'tower',
  }

  it('the archetype map covers every Strategy and nothing else', () => {
    expect(Object.keys(archetype).sort()).toEqual(STRATEGIES.map((st) => st.id).sort())
  })

  it.each(STRATEGIES.map((st) => [st.name, st] as const))('%s sits in its archetype\'s band of wall units and towers', (_, st) => {
    const pieces = piecesFor(st, 1)
    const wallUnits = pieces.filter((p) => p.kind === 'wall').reduce((n, p) => n + structureCost(p), 0)
    const towers = pieces.filter((p) => p.kind === 'tower')
    const towerCost = towers.reduce((n, p) => n + structureCost(p), 0)
    const kind = archetype[st.id]
    if (kind === 'wall') {
      expect(wallUnits).toBeGreaterThanOrEqual(26)
      expect(towers.length).toBeLessThanOrEqual(2)
      expect(towerCost).toBeLessThanOrEqual(10)
    } else if (kind === 'hybrid') {
      expect(wallUnits).toBeGreaterThanOrEqual(17)
      expect(wallUnits).toBeLessThanOrEqual(23)
      expect(towers.length).toBeGreaterThanOrEqual(3)
      expect(towers.length).toBeLessThanOrEqual(4)
      expect(towerCost).toBeGreaterThanOrEqual(14)
      expect(towerCost).toBeLessThanOrEqual(18)
    } else {
      expect(towerCost).toBeGreaterThanOrEqual(25)
      expect(wallUnits).toBeLessThanOrEqual(11)
    }
  })

  // The shapes the issue names for each Strategy, pinned where the layout is easy to get wrong.
  const byId = (id: string) => STRATEGIES.find((st) => st.id === id)!
  const wallsOf = (pieces: readonly StrategyPiece[]) => pieces.filter((p): p is Extract<StrategyPiece, { kind: 'wall' }> => p.kind === 'wall')
  const towersOf = (pieces: readonly StrategyPiece[], power: TowerPower) => pieces.filter((p): p is Extract<StrategyPiece, { kind: 'tower' }> => p.kind === 'tower' && p.power === power)

  it('Watchtowers is "3 Repulsors spread across the forward line, backed by a row of short walls"', () => {
    const st = byId('watchtowers')
    const repulsors = towersOf(st.pieces, 'repulsor')
    expect(repulsors).toHaveLength(3)
    const lines = new Set(repulsors.map((p) => p.at.gy))
    expect(lines.size).toBe(1)
    const behind = ([...lines][0] + 1) * rules.cellSize
    // One row: every wall is a short (1-unit) horizontal wall on the same line, behind the Repulsors (nearer the goal).
    const walls = wallsOf(st.pieces)
    expect(new Set(walls.map((w) => w.a.y)).size).toBe(1)
    for (const w of walls) {
      expect(w.b.y).toBe(w.a.y)
      expect(Math.abs(w.b.x - w.a.x)).toBeCloseTo(rules.wall.unit)
      expect(w.a.y).toBeGreaterThan(behind)
    }
  })

  it('Bastion\'s core is a closed box with chamfered corners just outside the goal no-build zone, with a forward screen up the pitch', () => {
    const st = byId('bastion')
    const box = st.pieces.slice(0, st.core)
    const walls = wallsOf(box)
    expect(walls).toHaveLength(box.length)
    expect(walls).toHaveLength(8)
    // Closed: every corner is shared by exactly two walls.
    const key = (p: Point) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`
    const ends = new Map<string, number>()
    for (const w of walls) for (const p of [w.a, w.b]) ends.set(key(p), (ends.get(key(p)) ?? 0) + 1)
    expect([...ends.values()]).toEqual(Array(8).fill(2))
    // Four straight sides and four diagonal (chamfered) corners.
    expect(walls.filter((w) => Math.abs(w.a.x - w.b.x) > 0.01 && Math.abs(w.a.y - w.b.y) > 0.01)).toHaveLength(4)
    // Just outside: its nearest point is within a cell of the goal no-build zone.
    const goal = { x: rules.pitchWidth / 2, y: rules.pitchHeight }
    const nearest = Math.min(...walls.map((w) => distToSegment(w, goal)))
    expect(nearest).toBeGreaterThan(rules.noBuildRadius)
    expect(nearest).toBeLessThanOrEqual(rules.noBuildRadius + rules.cellSize)
    // A forward screen: walls beyond the core, up the pitch from the box.
    const top = Math.min(...walls.flatMap((w) => [w.a.y, w.b.y]))
    expect(wallsOf(st.pieces.slice(st.core)).some((w) => Math.max(w.a.y, w.b.y) < top)).toBe(true)
  })

  it('applying the plan places every piece and spends what it says', () => {
    const s = funded(buildState(1), 1, c.openingCredits)
    const plan = planStrategy(s, 1, STRATEGIES[0], c)
    const after = apply(s, plan.inputs)
    expect(after.objects.filter((o) => o.owner === 1)).toHaveLength(plan.total)
    expect(s.credits[1] - after.credits[1]).toBe(plan.cost)
  })

  it('clears this turn\'s own pieces first, refunded, so switching layouts costs nothing extra', () => {
    const s = funded(buildState(1), 1, c.openingCredits)
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
    const plan = planStrategy(s, 1, byId('turrets'), c)
    expect(plan.placed).toBe(plan.total)
    // Its walls only: 9 units against the 30 default Wall points.
    expect(plan.cost).toBe(9)
  })
})
