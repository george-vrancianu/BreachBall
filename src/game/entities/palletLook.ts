import { visual } from '../../config/visual'
import type { Pallet } from '../../sim/pallet'

/** The alpha of a Pallet's Activation ring: faint at rest, bright from tracking the ball through the swing, as in the prototype. */
export const ringAlpha = (phase: Pallet['phase']): number => (phase === 'idle' ? visual.pallet.ring.idleAlpha : visual.pallet.ring.activeAlpha)

/** The arm's motion ghosts during a swing, oldest (faintest) first: `draw` is called for each copy trailing the arm against its swing direction, `ghostGap` apart, as many as the swing has covered so far (up to `ghosts`). None outside a swing. */
export function ghostsOf({ phase, angle, dir, swept }: Pick<Pallet, 'phase' | 'angle' | 'dir' | 'swept'>, draw: (angle: number, alpha: number) => void): void {
  if (phase !== 'swing') return
  const n = Math.min(visual.pallet.ghosts, Math.floor(swept / visual.pallet.ghostGap))
  for (let back = n; back >= 1; back--) draw(angle - dir * back * visual.pallet.ghostGap, visual.pallet.ghostAlpha * (1 - (back - 1) / visual.pallet.ghosts))
}

/** How much of a swat's flash is left: 1 at the hit, down to 0 after `flash.ms`. */
export const flashLeft = (age: number): number => Math.min(1, Math.max(0, 1 - age / visual.pallet.flash.ms))
