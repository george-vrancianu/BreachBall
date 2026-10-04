import { initialState, step, type Aiming, type SimConfig, type SimEvent, type SimInput, type SimState } from '../sim/step'

/** Where a driver delivers sim state: `Game`. A paused sink (a flip or a goal, reveal or REPAIRED hold) makes the driver stop stepping. */
export type Sink = { apply(state: SimState, events: SimEvent[]): void; simPaused(): boolean }

/** Whatever runs the match for `Game`: starts it, takes local inputs, and advances it, delivering each tick to its `Sink`. Hot-seat is `LocalDriver`; online play would be another. */
export type Driver = {
  /** A new match; the sink gets the first state from the caller. */
  start(config: SimConfig, seed?: number): SimState
  send(input: SimInput): void
  /** Advances by `dt` seconds. */
  update(dt: number): void
}

/** Builds the driver for a sink; `Game` passes itself. */
export type DriverFactory = (sink: Sink) => Driver

/** Hot-seat: runs the sim on this device at its tick rate. The only place `step` is called. */
export class LocalDriver implements Driver {
  private state!: SimState
  private config!: SimConfig
  private pending: SimInput = {}
  private aiming?: Aiming
  private acc = 0

  constructor(private sink: Sink) {}

  /** A new match; the sink gets the first state from the caller. */
  start(config: SimConfig, seed?: number): SimState {
    this.config = config
    this.pending = {}
    this.aiming = undefined
    this.acc = 0
    return (this.state = initialState(seed, config))
  }

  /** One-off inputs go to the next tick; `aiming` holds until it is sent again (null releases it) or a shot is fired. */
  send(input: SimInput): void {
    const { aiming, ...rest } = input
    if (aiming !== undefined) this.aiming = aiming ?? undefined
    this.pending = { ...this.pending, ...rest }
  }

  /** Advances by `dt` seconds, stepping whole ticks and handing each to the sink. */
  update(dt: number): void {
    const tick = 1 / this.config.tickHz
    this.acc += dt
    for (; this.acc >= tick; this.acc -= tick) {
      if (this.sink.simPaused()) {
        this.pending = {}
        continue
      }
      const out = step(this.state, this.aiming ? { aiming: this.aiming, ...this.pending } : this.pending, this.config)
      this.state = out.state
      this.pending = {}
      // A fired aim is spent, whether the controller or the shot clock fired it.
      if (out.events.some((e) => e.type === 'shot-fired')) this.aiming = undefined
      this.sink.apply(out.state, out.events)
    }
  }
}
