import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { visual } from '../../config/visual'
import type { OffenceCircle as OffenceCircleView, OffenceItemSpec } from '../../game/view/offenceCircle'
import { BOLT, BREAKER, OVERDRIVE } from './icons'
import { ItemButton, noMenu, useColumn } from './ItemButton'
import { columnLift, tileLabel, tileStyle } from './tile'

const { itemPx, gap, columnZ } = visual.hud.defence
const { iconPx } = visual.hud.dock
/** The Powerup tile is wider than a piece tile, to fit its label. */
export const POWER_TILE_W = 66
const ITEM_ICON: Record<OffenceItemSpec['item'], ReactNode> = { breaker: BREAKER(26), overdrive: OVERDRIVE(26) }

/**
 * The Offence circle, drawn as the dock's Powerup tile (a bolt). Tap: open the column of items (a tap with it open closes it); tap an item to arm it, which closes the column. Armed, the circle fills in the viewer's colour.
 * Outside the viewer's possession the circle is greyed and its column still opens, with every item greyed, so the other seat's options can be looked at.
 */
export function OffenceCircle({ offence, color, flipped = false, onArm, onOpen, className, style }: { offence: OffenceCircleView; color: string; flipped?: boolean; onArm(item: OffenceItemSpec['item']): void; /** The column opened (true) or closed (false), unmounting included. */ onOpen?(open: boolean): void; className?: string; style?: CSSProperties }) {
  const { armed, available, items, shooter } = offence
  const [open, setOpen] = useState(false)
  const circle = useRef<HTMLButtonElement>(null)
  const column = useRef<HTMLDivElement>(null)
  const close = () => (setOpen(false), circle.current?.focus())
  useColumn(open, () => setOpen(false), circle, column, onOpen)
  // The possession changed hands: the column offered the other seat's options.
  useEffect(() => setOpen(false), [available, shooter])
  const arm = (item: OffenceItemSpec['item']) => (close(), onArm(item))
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) (e.stopPropagation(), close())
  }
  return (
    <div className={className} style={{ position: 'relative', ...style }}>
      {open && (
        <div ref={column} style={{ position: 'absolute', [flipped ? 'top' : 'bottom']: columnLift, right: (POWER_TILE_W - itemPx) / 2, display: 'flex', flexDirection: flipped ? 'column' : 'column-reverse', gap, zIndex: columnZ }}>
          {items.map((s) => <ItemButton key={s.item} spec={s} icon={ITEM_ICON[s.item]} color={color} onPick={arm} pillSide="left" />)}
        </div>
      )}
      <button
        ref={circle}
        aria-label={armed ? 'Offence, Breaker armed' : 'Offence'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-pressed={armed}
        aria-disabled={!available}
        onClick={() => setOpen(!open)}
        onContextMenu={noMenu}
        onKeyDown={key}
        style={tileStyle({ color, active: armed, available, width: POWER_TILE_W })}
      >
        {BOLT(iconPx)}
        <span style={tileLabel}>Powerup</span>
      </button>
    </div>
  )
}
