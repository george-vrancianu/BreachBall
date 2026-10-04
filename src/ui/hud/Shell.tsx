import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { visual } from '../../config/visual'
import type { DefenceCircle as DefenceCircleView, Item } from '../../game/view/defenceCircle'
import type { HudModel } from '../../game/view/hudModel'
import type { PlayerId, PowerUp } from '../../game/Game'
import { Button, ButtonRow, FONT } from '../ButtonRow'
import { DefenceCircle } from './DefenceCircle'

const ICONS: Record<PowerUp, string> = { breaker: 'B', repulsor: 'R', steal: 'S' }
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

function Clock({ clock }: { clock: HudModel['clock'] }) {
  const urgent = !!clock && clock.seconds <= visual.hud.urgentSeconds
  return (
    <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: visual.hud.dark, position: 'relative', background: ring(clock?.fraction ?? 0, urgent ? visual.hud.urgent : undefined), transform: urgent ? `scale(${1 + visual.hud.urgentPulse * Math.abs(Math.sin(Math.PI * clock.seconds))})` : undefined }}>
      {clock ? Math.ceil(clock.seconds) : '-'}
    </div>
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

export type ShellProps = {
  hud: HudModel
  defence?: DefenceCircleView
  confirm: boolean
  mapOpen: boolean
  /** Player 2 is at the bottom of the screen: the stage is turned, so the shell sits at the stage's top. */
  flipped: boolean
  onMap(): void
  onRecenter(): void
  onPowerUp(p: PowerUp): void
  onConfirm(): void
  onMapStretch(): void
  onMapClose(): void
  onDefenceToggle(): void
  onDefenceArm(item: Item): void
  /** Refund `count` Move points. */
  onRefund(count: number): void
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

/** The in-match controls, in one shell at the bottom of the screen and only for the active viewer. Mount inside the rotating stage. Flipped, the rows run in reverse so the Defence circle is always the row nearest the pitch, where its column opens over the pitch and not the HUD. */
export function Shell({ hud: m, defence, confirm, mapOpen, flipped, onMap, onRecenter, onPowerUp, onConfirm, onMapStretch, onMapClose, onDefenceToggle, onDefenceArm, onRefund, className, style, children }: ShellProps) {
  const color = visual.player.colors[m.active]
  const live = m.breaker.tappable
  const row: CSSProperties = { ...FONT, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12, pointerEvents: 'auto' }
  const auto: CSSProperties = { pointerEvents: 'auto' }
  return (
    <div className={className} style={{ position: 'absolute', left: 0, right: 0, [flipped ? 'top' : 'bottom']: 0, display: 'flex', flexDirection: flipped ? 'column-reverse' : 'column', alignItems: 'center', gap: visual.hud.gap, padding: visual.hud.gap, pointerEvents: 'none', color: visual.hud.ink, ...style }}>
      {defence && <DefenceCircle defence={defence} color={color} flipped={flipped} onToggle={onDefenceToggle} onArm={onDefenceArm} style={auto} />}
      {confirm && <ButtonRow specs={[{ label: 'Confirm', onClick: onConfirm }]} style={auto} />}
      {mapOpen && <ButtonRow specs={[{ label: 'Stretch', onClick: onMapStretch }, { label: 'Close', onClick: onMapClose }]} style={auto} />}
      {m.buttons?.length ? <ButtonRow specs={m.buttons} style={auto} /> : null}
      <div style={row}>
        {m.round !== null && <div>{`Round ${m.round} / ${m.rounds}`}</div>}
        <Clock clock={m.clock} />
        <MoveDots left={m.shotsLeft} max={m.shotsMax} refundable={m.refundable} onRefund={onRefund} />
        <div>{m.phase}</div>
        <ButtonRow specs={[{ label: 'Map', onClick: onMap }, { label: 'Recenter', onClick: onRecenter }]} />
      </div>
      <div style={{ ...row, gap: 16, color }}>
        {([1, 2] as PlayerId[]).map((id) => <Digit key={id} value={m.players[id].digit} color={visual.player.colors[id]} />)}
        {(Object.keys(ICONS) as PowerUp[]).map((p) => {
          const n = m.players[m.active].inventory[p]
          const armed = p === 'breaker' && m.breaker.armed
          return (
            <Button key={p} spec={{ label: ICONS[p], onClick: () => onPowerUp(p), disabled: p === 'breaker' && !live }} style={{ position: 'relative', width: 44, height: 44, padding: 0, borderRadius: '50%', border: `2px solid ${color}`, color: armed ? visual.hud.dark : color, background: armed ? color : 'none', opacity: n > 0 ? 1 : 0.35 }}>
              {ICONS[p]}
              <span style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, borderRadius: 9, background: color, color: visual.hud.dark, fontSize: 12 }}>{n}</span>
            </Button>
          )
        })}
      </div>
      {children && <div style={auto}>{children}</div>}
    </div>
  )
}
