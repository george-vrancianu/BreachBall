import { visual } from '../../config/visual'
import type { Pallet } from '../../sim/pallet'

const V = visual.pallet

/** The alpha of a Pallet's Activation ring: faint at rest, bright only while it tracks the ball. */
export const ringAlpha = (phase: Pallet['phase']): number => (phase === 'track' ? V.ring.trackAlpha : V.ring.idleAlpha)

/** The arm's motion ghosts during a swing, oldest first: copies trailing the arm against its swing direction, `ghostGap` apart, as many as the swing has covered so far (up to `ghosts`), fading with age. None outside a swing. */
export function ghostsOf({ phase, angle, dir, swept }: Pick<Pallet, 'phase' | 'angle' | 'dir' | 'swept'>): { angle: number; alpha: number }[] {
  if (phase !== 'swing') return []
  const n = Math.min(V.ghosts, Math.floor(swept / V.ghostGap))
  return Array.from({ length: n }, (_, k) => {
    const back = n - k
    return { angle: angle - dir * back * V.ghostGap, alpha: V.ghostAlpha * (1 - (back - 1) / V.ghosts) }
  })
}

/** How much of a swat's flash is left: 1 at the hit, down to 0 after `flash.ms`. */
export const flashLeft = (age: number): number => Math.min(1, Math.max(0, 1 - age / V.flash.ms))

/** Whether the ball wears the Palleted look: while it has pierces left. */
export const palleted = (pierces: number): boolean => pierces > 0
