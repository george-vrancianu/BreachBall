import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { visual } from '../../config/visual'
import type { OffenceCircle as OffenceCircleView, OffenceItemSpec } from '../../game/view/offenceCircle'
import { FONT } from '../ButtonRow'
import { GREY, ItemButton, NO_CALLOUT, noMenu, useColumn } from './ItemButton'

const { ink, panel } = visual.hud
const { circlePx, borderPx, itemPx, gap, columnZ } = visual.hud.defence

const svg = (size: number, d: ReactNode, fill = 'none') => <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">{d}</svg>
// Drawn rather than an emoji, which some fonts lack: a bolt, a wall cracked through by a shot, a spark.
const BOLT = svg(28, <path d="M13 2 4 14h7l-1 8 9-12h-7z" />)
const BREAKER = svg(26, <><path d="M3 4h7v6H3zM14 4h7v6h-7zM3 14h7v6H3zM14 14h7v6h-7z" /><path d="M12 2v20" strokeDasharray="3 2" /></>)
const OVERDRIVE = svg(26, <path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3" />)
const ITEM_ICON: Record<OffenceItemSpec['item'], ReactNode> = { breaker: BREAKER, overdrive: OVERDRIVE }

/**
 * The Offence circle. Tap: open the column of items (a tap with it open closes it); tap an item to arm it, which closes the column. Armed, the circle fills in the viewer's colour.
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
  const edge = available ? color : GREY
  return (
    <div className={className} style={{ position: 'relative', ...style }}>
      {open && (
        <div ref={column} style={{ position: 'absolute', [flipped ? 'top' : 'bottom']: circlePx + gap, left: (circlePx - itemPx) / 2, display: 'flex', flexDirection: flipped ? 'column' : 'column-reverse', gap, zIndex: columnZ }}>
          {items.map((s) => <ItemButton key={s.item} spec={s} icon={ITEM_ICON[s.item]} color={color} onPick={arm} />)}
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
        style={{ ...FONT, width: circlePx, height: circlePx, borderRadius: '50%', border: `${borderPx}px solid ${edge}`, color: armed ? visual.hud.dark : available ? ink : GREY, background: armed ? color : available ? panel : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, boxShadow: visual.tokens.halo, ...NO_CALLOUT }}
      >
        {BOLT}
      </button>
    </div>
  )
}
