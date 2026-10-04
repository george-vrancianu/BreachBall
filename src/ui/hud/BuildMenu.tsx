import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { visual } from '../../config/visual'
import { reducedMotion } from '../../game/feedback'
import type { BuildMenu as BuildMenuView, Item, ItemSpec } from '../../game/view/buildMenu'
import type { ButtonSpec } from '../../game/view/hudModel'
import { Button, FONT } from '../ButtonRow'

const { ink, panel, shadow } = visual.hud
const { circlePx, borderPx, itemPx, pillPx, gap, pulseMs, pulseScale, columnZ, circleFontPx, itemFontPx, pillFontPx, pillOffsetPx, pillPadPx, pillBorderPx } = visual.hud.defence
// A long press on touch would otherwise open the context menu, select text or show the callout.
const NO_CALLOUT: CSSProperties = { userSelect: 'none', WebkitTouchCallout: 'none' }
const noMenu = (e: { preventDefault(): void }) => e.preventDefault()
const GREY = visual.tokens.ghostBorder
const ROUND: CSSProperties = { ...FONT, width: 52, height: 52, borderRadius: '50%', border: `2px solid ${ink}`, color: ink, background: panel, fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, boxShadow: `0 2px 8px ${shadow}` }

const svg = (size: number, d: ReactNode) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{d}</svg>
// A small brick wall.
const WALL = svg(26, <><rect x="2" y="4" width="20" height="16" rx="1" /><path d="M2 9.3h20M2 14.7h20M8 4v5.3M16 4v5.3M12 9.3v5.4M8 14.7V20M16 14.7V20" /></>)
// Drawn rather than an emoji, which some fonts lack.
const GLYPHS: Record<string, { icon: ReactNode; aria: string }> = { '🗑': { icon: svg(22, <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />), aria: 'Demolish' } }
// Placeholder glyphs for the pieces until the icons are drawn.
const ITEM_ICON: Record<ItemSpec['item'], ReactNode> = { wall: WALL, repulsor: 'R', steal: 'S', cannon: 'C' }

const Round = ({ spec }: { spec: ButtonSpec }) => {
  const g = GLYPHS[spec.label]
  return <Button spec={spec} aria={g?.aria} style={ROUND}>{g?.icon ?? spec.label}</Button>
}

type Press = { x: number; y: number; slid: boolean; opened: boolean; pulsed: boolean }

/** One piece of the hold menu: a circle with its label pill beside it. Greyed when disabled, but still there (and hit-testable for a slide). */
function ItemButton({ spec, color, onPick }: { spec: ItemSpec; color: string; onPick(item: Item): void }) {
  const off = spec.disabled
  const edge = off ? GREY : spec.pressed ? visual.hud.pressedBorder : ink
  return (
    <button
      data-item={spec.item}
      aria-label={spec.label}
      aria-pressed={spec.pressed}
      aria-disabled={off}
      onClick={() => !off && spec.item !== 'cannon' && onPick(spec.item)}
      onContextMenu={noMenu}
      style={{ ...FONT, position: 'relative', width: itemPx, height: itemPx, padding: 0, borderRadius: '50%', border: `2px solid ${edge}`, color: off ? GREY : ink, background: spec.pressed ? visual.hud.pressed : panel, fontSize: itemFontPx, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 2px 8px ${shadow}`, touchAction: 'none', ...NO_CALLOUT }}
    >
      {ITEM_ICON[spec.item]}
      <span style={{ position: 'absolute', left: itemPx + pillOffsetPx, height: pillPx, lineHeight: `${pillPx - 2 * pillBorderPx}px`, padding: `0 ${pillPadPx}px`, boxSizing: 'border-box', borderRadius: pillPx / 2, border: `${pillBorderPx}px solid ${GREY}`, background: panel, color: off ? GREY : spec.pressed ? color : ink, whiteSpace: 'nowrap', fontSize: pillFontPx }}>{spec.soon ? `${spec.label} · soon` : spec.label}</span>
    </button>
  )
}

/**
 * The Defence circle. Tap: enter build mode with the Wall, or leave it (a tap with the menu open only closes it). Hold still for `holdMs`: the piece column
 * opens; slide onto a piece and lift to arm it, lift on the circle to keep the column for a tap. When the viewer cannot build, the circle is greyed and a hold pulses it.
 * Beside it, the controls of the selected structure.
 */
export function BuildMenu({ menu, color, flipped = false, onToggle, onArm, className, style, children }: { menu: BuildMenuView; color: string; flipped?: boolean; onToggle(): void; onArm(item: Item): void; className?: string; style?: CSSProperties; children?: ReactNode }) {
  const { building, available, items, selection } = menu
  const [open, setOpen] = useState(false)
  const hold = useRef<ReturnType<typeof setTimeout>>(undefined)
  const circle = useRef<HTMLButtonElement>(null)
  // The press in progress: where it began, and what the hold did.
  const press = useRef<Press>(undefined)
  // The hold timer fires later than the render that started it, so it reads the latest.
  const availableRef = useRef(available)
  availableRef.current = available
  const column = useRef<HTMLDivElement>(null)
  const clearHold = () => clearTimeout(hold.current)
  useEffect(() => () => clearTimeout(hold.current), [])
  useEffect(() => { if (!available) setOpen(false) }, [available])
  // A press anywhere outside the circle and its column closes the column.
  useEffect(() => {
    if (!open) return
    const outside = (e: Event) => {
      const t = e.target as Node
      if (!circle.current?.contains(t) && !column.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [open])

  // A refused hold swells the circle once; a second hold restarts it.
  const nudge = () => {
    if (reducedMotion()) return
    circle.current?.getAnimations?.().forEach((a) => a.cancel())
    circle.current?.animate?.([{ transform: 'scale(1)' }, { transform: `scale(${pulseScale})`, offset: 0.4 }, { transform: 'scale(1)' }], { duration: pulseMs, easing: 'ease-out' })
  }
  const down = (e: PointerEvent) => {
    clearHold()
    const p: Press = (press.current = { x: e.clientX, y: e.clientY, slid: false, opened: false, pulsed: false })
    circle.current?.setPointerCapture?.(e.pointerId)
    hold.current = setTimeout(() => {
      if (p.slid) return
      if (availableRef.current) (p.opened = true), setOpen(true)
      else (p.pulsed = true), nudge()
    }, visual.hud.holdMs)
  }
  const move = (e: PointerEvent) => {
    const p = press.current
    if (p && !p.opened && !p.slid && Math.hypot(e.clientX - p.x, e.clientY - p.y) > visual.input.tapSlopPx) (p.slid = true), clearHold()
  }
  const close = () => (setOpen(false), circle.current?.focus())
  const arm = (item: Item) => (close(), onArm(item))
  // The keyboard opens the column towards the pitch (Escape closes it); the pieces are buttons to Tab to.
  const key = (e: KeyboardEvent) => {
    if (e.key === (flipped ? 'ArrowDown' : 'ArrowUp') && available) (e.preventDefault(), setOpen(true))
    else if (e.key === 'Escape' && open) (e.stopPropagation(), close())
  }
  const tap = () => {
    if (open) close()
    else if (available) onToggle()
  }
  const up = (e: PointerEvent) => {
    clearHold()
    const p = press.current
    press.current = undefined
    if (!p) return
    if (p.opened) {
      const hit = document.elementFromPoint?.(e.clientX, e.clientY)
      const spec = items.find((i) => i.item === hit?.closest('[data-item]')?.getAttribute('data-item'))
      if (spec) (close(), !spec.disabled && spec.item !== 'cannon' && onArm(spec.item))
      else if (!(hit && circle.current?.contains(hit))) setOpen(false)
    } else if (!p.slid && !p.pulsed) tap()
  }
  const cancel = () => {
    clearHold()
    if (press.current?.opened) setOpen(false)
    press.current = undefined
  }

  const filled = building && available
  const edge = available ? color : GREY
  const row: CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', ...style }
  return (
    <div className={className} style={row}>
      {selection?.buttons.map((s) => <Round key={s.label} spec={s} />)}
      <div style={{ position: 'relative' }}>
        {open && (
          <div ref={column} style={{ position: 'absolute', [flipped ? 'top' : 'bottom']: circlePx + gap, left: (circlePx - itemPx) / 2, display: 'flex', flexDirection: flipped ? 'column' : 'column-reverse', gap, zIndex: columnZ }}>
            {items.map((s) => <ItemButton key={s.item} spec={s} color={color} onPick={arm} />)}
          </div>
        )}
        <button
          ref={circle}
          aria-label={building ? 'Leave building' : 'Build'}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-disabled={!available}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={cancel}
          onContextMenu={noMenu}
          onKeyDown={key}
          onClick={(e) => e.detail === 0 && tap()}
          style={{ ...FONT, width: circlePx, height: circlePx, borderRadius: '50%', border: `${borderPx}px solid ${edge}`, color: filled ? visual.hud.dark : available ? ink : GREY, background: filled ? color : available ? panel : 'transparent', fontSize: circleFontPx, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, boxShadow: visual.tokens.halo, touchAction: 'none', ...NO_CALLOUT }}
        >
          {building ? '✕' : WALL}
        </button>
      </div>
      {children}
    </div>
  )
}
