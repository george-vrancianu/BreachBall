import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { visual } from '../../config/visual'
import type { DefenceCircle as DefenceCircleView, Item, SelectionAction, SelectionButton } from '../../game/view/defenceCircle'
import { type ButtonSpec, type HudModel } from '../../game/view/hudModel'
import type { OffenceCircle as OffenceCircleView, OffenceItemSpec } from '../../game/view/offenceCircle'
import type { StrategyCard } from '../../game/view/strategies'
import type { SubterfugeCircle as SubterfugeCircleView } from '../../game/view/subterfugeCircle'
import type { SubterfugeItem } from '../../game/Game'
import { FONT } from '../ButtonRow'
import { CHECK, CLOSE, CREDIT, LAYERS, LOCK, PIECE_ICON, RECENTER, REFUND, ROTATE, TOWER, TRASH } from './icons'
import { noMenu } from './press'
import { AbilityBar } from './AbilityBar'
import { StrategyTray } from './StrategyTray'
import { tileBadge, tileLabel, tileStyle } from './tile'

const ELLIPSIS: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const ring = (f: number, color: string = visual.hud.ink) => `conic-gradient(${color} ${f * 360}deg,${visual.hud.track} 0)`
const { dock } = visual.hud
/** Each selection control's glyph. */
const SELECTION_ICON: Record<SelectionAction, (size: number) => ReactNode> = { demolish: TRASH, rotate: ROTATE, deselect: CLOSE }

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
  const chip = dock.credits
  useEffect(() => {
    if (last.current !== balance.amount) ref.current?.animate?.([{ transform: `scale(${chip.pop.scale})` }, { transform: 'scale(1)' }], chip.pop.ms)
    last.current = balance.amount
  }, [balance.amount])
  return (
    <div role="status" aria-label={`${balance.amount} ${balance.unit}`} style={{ ...FONT, flex: 'none', boxSizing: 'border-box', height: dock.chipPx, padding: `0 ${chip.padEndPx}px 0 ${chip.padStartPx}px`, display: 'flex', alignItems: 'center', gap: chip.gapPx, borderRadius: dock.chipPx / 2, border: `${chip.borderPx}px solid ${color}`, background: `linear-gradient(135deg, ${color}2e, ${color}0a 60%)`, color: visual.hud.ink, boxShadow: `inset 0 0 ${chip.glowPx}px ${color}22` }}>
      <span style={{ width: chip.tokenPx, height: chip.tokenPx, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: color, color: visual.hud.dark }}>{CREDIT(chip.iconPx)}</span>
      <span ref={ref} style={{ fontFamily: visual.hud.display, fontSize: dock.creditFontPx, lineHeight: 1, display: 'inline-block' }}>{balance.amount}</span>
      <span style={{ fontSize: chip.unitFontPx, letterSpacing: `${chip.unitSpacingEm}em`, color: visual.tokens.muted }}>{balance.unit}</span>
    </div>
  )
}

/** The primary pill of a dock (OK to submit the build; Repair or Rearrange): filled in the player's colour, a check when it submits. */
function Primary({ spec, color, icon, label, aria, grow = false }: { spec: ButtonSpec; color: string; icon?: ReactNode; label?: string; aria?: string; /** Fill the space it is given (the defence choice's two halves). */ grow?: boolean }) {
  const off = !!spec.disabled
  const pill = dock.primary
  return (
    <button disabled={spec.disabled} aria-label={aria ?? spec.label} onClick={spec.onClick} style={{ ...FONT, flex: grow ? 1 : 'none', boxSizing: 'border-box', minWidth: dock.okMinPx, height: grow ? pill.choicePx : dock.chipPx, padding: `0 ${pill.padPx}px`, borderRadius: dock.chipPx / 2, border: `${pill.borderPx}px solid ${off ? visual.tokens.ghostBorder : color}`, background: off ? 'transparent' : color, color: off ? visual.tokens.muted : visual.hud.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: pill.gapPx, fontSize: pill.fontPx, letterSpacing: `${pill.spacingEm}em`, boxShadow: off ? 'none' : `0 0 ${pill.glowPx}px ${color}55`, cursor: off ? 'default' : 'pointer', pointerEvents: 'auto' }}>
      {icon}
      {label ?? spec.label}
    </button>
  )
}

/** The Move points left this possession: a ball per point, filled while unspent. */
function ShotPips({ left, max, color }: { left: number; max: number; color: string }) {
  const { px, borderPx, glowPx, gapPx, labelGapPx, shine, shade } = dock.shots
  return (
    <div role="img" aria-label={`${left} of ${max} shots left`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: labelGapPx }}>
      <div style={{ display: 'flex', gap: gapPx }}>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} style={{ width: px, height: px, boxSizing: 'border-box', borderRadius: '50%', border: `${borderPx}px solid ${i < left ? visual.ball.fill : visual.tokens.ghostBorder}`, background: i < left ? `radial-gradient(circle at 35% 35%, ${shine}, ${visual.ball.fill} 60%, ${shade})` : 'none', boxShadow: i < left ? `0 0 ${glowPx}px ${color}66` : 'none' }} />
        ))}
      </div>
      <span style={{ ...tileLabel, color: visual.tokens.muted }}>{`Shots ${left}/${max}`}</span>
    </div>
  )
}

/** Refund: trades a Move point for Credits. A tap refunds one; a long-press refunds all but one (none when one is left, which `onRefund(0)` reports). Greyed when a refund is not allowed now. */
function RefundButton({ rate, unit, left, refundable, color, onRefund }: { rate: number; /** The balance's chip unit. */ unit: string; left: number; refundable: boolean; color: string; onRefund(count: number): void }) {
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
      style={{ ...tileStyle({ color, available: refundable }), width: dock.refundPx, ...(pressed && { background: visual.hud.pressed, borderColor: visual.hud.pressedBorder }), ...(refundable && { borderColor: color }) }}
    >
      <span style={{ color: refundable ? color : 'inherit', display: 'flex' }}>{REFUND(dock.iconPx)}</span>
      <span style={tileLabel}>{`+${rate} ${unit}`}</span>
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

/** The Build tile (a chess rook): filled in build mode; tap to enter or leave it. Greyed (and inert) when the viewer cannot build now, e.g. in play after the round's first shot. */
function BuildTile({ defence, color, onToggle }: { defence?: DefenceCircleView; color: string; onToggle(): void }) {
  const available = !!defence?.available
  const building = !!defence?.building
  return (
    <button aria-label={building ? 'Leave building' : 'Build'} aria-pressed={building} aria-disabled={!available} onClick={() => available && onToggle()} onContextMenu={noMenu} style={tileStyle({ color, active: building && available, available })}>
      {TOWER(dock.iconPx)}
      <span style={tileLabel}>Build</span>
    </button>
  )
}

/** The build dock's tool row: Build (a chess rook) on the left, then the pieces it can place, then Strategies on the right. */
function BuildTools({ defence, color, trayOpen, strategies, onToggle, onArm, onStrategies }: { defence: DefenceCircleView; color: string; trayOpen: boolean; strategies: boolean; onToggle(): void; onArm(item: Item): void; onStrategies(): void }) {
  const { available, items } = defence
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: dock.gapPx, minWidth: 0 }}>
      <BuildTile defence={defence} color={color} onToggle={onToggle} />
      <span aria-hidden style={{ flex: 'none', width: dock.dividerPx, height: dock.dividerHeightPx, background: dock.border, margin: `0 ${dock.dividerPadPx}px` }} />
      <div role="toolbar" aria-label="Pieces" style={{ display: 'flex', gap: dock.gapPx, minWidth: 0 }}>
        {items.map((s) => {
          const off = s.disabled || !available
          return (
            <button key={s.item} data-item={s.item} aria-label={s.soon ? `${s.label} · soon` : s.label} aria-pressed={s.pressed} aria-disabled={off} onClick={() => !off && s.item !== 'cannon' && onArm(s.item)} onContextMenu={noMenu} style={{ ...tileStyle({ color, active: s.pressed && !off, available: !off, width: dock.option.px }) }}>
              {s.soon ? LOCK(dock.option.lockPx) : PIECE_ICON[s.item](dock.iconPx)}
              <span style={{ ...tileLabel, fontSize: dock.option.labelPx, letterSpacing: `${dock.option.labelSpacingEm}em` }}>{s.name}</span>
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
function SelectionBar({ buttons }: { buttons: SelectionButton[] }) {
  const { buttonPx, buttonBorderPx, iconPx, gapPx, padPx, radiusPx, disabledOpacity } = dock.selection
  return (
    <div role="toolbar" aria-label="Selected piece" style={{ display: 'flex', gap: gapPx, padding: padPx, borderRadius: radiusPx, background: dock.fill, border: `${dock.borderPx}px solid ${dock.border}`, boxShadow: `0 ${dock.floatShadowPx.y}px ${dock.floatShadowPx.blur}px ${visual.hud.shadow}`, pointerEvents: 'auto' }}>
      {buttons.map((b) => {
        const danger = b.action === 'demolish'
        return (
          <button key={b.action} disabled={b.disabled} aria-label={b.label} onClick={b.onClick} style={{ ...FONT, width: buttonPx, height: buttonPx, padding: 0, borderRadius: '50%', border: `${buttonBorderPx}px solid ${danger ? visual.hud.urgent : visual.tokens.ghostBorder}`, background: visual.hud.panel, color: danger ? visual.hud.urgent : visual.hud.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: b.disabled ? disabledOpacity : 1 }}>
            {SELECTION_ICON[b.action](iconPx)}
          </button>
        )
      })}
    </div>
  )
}

/** A hint pill above the dock: taps pass through it to the pitch. The map's one is a single line; the first-round coaching line may wrap, so the pill grows to fit it. */
function HintPill({ text, wrap = false }: { text: string; wrap?: boolean }) {
  const { heightPx, padPx, borderPx, fontPx } = visual.hud.minimap.pill
  return <div style={{ ...FONT, fontSize: fontPx, [wrap ? 'minHeight' : 'height']: heightPx, padding: wrap ? `${padPx / 3}px ${padPx}px` : `0 ${padPx}px`, maxWidth: `calc(100% - ${2 * visual.hud.gap}px)`, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', borderRadius: heightPx / 2, border: `${borderPx}px solid ${visual.tokens.ghostBorder}`, background: visual.hud.panel, whiteSpace: wrap ? 'normal' : 'nowrap' }}>{text}</div>
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
 * selected piece's controls, Confirm, the map hint or, on the first round, the coaching hint). Mount inside the rotating stage. Flipped, it sits at the stage's top and runs in reverse, so the floating rows stay on the pitch side.
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
  const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: dock.wideGapPx, minWidth: 0 }
  // The screen-edge side clears the home indicator; longhands only, so a flip never mixes them with the `padding` shorthand.
  const safeEdge = `max(${dock.padPx}px, env(safe-area-inset-bottom))`
  return (
    <div className={className} style={{ position: 'absolute', left: 0, right: 0, [flipped ? 'top' : 'bottom']: 0, display: 'flex', flexDirection: flipped ? 'column-reverse' : 'column', alignItems: 'center', gap: visual.hud.gap, pointerEvents: 'none', color: visual.hud.ink, ...style }}>
      {/* Assumes the build dock always comes with a balance; without one the Strategies tray silently hides. */}
      {building && strategies && m.balance && <StrategyTray cards={strategies} color={color} unit={m.balance.unit} turned={m.active === 2 && !flipped} onApply={onStrategy} style={{ alignSelf: 'stretch', padding: `${dock.trayPadPx.y}px ${dock.padPx}px` }} />}
      {defence?.selection && <SelectionBar buttons={defence.selection.buttons} />}
      {confirm && <Primary spec={{ label: 'Confirm', onClick: onConfirm }} color={color} icon={CHECK(dock.primary.iconPx)} />}
      {mapOpen ? <HintPill text="Tap to jump · tap ✕ to close" /> : m.hint && <HintPill text={m.hint} wrap />}
      {children && <div style={auto}>{children}</div>}
      <div data-testid="dock" data-dock={m.dock} style={{ ...FONT, ...auto, alignSelf: 'stretch', boxSizing: 'border-box', display: 'flex', flexDirection: flipped ? 'column-reverse' : 'column', gap: dock.rowGapPx, paddingInline: dock.padPx, paddingTop: flipped ? safeEdge : dock.padPx, paddingBottom: flipped ? dock.padPx : safeEdge, background: dock.fill, [flipped ? 'borderBottom' : 'borderTop']: `${dock.borderPx}px solid ${dock.border}`, borderRadius: radius, boxShadow: `0 ${flipped ? dock.shadowPx.y : -dock.shadowPx.y}px ${dock.shadowPx.blur}px ${visual.hud.shadow}` }}>
        <div data-testid="status-row" style={row}>
          {m.balance && <CreditsChip balance={m.balance} color={color} />}
          <Status m={m} />
          {m.clock && <Clock clock={m.clock} />}
          <Recenter onClick={onRecenter} />
          {done && <Primary spec={done} color={color} icon={CHECK(dock.primary.iconPx)} label="OK" aria="OK" />}
        </div>
        <div data-testid="action-row" style={{ ...row, minHeight: dock.tilePx }}>
          {m.dock === 'build' && defence && <div style={{ flex: 1, minWidth: 0 }}><BuildTools defence={defence} color={color} trayOpen={!!strategies} strategies={!!defence.available} onToggle={onDefenceToggle} onArm={onDefenceArm} onStrategies={onStrategies} /></div>}
          {m.dock === 'rearrange' && <Prompt text="Drag your pieces to new spots, then OK" />}
          {m.dock === 'choice' && (choices.length ? choices.map((b) => <Primary key={b.label} spec={b} color={color} grow />) : <Prompt text="Waiting for the defence choice" />)}
          {m.dock === 'play' && (
            <AbilityBar
              defence={defence}
              offence={offence}
              subterfuge={subterfuge}
              color={color}
              onDefenceToggle={onDefenceToggle}
              onDefenceArm={onDefenceArm}
              onOffenceArm={onOffenceArm}
              onSubterfuge={onSubterfuge}
              trailing={
                <div style={{ display: 'flex', alignItems: 'center', gap: dock.wideGapPx }}>
                  <ShotPips left={m.shotsLeft} max={m.shotsMax} color={color} />
                  {/* Assumes refunds always come with a balance; without one the Refund button silently hides. */}
                  {m.refundRate !== null && m.balance && <RefundButton rate={m.refundRate} unit={m.balance.unit} left={m.shotsLeft} refundable={m.refundable} color={color} onRefund={onRefund} />}
                </div>
              }
            />
          )}
        </div>
      </div>
    </div>
  )
}

function Prompt({ text }: { text: string }) {
  return <div style={{ flex: 1, minWidth: 0, fontSize: dock.prompt.fontPx, letterSpacing: `${dock.prompt.spacingEm}em`, color: visual.tokens.muted, textAlign: 'center', ...ELLIPSIS }}>{text}</div>
}
