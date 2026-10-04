import type { CSSProperties } from 'react'
import { visual } from '../../config/visual'
import type { DefenceBar as DefenceBarView, DefenceSide } from '../../game/view/defenceBar'
import type { PlayerId } from '../../game/Game'
import { barFill, slanted } from './barStyle'

const IDS: PlayerId[] = [1, 2]

/** One player's half: the end digit, then the segments running from the middle out to it. Player 1 sits left and its segments fill from the right, so the two halves mirror. */
function Side({ id, side }: { id: PlayerId; side: DefenceSide }) {
  const { segmentPx, segmentMaxPx, slantPx, gapPx, digitPx, digitWidthPx } = visual.hud.bar
  const digit = <div style={{ width: digitWidthPx, textAlign: 'center', fontFamily: visual.hud.display, fontSize: digitPx, lineHeight: 1, color: visual.player.colors[id] }}>{side.count}</div>
  const segments = (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: id === 1 ? 'row-reverse' : 'row', gap: gapPx }}>
      {side.segments.map((filled, i) => <div key={i} data-filled={filled} style={{ flex: 1, minWidth: slantPx * 2, maxWidth: segmentMaxPx, height: segmentPx, clipPath: slanted(), ...barFill(id, filled) }} />)}
    </div>
  )
  return <div role="img" aria-label={`Player ${id} structures: ${side.count}`} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: gapPx * 2 }}>{id === 1 ? <>{digit}{segments}</> : <>{segments}{digit}</>}</div>
}

/** The Defence bar: a strip at the far edge, two bars meeting in the middle with the structure counts at the outer ends. Mount inside the rotating stage; flipped (seat 2 at the bottom) the far edge is the stage's bottom, and the stage's turn swaps the sides. Takes no pointer input. */
export function DefenceBar({ bar, flipped, className, style }: { bar: DefenceBarView; flipped: boolean; className?: string; style?: CSSProperties }) {
  return (
    <div className={className} style={{ position: 'absolute', left: 0, right: 0, [flipped ? 'bottom' : 'top']: 0, height: visual.hud.bar.heightPx, boxSizing: 'border-box', padding: `0 ${visual.hud.gap}px`, display: 'flex', alignItems: 'center', gap: visual.hud.gap, pointerEvents: 'none', ...style }}>
      {IDS.map((id) => <Side key={id} id={id} side={bar[id]} />)}
    </div>
  )
}
