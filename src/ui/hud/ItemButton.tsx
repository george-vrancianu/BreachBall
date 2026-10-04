import { useEffect, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { visual } from '../../config/visual'
import { FONT } from '../ButtonRow'

const { ink, panel, shadow } = visual.hud
const { itemPx, pillPx, itemFontPx, pillFontPx, pillOffsetPx, pillPadPx, pillBorderPx, itemBorderPx, shadowPx } = visual.hud.defence
// A long press on touch would otherwise open the context menu, select text or show the callout.
export const NO_CALLOUT: CSSProperties = { userSelect: 'none', WebkitTouchCallout: 'none' }
export const noMenu = (e: { preventDefault(): void }) => e.preventDefault()
export const GREY = visual.tokens.ghostBorder

/** One item of a circle's column. `disabled` greys it (cannot be used now, or `soon` locked), `pressed` marks the armed one. */
export type ColumnItemSpec<I extends string> = { item: I; label: string; disabled: boolean; pressed: boolean; soon?: boolean }

/** One item of a circle's column: a circle with its label pill beside it. Greyed when disabled, but still there to look at (and hit-testable for a slide). */
export function ItemButton<I extends string>({ spec, icon, color, onPick, pillSide = 'right' }: { spec: ColumnItemSpec<I>; icon: ReactNode; color: string; onPick(item: I): void; /** Which side of the item its label pill sits: left for a column opened from the screen's right edge. */ pillSide?: 'left' | 'right' }) {
  const off = spec.disabled
  const edge = off ? GREY : spec.pressed ? visual.hud.pressedBorder : ink
  return (
    <button
      data-item={spec.item}
      aria-label={spec.label}
      aria-pressed={spec.pressed}
      aria-disabled={off}
      onClick={() => !off && onPick(spec.item)}
      onContextMenu={noMenu}
      style={{ ...FONT, position: 'relative', width: itemPx, height: itemPx, padding: 0, borderRadius: '50%', border: `${itemBorderPx}px solid ${edge}`, color: off ? GREY : ink, background: spec.pressed ? visual.hud.pressed : panel, fontSize: itemFontPx, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 ${shadowPx.y}px ${shadowPx.blur}px ${shadow}`, touchAction: 'none', ...NO_CALLOUT }}
    >
      {icon}
      <span style={{ position: 'absolute', [pillSide === 'left' ? 'right' : 'left']: itemPx + pillOffsetPx, height: pillPx, lineHeight: `${pillPx - 2 * pillBorderPx}px`, padding: `0 ${pillPadPx}px`, boxSizing: 'border-box', borderRadius: pillPx / 2, border: `${pillBorderPx}px solid ${GREY}`, background: panel, color: off ? GREY : spec.pressed ? color : ink, whiteSpace: 'nowrap', fontSize: pillFontPx }}>{spec.soon ? `${spec.label} · soon` : spec.label}</span>
    </button>
  )
}

/** The column's effects: `onOpen` hears it open and close (unmounting included), and a press anywhere outside the circle and its column closes it. */
export function useColumn(open: boolean, close: () => void, circle: RefObject<HTMLElement | null>, column: RefObject<HTMLElement | null>, onOpen?: (open: boolean) => void) {
  useEffect(() => {
    if (!open) return
    onOpen?.(true)
    return () => onOpen?.(false)
  }, [open])
  useEffect(() => {
    if (!open) return
    const outside = (e: Event) => {
      const t = e.target as Node
      if (!circle.current?.contains(t) && !column.current?.contains(t)) close()
    }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [open])
}
