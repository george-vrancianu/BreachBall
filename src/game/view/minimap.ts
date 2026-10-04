import { rules } from '../../config/rules'
import { fogOf } from '../entities/Camera'
import type { PlayerId } from '../../sim/pitch'

/** A band of the whole pitch as fractions of its extent from the top end: `top` is where it starts, `height` how much it covers. */
export type Band = { top: number; height: number }

/** What the minimap chip's thumbnail draws: the main camera's frame, and the opponent's half when a blind build fogs it. */
export type Minimap = { frame: Band; fog?: Band }

const band = (from: number, to: number): Band => ({ top: (from - rules.mapTop) / rules.mapHeight, height: (to - from) / rules.mapHeight })
// Rounded so a camera at rest does not push a new HUD view every frame.
const round = (b: Band): Band => ({ top: Math.round(b.top * 1000) / 1000, height: Math.round(b.height * 1000) / 1000 })

/** The thumbnail of the whole pitch (the map's extent, nets included): the view of a camera at `y` showing `visibleHeight` world units, and the fogged half for a `blind` seat. */
export function minimapOf(y: number, visibleHeight: number, blind?: PlayerId): Minimap {
  const fog = blind && fogOf(blind)
  return { frame: round(band(y - visibleHeight / 2, y + visibleHeight / 2)), fog: fog ? round(band(fog.top, fog.bottom)) : undefined }
}
