import { describe, expect, it } from 'vitest'
import { lockstep, type Frame } from './lockstep'
import { canPlaceBall } from '../sim/possession'
import { defaultConfig, initialState, step, type SimConfig, type SimInput, type SimState } from '../sim/step'
import type { PlayerId } from '../sim/pitch'
import { healthOf, roundsMatch, hseg } from '../sim/testkit'

const config: SimConfig = { ...defaultConfig, buildTime: 1 }
const DELAY = 4

/** A deterministic player: acts every 20th tick, from its own view of the state. */
function bot(s: SimState, me: PlayerId): SimInput {
  if (s.tick % 20) return {}
  if (s.match.builder === me) return { done: me }
  const { possession: p } = s
  if (p.shooter !== me || s.match.builder || p.live) return {}
  if (p.inHand) {
    const at = { x: 20, y: me === 1 ? 80 : 28 }
    return canPlaceBall(me, at, s.objects, config) ? { placeBall: { player: me, at } } : {}
  }
  return { shot: { player: me, dir: { x: 0, y: me === 1 ? -1 : 1 }, tier: 1, power: 0.8 } }
}

/** Two peers over a link where each frame arrives `lag` rounds late; a peer missing a frame stalls. */
function match(seed: number, lag: number, ticks: number, play: (s: SimState, me: PlayerId) => SimInput = bot, cfg: SimConfig = config, start: (seed: number) => SimState = (seed) => initialState(seed, cfg)) {
  let frames = 0
  const shots: unknown[] = []
  const inbox: { f: Frame; at: number }[][] = [[], []]
  let now = 0
  const decided = [-1, -1]
  const peers = [1, 2].map((me, i) => lockstep((f) => (frames++, inbox[1 - i].push({ f, at: now + lag })), me as PlayerId, DELAY))
  const states = [start(seed), start(seed)]
  while (states.some((s) => s.tick < ticks) && now < ticks * 20) {
    now++
    peers.forEach((net, i) => {
      for (const m of inbox[i].filter((m) => m.at <= now)) net.receive(m.f)
      inbox[i] = inbox[i].filter((m) => m.at > now)
      if (states[i].tick >= ticks) return
      // A peer stalled on a late frame must not decide again for the same tick: a repeated shot would be queued twice and land when the ball is free again.
      if (decided[i] !== states[i].tick) net.submit(play(states[i], (i + 1) as PlayerId))
      decided[i] = states[i].tick
      const input = net.advance(states[i].possession.shooter)
      if (input) {
        const r = step(states[i], input, cfg)
        net.stepped(r.events)
        states[i] = r.state
        if (i === 0) shots.push(...r.events.filter((e) => e.type === 'shot-fired'))
      }
    })
  }
  return Object.assign(states, { frames, shots })
}

describe('lockstep', () => {
  it('stalls until the remote frame for the tick has arrived', () => {
    const a = lockstep(() => {}, 1, DELAY)
    for (let i = 0; i < DELAY; i++) expect(a.advance(1)).toEqual({})
    expect(a.advance(1)).toBeUndefined()
    a.receive({ t: DELAY })
    expect(a.advance(1)).toEqual({})
  })

  it('applies an input on the same tick on both sides, merged by player id', () => {
    const out: Frame[][] = [[], []]
    const a = lockstep((f) => out[0].push(f), 1, DELAY)
    const b = lockstep((f) => out[1].push(f), 2, DELAY)
    const placeBall = { player: 2 as const, at: { x: 1, y: 2 } }
    a.submit({ done: 1 })
    b.submit({ placeBall })
    const seen: (SimInput | undefined)[][] = [[], []]
    for (let t = 0; t <= DELAY; t++) {
      for (const f of out[0].splice(0)) b.receive(f)
      for (const f of out[1].splice(0)) a.receive(f)
      seen[0].push(a.advance(1))
      seen[1].push(b.advance(1))
    }
    expect(seen[0]).toEqual(seen[1])
    expect(seen[0][DELAY]).toEqual({ done: 1, placeBall })
  })

  it('same seed and inputs give identical states on both peers, at any latency', () => {
    for (const lag of [0, 3, 11]) {
      const [a, b] = match(5, lag, 900)
      expect(a).toEqual(b)
      expect(a.tick).toBeGreaterThanOrEqual(900)
      expect(a.match.builder).toBeNull()
      expect(roundsMatch(a).roundShots).toBeGreaterThan(0)
    }
  })

  it('sends a frame per input or promise, not one per tick', () => {
    const idle = match(5, 0, 600, () => ({}))
    expect(idle.frames).toBeLessThan(600 / 2)
  })

  describe('a held aim', () => {
    const aiming = { dir: { x: 0, y: -1 }, tier: 1, power: 0.6 }
    /** Player 1's peer beside a silent player 2: tick `t` submits `inputs[t]` (if any). Returns what advance gives shooter 1, with consecutive repeats collapsed. */
    const held = (inputs: Record<number, SimInput>) => {
      const a = lockstep(() => {}, 1, DELAY)
      const runs: (SimInput | undefined)[] = []
      for (let t = 0; t < 40; t++) {
        if (inputs[t]) a.submit(inputs[t])
        a.receive({ t: t + DELAY })
        const i = a.advance(1)
        if (JSON.stringify(i) !== JSON.stringify(runs.at(-1))) runs.push(i)
      }
      return runs
    }
    it('rides along every tick from when it lands until it is replaced', () => {
      const other = { ...aiming, power: 0.3 }
      expect(held({ 0: { aiming }, 3: { aiming: other } })).toEqual([{}, { aiming }, { aiming: other }])
    })
    it('is dropped once cleared', () => {
      expect(held({ 0: { aiming }, 2: { aiming: null } })).toEqual([{}, { aiming }, {}])
    })
    it('is dropped once its owner fires', () => {
      const shot = { player: 1 as const, ...aiming }
      expect(held({ 0: { aiming }, 2: { shot } })).toEqual([{}, { aiming }, { shot }, {}])
    })
    it('only the shooter\'s rides along', () => {
      const a = lockstep(() => {}, 1, DELAY)
      a.submit({ aiming })
      for (let t = 0; t <= DELAY; t++) (a.receive({ t: t + DELAY }), a.advance(1))
      a.receive({ t: 2 * DELAY })
      expect(a.advance(2)).toEqual({})
    })
  })

  it('auto-fires a held aim on shot-clock expiry, on both peers', () => {
    // Once the build turns are over, the shooter holds an aim at power 0.6 and never releases.
    const hold = (s: SimState, me: PlayerId): SimInput => {
      if (s.match.builder === me) return { done: me }
      const { possession: p } = s
      if (p.shooter !== me || s.match.builder || p.live) return {}
      if (p.inHand) return s.tick % 20 === 0 ? { placeBall: { player: me, at: { x: 20, y: me === 1 ? 80 : 28 } } } : {}
      return s.tick % 20 === 0 ? { aiming: { dir: { x: 0, y: me === 1 ? -1 : 1 }, tier: 1, power: 0.6 } } : {}
    }
    const peers = match(5, 3, 1500, hold)
    expect(peers[0]).toEqual(peers[1])
    expect(peers.shots).toContainEqual(expect.objectContaining({ type: 'shot-fired', power: 0.6 }))
  })

  it('drops an aim the shot clock fired, on both peers: it does not fire again at the next expiry', () => {
    // Player 1 holds an aim once and never sends another input; player 2 only ends build turns.
    let aimed = false
    const once = (s: SimState, me: PlayerId): SimInput => {
      if (s.match.builder === me) return { done: me }
      const { possession: p } = s
      if (me !== 1 || p.shooter !== 1 || s.match.builder || p.live || aimed) return {}
      if (p.inHand) return s.tick % 20 === 0 ? { placeBall: { player: 1, at: { x: 20, y: 80 } } } : {}
      aimed = true
      return { aiming: { dir: { x: 1, y: 0 }, tier: 0, power: 0.3 } }
    }
    const peers = match(5, 3, 3000, once)
    expect(peers[0]).toEqual(peers[1])
    expect(peers.shots.filter((e) => (e as { power: number }).power === 0.3)).toHaveLength(1)
  })

  describe('Siege defence choice under the build timer', () => {
    const siege: SimConfig = { ...config, mode: 'siege' }
    const wall = (id: number, owner: PlayerId, gx: number) => ({ id, kind: 'wall' as const, owner, ...hseg(gx, owner === 1 ? 40 : 10), segments: [1] })
    /** Player 1's ball is about to cross into player 2's goal. */
    const scoring = (seed: number): SimState => {
      const s = initialState(seed, siege)
      return { ...s, match: { ...s.match, builder: null, opening: false } as SimState['match'], objects: [wall(1, 1, 2), wall(2, 2, 2)], nextId: 3, ball: { ...s.ball, pos: { x: 20, y: 0.5 }, vel: { x: 0, y: -60 } }, possession: { shooter: 1, shots: 1, inHand: false, live: true } }
    }
    it('an unanswered choice times out to Repair identically on both peers, at any latency', () => {
      for (const lag of [0, 3, 11]) {
        const [a, b] = match(5, lag, 400, () => ({}), siege, scoring)
        expect(a).toEqual(b)
        expect(a.match).toMatchObject({ choosing: null, builder: null })
        expect(a.objects.map((o) => healthOf(o))).toEqual([3, 1])
      }
    })
    // The window is 60 ticks; the choice is submitted when `left` drops under `at`, and arrives DELAY ticks later (plus the link lag).
    const choosesAt = (at: number) => (s: SimState, me: PlayerId): SimInput => (me === 1 && s.match.choosing === 1 && s.clock.left < at ? { defence: { player: 1, choice: 'rearrange' } } : {})
    it('a Rearrange choice made near the end of the window lands on the same tick for both peers and its window then expires', () => {
      for (const lag of [0, 3]) {
        const [a, b] = match(5, lag, 700, choosesAt(10), siege, scoring)
        expect(a).toEqual(b)
        expect(a.match).toMatchObject({ choosing: null, builder: null })
        // Not repaired: the Rearrange got in before the timeout.
        expect(a.objects.map((o) => healthOf(o))).toEqual([1, 1])
      }
    })
    it('a Rearrange choice that arrives after the window ran out is refused identically on both peers: the timeout Repair stands', () => {
      for (const lag of [0, 3]) {
        const [a, b] = match(5, lag, 700, choosesAt(2), siege, scoring)
        expect(a).toEqual(b)
        expect(a.match).toMatchObject({ choosing: null, builder: null })
        expect(a.objects.map((o) => healthOf(o))).toEqual([3, 1])
      }
    })
  })

  it('latency does not change the outcome', () => {
    expect(match(5, 0, 600)[0]).toEqual(match(5, 9, 600)[0])
  })
})
