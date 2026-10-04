import type { CSSProperties } from 'react'
import { visual } from '../../config/visual'
import { FONT } from '../ButtonRow'
import { NO_CALLOUT } from './press'

const { ink, panel, dark } = visual.hud
const { tilePx, radiusPx, labelPx, labelSpacingEm, tile } = visual.hud.dock

/** How a dock tile reads: `active` fills it in the player's colour (the armed piece, build mode, an armed Breaker), `available` false greys it. */
export type TileLook = { color: string; active?: boolean; available?: boolean; width?: number }

/** A dock tile: a rounded square with its icon over a small label. Shared by the Build tools, Strategies, Powerup and Subterfuge. */
export function tileStyle({ color, active = false, available = true, width = tilePx }: TileLook): CSSProperties {
  const grey = visual.tokens.ghostBorder
  return {
    ...FONT,
    position: 'relative',
    flex: 'none',
    boxSizing: 'border-box',
    width,
    height: tilePx,
    padding: 0,
    borderRadius: radiusPx,
    border: `${tile.borderPx}px solid ${active ? color : available ? visual.tokens.ghostBorder : visual.tokens.dimOutline}`,
    background: active ? color : available ? panel : 'transparent',
    color: active ? dark : available ? ink : grey,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tile.gapPx,
    boxShadow: active ? `0 0 ${tile.glowPx}px ${color}66` : 'none',
    touchAction: 'none',
    cursor: available ? 'pointer' : 'default',
    transition: `background ${tile.easeMs}ms, border-color ${tile.easeMs}ms, box-shadow ${tile.easeMs}ms`,
    ...NO_CALLOUT,
  }
}

/** The label under a tile's icon. */
export const tileLabel: CSSProperties = { fontSize: labelPx, lineHeight: 1, letterSpacing: `${labelSpacingEm}em`, whiteSpace: 'nowrap' }

/** A tile's corner badge (a price, a stock count, the Credits left): a small pill overhanging the top-right corner. */
export const tileBadge = (color: string, dim = false): CSSProperties => {
  const { offsetPx, px, padPx, fontPx } = tile.badge
  return { position: 'absolute', top: offsetPx, right: offsetPx, minWidth: px, height: px, padding: `0 ${padPx}px`, boxSizing: 'border-box', borderRadius: px / 2, background: dim ? visual.tokens.dimOutline : color, color: dim ? visual.tokens.muted : dark, fontSize: fontPx, lineHeight: `${px}px`, textAlign: 'center', pointerEvents: 'none' }
}
