import type { CSSProperties } from 'react'
import { visual } from '../../config/visual'
import type { PlayerId } from '../../game/Game'

/** A parallelogram: the slanted ends of a bar segment. */
export const slanted = (px: number = visual.hud.bar.slantPx): string => `polygon(${px}px 0, 100% 0, calc(100% - ${px}px) 100%, 0 100%)`

/** The fill of a bar piece, shared by the far-edge bars: solid in Player 1's colour, 45-degree stripes of Player 2's over a dark band, the dim `empty` colour when not `filled`. */
export function barFill(player: PlayerId, filled = true): CSSProperties {
  const { empty, stripePx: [on, off], stripeDark } = visual.hud.bar
  const color = visual.player.colors[player]
  if (!filled) return { background: empty }
  if (player === 1) return { background: color }
  return { background: `repeating-linear-gradient(45deg, ${color} 0 ${on}px, ${stripeDark} ${on}px ${on + off}px)` }
}
