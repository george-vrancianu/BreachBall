import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { visual } from '../../config/visual'
import { reducedMotion } from '../../game/feedback'
import type { SubterfugeCircle as SubterfugeCircleView, SubterfugeSpec } from '../../game/view/subterfugeCircle'
import type { SubterfugeItem } from '../../game/Game'
import { FONT } from '../ButtonRow'
import { GREY, ItemButton, NO_CALLOUT, noMenu, useColumn, type ColumnItemSpec } from './ItemButton'

const { ink, panel, shadow } = visual.hud
const { circlePx, borderPx, gap, pulseMs, pulseScale, columnZ, itemPx, itemBorderPx, shadowPx } = visual.hud.defence

const svg = (size: number, d: ReactNode) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{d}</svg>
// Drawn rather than an emoji, which some fonts lack: a dagger, and a spiked hub for the Jam.
const DAGGER = svg(26, <path d="M20 4l-1 5-9 9-4-4 9-9zM6 14l4 4M4 20l3-3" />)
const JAM = (size: number) => svg(size, <><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3" /></>)
/** How each item is drawn and named, in the column and in the queued icons. */
const ITEMS: Record<SubterfugeItem, { icon(size: number): ReactNode; name: string }> = { jam: { icon: JAM, name: 'Jam' } }
const SOON_ICON = '🧪'

type Press = { x: number; y: number; slid: boolean; opened: boolean; pulsed: boolean }

/**
 * The Subterfuge circle. Tap, or hold still for `holdMs`: the item column opens (a tap with it open closes it); slide onto an item and lift to buy it.
 * Outside the viewer's turn (or once this turn's Subterfuge is bought) the circle is greyed and a tap or hold pulses it instead.
 */
export function SubterfugeCircle({ subterfuge, color, flipped = false, onBuy, onOpen, className, style }: { subterfuge: SubterfugeCircleView; color: string; flipped?: boolean; onBuy(item: SubterfugeItem): void; /** The column opened (true) or closed (false), unmounting included. */ onOpen?(open: boolean): void; className?: string; style?: CSSProperties }) {
  const { available, items } = subterfuge
  const [open, setOpen] = useState(false)
  const hold = useRef<ReturnType<typeof setTimeout>>(undefined)
  const circle = useRef<HTMLButtonElement>(null)
  const column = useRef<HTMLDivElement>(null)
  // The press in progress: where it began, and what the hold did.
  const press = useRef<Press>(undefined)
  // The hold timer fires later than the render that started it, so it reads the latest.
  const availableRef = useRef(available)
  availableRef.current = available
  const clearHold = () => clearTimeout(hold.current)
  useEffect(() => () => clearTimeout(hold.current), [])
  useEffect(() => { if (!available) setOpen(false) }, [available])
  useColumn(open, () => setOpen(false), circle, column, onOpen)

  // A refused press swells the circle once; a second one restarts it.
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
  const spec = (slot: string) => items.find((i) => i.item === slot)
  // Closes the column; buys the item only when it can be (a greyed or locked one just closes it).
  const pick = (slot: string) => {
    close()
    const i = spec(slot)
    if (i && !i.soon && !i.disabled) onBuy(i.item)
  }
  const colSpec = (i: SubterfugeSpec): ColumnItemSpec<string> => ({ item: i.item, label: i.soon ? 'Locked' : `${i.label} · ${i.when}`, disabled: i.disabled, pressed: false, soon: i.soon })
  // The keyboard opens the column towards the pitch (Escape closes it); the items are buttons to Tab to.
  const key = (e: KeyboardEvent) => {
    if (e.key === (flipped ? 'ArrowDown' : 'ArrowUp') && available) (e.preventDefault(), setOpen(true))
    else if (e.key === 'Escape' && open) (e.stopPropagation(), close())
  }
  const tap = () => {
    if (open) close()
    else if (available) setOpen(true)
    else nudge()
  }
  const up = (e: PointerEvent) => {
    clearHold()
    const p = press.current
    press.current = undefined
    if (!p) return
    if (p.opened) {
      const hit = document.elementFromPoint?.(e.clientX, e.clientY)
      const slot = hit?.closest('[data-item]')?.getAttribute('data-item')
      if (slot && spec(slot)) pick(slot)
      // Lifting on the circle keeps the column for a tap; anywhere else closes it.
      else if (!(hit && circle.current?.contains(hit))) setOpen(false)
    } else if (!p.slid && !p.pulsed) tap()
  }
  const cancel = () => {
    clearHold()
    if (press.current?.opened) setOpen(false)
    press.current = undefined
  }

  const edge = available ? color : GREY
  return (
    <div className={className} style={{ position: 'relative', ...style }}>
      {open && (
        <div ref={column} style={{ position: 'absolute', [flipped ? 'top' : 'bottom']: circlePx + gap, left: (circlePx - itemPx) / 2, display: 'flex', flexDirection: flipped ? 'column' : 'column-reverse', gap, zIndex: columnZ }}>
          {items.map((i) => <ItemButton key={i.item} spec={colSpec(i)} icon={i.soon ? SOON_ICON : ITEMS[i.item].icon(26)} color={color} onPick={pick} />)}
        </div>
      )}
      <button
        ref={circle}
        aria-label="Subterfuge"
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
        style={{ ...FONT, width: circlePx, height: circlePx, borderRadius: '50%', border: `${borderPx}px solid ${edge}`, color: available ? ink : GREY, background: available ? panel : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, boxShadow: `0 ${shadowPx.y}px ${shadowPx.blur}px ${shadow}`, touchAction: 'none', ...NO_CALLOUT }}
      >
        {DAGGER}
      </button>
    </div>
  )
}

/**
 * What is queued, for both players: a small icon per item in its caster's colour, near the far edge, until the item takes effect.
 * Mount inside the rotating stage; `flipped` puts it on the stage's bottom, which is the far edge once the stage is turned. (The Defence bar will carry it, per its slice.)
 */
export function QueuedIcons({ queued, flipped }: { queued: SubterfugeCircleView['queued']; flipped: boolean }) {
  if (!queued.length) return null
  const { px, edgePx, gapPx, fontPx } = visual.hud.queued
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, [flipped ? 'bottom' : 'top']: edgePx, display: 'flex', justifyContent: 'center', gap: gapPx, pointerEvents: 'none', ...FONT }}>
      {queued.map((q) => (
        <div key={q.against} role="img" aria-label={`${ITEMS[q.item].name} queued against Player ${q.against}`} style={{ display: 'flex', alignItems: 'center', gap: 4, height: px, padding: `0 ${gapPx}px`, borderRadius: px / 2, border: `${itemBorderPx}px solid ${visual.player.colors[q.by]}`, background: panel, color: visual.player.colors[q.by], fontSize: fontPx }}>
          {ITEMS[q.item].icon(px - 10)}
          <span>{`${ITEMS[q.item].name} · P${q.against}`}</span>
        </div>
      ))}
    </div>
  )
}
