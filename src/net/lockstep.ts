import type { PlayerId } from '../sim/pitch'
import type { Aiming, SimEvent, SimInput } from '../sim/step'

/** A peer's input (if any) for sim tick `t`. Frames arrive in order, so `t` also says it has no other input before `t`. */
export type Frame = { t: number; i?: SimInput }

const isEmpty = (i: SimInput) => Object.keys(i).length === 0
/** How far ahead an idle peer promises "no input" in one frame. */
const PROMISE = 6

/**
 * Delay lockstep: an input submitted now runs at least `delay` ticks ahead on both sides, and a tick only runs once the
 * other peer has promised nothing else for it. No state is ever sent; the sim is deterministic, so inputs are enough.
 * A frame is sent per input, or once per `PROMISE` ticks to keep the other peer running.
 */
export function lockstep(send: (f: Frame) => void, me: PlayerId, delay = 6) {
  const inputs: Record<'mine' | 'theirs', Map<number, SimInput>> = { mine: new Map(), theirs: new Map() }
  // Ticks before `delay` are empty on both sides.
  let promised = delay - 1
  let heard = delay - 1
  let pending: SimInput = {}
  let n = 0
  // An aim stays in force until its owner replaces it, clears it (null) or a shot is fired (sent, or by the shot clock: see `stepped`); the sim reads it only on shot-clock expiry.
  const aims: Partial<Record<PlayerId, Aiming>> = {}
  const take = (who: 'mine' | 'theirs', player: PlayerId) => {
    const { aiming, ...rest } = inputs[who].get(n) ?? {}
    inputs[who].delete(n)
    if (aiming !== undefined) aims[player] = aiming ?? undefined
    if (rest.shot) aims[player] = undefined
    return rest
  }
  return {
    /** Queue this peer's input for the next frame it sends. Does not de-duplicate: submit once per user action, not once per frame while stalled. */
    submit(i: SimInput) {
      pending = { ...pending, ...i }
    },
    /** Report the events of the tick just stepped: a fired shot spends its player's aim, however it was fired. */
    stepped(events: readonly SimEvent[]) {
      for (const e of events) if (e.type === 'shot-fired') aims[e.player] = undefined
    },
    receive(f: Frame) {
      if (f.i) inputs.theirs.set(f.t, f.i)
      heard = Math.max(heard, f.t)
    },
    /** The merged input for the next tick (with the shooter's held aim), or undefined while the other peer is not caught up. */
    advance(shooter: PlayerId): SimInput | undefined {
      if (!isEmpty(pending)) {
        promised = Math.max(n + delay, promised + 1)
        inputs.mine.set(promised, pending)
        send({ t: promised, i: pending })
        pending = {}
      } else if (promised < n + delay) {
        promised = n + delay + PROMISE - 1
        send({ t: promised })
      }
      if (heard < n) return undefined
      const [mine, theirs] = [take('mine', me), take('theirs', me === 1 ? 2 : 1)]
      n++
      const aiming = aims[shooter]
      return { ...(me === 1 ? { ...mine, ...theirs } : { ...theirs, ...mine }), ...(aiming && { aiming }) }
    },
  }
}
