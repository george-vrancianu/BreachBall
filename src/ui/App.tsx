import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { visual } from '../config/visual'
import { LocalDriver } from '../game/driver'
import { Game, type HudView } from '../game/Game'
import { showConnectScreen } from '../net/connectScreen'
import { defaultSettings, type Settings } from '../game/view/settings'
import { loadTabletop } from '../game/deviceSettings'
import { safeAreaVars } from '../game/view/safeInsets'
import { stageLayers } from '../game/view/stageLayers'
import { DefenceBar } from './hud/DefenceBar'
import { ResourceBar } from './hud/ResourceBar'
import { Shell } from './hud/Shell'
import { Minimap } from './hud/Minimap'
import { SideMenu, SideMenuButton } from './hud/SideMenu'
import { QueuedIcons } from './hud/QueuedIcons'
import { Overlay } from './overlays/Overlay'
import { TabletopToggle } from './ButtonRow'
import { HelpScreen, MatchEndScreen, SettingsScreen, TitleScreen } from './screens/Screens'

type Screen = 'title' | 'settings' | 'help' | 'end' | undefined

/** A full-screen layer of the stage, turned `angle` degrees. */
const layerStyle = (angle: number, style?: CSSProperties): CSSProperties => ({ position: 'fixed', inset: 0, transform: `rotate(${angle}deg)`, ...style })

/** The Tabletop handover's fade on an edge strip or corner chip: `chrome` is its opacity (1 at rest, leaving it untouched), and it takes no taps while faded. */
const fade = (chrome: number): CSSProperties | undefined => (chrome < 1 ? { opacity: chrome, pointerEvents: 'none' } : undefined)

/** Owns the canvas, the Game and the HUD view. Game pushes the view up; the layers drive it back through `actions`. */
export function App() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const game = useRef<Game>(null)
  const [view, setView] = useState<HudView>()
  // The match runs behind the title; the end screen shows when a match is won while no screen is up.
  const [screen, setScreen] = useState<Screen>('title')
  // Lasts the session: Menu then Play shows the last choices.
  const [settings, setSettings] = useState<Settings>(defaultSettings)

  useEffect(() => {
    const g = new Game(canvas.current!, (sink) => new LocalDriver(sink), setView)
    game.current = g
    document.getElementById('splash')?.remove()
    return () => g.destroy()
  }, [])

  useEffect(() => {
    if (view?.winner && !screen) setScreen('end')
  }, [view?.winner, screen])

  const actions = () => game.current!.actions
  const tabletop = view ? view.tabletop : loadTabletop()
  const { canvasAngle, hudAngle } = stageLayers({ tabletop, stageAngle: view?.angle ?? 0, seatAngle: view?.seatAngle ?? 0 })

  return (
    <>
      <div data-testid="canvas-layer" style={layerStyle(canvasAngle)}>
        <canvas ref={canvas} />
      </div>
      {/* The HUD layer sits over the canvas and passes pointer input through; its controls opt back in. It sets the safe-area insets as variables by the physical edge each of its sides is on, so they swap with its turn. The overlay goes under the shell so the controls stay tappable during a hold. In Tabletop mode only this layer turns at a handover, to face the active player; with it off both layers turn together. */}
      <div data-testid="hud-layer" style={layerStyle(hudAngle, { pointerEvents: 'none', ...safeAreaVars(hudAngle) })}>
        {view && (
          <>
            <Overlay view={view.overlay} flipped={view.flipped} resourceBar={!!view.hud.resourceBar} style={fade(view.slide.chrome)} />
            <DefenceBar bar={view.hud.defenceBar} flipped={view.flipped} style={fade(view.slide.chrome)} />
            {view.hud.resourceBar && <ResourceBar bar={view.hud.resourceBar} flipped={view.flipped} style={fade(view.slide.chrome)} />}
            {view.subterfuge && <QueuedIcons queued={view.subterfuge.queued} flipped={view.flipped} style={fade(view.slide.chrome)} />}
            <Shell
              hud={view.hud}
              offence={view.offence}
              defence={view.defence}
              subterfuge={view.subterfuge}
              strategies={view.strategies}
              confirm={view.confirm}
              mapOpen={view.mapOpen}
              flipped={view.flipped}
              style={view.slide.dock > 0 ? { transform: `translateY(${view.slide.dock * 100}%)` } : undefined}
              onRecenter={() => actions().recenter()}
              onOffenceArm={(item) => actions().offence.arm(item)}
              onRefund={(n) => actions().refund(n)}
              onConfirm={() => actions().confirmBall()}
              onDefenceToggle={() => actions().build.toggle()}
              onDefenceArm={(item) => actions().build.arm(item)}
              onSubterfuge={(item) => actions().subterfuge(item)}
              onStrategies={() => actions().strategies.toggle()}
              onStrategy={(id) => actions().strategies.apply(id)}
            />
            {/* The minimap chip (top-left) and ☰ (top-right) sit level with each other, under the far-edge bars. */}
            {!screen && <Minimap minimap={view.minimap} open={view.mapOpen} color={visual.player.colors[view.hud.active]} flipped={view.flipped} resourceBar={!!view.hud.resourceBar} onToggle={() => actions().map()} style={fade(view.slide.chrome)} />}
            {/* Both sit in the HUD layer, so they turn with the flip and open from the viewer's left. */}
            {!screen && !view.menu.open && <SideMenuButton flipped={view.flipped} resourceBar={!!view.hud.resourceBar} onOpen={() => actions().menu(true)} style={fade(view.slide.chrome)} />}
            {!screen && <SideMenu menu={view.menu} onResume={() => actions().menu(false)} onHelp={() => setScreen('help')} onRestart={() => actions().restart()} onQuit={() => (actions().quit(), setScreen('title'))}>
              {view.menu.hotSeat && <TabletopToggle on={view.tabletop} onChange={(on) => actions().tabletop(on)} />}
            </SideMenu>}
          </>
        )}
      </div>
      {/* Online opens the Host/Join overlay as-is; a connection does nothing yet, online play is the next wave (specs.md). */}
      {screen === 'title' && <TitleScreen onPlay={() => setScreen('settings')} onOnline={() => showConnectScreen(() => {})} onSettings={() => setScreen('settings')} onHelp={() => setScreen('help')} />}
      {screen === 'help' && <HelpScreen onBack={() => setScreen(view?.menu.open ? undefined : 'title')} />}
      {screen === 'settings' && <SettingsScreen settings={settings} onChange={setSettings} tabletop={tabletop} onTabletop={(on) => actions().tabletop(on)} onStart={() => (actions().start(settings), setScreen(undefined))} />}
      {screen === 'end' && view?.winner && <MatchEndScreen winner={view.winner} result={view.result} onRematch={() => (actions().rematch(), setScreen(undefined))} onMenu={() => setScreen('title')} />}
    </>
  )
}
