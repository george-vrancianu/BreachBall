import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { visual } from '../../config/visual'
import type { DefenceCircle as DefenceCircleView, Item, ItemSpec } from '../../game/view/defenceCircle'
import type { ButtonSpec, HudModel } from '../../game/view/hudModel'
import type { OffenceCircle as OffenceCircleView, OffenceItemSpec } from '../../game/view/offenceCircle'
import type { StrategyCard } from '../../game/view/strategies'
import type { SubterfugeCircle as SubterfugeCircleView } from '../../game/view/subterfugeCircle'
import type { SubterfugeItem } from '../../game/Game'
import { FONT } from '../ButtonRow'
import { CANNON, CHECK, CLOSE, CREDIT, LAYERS, LOCK, RECENTER, REFUND, REPULSOR, ROTATE, STEAL, TOWER, TRASH, WALL } from './icons'
import { NO_CALLOUT, noMenu } from './ItemButton'
import { OffenceCircle } from './OffenceCircle'
import { StrategyTray } from './StrategyTray'
import { SubterfugeCircle } from './SubterfugeCircle'
import { tileBadge, tileLabel, tileStyle } from './tile'

const ELLIPSIS: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const ring = (f: number, color: string = visual.hud.ink) => `conic-gradient(${color} ${f * 360}deg,${visual.hud.track} 0)`
const { dock } = visual.hud
const PIECE_ICON: Record<ItemSpec['item'], (size: number) => ReactNode> = { wall: WALL, repulsor: REPULSOR, steal: STEAL, cannon: CANNON }

/** The clock ring: a conic drain around a dark disc holding the seconds; at the urgent seconds it turns red with a halo and pulses. */
function Clock({ clock }: { clock: HudModel['clock'] }) {
  const { ringPx, discPx, haloPx, haloColor } = visual.hud.sharedRow
  const urgent = !!clock && clock.seconds <= visual.hud.urgentSeconds
  return (
    <div role="timer" aria-label={clock ? `${Math.ceil(clock.seconds)} seconds left` : 'No clock'} style={{ flex: 'none', width: ringPx, height: ringPx, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', background: ring(clock?.fraction ?? 0, urgent ? visual.hud.urgent : undefined), boxShadow: urgent ? `0 0 0 ${haloPx}px ${haloColor}` : undefined, transform: urgent ? `scale(${1 + visual.hud.urgentPulse * Math.abs(Math.sin(Math.PI * clock.seconds))})` : undefined }}>
      <div style={{ width: discPx, height: discPx, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: visual.tokens.bg, color: urgent ? visual.hud.urgent : visual.hud.ink }}>{clock ? Math.ceil(clock.seconds) : '-'}</div>
    </div>
  )
}

/** The ghost circle that sends the camera back to the ball: a crosshair. */
function Recenter({ onClick }: { onClick(): void }) {
  const { recenterPx, recenterBorderPx, iconPx } = visual.hud.sharedRow
  const { ghostBorder, ghostGlyph } = visual.tokens
  return (
    <button aria-label="Recenter" onClick={onClick} style={{ flex: 'none', width: recenterPx, height: recenterPx, padding: 0, borderRadius: '50%', border: `${recenterBorderPx}px solid ${ghostBorder}`, background: 'none', color: ghostGlyph, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {RECENTER(iconPx)}
    </button>
  )
}

/** The balance chip: a Credit token and the amount in the display face, ringed in the player's colour; the amount pops when it changes. */
function CreditsChip({ balance, color }: { balance: NonNullable<HudModel['balance']>; color: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const last = useRef(balance.amount)
  useEffect(() => {
    if (last.current !== balance.amount) ref.current?.animate?.([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], 260)
    last.current = balance.amount
  }, [balance.amount])
  return (
    <div role="status" aria-label={`${balance.amount} ${balance.unit}`} style={{ ...FONT, flex: 'none', boxSizing: 'border-box', height: dock.chipPx, padding: '0 12px 0 6px', display: 'flex', alignItems: 'center', gap: 6, borderRadius: dock.chipPx / 2, border: `2px solid ${color}`, background: `linear-gradient(135deg, ${color}2e, ${color}0a 60%)`, color: visual.hud.ink, boxShadow: `inset 0 0 12px ${color}22` }}>
      <span style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: color, color: visual.hud.dark }}>{CREDIT(18)}</span>
      <span ref={ref} style={{ fontFamily: visual.hud.display, fontSize: dock.creditFontPx, lineHeight: 1, display: 'inline-block' }}>{balance.amount}</span>
      <span style={{ fontSize: 10, letterSpacing: '0.1em', color: visual.tokens.muted }}>{balance.unit}</span>
    </div>
  )
}

/** The primary pill of a dock (OK to submit the build; Repair or Rearrange): filled in the player's colour, a check when it submits. */
function Primary({ spec, color, icon, label, aria, grow = false }: { spec: ButtonSpec; color: string; icon?: ReactNode; label?: string; aria?: string; /** Fill the space it is given (the defence choice's two halves). */ grow?: boolean }) {
  const off = !!spec.disabled
  return (
    <button disabled={spec.disabled} aria-label={aria ?? spec.label} onClick={spec.onClick} style={{ ...FONT, flex: grow ? 1 : 'none', boxSizing: 'border-box', minWidth: dock.okMinPx, height: grow ? dock.tilePx - 4 : dock.chipPx, padding: '0 14px', borderRadius: dock.chipPx / 2, border: `2px solid ${off ? visual.tokens.ghostBorder : color}`, background: off ? 'transparent' : color, color: off ? visual.tokens.muted : visual.hud.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 15, letterSpacing: '0.06em', boxShadow: off ? 'none' : `0 0 16px ${color}55`, cursor: off ? 'default' : 'pointer', pointerEvents: 'auto' }}>
      {icon}
      {label ?? spec.label}
    </button>
  )
}

/** The Move points left this possession: a ball per point, filled while unspent. */
function ShotPips({ left, max, color }: { left: number; max: number; color: string }) {
  const px = 14
  return (
    <div role="img" aria-label={`${left} of ${max} shots left`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      <div style={{ display: 'flex', gap: 5 }}>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} style={{ width: px, height: px, boxSizing: 'border-box', borderRadius: '50%', border: `2px solid ${i < left ? visual.ball.fill : visual.tokens.ghostBorder}`, background: i < left ? `radial-gradient(circle at 35% 35%, #fff, ${visual.ball.fill} 60%, #c9c9c0)` : 'none', boxShadow: i < left ? `0 0 6px ${color}66` : 'none' }} />
        ))}
      </div>
      <span style={{ ...tileLabel, color: visual.tokens.muted }}>{`Shots ${left}/${max}`}</span>
    </div>
  )
}

/** Refund: trades a Move point for Credits. A tap refunds one; a long-press refunds all but one (none when one is left, which `onRefund(0)` reports). Greyed when a refund is not allowed now. */
function RefundButton({ rate, left, refundable, color, onRefund }: { rate: number; left: number; refundable: boolean; color: string; onRefund(count: number): void }) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const longPressed = useRef(false)
  const [pressed, setPressed] = useState(false)
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      longPressed.current = true
      setPressed(false)
    },
    [left, refundable],
  )
  const down = () => {
    if (!refundable) return
    longPressed.current = false
    setPressed(true)
    timer.current = setTimeout(() => {
      longPressed.current = true
      setPressed(false)
      onRefund(left - 1)
    }, visual.hud.longPressMs)
  }
  const up = () => {
    clearTimeout(timer.current)
    setPressed(false)
    if (refundable && !longPressed.current) onRefund(1)
    longPressed.current = true
  }
  const cancel = () => {
    clearTimeout(timer.current)
    longPressed.current = true
    setPressed(false)
  }
  return (
    <button
      aria-label={`Refund a shot for ${rate} Credits`}
      aria-disabled={!refundable}
      aria-pressed={pressed}
      onPointerDown={down}
      onPointerUp={up}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={noMenu}
      onClick={(e) => e.detail === 0 && refundable && onRefund(1)}
      style={{ ...FONT, flex: 'none', boxSizing: 'border-box', height: dock.tilePx, padding: '0 12px 0 8px', borderRadius: dock.radiusPx, border: `2px solid ${refundable ? color : visual.tokens.dimOutline}`, background: pressed ? visual.hud.pressed : refundable ? visual.hud.panel : 'transparent', color: refundable ? visual.hud.ink : visual.tokens.ghostBorder, display: 'flex', alignItems: 'center', gap: 6, touchAction: 'none', cursor: refundable ? 'pointer' : 'default', ...NO_CALLOUT }}
    >
      <span style={{ color: refundable ? color : 'inherit', display: 'flex' }}>{REFUND(22)}</span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
        <span style={{ fontSize: 12, lineHeight: 1 }}>Refund</span>
        <span style={{ fontSize: 11, lineHeight: 1, color: refundable ? color : 'inherit' }}>{`+${rate} CR`}</span>
      </span>
    </button>
  )
}

/** The round line (with the score) over the phase label. */
function Status({ m }: { m: HudModel }) {
  const { roundPx, labelPx, roundSpacingEm, labelSpacingEm } = visual.hud.sharedRow
  return (
    <div style={{ textAlign: 'left', flex: '1 1 0', minWidth: 0 }}>
      {m.round === null ? null : <div style={{ fontSize: roundPx - 1, letterSpacing: `${roundSpacingEm}em`, ...ELLIPSIS }}>{`Round ${m.round}/${m.rounds}${m.score ? ` · ${m.score}` : ''}`}</div>}
      <div style={{ fontSize: labelPx, letterSpacing: `${labelSpacingEm}em`, color: visual.tokens.muted, ...ELLIPSIS }}>{m.phase}</div>
    </div>
  )
}

/** The build dock's tool row: Build (a chess rook) on the left, then the pieces it can place, then Strategies on the right. */
function BuildTools({ defence, color, trayOpen, strategies, onToggle, onArm, onStrategies }: { defence: DefenceCircleView; color: string; trayOpen: boolean; strategies: boolean; onToggle(): void; onArm(item: Item): void; onStrategies(): void }) {
  const { building, available, items } = defence
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: dock.gapPx, minWidth: 0 }}>
      <button aria-label={building ? 'Leave building' : 'Build'} aria-pressed={building} aria-disabled={!available} onClick={() => available && onToggle()} onContextMenu={noMenu} style={tileStyle({ color, active: building && available, available })}>
        {TOWER(dock.iconPx)}
        <span style={tileLabel}>Build</span>
      </button>
      <span aria-hidden style={{ flex: 'none', width: dock.dividerPx, height: dock.tilePx - 16, background: dock.border, margin: '0 2px' }} />
      <div role="toolbar" aria-label="Pieces" style={{ display: 'flex', gap: dock.gapPx, minWidth: 0 }}>
        {items.map((s) => {
          const off = s.disabled || !available
          return (
            <button key={s.item} data-item={s.item} aria-label={s.soon ? `${s.label} · soon` : s.label} aria-pressed={s.pressed} aria-disabled={off} onClick={() => !off && s.item !== 'cannon' && onArm(s.item)} onContextMenu={noMenu} style={{ ...tileStyle({ color, active: s.pressed && !off, available: !off, width: dock.tilePx - 4 }) }}>
              {s.soon ? LOCK(dock.iconPx - 4) : PIECE_ICON[s.item](dock.iconPx)}
              <span style={{ ...tileLabel, fontSize: dock.labelPx - 1, letterSpacing: '0.02em' }}>{s.name}</span>
              {s.badge && !s.soon && <span style={tileBadge(color, off)}>{s.badge}</span>}
            </button>
          )
        })}
      </div>
      <span style={{ flex: 1 }} />
      {strategies && (
        <button aria-label="Strategies" aria-pressed={trayOpen} aria-expanded={trayOpen} aria-haspopup="menu" onClick={onStrategies} onContextMenu={noMenu} style={tileStyle({ color, active: trayOpen })}>
          {LAYERS(dock.iconPx)}
          <span style={tileLabel}>Plans</span>
        </button>
      )}
    </div>
  )
}

/** The selected structure's controls (demolish, rotate, deselect), floating over the pitch above the dock. */
function SelectionBar({ buttons }: { buttons: ButtonSpec[] }) {
  const GLYPH: Record<string, { icon: ReactNode; aria: string }> = { '🗑': { icon: TRASH(20), aria: 'Demolish' }, '↻': { icon: ROTATE(20), aria: 'Rotate' }, '✕': { icon: CLOSE(20), aria: 'Deselect' } }
  return (
    <div role="toolbar" aria-label="Selected piece" style={{ display: 'flex', gap: 8, padding: 6, borderRadius: 26, background: dock.fill, border: `1px solid ${dock.border}`, boxShadow: `0 6px 18px ${visual.hud.shadow}`, pointerEvents: 'auto' }}>
      {buttons.map((b) => {
        const g = GLYPH[b.label]
        return (
          <button key={b.label} disabled={b.disabled} aria-label={g?.aria ?? b.label} onClick={b.onClick} style={{ ...FONT, width: 40, height: 40, padding: 0, borderRadius: '50%', border: `2px solid ${b.label === '🗑' ? visual.hud.urgent : visual.tokens.ghostBorder}`, background: visual.hud.panel, color: b.label === '🗑' ? visual.hud.urgent : visual.hud.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: b.disabled ? 0.4 : 1 }}>
            {g?.icon ?? b.label}
          </button>
        )
      })}
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
  /** The Strategies tray's cards while it is open; absent when closed. */
  strategies?: StrategyCard[]
  confirm: boolean
  mapOpen: boolean
  /** Player 2 is at the bottom of the screen: the stage is turned, so the shell sits at the stage's top. */
  flipped: boolean
  onRecenter(): void
  onOffenceArm(item: OffenceItemSpec['item']): void
  onConfirm(): void
  onDefenceToggle(): void
  onDefenceArm(item: Item): void
  /** Buy a Subterfuge item. */
  onSubterfuge(item: SubterfugeItem): void
  /** Refund `count` Move points. */
  onRefund(count: number): void
  /** Open or close the Strategies tray. */
  onStrategies(): void
  /** Drop a Strategy in. */
  onStrategy(id: string): void
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

/**
 * The in-match controls: one dock at the bottom of the screen, only for the active viewer, plus what floats over the pitch above it (the Strategies tray, the
 * selected piece's controls, Confirm, the map hint). Mount inside the rotating stage. Flipped, it sits at the stage's top and runs in reverse, so the floating rows stay on the pitch side.
 *
 * The dock has two rows: the status row (balance, round and phase, clock, Recenter, and the turn's primary pill) and the action row, which depends on `hud.dock`:
 * a build turn gets the Build tools and Strategies; play gets the shots, Refund, Powerup and Subterfuge; a Rearrange turn and a defence choice get a prompt.
 */
export function Shell({ hud: m, offence, defence, subterfuge, strategies, confirm, mapOpen, flipped, onRecenter, onOffenceArm, onConfirm, onDefenceToggle, onDefenceArm, onSubterfuge, onRefund, onStrategies, onStrategy, className, style, children }: ShellProps) {
  const color = visual.player.colors[m.active]
  const buttons = m.buttons ?? []
  const done = m.dock === 'build' || m.dock === 'rearrange' ? buttons.find((b) => b.label === 'Done') : undefined
  const choices = m.dock === 'choice' ? buttons : []
  const building = m.dock === 'build' && !!defence?.available
  const auto: CSSProperties = { pointerEvents: 'auto' }
  const radius = `${flipped ? 0 : dock.cornerPx}px ${flipped ? 0 : dock.cornerPx}px ${flipped ? dock.cornerPx : 0}px ${flipped ? dock.cornerPx : 0}px`
  const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: dock.gapPx + 2, minWidth: 0 }
  return (
    <div className={className} style={{ position: 'absolute', left: 0, right: 0, [flipped ? 'top' : 'bottom']: 0, display: 'flex', flexDirection: flipped ? 'column-reverse' : 'column', alignItems: 'center', gap: visual.hud.gap, pointerEvents: 'none', color: visual.hud.ink, ...style }}>
      {building && strategies && <StrategyTray cards={strategies} color={color} unit={m.balance?.unit ?? 'CR'} turned={m.active === 2 && !flipped} onApply={onStrategy} style={{ alignSelf: 'stretch', padding: `4px ${dock.padPx}px` }} />}
      {defence?.selection && <SelectionBar buttons={defence.selection.buttons} />}
      {confirm && <Primary spec={{ label: 'Confirm', onClick: onConfirm }} color={color} icon={CHECK(18)} />}
      {mapOpen && <MapHint />}
      {children && <div style={auto}>{children}</div>}
      <div data-testid="dock" data-dock={m.dock} style={{ ...FONT, ...auto, alignSelf: 'stretch', boxSizing: 'border-box', display: 'flex', flexDirection: flipped ? 'column-reverse' : 'column', gap: dock.rowGapPx, padding: `${dock.padPx}px ${dock.padPx}px`, [flipped ? 'paddingTop' : 'paddingBottom']: `max(${dock.padPx}px, env(safe-area-inset-bottom))`, background: dock.fill, [flipped ? 'borderBottom' : 'borderTop']: `1px solid ${dock.border}`, borderRadius: radius, boxShadow: `0 ${flipped ? 8 : -8}px 24px ${visual.hud.shadow}` }}>
        <div data-testid="status-row" style={row}>
          {m.balance && <CreditsChip balance={m.balance} color={color} />}
          <Status m={m} />
          {m.clock && <Clock clock={m.clock} />}
          <Recenter onClick={onRecenter} />
          {done && <Primary spec={done} color={color} icon={CHECK(18)} label="OK" aria="Done" />}
        </div>
        <div data-testid="action-row" style={{ ...row, minHeight: dock.tilePx }}>
          {m.dock === 'build' && defence && <div style={{ flex: 1, minWidth: 0 }}><BuildTools defence={defence} color={color} trayOpen={!!strategies} strategies={!!defence.available} onToggle={onDefenceToggle} onArm={onDefenceArm} onStrategies={onStrategies} /></div>}
          {m.dock === 'rearrange' && <Prompt text="Drag your pieces to new spots, then OK" />}
          {m.dock === 'choice' && (choices.length ? choices.map((b) => <Primary key={b.label} spec={b} color={color} grow />) : <Prompt text="Waiting for the defence choice" />)}
          {m.dock === 'play' && (
            <>
              <ShotPips left={m.shotsLeft} max={m.shotsMax} color={color} />
              {m.refundRate !== null && <RefundButton rate={m.refundRate} left={m.shotsLeft} refundable={m.refundable} color={color} onRefund={onRefund} />}
              <span style={{ flex: 1 }} />
              <OffenceCircle offence={offence} color={color} flipped={flipped} onArm={onOffenceArm} />
              {subterfuge && <SubterfugeCircle subterfuge={subterfuge} color={color} flipped={flipped} onBuy={onSubterfuge} />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Prompt({ text }: { text: string }) {
  return <div style={{ flex: 1, minWidth: 0, fontSize: 12, letterSpacing: '0.08em', color: visual.tokens.muted, textAlign: 'center', ...ELLIPSIS }}>{text}</div>
}
