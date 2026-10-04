import { visual } from '../config/visual'
import type { PlayerId, Point } from '../sim/pitch'
import type { SimEvent } from '../sim/step'
import type { GestureView } from './input/gesture'

/** Vibration pattern for an event, if it has one. */
export function vibration(ev: SimEvent): number | number[] | undefined {
  if (ev.type === 'shot-fired') return Math.round(visual.aim.vibration.shotBase + visual.aim.vibration.shotPerPower * ev.power)
  if (ev.type === 'goal') return [...visual.aim.vibration.goal]
  if (ev.type === 'refunded') return visual.hud.refund.vibration
}

type Hold = Pick<GestureView, 'phase' | 'tier'>

/** Whether holding still on the ball reached a higher tier between one frame's aim view and the next. */
export const tierClimbed = (prev: Hold | undefined, next: Hold | undefined): boolean => prev?.phase === 'holding' && next?.phase === 'holding' && next.tier > prev.tier

/** The short buzz when holding still on the ball reaches a higher tier (Power). */
export function tierBuzz(prev: Hold | undefined, next: Hold | undefined): number | undefined {
  return tierClimbed(prev, next) ? visual.aim.vibration.tier : undefined
}

/** What an event batch should trigger. Pure; `Game` turns it into entity calls. */
export function feedbackFor(events: SimEvent[], walls: { id: number; owner: PlayerId }[]) {
  const out = {
    flashes: [] as { wall: number; dim: boolean; segment?: number; at?: Point }[],
    bursts: [] as { at: Point; color: string; count: number }[],
    /** Wall segments that broke: one full effect each, shake aside. */
    breaks: [] as { id: number; segment: number; at: Point; breaker: boolean }[],
    /** At most one: the largest of the tick's shake amplitudes, so several breaks (a Splash) shake once, never stacked. Only breaks and strong shots shake; a crack never does. */
    shakes: [] as number[],
    /** The owner's colour for the tracer's bounce burst on every wall a damaging hit landed on. */
    hitColors: new Map<number, string>(),
    vibrations: [] as (number | number[])[],
  }
  // A destroyed structure has left `walls` already, so its event carries the owner.
  const owner = (id: number): PlayerId => walls.find((w) => w.id === id)?.owner ?? events.flatMap((e) => (e.type === 'wall-destroyed' && e.wall.id === id ? [e.wall.owner] : []))[0] ?? 1
  const damaged = new Set(events.flatMap((e) => (e.type === 'wall-cracked' || e.type === 'segment-broken' ? [e.id] : e.type === 'wall-destroyed' ? [e.wall.id] : [])))
  const amps: number[] = []
  for (const ev of events) {
    if (ev.type === 'ball-hit-wall') {
      if (damaged.has(ev.wall)) out.hitColors.set(ev.wall, visual.player.colors[owner(ev.wall)])
      else out.flashes.push({ wall: ev.wall, dim: true, at: ev.at })
    }
    if (ev.type === 'wall-cracked') {
      out.flashes.push({ wall: ev.id, dim: false, segment: ev.segment, at: ev.at })
      // The tracer's bounce is the one spark burst of a ball hit; a crack from a Splash has none, so it sprays its own.
      if (!events.some((e) => e.type === 'ball-hit-wall' && e.wall === ev.id)) out.bursts.push({ at: ev.at, color: visual.player.colors[owner(ev.id)], count: visual.wall.particles.crack })
    }
    if (ev.type === 'repaired') out.flashes.push({ wall: ev.id, dim: false })
    if ((ev.type === 'segment-broken' || ev.type === 'wall-destroyed') && ev.segment !== undefined) {
      const breaker = !!ev.breaker
      out.breaks.push({ id: ev.type === 'segment-broken' ? ev.id : ev.wall.id, segment: ev.segment, at: ev.at, breaker })
      amps.push(breaker ? visual.wall.break.breakerShake : visual.wall.break.shake)
    }
    if (ev.type === 'wall-destroyed' && ev.segment === undefined) out.bursts.push({ at: ev.at, color: visual.player.colors[ev.wall.owner], count: ev.breaker ? visual.wall.particles.breaker : visual.wall.particles.destroy })
    if (ev.type === 'shot-fired' && ev.power >= visual.camera.shake.minPower) amps.push(visual.camera.shake.max * ev.power)
    const v = vibration(ev)
    if (v !== undefined) out.vibrations.push(v)
  }
  if (amps.length) out.shakes.push(Math.max(...amps))
  return out
}
