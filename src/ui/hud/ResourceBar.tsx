import type { CSSProperties } from 'react'
import { visual } from '../../config/visual'
import type { PlayerId } from '../../game/Game'
import type { ResourceBar as ResourceBarView } from '../../game/view/resourceBar'
import { barDigit, barFill, barStrip, slanted } from './barStyle'

const IDS: PlayerId[] = [1, 2]

/** The Resource bar: a full-width tug-of-war of the banked Credits, directly under the Defence bar (the same far edge, one bar-height in). Each player's Credits sit at their end, in the Defence bar's digit column, and their share fills from their side; the fills ease to a change. Mount inside the rotating stage; flipped (seat 2 at the bottom) the far edge is the stage's bottom. Takes no pointer input. */
export function ResourceBar({ bar, flipped, className, style }: { bar: ResourceBarView; flipped: boolean; className?: string; style?: CSSProperties }) {
  const { heightPx, resourceRowPx, resourcePx, resourceMs, gapPx } = visual.hud.bar
  const transition = `width ${resourceMs}ms ease-out`
  const digit = (id: PlayerId) => <div role="img" aria-label={`Player ${id} Credits: ${bar[id].credits}`} style={barDigit(id)}>{bar[id].credits}</div>
  return (
    <div className={className} style={{ ...barStrip(flipped, heightPx, resourceRowPx), gap: gapPx * 2, ...style }}>
      {digit(1)}
      <div style={{ flex: 1, minWidth: 0, height: resourcePx, display: 'flex', clipPath: slanted(), background: visual.hud.bar.empty }}>
        {IDS.map((id) => <div key={id} data-fill={id} style={{ width: `${bar[id].share * 100}%`, height: '100%', transition, ...barFill(id) }} />)}
      </div>
      {digit(2)}
    </div>
  )
}
