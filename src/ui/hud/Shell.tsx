import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { visual } from '../../config/visual'
import type { DefenceCircle as DefenceCircleView, Item } from '../../game/view/defenceCircle'
import type { ButtonSpec, HudModel } from '../../game/view/hudModel'
import type { MinimapView } from '../../game/view/minimap'
import type { OffenceCircle as OffenceCircleView, OffenceItemSpec } from '../../game/view/offenceCircle'
import type { SubterfugeCircle as SubterfugeCircleView } from '../../game/view/subterfugeCircle'
import type { PlayerId, PowerUp, SubterfugeItem } from '../../game/Game'
import { Button, ButtonRow, FONT } from '../ButtonRow'
import { DefenceCircle } from './DefenceCircle'
import { Minimap } from './Minimap'
import { OffenceCircle } from './OffenceCircle'
import { SubterfugeCircle } from './SubterfugeCircle'

const ELLIPSIS: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
// The Breaker lives in the Offence circle; what is left here is the tower stock.
const ICONS: Record<Exclude<PowerUp, 'breaker'>, string> = { repulsor: 'R', steal: 'S' }
const ring = (f: number, color: string = visual.hud.ink) => `conic-gradient(${color} ${f * 360}deg,${visual.hud.track} 0)`

/** The structure count (Siege) or score (Rounds); the digit flips when it changes. */
function Digit({ value, color }: { value: string | null; color: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const last = useRef(value)
  useEffect(() => {
    if (last.current && value && last.current !== value) ref.current?.animate?.([{ transform: 'rotateX(90deg)' }, { transform: 'rotateX(0)' }], visual.hud.scoreFlipMs)
    last.current = value
  }, [value])
  return <div ref={ref} style={{ display: value === null ? 'none' : undefined, fontFamily: visual.hud.display, fontSize: 40, lineHeight: 1, color }}>{value}</div>
}

/** The clock ring: a conic drain around a dark disc holding the seconds; at the urgent seconds it turns red with a halo and pulses. */
function Clock({ clock }: { clock: HudModel['clock'] }) {
  const { ringPx, discPx, haloPx, haloColor } = visual.hud.sharedRow
  const urgent = !!clock && clock.seconds <= visual.hud.urgentSeconds
  return (
    <div style={{ flex: 'none', width: ringPx, height: ringPx, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', background: ring(clock?.fraction ?? 0, urgent ? visual.hud.urgent : undefined), boxShadow: urgent ? `0 0 0 ${haloPx}px ${haloColor}` : undefined, transform: urgent ? `scale(${1 + visual.hud.urgentPulse * Math.abs(Math.sin(Math.PI * clock.seconds))})` : undefined }}>
      <div style={{ width: discPx, height: discPx, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: visual.tokens.bg, color: urgent ? visual.hud.urgent : visual.hud.ink }}>{clock ? Math.ceil(clock.seconds) : '-'}</div>
    </div>
  )
}

/** The ghost circle that sends the camera back to the ball: a crosshair. */
function Recenter({ onClick }: { onClick(): void }) {
  const { recenterPx, recenterBorderPx, iconPx, iconStroke } = visual.hud.sharedRow
  const { ghostBorder, ghostGlyph } = visual.tokens
  return (
    <button aria-label="Recenter" onClick={onClick} style={{ flex: 'none', width: recenterPx, height: recenterPx, padding: 0, borderRadius: '50%', border: `${recenterBorderPx}px solid ${ghostBorder}`, background: 'none', color: ghostGlyph, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={iconPx} height={iconPx} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={iconStroke} strokeLinecap="round" aria-hidden>
        <circle cx="10" cy="10" r="3.5" />
        <path d="M10 1v4M10 15v4M1 10h4M15 10h4" />
      </svg>
    </button>
  )
}

/** A phase button as the handoff's pill: a fully rounded 36 px outline, inside a transparent 44 px tap target. */
function Pill({ spec }: { spec: ButtonSpec }) {
  const { pillPx, pillPadPx, pillBorderPx, hitPx } = visual.hud.sharedRow
  const { ink, panel, pressed, pressedBorder } = visual.hud
  return (
    <button disabled={spec.disabled} aria-pressed={spec.pressed} onClick={spec.onClick} style={{ ...FONT, flex: 'none', minWidth: hitPx, height: hitPx, margin: `${(pillPx - hitPx) / 2}px 0`, padding: 0, border: 'none', background: 'none', color: ink, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: spec.disabled ? 0.4 : 1 }}>
      <span style={{ boxSizing: 'border-box', height: pillPx, padding: `0 ${pillPadPx}px`, display: 'flex', alignItems: 'center', borderRadius: 999, border: `${pillBorderPx}px solid ${spec.pressed ? pressedBorder : ink}`, background: spec.pressed ? pressed : panel, whiteSpace: 'nowrap' }}>{spec.label}</span>
    </button>
  )
}

/** Move points: filled for each one left. When `refundable`, the filled ones are buttons: a tap refunds one, a long-press all but one (none when one is left, which `onRefund(0)` reports). A held dot shows pressed. */
function MoveDots({ left, max, refundable, onRefund }: { left: number; max: number; refundable: boolean; onRefund(count: number): void }) {
  const { dotPx, ringPx, gap } = visual.hud.refund
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const longPressed = useRef(false)
  const [pressed, setPressed] = useState<number>()
  const down = (i: number) => {
    longPressed.current = false
    setPressed(i)
    timer.current = setTimeout(() => {
      longPressed.current = true
      setPressed(undefined)
      onRefund(left - 1)
    }, visual.hud.longPressMs)
  }
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      longPressed.current = true
      setPressed(undefined)
    },
    [left, refundable],
  )
  const up = () => {
    clearTimeout(timer.current)
    setPressed(undefined)
    if (!longPressed.current) onRefund(1)
    longPressed.current = true
  }
  const cancel = () => {
    clearTimeout(timer.current)
    longPressed.current = true
    setPressed(undefined)
  }
  const dot = (filled: boolean): CSSProperties => ({ width: dotPx, height: dotPx, padding: 0, borderRadius: '50%', border: `${ringPx}px solid ${visual.hud.ink}`, background: filled ? visual.hud.ink : 'none' })
  return (
    <div style={{ display: 'flex', gap, pointerEvents: 'auto' }}>
      {Array.from({ length: max }, (_, i) =>
        refundable && i < left ? (
          <button key={i} aria-label="Refund a Move point" aria-pressed={pressed === i} onPointerDown={() => down(i)} onPointerUp={up} onPointerLeave={cancel} onPointerCancel={cancel} style={{ ...dot(true), ...(pressed === i && { background: visual.hud.pressed, borderColor: visual.hud.pressedBorder }), cursor: 'pointer', touchAction: 'none' }} />
        ) : (
          <span key={i} style={dot(i < left)} />
        ),
      )}
    </div>
  )
}

/** The map view's pill: taps pass through it to the map. */
function MapHint() {
  const { heightPx, padPx, borderPx, fontPx } = visual.hud.minimap.pill
  return <div style={{ ...FONT, fontSize: fontPx, height: heightPx, lineHeight: `${heightPx - 2 * borderPx}px`, padding: `0 ${padPx}px`, boxSizing: 'border-box', borderRadius: heightPx / 2, border: `${borderPx}px solid ${visual.tokens.ghostBorder}`, background: visual.hud.panel, whiteSpace: 'nowrap' }}>Tap to jump · tap ✕ to close</div>
}

export type ShellProps = {
  hud: HudModel
  offence: OffenceCircleView
  defence?: DefenceCircleView
  /** The Subterfuge circle's model; absent where the mode has no Credits (Siege). */
  subterfuge?: SubterfugeCircleView
  confirm: boolean
  mapOpen: boolean
  /** The minimap chip's thumbnail. */
  minimap: MinimapView
  /** Player 2 is at the bottom of the screen: the stage is turned, so the shell sits at the stage's top. */
  flipped: boolean
  /** The minimap chip: opens the map view, or closes it. */
  onMap(): void
  onRecenter(): void
  onOffenceArm(item: OffenceItemSpec['item']): void
  onConfirm(): void
  onDefenceToggle(): void
  onDefenceArm(item: Item): void
  /** Buy a Subterfuge item. */
  onSubterfuge(item: SubterfugeItem): void
  /** Refund `count` Move points. */
  onRefund(count: number): void
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

/** The in-match controls, in one shell at the bottom of the screen and only for the active viewer. Mount inside the rotating stage. Flipped, the rows run in reverse so the Defence circle is always the row nearest the pitch, where its column opens over the pitch and not the HUD. */
export function Shell({ hud: m, offence, defence, subterfuge, confirm, mapOpen, minimap, flipped, onMap, onRecenter, onOffenceArm, onConfirm, onDefenceToggle, onDefenceArm, onSubterfuge, onRefund, className, style, children }: ShellProps) {
  const color = visual.player.colors[m.active]
  const { sharedRow } = visual.hud
  // The power-ups dim to outlines while a circle's column is open over the pitch, or the map is.
  const [open, setOpen] = useState({ offence: false, defence: false, subterfuge: false })
  const columnOpen = open.offence || open.defence || open.subterfuge
  const dimmed = columnOpen || mapOpen
  const dim = visual.tokens.dimOutline
  const row: CSSProperties = { ...FONT, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12, pointerEvents: 'auto' }
  const auto: CSSProperties = { pointerEvents: 'auto' }
  const buttons = m.buttons ?? []
  // One phase button (Done) fits in the row; Siege's Repair and Rearrange together do not (see the width budget on `visual.hud.sharedRow`), so they sit on their own row above.
  const stacked = buttons.length > 1
  return (
    <div className={className} style={{ position: 'absolute', left: 0, right: 0, [flipped ? 'top' : 'bottom']: 0, display: 'flex', flexDirection: flipped ? 'column-reverse' : 'column', alignItems: 'center', gap: visual.hud.gap, padding: visual.hud.gap, pointerEvents: 'none', color: visual.hud.ink, ...style }}>
      <div style={{ ...auto, display: 'flex', alignItems: 'center', gap: visual.hud.circleGapPx }}>
        <OffenceCircle offence={offence} color={color} flipped={flipped} onArm={onOffenceArm} onOpen={(o) => setOpen((p) => ({ ...p, offence: o }))} />
        {defence && <DefenceCircle defence={defence} color={color} flipped={flipped} onToggle={onDefenceToggle} onArm={onDefenceArm} onOpen={(o) => setOpen((p) => ({ ...p, defence: o }))} />}
        {subterfuge && <SubterfugeCircle subterfuge={subterfuge} color={color} flipped={flipped} onBuy={onSubterfuge} onOpen={(o) => setOpen((p) => ({ ...p, subterfuge: o }))} />}
      </div>
      {confirm && <ButtonRow specs={[{ label: 'Confirm', onClick: onConfirm }]} style={auto} />}
      {mapOpen && <MapHint />}
      {stacked && <div style={{ ...row, gap: sharedRow.gapPx }}>{buttons.map((b) => <Pill key={b.label} spec={b} />)}</div>}
      <div data-testid="shared-row" style={{ ...row, gap: sharedRow.gapPx, justifyContent: 'flex-start', flexWrap: 'nowrap', alignSelf: 'stretch', minHeight: sharedRow.heightPx, paddingRight: sharedRow.chipPadPx }}>
        <div style={{ textAlign: 'left', flex: '1 1 0', minWidth: 0 }}>
          {m.round === null ? null : <div style={{ fontSize: sharedRow.roundPx, letterSpacing: `${sharedRow.roundSpacingEm}em`, ...ELLIPSIS }}>{`Round ${m.round}/${m.rounds}${m.score ? ` · ${m.score}` : ''}`}</div>}
          <div style={{ fontSize: sharedRow.labelPx, letterSpacing: `${sharedRow.labelSpacingEm}em`, color: visual.tokens.muted, ...ELLIPSIS }}>{m.phase}</div>
        </div>
        <Clock clock={m.clock} />
        <MoveDots left={m.shotsLeft} max={m.shotsMax} refundable={m.refundable} onRefund={onRefund} />
        <Recenter onClick={onRecenter} />
        {!stacked && buttons.map((b) => <Pill key={b.label} spec={b} />)}
      </div>
      <div style={{ ...row, gap: 16, color }}>
        {([1, 2] as PlayerId[]).filter((id) => m.score === null || id === m.active).map((id) => <Digit key={id} value={m.players[id].digit} color={visual.player.colors[id]} />)}
        {(Object.keys(ICONS) as (keyof typeof ICONS)[]).map((p) => {
          const n = m.players[m.active].inventory[p]
          return (
            <div key={p} role="img" aria-label={`${ICONS[p]}${n}`} style={{ ...FONT, position: 'relative', width: 44, height: 44, boxSizing: 'border-box', borderRadius: '50%', border: `2px solid ${dimmed ? dim : color}`, color: dimmed ? dim : color, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: n > 0 ? 1 : 0.35 }}>
              {ICONS[p]}
              <span style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, borderRadius: 9, background: dimmed ? dim : color, color: visual.hud.dark, fontSize: 12, textAlign: 'center' }}>{n}</span>
            </div>
          )
        })}
      </div>
      {children && <div style={auto}>{children}</div>}
      <Minimap minimap={minimap} open={mapOpen} color={color} flipped={flipped} onToggle={onMap} />
    </div>
  )
}
