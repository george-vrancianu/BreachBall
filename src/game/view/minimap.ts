import { rules } from '../../config/rules'
import { fogOf } from '../entities/Camera'
import type { PlayerId } from '../../sim/pitch'

/** A band of the whole pitch as fractions of its extent from the top end: `top` is where it starts, `height` how much it covers. */
export type Band = { top: number; height: number }

/** What the minimap chip's thumbnail draws: the main camera's frame, and the opponent's half when a blind build fogs it. */
export type MinimapView = { frame: Band; fog?: Band }

const band = (from: number, to: number): Band => ({ top: (from - rules.mapTop) / rules.mapHeight, height: (to - from) / rules.mapHeight })
// Fractions are rounded to this many steps (thousandths) so a camera at rest does not push a new HUD view every frame.
const PRECISION = 1000
const snap = (n: number): number => Math.round(n * PRECISION) / PRECISION
const round = (b: Band): Band => ({ top: snap(b.top), height: snap(b.height) })

/** The thumbnail of the whole pitch (the map's extent, nets included): the view of a camera at `y` showing `visibleHeight` world units, and the fogged half for a `blind` seat. `across` (Tabletop mode, seat 2): the thumbnail sits in the turned HUD layer while the canvas layer does not, so its bands are mirrored to keep each end of the pitch where the viewer sees it. */
export function minimapOf(y: number, visibleHeight: number, blind?: PlayerId, across = false): MinimapView {
  const fog = blind && fogOf(blind)
  const seen = (b: Band): Band => round(across ? { top: 1 - b.top - b.height, height: b.height } : b)
  return { frame: seen(band(y - visibleHeight / 2, y + visibleHeight / 2)), fog: fog ? seen(band(fog.top, fog.bottom)) : undefined }
}
