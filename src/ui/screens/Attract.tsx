import { useEffect, useRef, useState, type ReactNode } from 'react'
import { visual } from '../../config/visual'
import { FONT } from '../ButtonRow'
import { createAttract, position, step, type Attract, type Piece, type Side } from './attract'

const { tokens, attract: cfg } = visual
const COLOR: Record<Side, string> = { 1: visual.player.colors[1], 2: visual.player.colors[2] }
const WORDMARK_FONT = `72px ${visual.hud.display}`
const deg = (rad: number) => (rad * 180) / Math.PI

/** The hero frame: the halfway line and the centre rings, `children` on the ring, then the wordmark on top so pieces pass behind it. Drawn in a 390-wide frame around the ring's centre; the halfway line runs past it to the screen edges. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <svg role="img" aria-label="BreachBall" viewBox="0 80 390 420" overflow="visible" style={{ flex: '1 1 0', minHeight: 0, width: '100%' }}>
      <g transform="translate(195 330)">
        <line x1={-2195} x2={2195} y1={0} y2={0} stroke={tokens.lines} strokeWidth={3} />
        <circle r={cfg.ring} fill="none" stroke={tokens.lines} strokeWidth={3} />
        <circle r={110} fill="none" stroke={tokens.lines} strokeWidth={2} strokeDasharray="4 6" />
        {children}
      </g>
      <text x={195} y={155} textAnchor="middle" fill={COLOR[1]} style={{ font: WORDMARK_FONT }}>BREACH</text>
      <text x={223} y={222} textAnchor="middle" fill={COLOR[2]} style={{ font: WORDMARK_FONT }}>BALL</text>
      <text x={195} y={262} textAnchor="middle" fill={tokens.muted} style={{ ...FONT, fontSize: 12, letterSpacing: '0.3em' }}>Build · Shoot · Breach</text>
    </svg>
  )
}

const Wall = ({ fill }: { fill: string }) => <rect x={-cfg.wall.w / 2} y={-cfg.wall.h / 2} width={cfg.wall.w} height={cfg.wall.h} rx={2} fill={fill} />

/** A tower: the side's square with its glyph cut out in the background colour, Repulsor rings or the Steal vortex (specs.md, Walls and towers). */
function Tower({ kind, fill }: { kind: 'repulsor' | 'steal'; fill: string }) {
  const half = cfg.towerPx / 2
  return (
    <>
      <rect x={-half} y={-half} width={cfg.towerPx} height={cfg.towerPx} rx={3} fill={fill} />
      {kind === 'repulsor' ? (
        visual.tower.rings.map((r) => <circle key={r} r={r * half} fill="none" stroke={tokens.bg} strokeWidth={2} />)
      ) : (
        <path d={spiral(half * 0.75)} fill="none" stroke={tokens.bg} strokeWidth={2} strokeLinecap="round" />
      )}
    </>
  )
}

/** The Steal glyph: an Archimedean spiral out to `radius`. */
function spiral(radius: number): string {
  const turns = 2.5
  const points = Array.from({ length: 40 }, (_, i) => {
    const t = (i / 39) * turns * 2 * Math.PI
    const r = (radius * i) / 39
    return `${(r * Math.cos(t)).toFixed(1)} ${(r * Math.sin(t)).toFixed(1)}`
  })
  return `M${points.join(' L')}`
}

/** A live piece on the ring: walls lie along it, towers stay upright; both scale in on arrival. */
function Live({ piece }: { piece: Piece }) {
  const { x, y } = position(piece)
  const scale = Math.min(piece.age / cfg.spawnSec, 1)
  const turn = piece.kind === 'wall' ? ` rotate(${deg(piece.angle) + 90})` : ''
  return (
    <g transform={`translate(${x} ${y})${turn} scale(${scale})`}>
      {piece.kind === 'wall' ? <Wall fill={COLOR[piece.side]} /> : <Tower kind={piece.kind} fill={COLOR[piece.side]} />}
    </g>
  )
}

/** A piece's exit: a wall's fragments fly from the hit, a Repulsor's rings burst as it fades, a Steal collapses to nothing. */
function Exit({ piece, time }: { piece: Piece & { gone: NonNullable<Piece['gone']> }; time: number }) {
  const { x, y } = position(piece)
  const fill = COLOR[piece.side]
  const { by, from, at } = piece.gone
  if (by === 'shatter') {
    const k = Math.min((time - at) / cfg.shatterSec, 1)
    const along = { x: -Math.sin(piece.angle), y: Math.cos(piece.angle) }
    const w = cfg.wall.w / cfg.fragments
    return (
      <g opacity={1 - k}>
        {Array.from({ length: cfg.fragments }, (_, i) => {
          const offset = (i - (cfg.fragments - 1) / 2) * w
          const base = { x: x + along.x * offset, y: y + along.y * offset }
          const d = Math.hypot(base.x - from.x, base.y - from.y) || 1
          const fx = base.x + ((base.x - from.x) / d) * cfg.flyPx * k
          const fy = base.y + ((base.y - from.y) / d) * cfg.flyPx * k
          return <rect key={i} x={-w / 2 + 1} y={-cfg.wall.h / 2} width={w - 2} height={cfg.wall.h} rx={2} fill={fill} transform={`translate(${fx} ${fy}) rotate(${deg(piece.angle) + 90 + (i % 2 ? 1 : -1) * 60 * k})`} />
        })}
      </g>
    )
  }
  const k = Math.min((time - at) / (by === 'burst' ? cfg.burstSec : cfg.swallowSec), 1)
  const half = cfg.towerPx / 2
  return (
    <g transform={`translate(${x} ${y})`} opacity={1 - k}>
      {by === 'burst' ? (
        <>
          <rect x={-half} y={-half} width={cfg.towerPx} height={cfg.towerPx} rx={3} fill={fill} />
          {visual.tower.rings.map((r) => <circle key={r} r={r * half + cfg.flyPx * k} fill="none" stroke={fill} strokeWidth={2} />)}
        </>
      ) : (
        <rect x={-half} y={-half} width={cfg.towerPx} height={cfg.towerPx} rx={3} fill={fill} transform={`scale(${1 - k})`} />
      )}
    </g>
  )
}

function Ball({ ball }: { ball: Attract['ball'] }) {
  const speed = Math.hypot(ball.vx, ball.vy)
  return (
    <>
      {speed > 0 && <line x1={ball.x} y1={ball.y} x2={ball.x - (ball.vx / speed) * cfg.trailPx} y2={ball.y - (ball.vy / speed) * cfg.trailPx} stroke={visual.ball.trail} strokeWidth={cfg.ballR} strokeLinecap="round" />}
      <circle cx={ball.x} cy={ball.y} r={cfg.ballR * ball.scale} fill={visual.ball.fill} />
    </>
  )
}

/** The design's still: a wall of each colour and the ball on the halfway line. */
export function StillHero() {
  const wall = (x: number, y: number, fill: string) => <rect x={-55} y={-6.5} width={110} height={13} rx={2} fill={fill} transform={`translate(${x} ${y}) rotate(-21)`} />
  return (
    <Frame>
      <circle r={cfg.ballR} fill={visual.ball.fill} />
      {wall(-80, 107, COLOR[1])}
      {wall(80, -113, COLOR[2])}
    </Frame>
  )
}

/** The Attract loop (see GLOSSARY.md), showing the still until its first frame. Runs on requestAnimationFrame while mounted and the tab is visible; the seed is the clock. */
export function AttractHero() {
  const loop = useRef<Attract>(null)
  const [scene, setScene] = useState<Attract | null>(null)
  useEffect(() => {
    loop.current ??= createAttract(Date.now())
    let raf = 0
    let last = 0
    const frame = (now: number) => {
      // Clamp the first frame and any long stall so the ball never teleports.
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0
      last = now
      loop.current = step(loop.current!, dt).state
      setScene(loop.current)
      raf = requestAnimationFrame(frame)
    }
    const start = () => {
      last = 0
      raf = requestAnimationFrame(frame)
    }
    const stop = () => cancelAnimationFrame(raf)
    const onVisibility = () => (document.hidden ? stop() : start())
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
  return !scene ? <StillHero /> : <Scene scene={scene} />
}

/** One moment of the loop. */
export function Scene({ scene }: { scene: Attract }) {
  return (
    <Frame>
      {scene.pieces.map((p) => (p.gone ? <Exit key={p.id} piece={p as Piece & { gone: NonNullable<Piece['gone']> }} time={scene.time} /> : <Live key={p.id} piece={p} />))}
      <Ball ball={scene.ball} />
    </Frame>
  )
}
