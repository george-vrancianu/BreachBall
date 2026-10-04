import { rules } from '../config/rules'
import { visual } from '../config/visual'
import type { PlayerId, Point } from '../sim/pitch'
import type { SimEvent } from '../sim/step'
import type { GestureView } from './input/gesture'

/** Whether the viewer wants no animation. With no `matchMedia` (tests, odd embeds) there is no stated preference to honour, so it counts as still. */
export const reducedMotion = () => typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches

/** Which zone a Charged ball's `factor` came from. */
export const zoneOf = (factor: number): 'ring' | 'bullseye' => (factor === rules.boost.bullseye.factor ? 'bullseye' : 'ring')

/** The "x1.5" / "x2" text for a Charged `factor`. */
export const boostLabel = (factor: number): string => `×${factor}`

/** The colour of the zone a Charged `factor` came from. */
export const boostColor = (factor: number): string => visual.pitch.boost.colors[zoneOf(factor)]

/** Vibration pattern for an event, if it has one. */
export function vibration(ev: SimEvent): number | number[] | undefined {
  if (ev.type === 'shot-fired') return Math.round(visual.aim.vibration.shotBase + visual.aim.vibration.shotPerPower * ev.power)
  if (ev.type === 'goal') return [...visual.aim.vibration.goal]
  if (ev.type === 'refunded') return visual.hud.refund.vibration
}

type Hold = Pick<GestureView, 'phase' | 'tier'>

/** Whether holding still on the ball reached a higher tier between one frame's aim view and the next. */
export const tierClimbed = (prev: Hold | undefined, next: Hold | undefined): boolean => prev?.phase === 'holding' && next?.phase === 'holding' && next.tier > prev.tier

/** The short buzz when holding still on the ball reaches a higher tier (Power). Dropped under reduced motion. */
export function tierBuzz(prev: Hold | undefined, next: Hold | undefined, reduced: boolean): number | undefined {
  return tierClimbed(prev, next) && !reduced ? visual.aim.vibration.tier : undefined
}

/** What an event batch should trigger. Pure; `Game` turns it into entity calls. Flashes survive reduced motion. */
export function feedbackFor(events: SimEvent[], walls: { id: number; owner: PlayerId }[], reduced: boolean) {
  const out = { flashes: [] as { wall: number; dim: boolean }[], bursts: [] as { at: Point; color: string; count: number }[], shakes: [] as number[], vibrations: [] as (number | number[])[] }
  const cracked = new Set(events.flatMap((e) => (e.type === 'wall-cracked' ? [e.id] : [])))
  const color = (id: number) => visual.player.colors[walls.find((w) => w.id === id)?.owner ?? 1]
  for (const ev of events) {
    if (ev.type === 'ball-hit-wall' && !cracked.has(ev.wall)) out.flashes.push({ wall: ev.wall, dim: true })
    if (ev.type === 'wall-cracked') {
      out.flashes.push({ wall: ev.id, dim: false })
      out.bursts.push({ at: ev.at, color: color(ev.id), count: visual.wall.particles.crack })
    }
    if (ev.type === 'repaired') out.flashes.push({ wall: ev.id, dim: false })
    if (ev.type === 'wall-destroyed') out.bursts.push({ at: ev.at, color: visual.player.colors[ev.wall.owner], count: ev.breaker ? visual.wall.particles.breaker : visual.wall.particles.destroy })
    if (ev.type === 'shot-fired' && ev.power >= visual.camera.shake.minPower) out.shakes.push(visual.camera.shake.max * ev.power)
    const v = vibration(ev)
    if (v !== undefined) out.vibrations.push(v)
  }
  return reduced ? { ...out, bursts: [], shakes: [], vibrations: [] } : out
}
