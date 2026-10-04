import type { CSSProperties } from 'react'
import { visual } from '../../config/visual'
import { reducedMotion } from '../../game/feedback'
import type { PlayerId } from '../../game/Game'
import type { ResourceBar as ResourceBarView } from '../../game/view/resourceBar'
import { barFill, slanted } from './barStyle'

const IDS: PlayerId[] = [1, 2]

/** Only a stated preference stills the bar: with no `matchMedia` (odd embeds) it still eases. */
const still = () => typeof matchMedia === 'function' && reducedMotion()

/** The Resource bar: a full-width tug-of-war of the banked Credits, directly under the Defence bar (the same far edge, one bar-height in). Each player's Credits sit at their end, in the Defence bar's digit column, and their share fills from their side; the fills ease to a change unless the viewer prefers reduced motion. Mount inside the rotating stage; flipped (seat 2 at the bottom) the far edge is the stage's bottom. Takes no pointer input. */
export function ResourceBar({ bar, flipped, className, style }: { bar: ResourceBarView; flipped: boolean; className?: string; style?: CSSProperties }) {
  const { heightPx, resourceRowPx, resourcePx, resourceMs, digitPx, digitWidthPx } = visual.hud.bar
  const transition = still() ? 'none' : `width ${resourceMs}ms ease-out`
  const digit = (id: PlayerId) => <div role="img" aria-label={`Player ${id} Credits: ${bar[id].credits}`} style={{ width: digitWidthPx, textAlign: 'center', fontFamily: visual.hud.display, fontSize: digitPx, lineHeight: 1, color: visual.player.colors[id] }}>{bar[id].credits}</div>
  return (
    <div className={className} style={{ position: 'absolute', left: 0, right: 0, [flipped ? 'bottom' : 'top']: heightPx, height: resourceRowPx, boxSizing: 'border-box', padding: `0 ${visual.hud.gap}px`, display: 'flex', alignItems: 'center', gap: visual.hud.gap, pointerEvents: 'none', ...style }}>
      {digit(1)}
      <div style={{ flex: 1, minWidth: 0, height: resourcePx, display: 'flex', clipPath: slanted(), background: visual.hud.bar.empty }}>
        {IDS.map((id) => <div key={id} data-fill={id} style={{ width: `${bar[id].share * 100}%`, height: '100%', transition, ...barFill(id) }} />)}
      </div>
      {digit(2)}
    </div>
  )
}
