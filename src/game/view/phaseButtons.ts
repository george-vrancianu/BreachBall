import type { PlayerId } from '../../sim/pitch'
import { canFinishBuild, type SimConfig, type SimInput, type SimState } from '../../sim/step'
import type { ButtonSpec } from './hudModel'

export type PhaseSeam = {
  /** Whether this device plays that seat (online: only your own). */
  mine(p: PlayerId): boolean
  /** The live state. Handlers read it at click time: the HUD keeps a button row while its labels are unchanged, so a handler must never carry the player it was created for. */
  current(): SimState
  send(input: SimInput): void
  /** True while a blocking hold (the handover flip, the GOAL banner, the REVEAL hold, the REPAIRED sweep) or the Side menu hides or covers the board: Done and the defence choice, Repair and Rearrange alike, are not offered. Read live, like `current`. Default false. */
  blocked?(): boolean
  /** The builder holds a piece not yet in the sim (being drawn, or red): Done waits until it is placed or cancelled. */
  unplaced?: boolean
}

/** The phase buttons in the HUD shell: Done in a build turn, Repair and Rearrange when the scorer owes a defence choice. */
export function phaseButtons(s: SimState, config: SimConfig, h: PhaseSeam): ButtonSpec[] | undefined {
  const { builder, choosing } = s.match
  if (builder && h.mine(builder)) {
    return [{
      label: 'Done',
      disabled: !canFinishBuild(s, config) || !!h.unplaced || !!h.blocked?.(),
      onClick: () => {
        const b = h.current().match.builder
        if (b && h.mine(b) && !h.blocked?.()) h.send({ done: b })
      },
    }]
  }
  if (choosing && h.mine(choosing) && !h.blocked?.()) {
    return (['repair', 'rearrange'] as const).map((choice) => ({
      label: choice === 'repair' ? 'Repair' : 'Rearrange',
      onClick: () => {
        const c = h.current().match.choosing
        if (c && h.mine(c)) h.send({ defence: { player: c, choice } })
      },
    }))
  }
  return undefined
}
