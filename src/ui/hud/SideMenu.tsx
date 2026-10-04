import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { visual } from '../../config/visual'
import type { SideMenuView } from '../../game/view/sideMenu'
import { Button, FONT, ghostCircle } from '../ButtonRow'

const { sideMenu, tokens } = visual

/** The ☰ ghost button that opens the Side menu. Mount inside the rotating stage: it sits at the stage's left, just inside the Defence bar at the far edge (below it, or above it when `flipped` puts the bar at the stage's bottom), so it never covers the bar's P1 digit. With the Resource bar shown (`resourceBar`) it sits below that too. */
export function SideMenuButton({ onOpen, flipped, resourceBar = false, className, style }: { onOpen(): void; flipped: boolean; resourceBar?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <button aria-label="Menu" className={className} onClick={onOpen} style={{ ...ghostCircle(sideMenu.buttonPx), position: 'absolute', [flipped ? 'bottom' : 'top']: visual.hud.bar.heightPx + (resourceBar ? visual.hud.bar.resourceRowPx : 0) + sideMenu.buttonInsetPx, left: sideMenu.buttonInsetPx, zIndex: sideMenu.buttonZ, pointerEvents: 'auto', ...style }}>
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
  // The latest `onResume`, so the listener is bound once per open rather than on every render.
  const resume = useRef(onResume)
  resume.current = onResume
  useEffect(() => {
    if (!menu.open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && resume.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu.open])
  useEffect(() => setArmed(undefined), [menu.open])
  if (!menu.open) return null
  const confirm = (which: 'restart' | 'quit', label: string, go: () => void) => ({ label: armed === which ? `${label}? Tap again` : label, onClick: () => (armed === which ? go() : setArmed(which)) })
  const wide: CSSProperties = { width: '100%' }
  return (
    <div className={className} style={{ ...FONT, position: 'absolute', inset: 0, zIndex: sideMenu.z, display: 'flex', pointerEvents: 'auto', ...style }}>
      <nav aria-label="Side menu" style={{ boxSizing: 'border-box', width: `min(${sideMenu.panelWidthPct}%, ${sideMenu.panelMaxPx}px)`, height: '100%', overflowY: 'auto', padding: sideMenu.panelPadPx, display: 'flex', flexDirection: 'column', gap: sideMenu.gapPx, background: visual.hud.panel, color: visual.hud.ink, borderRight: `2px solid ${tokens.ghostBorder}` }}>
        <Button spec={{ label: 'Resume', onClick: onResume }} style={wide} />
        <Button spec={{ label: 'Help', onClick: onHelp }} style={wide} />
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr auto', gap: sideMenu.rowGap, color: tokens.muted }}>
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
