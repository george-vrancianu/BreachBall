import type { CSSProperties, ReactNode } from 'react'
import { visual } from '../../config/visual'
import type { OverlayView } from '../../game/view/transition'

/** The one interstitial layer: turn card, GOAL banner, BUILD/PLAY/REPAIRED sweep and the REVEAL and "Opponent is choosing" labels (pinned to the top, no band, so the pitch stays visible). Mount inside the rotating stage; no view renders nothing. */
export function Overlay({ view: v, onTap, className, style, children }: { view?: OverlayView; onTap(): void; className?: string; style?: CSSProperties; children?: ReactNode }) {
  if (!v) return null
  const top = v.placement === 'top'
  return (
    <div
      className={className}
      onPointerDown={onTap}
      style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center',
        font: `700 9vmin ${visual.hud.font}`, textTransform: 'uppercase',
        justifyContent: top ? 'flex-start' : 'center',
        opacity: v.opacity,
        pointerEvents: v.kind === 'sweep' || v.kind === 'notice' ? 'none' : 'auto',
        color: v.color,
        background: top || v.band ? 'transparent' : visual.hud.scrim,
        transform: v.kind === 'sweep' ? `translateX(${(0.5 - v.progress) * 200}%)` : undefined,
        ...style,
      }}
    >
      {/* The top margin clears the Defence bar at the far edge. */}
      <div style={top ? { padding: '1vmin 3vmin', marginTop: visual.hud.bar.heightPx + visual.hud.gap * 2, background: visual.hud.scrimLight, borderRadius: '1vmin', fontSize: '6vmin' } : v.band ? { width: '100%', padding: '2vmin 0', background: visual.hud.scrim, ...(v.kind === 'goal' ? { borderBlock: `1vmin solid ${v.color}` } : {}) } : undefined}>{v.text}</div>
      <div style={{ font: `500 3.5vmin ${visual.hud.font}`, textTransform: 'none', color: visual.hud.ink }}>{v.hint}</div>
      {children}
    </div>
  )
}
