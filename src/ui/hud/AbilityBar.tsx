import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { visual } from '../../config/visual'
import type { DefenceCircle as DefenceCircleView, Item } from '../../game/view/defenceCircle'
import type { OffenceCircle as OffenceCircleView, OffenceItemSpec } from '../../game/view/offenceCircle'
import type { SubterfugeCircle as SubterfugeCircleView } from '../../game/view/subterfugeCircle'
import type { SubterfugeItem } from '../../game/Game'
import { BOLT, BREAKER, JAM, LOCK, MASK, OVERDRIVE, PIECE_ICON, TOWER } from './icons'
import { noMenu } from './press'
import { tileBadge, tileLabel, tileStyle } from './tile'

const { dock } = visual.hud
const OFFENCE_ICON: Record<OffenceItemSpec['item'], (size: number) => ReactNode> = { breaker: BREAKER, overdrive: OVERDRIVE }
const SUBTERFUGE_ICON: Record<SubterfugeItem, (size: number) => ReactNode> = { jam: JAM }
/** How long an ability slides left (and the others fold away), ms. */
const SLIDE_MS = 220

export type Ability = 'build' | 'powerup' | 'subterfuge'

/** One option tile beside an open ability: an icon, a short name, a corner badge (price or stock); greyed when it cannot be used, filled when pressed (armed). */
export type OptionSpec = { key: string; aria: string; name: string; icon: ReactNode; badge?: string; disabled: boolean; pressed: boolean; onPick(): void }

/** An ability tile (Build, Powerup, Subterfuge): an icon over its label (the option tiles' size), all three `abilityPx` wide. `open` fills it; `active` (the Breaker armed) fills it too. */
function AbilityTile({ label, aria, icon, color, available, open, active, onTap }: { label: string; aria: string; icon: ReactNode; color: string; available: boolean; open: boolean; active?: boolean; onTap(): void }) {
  return (
    <button aria-label={aria} aria-expanded={open} aria-pressed={open || !!active} aria-disabled={!available} onClick={onTap} onContextMenu={noMenu} style={tileStyle({ color, active: (open || !!active) && available, available, width: dock.abilityPx })}>
      {icon}
      <span style={{ ...tileLabel, fontSize: dock.labelPx - 1 }}>{label}</span>
    </button>
  )
}

/** The options of the open ability, sliding in from the right. */
function Options({ options, color }: { options: OptionSpec[]; color: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.animate?.([{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'none' }], { duration: SLIDE_MS, easing: 'ease-out' })
  }, [])
  return (
    <div ref={ref} role="toolbar" aria-label="Options" style={{ display: 'flex', gap: dock.gapPx, minWidth: 0 }}>
      {options.map((o) => (
        <button key={o.key} data-item={o.key} aria-label={o.aria} aria-pressed={o.pressed} aria-disabled={o.disabled} onClick={() => !o.disabled && o.onPick()} onContextMenu={noMenu} style={tileStyle({ color, active: o.pressed && !o.disabled, available: !o.disabled, width: dock.tilePx - 4 })}>
          {o.icon}
          <span style={{ ...tileLabel, fontSize: dock.labelPx - 1, letterSpacing: '0.02em' }}>{o.name}</span>
          {o.badge && <span style={tileBadge(color, o.disabled)}>{o.badge}</span>}
        </button>
      ))}
    </div>
  )
}

/** A slot that folds to nothing (width and opacity) while another ability is open, so the open one slides to the left edge. */
function Fold({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  const t = `max-width ${SLIDE_MS}ms ease, opacity ${SLIDE_MS * 0.7}ms ease, margin ${SLIDE_MS}ms ease`
  const style: CSSProperties = { flex: 'none', maxWidth: hidden ? 0 : dock.abilityPx, opacity: hidden ? 0 : 1, marginRight: hidden ? 0 : dock.gapPx, overflow: hidden ? 'hidden' : 'visible', transition: t, pointerEvents: hidden ? 'none' : undefined }
  return <div aria-hidden={hidden || undefined} style={style}>{children}</div>
}

/** The Build tool options: the pieces, each arming its item. */
export const pieceOptions = (defence: DefenceCircleView, onArm: (item: Item) => void): OptionSpec[] =>
  defence.items.map((s) => {
    const off = s.disabled || !defence.available
    return { key: s.item, aria: s.soon ? `${s.label} · soon` : s.label, name: s.name, icon: s.soon ? LOCK(dock.iconPx - 4) : PIECE_ICON[s.item](dock.iconPx), badge: s.soon ? undefined : s.badge, disabled: off, pressed: s.pressed, onPick: () => s.item !== 'cannon' && onArm(s.item) }
  })

/**
 * The play dock's abilities, left-aligned: Build (a chess rook), Powerup (a bolt), Subterfuge (a theatre mask), with `trailing` (the shots and Refund) on the right.
 * Tapping an ability opens it: it slides to the left edge, the other abilities fold away, and its options take the rest of the row (the trailing part steps aside).
 * Tapping it again (or Escape) closes it and the row returns. Build is open while build mode is on (the game arms an item); Powerup and Subterfuge open locally,
 * and still open greyed outside the viewer's turn so their options can be looked at. Picking a Powerup or Subterfuge option closes it again.
 */
export function AbilityBar({ defence, offence, subterfuge, color, trailing, onDefenceToggle, onDefenceArm, onOffenceArm, onSubterfuge }: { defence?: DefenceCircleView; offence: OffenceCircleView; subterfuge?: SubterfugeCircleView; color: string; trailing?: ReactNode; onDefenceToggle(): void; onDefenceArm(item: Item): void; onOffenceArm(item: OffenceItemSpec['item']): void; onSubterfuge(item: SubterfugeItem): void }) {
  const [local, setLocal] = useState<Exclude<Ability, 'build'>>()
  const building = !!defence?.building && !!defence.available
  const open: Ability | undefined = building ? 'build' : local
  // The possession changed hands, or build mode came on: what was open goes.
  useEffect(() => setLocal(undefined), [offence.shooter, building])
  const toggle = (a: Exclude<Ability, 'build'>) => setLocal((o) => (o === a ? undefined : a))
  const key = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !open) return
    e.stopPropagation()
    if (open === 'build') onDefenceToggle()
    else setLocal(undefined)
  }
  const options: OptionSpec[] =
    open === 'build' && defence
      ? pieceOptions(defence, onDefenceArm)
      : open === 'powerup'
        ? offence.items.map((i) => ({ key: i.item, aria: i.soon ? `${i.label} · soon` : i.label, name: i.name, icon: i.soon ? LOCK(dock.iconPx - 4) : OFFENCE_ICON[i.item](dock.iconPx), badge: i.soon ? undefined : i.badge, disabled: i.disabled, pressed: i.pressed, onPick: () => (onOffenceArm(i.item), setLocal(undefined)) }))
        : open === 'subterfuge' && subterfuge
          ? subterfuge.items.map((i) => (i.soon
              ? { key: i.item, aria: 'Locked · soon', name: i.name, icon: LOCK(dock.iconPx - 4), disabled: true, pressed: false, onPick: () => {} }
              : { key: i.item, aria: `${i.label} · ${i.when}`, name: i.name, icon: SUBTERFUGE_ICON[i.item](dock.iconPx), badge: i.badge, disabled: i.disabled || !subterfuge.available, pressed: false, onPick: () => (onSubterfuge(i.item), setLocal(undefined)) }))
          : []
  return (
    <div onKeyDown={key} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
      <Fold hidden={!!open && open !== 'build'}>
        <AbilityTile label="Build" aria={building ? 'Leave building' : 'Build'} icon={TOWER(dock.iconPx)} color={color} available={!!defence?.available} open={open === 'build'} onTap={() => defence?.available && onDefenceToggle()} />
      </Fold>
      <Fold hidden={!!open && open !== 'powerup'}>
        <AbilityTile label="Powerup" aria={offence.armed ? 'Offence, Breaker armed' : 'Offence'} icon={BOLT(dock.iconPx)} color={color} available={offence.available} open={open === 'powerup'} active={offence.armed} onTap={() => toggle('powerup')} />
      </Fold>
      {subterfuge && (
        <Fold hidden={!!open && open !== 'subterfuge'}>
          <AbilityTile label="Subterfuge" aria="Subterfuge" icon={MASK(dock.iconPx)} color={color} available={subterfuge.available} open={open === 'subterfuge'} onTap={() => toggle('subterfuge')} />
        </Fold>
      )}
      {open && <span aria-hidden style={{ flex: 'none', width: dock.dividerPx, height: dock.tilePx - 16, background: dock.border, marginRight: dock.gapPx + 2 }} />}
      {open && <Options key={open} options={options} color={color} />}
      <span style={{ flex: 1 }} />
      {!open && trailing}
    </div>
  )
}
