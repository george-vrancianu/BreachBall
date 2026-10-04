import type { CSSProperties, ReactNode } from 'react'
import { visual } from '../../config/visual'
import type { SubterfugeCircle as SubterfugeCircleView } from '../../game/view/subterfugeCircle'
import type { SubterfugeItem } from '../../game/Game'
import { FONT } from '../ButtonRow'
import { JAM } from './icons'
import { chipClear } from './Minimap'

const { panel } = visual.hud

/** How each item is drawn and named, in the queued icons. */
const ITEMS: Record<SubterfugeItem, { icon(size: number): ReactNode; name: string }> = { jam: { icon: JAM, name: 'Jam' } }

/**
 * What is queued, for both players: a small icon per item in its caster's colour, near the far edge, until the item takes effect.
 * Mount inside the rotating stage; `flipped` puts it on the stage's bottom, which is the far edge once the stage is turned. It sits just under the targeted player's half of the Defence bar, clear of the Resource bar's row; Player 1's icon is kept clear of the minimap chip at the stage's left, Player 2's of the ☰ button at its right.
 */
export function QueuedIcons({ queued, flipped, style }: { queued: SubterfugeCircleView['queued']; flipped: boolean; style?: CSSProperties }) {
  if (!queued.length) return null
  const { px, edgePx, gapPx, fontPx, iconPx, iconGapPx, borderPx } = visual.hud.queued
  const offset = visual.hud.bar.heightPx + visual.hud.bar.resourceRowPx + edgePx
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, [flipped ? 'bottom' : 'top']: offset, boxSizing: 'border-box', padding: `0 ${visual.hud.gap}px`, display: 'flex', gap: visual.hud.gap, pointerEvents: 'none', ...FONT, ...style }}>
      {([1, 2] as const).map((id) => (
        <div key={id} style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center', gap: gapPx }}>
          {queued.filter((q) => q.against === id).map((q) => (
            <div key={q.against} role="img" aria-label={`${ITEMS[q.item].name} queued against Player ${q.against}`} style={{ display: 'flex', alignItems: 'center', gap: iconGapPx, height: px, marginLeft: q.against === 1 ? chipClear() : 0, marginRight: q.against === 2 ? visual.sideMenu.buttonInsetPx + visual.sideMenu.buttonPx : 0, padding: `0 ${gapPx}px`, borderRadius: px / 2, border: `${borderPx}px solid ${visual.player.colors[q.by]}`, background: panel, color: visual.player.colors[q.by], fontSize: fontPx }}>
              {ITEMS[q.item].icon(iconPx)}
              <span>{`${ITEMS[q.item].name} · P${q.against}`}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
