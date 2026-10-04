import type { CSSProperties, ReactNode } from 'react'
import { visual } from '../../config/visual'
import type { OverlayView } from '../../game/view/transition'

/** The one interstitial layer: GOAL banner, BUILD/PLAY/REPAIRED sweep and the REVEAL and "Opponent is choosing" labels (pinned to the top, no band, so the pitch stays visible). The top labels clear the Defence bar and, when `resourceBar` is set, the Resource bar under it. Mount inside the rotating stage; no view renders nothing. */
export function Overlay({ view: v, flipped = false, resourceBar = false, className, style, children }: { view?: OverlayView; /** Seat 2 is at the bottom, so the Defence bar (and the top labels' clearance) is on the stage's bottom edge. */ flipped?: boolean; /** The Resource bar sits under the Defence bar, so the top labels clear it too. */ resourceBar?: boolean; className?: string; style?: CSSProperties; children?: ReactNode }) {
  if (!v) return null
  const top = v.placement === 'top'
  return (
    <div
      className={className}
      style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center',
        font: `700 9vmin ${visual.hud.font}`, textTransform: 'uppercase',
        justifyContent: top ? (flipped ? 'flex-end' : 'flex-start') : 'center',
        pointerEvents: v.kind === 'sweep' || v.kind === 'notice' ? 'none' : 'auto',
        color: v.color,
        background: top || v.band ? 'transparent' : visual.hud.scrim,
        transform: v.kind === 'sweep' ? `translateX(${(0.5 - v.progress) * 200}%)` : undefined,
        ...style,
      }}
    >
      {/* The margin clears the Defence bar (and the Resource bar under it, when shown) at the far edge, which is the stage's bottom when flipped. */}
      <div style={top ? { padding: '1vmin 3vmin', [flipped ? 'marginBottom' : 'marginTop']: visual.hud.bar.heightPx + (resourceBar ? visual.hud.bar.resourceRowPx : 0) + visual.hud.gap * 2, background: visual.hud.scrimLight, borderRadius: '1vmin', fontSize: '6vmin' } : v.band ? { width: '100%', padding: '2vmin 0', background: visual.hud.scrim, ...(v.kind === 'goal' ? { borderBlock: `1vmin solid ${v.color}` } : {}) } : undefined}>{v.text}</div>
      {children}
    </div>
  )
}
