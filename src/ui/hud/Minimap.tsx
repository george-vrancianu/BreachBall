import type { CSSProperties } from 'react'
import { visual } from '../../config/visual'
import type { Band, MinimapView } from '../../game/view/minimap'
import type { Side } from '../../game/view/physicalEdges'
import { farEdge, safeInset } from './safeArea'

/** How far in from the far edge the minimap chip (top-left) and the ☰ button (top-right) sit: just inside the Defence bar, and the Resource bar when it is shown. */
export const underBars = (resourceBar: boolean): number => visual.hud.bar.heightPx + (resourceBar ? visual.hud.bar.resourceRowPx : 0) + visual.sideMenu.buttonInsetPx

/** Where a corner chip sits: `underBars` in from the far edge (the stage's bottom when `flipped`) and `buttonInsetPx` in from the side, both measured from the safe area, so the chip clears the notch or status bar the HUD layer's turn puts there. */
export const cornerPos = (flipped: boolean, resourceBar: boolean, side: Extract<Side, 'left' | 'right'>): CSSProperties => ({ ...farEdge(flipped, underBars(resourceBar)), [side]: `calc(${safeInset(side)} + ${visual.sideMenu.buttonInsetPx}px)` })

/** How much of the stage's left edge the minimap chip takes, inset included: what the queued Subterfuge icons keep clear of. */
export const chipClear = (): number => visual.sideMenu.buttonInsetPx + visual.hud.minimap.hitPx

/**
 * The minimap chip at the top-left, under the far-edge bars: a thumbnail of the whole pitch with the main camera's frame
 * on it, and the opening of the map view. While the map is open it is a filled ✕ in the player's `color` that closes it. Its tap area is wider than the chip.
 */
export function Minimap({ minimap, open, color, flipped, resourceBar = false, onToggle, style }: { minimap: MinimapView; open: boolean; color: string; flipped: boolean; /** The Resource bar is shown, so the chip sits below it too. */ resourceBar?: boolean; onToggle(): void; style?: CSSProperties }) {
  const { chipW, chipH, thumbW, thumbH, borderPx, radiusPx, hitPx, fontPx, linePx, frame, fog } = visual.hud.minimap
  const { tokens, pitch } = visual
  const band = (b: Band, fill: string): CSSProperties => ({ position: 'absolute', left: 0, right: 0, top: b.top * thumbH, height: b.height * thumbH, background: fill })
  return (
    <button
      aria-label={open ? 'Close map' : 'Map'}
      aria-expanded={open}
      onClick={onToggle}
      style={{ position: 'absolute', ...cornerPos(flipped, resourceBar, 'left'), width: hitPx, height: chipH, padding: 0, border: 0, background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto', zIndex: visual.sideMenu.buttonZ, ...style }}
    >
      <span style={{ boxSizing: 'border-box', width: chipW, height: chipH, borderRadius: radiusPx, border: `${borderPx}px solid ${open ? color : tokens.ghostBorder}`, background: open ? color : visual.hud.dock.fill, boxShadow: `0 4px 12px ${visual.hud.shadow}`, color: visual.hud.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: fontPx, lineHeight: 1 }}>
        {open ? (
          '✕'
        ) : (
          <span data-testid="thumbnail" style={{ position: 'relative', width: thumbW, height: thumbH, overflow: 'hidden', background: pitch.ground }}>
            <span style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: linePx, background: tokens.lines }} />
            {minimap.fog && <span data-testid="thumbnail-fog" style={band(minimap.fog, fog)} />}
            <span data-testid="thumbnail-frame" style={{ ...band(minimap.frame, frame), boxSizing: 'border-box', border: `${linePx}px solid ${visual.hud.ink}` }} />
          </span>
        )}
      </span>
    </button>
  )
}
