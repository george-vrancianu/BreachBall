import type { CSSProperties, ReactNode } from 'react'
import { visual } from '../config/visual'
import type { ButtonSpec } from '../game/view/hudModel'

export const FONT: CSSProperties = { font: `700 14px ${visual.hud.font}`, textTransform: 'uppercase', fontVariantNumeric: 'tabular-nums' }

/** A ghost circle button: a `px` circle with a ghost border and glyph, no fill. The Title screen's Settings and Help, and the in-match ☰. */
export const ghostCircle = (px: number): CSSProperties => ({ ...FONT, width: px, height: px, borderRadius: '50%', border: `2px solid ${visual.tokens.ghostBorder}`, background: 'transparent', color: visual.tokens.ghostGlyph, fontSize: visual.sideMenu.glyphPx, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer' })

type Look = { className?: string; style?: CSSProperties; children?: ReactNode }

/** One button of the flat style; `pressed` marks a toggle that is on. */
export function Button({ spec, aria, className, style, children }: { spec: ButtonSpec; aria?: string } & Look) {
  const { ink, panel, pressed, pressedBorder } = visual.hud
  return (
    <button
      className={className}
      disabled={spec.disabled}
      aria-label={aria}
      aria-pressed={spec.pressed}
      onClick={spec.onClick}
      style={{ ...FONT, minWidth: 44, minHeight: 44, padding: '0 14px', borderRadius: 8, border: `2px solid ${spec.pressed ? pressedBorder : ink}`, color: ink, background: spec.pressed ? pressed : panel, opacity: spec.disabled ? 0.4 : 1, ...style }}
    >
      {children ?? spec.label}
    </button>
  )
}

/** A row of buttons, shared by the phase row and the screens. */
export function ButtonRow({ specs, className, style, children }: { specs: ButtonSpec[] } & Look) {
  return (
    <div className={className} style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', ...style }}>
      {specs.map((s) => <Button key={s.label} spec={s} />)}
      {children}
    </div>
  )
}
