import type { CSSProperties, ReactNode } from 'react'
import { visual } from '../../config/visual'
import type { BuildMenu as BuildMenuView } from '../../game/view/buildMenu'
import type { ButtonSpec } from '../../game/view/hudModel'
import { Button, FONT } from '../ButtonRow'

const ROUND: CSSProperties = { ...FONT, width: 52, height: 52, borderRadius: '50%', border: `2px solid ${visual.hud.ink}`, color: visual.hud.ink, background: visual.hud.panel, fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, boxShadow: `0 2px 8px ${visual.hud.shadow}` }

const svg = (size: number, d: ReactNode) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{d}</svg>
// A small brick wall.
const WALL = svg(26, <><rect x="2" y="4" width="20" height="16" rx="1" /><path d="M2 9.3h20M2 14.7h20M8 4v5.3M16 4v5.3M12 9.3v5.4M8 14.7V20M16 14.7V20" /></>)
// Drawn rather than an emoji, which some fonts lack.
const GLYPHS: Record<string, { icon: ReactNode; aria: string }> = { '🗑': { icon: svg(22, <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />), aria: 'Demolish' } }

const Round = ({ spec }: { spec: ButtonSpec }) => {
  const g = GLYPHS[spec.label]
  return <Button spec={spec} aria={g?.aria} style={ROUND}>{g?.icon ?? spec.label}</Button>
}

/** The builder's menu: a Build button that opens the piece list, or the buttons for the selected piece. */
export function BuildMenu({ menu, onToggle, className, style, children }: { menu: BuildMenuView; onToggle(): void; className?: string; style?: CSSProperties; children?: ReactNode }) {
  const row: CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', ...style }
  if (menu.kind === 'selected') {
    return (
      <div className={className} style={row}>
        {menu.buttons.map((s) => <Round key={s.label} spec={s} />)}
        {children}
      </div>
    )
  }
  return (
    <div className={className} style={row}>
      {menu.open && menu.items.map((s) => <Button key={s.label} spec={s} style={{ minHeight: 44, borderRadius: 22 }} />)}
      <button aria-label={menu.open ? 'Leave building' : 'Build'} onClick={onToggle} style={ROUND}>{menu.open ? '✕' : WALL}</button>
      {children}
    </div>
  )
}
