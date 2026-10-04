import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { visual } from '../../config/visual'
import type { SideMenuView } from '../../game/view/sideMenu'
import { Button, FONT } from '../ButtonRow'

const { sideMenu, tokens } = visual

/** The ☰ ghost button that opens the Side menu. Mount inside the rotating stage: it sits at the stage's top-left, which is the viewer's left whichever seat is at the bottom. */
export function SideMenuButton({ onOpen, className, style }: { onOpen(): void; className?: string; style?: CSSProperties }) {
  return (
    <button aria-label="Menu" className={className} onClick={onOpen} style={{ ...FONT, position: 'absolute', top: sideMenu.buttonInsetPx, left: sideMenu.buttonInsetPx, width: sideMenu.buttonPx, height: sideMenu.buttonPx, padding: 0, borderRadius: '50%', border: `2px solid ${tokens.ghostBorder}`, background: 'transparent', color: tokens.ghostGlyph, fontSize: 20, cursor: 'pointer', pointerEvents: 'auto', ...style }}>
      ☰
    </button>
  )
}

export type SideMenuProps = {
  menu: SideMenuView
  onResume(): void
  onHelp(): void
  /** Hot-seat only; offered only when `menu.hotSeat`. */
  onRestart(): void
  onQuit(): void
  className?: string
  style?: CSSProperties
  /** Device settings (the flip toggle) go here, between the match's settings and Restart. */
  children?: ReactNode
}

/** The in-match Side menu: Resume, Help, the match's settings (read-only), the device settings, Restart (hot-seat only) and Quit to the Title screen. Mount inside the rotating stage so it opens from the viewer's left. Restart and Quit ask for a second tap, so a stray touch cannot end the match. Esc resumes. */
export function SideMenu({ menu, onResume, onHelp, onRestart, onQuit, className, style, children }: SideMenuProps) {
  const [armed, setArmed] = useState<'restart' | 'quit'>()
  useEffect(() => {
    if (!menu.open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onResume()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu.open, onResume])
  useEffect(() => setArmed(undefined), [menu.open])
  if (!menu.open) return null
  const confirm = (which: 'restart' | 'quit', label: string, go: () => void) => ({ label: armed === which ? `${label}? Tap again` : label, onClick: () => (armed === which ? go() : setArmed(which)) })
  const wide: CSSProperties = { width: '100%' }
  return (
    <div className={className} style={{ ...FONT, position: 'absolute', inset: 0, zIndex: sideMenu.z, display: 'flex', pointerEvents: 'auto', ...style }}>
      <nav aria-label="Side menu" style={{ boxSizing: 'border-box', width: `min(80%, ${sideMenu.panelMaxPx}px)`, height: '100%', overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, background: visual.hud.panel, color: visual.hud.ink, borderRight: `2px solid ${tokens.ghostBorder}` }}>
        <Button spec={{ label: 'Resume', onClick: onResume }} style={wide} />
        <Button spec={{ label: 'Help', onClick: onHelp }} style={wide} />
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 12px', color: tokens.muted }}>
          {menu.settings.map(({ label, value }) => (
            <div key={label} style={{ display: 'contents' }}>
              <dt>{label}</dt>
              <dd style={{ margin: 0, color: visual.hud.ink }}>{value}</dd>
            </div>
          ))}
        </dl>
        {children}
        {menu.hotSeat && <Button spec={confirm('restart', 'Restart', onRestart)} style={wide} />}
        <Button spec={confirm('quit', 'Quit to title', onQuit)} style={wide} />
      </nav>
      {/* The rest of the stage is a backdrop: a tap on it resumes, and nothing reaches the board. */}
      <div aria-hidden onClick={onResume} style={{ flex: 1, background: visual.hud.scrimLight }} />
    </div>
  )
}
