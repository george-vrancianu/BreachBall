import type { CSSProperties } from 'react'
import { visual } from '../../config/visual'
import type { PlayerId } from '../../game/Game'

/** A parallelogram: the slanted ends of a bar segment. */
export const slanted = (px: number = visual.hud.bar.slantPx): string => `polygon(${px}px 0, 100% 0, calc(100% - ${px}px) 100%, 0 100%)`

/** One end digit of a far-edge bar, in the player's colour. */
export const barDigit = (player: PlayerId): CSSProperties => ({ width: visual.hud.bar.digitWidthPx, textAlign: 'center', fontFamily: visual.hud.display, fontSize: visual.hud.bar.digitPx, lineHeight: 1, color: visual.player.colors[player] })

/** The outer strip of a far-edge bar: full width, `top` px in from the far edge (the stage's bottom when `flipped`), `height` px tall, laid out in a row. */
export const barStrip = (flipped: boolean, top: number, height: number): CSSProperties => ({ position: 'absolute', left: 0, right: 0, [flipped ? 'bottom' : 'top']: top, height, boxSizing: 'border-box', padding: `0 ${visual.hud.gap}px`, display: 'flex', alignItems: 'center', gap: visual.hud.gap, pointerEvents: 'none' })

/** The fill of a bar piece, shared by the far-edge bars: solid in Player 1's colour, 45-degree stripes of Player 2's over a dark band, the dim `empty` colour when not `filled`. */
export function barFill(player: PlayerId, filled = true): CSSProperties {
  const { empty, stripePx: [on, off], stripeDark } = visual.hud.bar
  const color = visual.player.colors[player]
  if (!filled) return { background: empty }
  if (player === 1) return { background: color }
  return { background: `repeating-linear-gradient(45deg, ${color} 0 ${on}px, ${stripeDark} ${on}px ${on + off}px)` }
}
