import { visual } from '../config/visual'
import { cellToWorld } from '../sim/pitch'
import type { SimEvent } from '../sim/step'
import type { Structure } from '../sim/wall'
import type { Aim } from './entities/Aim'
import type { Ball } from './entities/Ball'
import type { Pallets } from './entities/Pallets'
import type { Pitch } from './entities/Pitch'
import type { Camera } from './entities/Camera'
import type { Structures } from './entities/Structures'
import { feedbackFor } from './feedback'

/** The entities an event batch can reach. Events stop here: entities only see these method calls. */
export type Targets = { camera: Camera; structures: Structures; ball: Ball; aim: Aim; pitch: Pitch; pallets: Pallets; vibrate: (pattern: number | number[]) => void }

/** Maps a tick's sim events to entity methods: `hit`, `shatter`, `shatterSegment`, `pulse`, `steal`, `shake`, `splash`, `burst`, `fire`, `bounce`, `handOver`, `credit` (the ball entered the Bullseye), `arrive` and `pop` (a shot came to rest Charged), `launch`, `pallets.hit` (a Pallet's swat, with sparks from the shared particle pool). `objects` is the state after the tick. */
export function routeEvents(events: SimEvent[], t: Targets, objects: Structure[]): void {
  const fb = feedbackFor(events, objects)
  for (const f of fb.flashes) t.structures.hit(f.wall, f.dim, f.segment, f.at)
  for (const b of fb.bursts) t.structures.burst(b.at, b.color, b.count)
  for (const b of fb.breaks) t.structures.shatterSegment(b.id, b.segment, b.breaker)
  for (const amp of fb.shakes) t.camera.shake(amp)
  for (const v of fb.vibrations) t.vibrate(v)
  for (const ev of events) {
    if (ev.type === 'wall-destroyed') {
      // A wall's last segment broke above; a tower goes whole.
      if (ev.segment === undefined) t.structures.shatter(ev.wall.id, ev.at)
    } else if (ev.type === 'repulsor-fired') (t.structures.pulse(ev.tower), t.ball.pulse())
    else if (ev.type === 'steal-triggered') {
      const { gx, gy } = ev.tower.at
      t.ball.steal(ev.at, cellToWorld({ cx: gx, cy: gy }))
      t.structures.shatter(ev.tower.id, ev.at, visual.ball.stealMs)
    } else if (ev.type === 'shot-fired') {
      t.aim.splash(ev.from, ev.tier, ev.power)
      t.ball.fire(ev.tier, ev.from)
      if (ev.charge) t.ball.launch()
    } else if (ev.type === 'ball-hit-wall' || ev.type === 'ball-hit-board') t.ball.bounce(ev.at, ev.type === 'ball-hit-wall', ev.type === 'ball-hit-wall' ? fb.hitColors.get(ev.wall) : undefined)
    else if (ev.type === 'possession-changed') t.ball.handOver()
    else if (ev.type === 'bullseye-credited') t.pitch.credit(ev.player, ev.credits)
    else if (ev.type === 'pallet-hit') (t.pallets.hit(ev.pallet, ev.at), t.structures.burst(ev.at, visual.pallet.color, visual.pallet.sparks.count, visual.pallet.sparks.speed, visual.pallet.sparks.lifeMs))
    else if (ev.type === 'charged') (t.pitch.arrive(ev.zone), t.ball.pop())
  }
}
