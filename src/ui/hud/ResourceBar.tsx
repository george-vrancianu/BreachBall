import { useEffect, useRef, type CSSProperties } from 'react'
import { visual } from '../../config/visual'
import type { PlayerId } from '../../game/Game'
import type { ResourceBar as ResourceBarView } from '../../game/view/resourceBar'
import { barDigit, barFill, barStrip, slanted } from './barStyle'

const IDS: PlayerId[] = [1, 2]

/** One end's banked Credits, flashing (growing and glowing white) when `bullseyes` rises. */
function Digit({ id, side }: { id: PlayerId; side: ResourceBarView[PlayerId] }) {
  const ref = useRef<HTMLDivElement>(null)
  const last = useRef(side.bullseyes)
  useEffect(() => {
    const { ms, scale } = visual.hud.bar.flash
    if (side.bullseyes > last.current) ref.current?.animate?.([{ transform: `scale(${scale})`, textShadow: '0 0 8px #fff', color: '#fff' }, { transform: 'scale(1)', textShadow: 'none' }], ms)
    last.current = side.bullseyes
  }, [side.bullseyes])
  return <div ref={ref} role="img" aria-label={`Player ${id} Credits: ${side.credits}`} style={barDigit(id)}>{side.credits}</div>
}

/** The Resource bar: a full-width tug-of-war of the banked Credits, directly under the Defence bar (the same far edge, one bar-height in). Each player's Credits sit at their end, in the Defence bar's digit column, and their share fills from their side; the fills ease to a change, and a player's digit flashes on a Bullseye Credit. Mount inside the rotating stage; flipped (seat 2 at the bottom) the far edge is the stage's bottom. Takes no pointer input. */
export function ResourceBar({ bar, flipped, className, style }: { bar: ResourceBarView; flipped: boolean; className?: string; style?: CSSProperties }) {
  const { heightPx, resourceRowPx, resourcePx, resourceMs, gapPx } = visual.hud.bar
  const transition = `width ${resourceMs}ms ease-out`
  return (
    <div className={className} style={{ ...barStrip(flipped, heightPx, resourceRowPx), gap: gapPx * 2, ...style }}>
      <Digit id={1} side={bar[1]} />
      <div style={{ flex: 1, minWidth: 0, height: resourcePx, display: 'flex', clipPath: slanted(), background: visual.hud.bar.empty }}>
        {IDS.map((id) => <div key={id} data-fill={id} style={{ width: `${bar[id].share * 100}%`, height: '100%', transition, ...barFill(id) }} />)}
      </div>
      <Digit id={2} side={bar[2]} />
    </div>
  )
}
