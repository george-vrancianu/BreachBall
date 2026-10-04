import type { CSSProperties } from 'react'
import { visual } from '../../config/visual'
import type { Band, MinimapView } from '../../game/view/minimap'

/**
 * The minimap chip at the near band's bottom-right (`flipped`, the stage is turned, so its top-left): a thumbnail of the whole pitch with the main camera's frame
 * on it, and the opening of the map view. While the map is open it is a filled ✕ in the player's `color` that closes it. Its tap area is wider than the chip.
 */
export function Minimap({ minimap, open, color, flipped, onToggle, style }: { minimap: MinimapView; open: boolean; color: string; flipped: boolean; onToggle(): void; style?: CSSProperties }) {
  const { chipW, chipH, thumbW, thumbH, borderPx, radiusPx, insetPx, hitPx, fontPx, linePx, frame, fog } = visual.hud.minimap
  const { tokens, pitch } = visual
  const band = (b: Band, fill: string): CSSProperties => ({ position: 'absolute', left: 0, right: 0, top: b.top * thumbH, height: b.height * thumbH, background: fill })
  return (
    <button
      aria-label={open ? 'Close map' : 'Map'}
      aria-expanded={open}
      onClick={onToggle}
      style={{ position: 'absolute', [flipped ? 'top' : 'bottom']: insetPx, [flipped ? 'left' : 'right']: insetPx - (hitPx - chipW) / 2, width: hitPx, height: chipH, padding: 0, border: 0, background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto', ...style }}
    >
      <span style={{ boxSizing: 'border-box', width: chipW, height: chipH, borderRadius: radiusPx, border: `${borderPx}px solid ${open ? color : tokens.ghostBorder}`, background: open ? color : 'none', color: visual.hud.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: fontPx, lineHeight: 1 }}>
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
