import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { visual } from '../../config/visual'
import { reducedMotion } from '../../game/feedback'
import type { SubterfugeCircle as SubterfugeCircleView, SubterfugeSpec } from '../../game/view/subterfugeCircle'
import type { SubterfugeItem } from '../../game/Game'
import { FONT } from '../ButtonRow'

const { ink, panel, shadow } = visual.hud
const { circlePx, borderPx, itemPx, pillPx, gap, pulseMs, pulseScale, columnZ, itemFontPx, pillFontPx, pillOffsetPx, pillPadPx, pillBorderPx, itemBorderPx, shadowPx } = visual.hud.defence
// A long press on touch would otherwise open the context menu, select text or show the callout.
const NO_CALLOUT: CSSProperties = { userSelect: 'none', WebkitTouchCallout: 'none' }
const noMenu = (e: { preventDefault(): void }) => e.preventDefault()
const GREY = visual.tokens.ghostBorder

const svg = (size: number, d: ReactNode) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{d}</svg>
// Drawn rather than an emoji, which some fonts lack: a dagger, and a spiked hub for the Jam.
const DAGGER = svg(26, <path d="M20 4l-1 5-9 9-4-4 9-9zM6 14l4 4M4 20l3-3" />)
export const JAM = (size: number) => svg(size, <><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3" /></>)
const ITEM_ICON: Record<SubterfugeSpec['item'], ReactNode> = { jam: JAM(26), soon1: '🧪', soon2: '🧪' }

type Press = { x: number; y: number; slid: boolean; opened: boolean; pulsed: boolean }

/** One item of the column: a circle with its pill beside it, saying what it costs and when it lands. Greyed when disabled, but still there (and hit-testable for a slide). */
function ItemButton({ spec, onPick }: { spec: SubterfugeSpec; onPick(item: SubterfugeItem): void }) {
  const off = spec.disabled
  return (
    <button
      data-item={spec.item}
      aria-label={spec.soon ? 'Coming soon' : `${spec.label}, ${spec.when}`}
      aria-disabled={off}
      onClick={() => !off && !spec.soon && onPick(spec.item as SubterfugeItem)}
      onContextMenu={noMenu}
      style={{ ...FONT, position: 'relative', width: itemPx, height: itemPx, padding: 0, borderRadius: '50%', border: `${itemBorderPx}px solid ${off ? GREY : ink}`, color: off ? GREY : ink, background: panel, fontSize: itemFontPx, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 ${shadowPx.y}px ${shadowPx.blur}px ${shadow}`, touchAction: 'none', ...NO_CALLOUT }}
    >
      {ITEM_ICON[spec.item]}
      <span style={{ position: 'absolute', left: itemPx + pillOffsetPx, height: pillPx, lineHeight: `${pillPx - 2 * pillBorderPx}px`, padding: `0 ${pillPadPx}px`, boxSizing: 'border-box', borderRadius: pillPx / 2, border: `${pillBorderPx}px solid ${GREY}`, background: panel, color: off ? GREY : ink, whiteSpace: 'nowrap', fontSize: pillFontPx }}>
        {spec.soon ? 'Soon' : `${spec.label} · ${spec.when}`}
      </span>
    </button>
  )
}

/**
 * The Subterfuge circle. Tap, or hold still for `holdMs`: the item column opens (a tap with it open closes it); slide onto an item and lift to buy it.
 * Outside the viewer's turn (or once this turn's Subterfuge is bought) the circle is greyed and a tap or hold pulses it instead.
 */
export function SubterfugeCircle({ subterfuge, color, flipped = false, onBuy, className, style }: { subterfuge: SubterfugeCircleView; color: string; flipped?: boolean; onBuy(item: SubterfugeItem): void; className?: string; style?: CSSProperties }) {
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
  const buy = (item: SubterfugeItem) => (close(), onBuy(item))
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
      const spec = items.find((i) => i.item === hit?.closest('[data-item]')?.getAttribute('data-item'))
      if (spec) (close(), !spec.disabled && !spec.soon && onBuy(spec.item as SubterfugeItem))
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
          {items.map((s) => <ItemButton key={s.item} spec={s} onPick={buy} />)}
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
        <div key={q.against} role="img" aria-label={`${q.item} queued against Player ${q.against}`} style={{ display: 'flex', alignItems: 'center', gap: 4, height: px, padding: `0 ${gapPx}px`, borderRadius: px / 2, border: `${itemBorderPx}px solid ${visual.player.colors[q.by]}`, background: panel, color: visual.player.colors[q.by], fontSize: fontPx }}>
          {JAM(px - 10)}
          <span>{`Jam · P${q.against}`}</span>
        </div>
      ))}
    </div>
  )
}
