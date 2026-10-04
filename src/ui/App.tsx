import { useEffect, useRef, useState } from 'react'
import { LocalDriver } from '../game/driver'
import { Game, type HudView } from '../game/Game'
import { showConnectScreen } from '../net/connectScreen'
import { defaultSettings, type Settings } from '../game/view/settings'
import { DefenceBar } from './hud/DefenceBar'
import { ResourceBar } from './hud/ResourceBar'
import { Shell } from './hud/Shell'
import { Overlay } from './overlays/Overlay'
import { HelpScreen, MatchEndScreen, SettingsScreen, TitleScreen } from './screens/Screens'

type Screen = 'title' | 'settings' | 'help' | 'end' | undefined

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

  return (
    <>
      {/* The overlay goes under the shell so the controls stay tappable during a card. The stage rotates as one: canvas, in-match HUD and overlay (the 180-degree handover flip). */}
      <div style={{ position: 'fixed', inset: 0, transform: `rotate(${view?.angle ?? 0}deg)` }}>
        <canvas ref={canvas} />
        {view && (
          <>
            <Overlay view={view.overlay} flipped={view.flipped} resourceBar={!!view.hud.resourceBar} onTap={() => actions().dismiss()} />
            <DefenceBar bar={view.hud.defenceBar} flipped={view.flipped} />
            {view.hud.resourceBar && <ResourceBar bar={view.hud.resourceBar} flipped={view.flipped} />}
            <Shell
              hud={view.hud}
              offence={view.offence}
              defence={view.defence}
              confirm={view.confirm}
              mapOpen={view.mapOpen}
              flipped={view.flipped}
              onMap={() => actions().map()}
              onRecenter={() => actions().recenter()}
              onOffenceArm={(item) => actions().offence.arm(item)}
              onRefund={(n) => actions().refund(n)}
              onConfirm={() => actions().confirmBall()}
              onMapStretch={() => actions().mapStretch()}
              onMapClose={() => actions().map(false)}
              onDefenceToggle={() => actions().build.toggle()}
              onDefenceArm={(item) => actions().build.arm(item)}
            />
          </>
        )}
      </div>
      {/* Online opens the Host/Join overlay as-is; a connection does nothing yet, online play is the next wave (specs.md). */}
      {screen === 'title' && <TitleScreen onPlay={() => setScreen('settings')} onOnline={() => showConnectScreen(() => {})} onSettings={() => setScreen('settings')} onHelp={() => setScreen('help')} />}
      {screen === 'help' && <HelpScreen onBack={() => setScreen('title')} />}
      {screen === 'settings' && <SettingsScreen settings={settings} onChange={setSettings} onStart={() => (actions().start(settings), setScreen(undefined))} />}
      {screen === 'end' && view?.winner && <MatchEndScreen winner={view.winner} result={view.result} onRematch={() => (actions().rematch(), setScreen(undefined))} onMenu={() => setScreen('title')} />}
    </>
  )
}
