import { visual } from '../config/visual'
import { cellToWorld } from '../sim/pitch'
import type { SimEvent } from '../sim/step'
import type { Structure } from '../sim/wall'
import type { Aim } from './entities/Aim'
import type { Ball } from './entities/Ball'
import type { Pitch } from './entities/Pitch'
import type { Camera } from './entities/Camera'
import type { Structures } from './entities/Structures'
import { feedbackFor } from './feedback'

/** The entities an event batch can reach. Events stop here: entities only see these method calls. */
export type Targets = { camera: Camera; structures: Structures; ball: Ball; aim: Aim; pitch: Pitch; vibrate: (pattern: number | number[]) => void }

/** Maps a tick's sim events to entity methods: `hit`, `shatter`, `pulse`, `steal`, `shake`, `splash`, `burst`, `credit` (the ball entered the Bullseye), `arrive` and `pop` (a shot came to rest Charged), `launch`. `objects` is the state after the tick. */
export function routeEvents(events: SimEvent[], t: Targets, objects: Structure[]): void {
  const fb = feedbackFor(events, objects)
  for (const f of fb.flashes) t.structures.hit(f.wall, f.dim)
  for (const b of fb.bursts) t.structures.burst(b.at, b.color, b.count)
  for (const amp of fb.shakes) t.camera.shake(amp)
  for (const v of fb.vibrations) t.vibrate(v)
  for (const ev of events) {
    if (ev.type === 'wall-destroyed') t.structures.shatter(ev.wall.id, ev.at)
    else if (ev.type === 'repulsor-fired') (t.structures.pulse(ev.tower), t.ball.pulse())
    else if (ev.type === 'steal-triggered') {
      const { gx, gy } = ev.tower.at
      t.ball.steal(ev.at, cellToWorld({ cx: gx, cy: gy }))
      t.structures.shatter(ev.tower.id, ev.at, visual.ball.stealMs)
    } else if (ev.type === 'shot-fired') {
      t.aim.splash(ev.from, ev.tier, ev.power)
      if (ev.charge) t.ball.launch()
    } else if (ev.type === 'bullseye-credited') t.pitch.credit(ev.player, ev.credits)
    else if (ev.type === 'charged') (t.pitch.arrive(ev.zone), t.ball.pop())
  }
}
