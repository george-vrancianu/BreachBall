import type { CSSProperties } from 'react'
import { rules } from '../../config/rules'
import { visual } from '../../config/visual'
import type { StrategyCard, StrategyPiece } from '../../game/view/strategies'
import { FONT } from '../ButtonRow'
import { CREDIT } from './icons'
import { NO_CALLOUT } from './press'

const { card, trayZ, wideGapPx, floatShadowPx, trayPadPx, preview } = visual.hud.dock
const { pitchWidth: W, pitchHeight: H, halfHeight: HALF, cellSize, goalLeft, goalRight, noBuildRadius, centreZoneRadius } = rules

/** One layout drawn on the builder's half, goal at the bottom (as authored for Player 1, which is what each player sees from their own end: the HUD layer turns with the active player). */
export function StrategyPreview({ pieces, color, width = card.w - card.previewInsetPx }: { pieces: StrategyPiece[]; color: string; width?: number }) {
  const line = visual.tokens.lines
  // The goal end of the half, where every layout sits; the strip by the halfway line stays out of the frame.
  const top = HALF + preview.crop
  const { margin } = preview
  return (
    <svg viewBox={`${-margin} ${top} ${W + 2 * margin} ${H - top + margin}`} width={width} height={(width * (H - top + margin)) / (W + 2 * margin)} aria-hidden style={{ display: 'block' }}>
      <rect x={0} y={HALF} width={W} height={H - HALF} rx={preview.cornerR} fill={visual.pitch.ground} stroke={line} strokeWidth={preview.outline} />
      <path d={`M${W / 2 - centreZoneRadius} ${HALF}a${centreZoneRadius} ${centreZoneRadius} 0 0 0 ${2 * centreZoneRadius} 0`} fill="none" stroke={line} strokeWidth={preview.zoneLine} />
      <path d={`M${W / 2 - noBuildRadius} ${H}a${noBuildRadius} ${noBuildRadius} 0 0 1 ${2 * noBuildRadius} 0`} fill="none" stroke={line} strokeWidth={preview.zoneLine} strokeDasharray={preview.dash.join(' ')} />
      <line x1={goalLeft} y1={H} x2={goalRight} y2={H} stroke={visual.hud.ink} strokeWidth={preview.goal} />
      {pieces.map((p, i) =>
        p.kind === 'wall' ? (
          <line key={i} x1={p.a.x} y1={p.a.y} x2={p.b.x} y2={p.b.y} stroke={color} strokeWidth={preview.wall} strokeLinecap="round" />
        ) : p.power === 'repulsor' ? (
          <circle key={i} cx={(p.at.gx + 0.5) * cellSize} cy={(p.at.gy + 0.5) * cellSize} r={cellSize * preview.repulsorCells} fill="none" stroke={color} strokeWidth={preview.repulsorLine} />
        ) : (
          <rect key={i} x={p.at.gx * cellSize - preview.stealPad} y={p.at.gy * cellSize - preview.stealPad} width={cellSize + 2 * preview.stealPad} height={cellSize + 2 * preview.stealPad} rx={preview.stealR} fill={color} />
        ),
      )}
    </svg>
  )
}

/**
 * The Strategies tray: ready-made layouts floating over the pitch above the build dock, as rounded cards with a preview, the name and the net cost.
 * A tap drops the layout in (this turn's own pieces are cleared and refunded first); a card where nothing fits is greyed, one that only partly fits says how much.
 */
export function StrategyTray({ cards, color, unit, onApply, style }: { cards: StrategyCard[]; color: string; /** The balance's short unit: CR or PTS. */ unit: string; onApply(id: string): void; style?: CSSProperties }) {
  return (
    <div role="menu" aria-label="Strategies" style={{ display: 'flex', gap: wideGapPx, padding: `${trayPadPx.y}px ${trayPadPx.x}px`, overflowX: 'auto', maxWidth: '100%', pointerEvents: 'auto', zIndex: trayZ, scrollbarWidth: 'none', ...style }}>
      {cards.map((c) => {
        const partial = !c.disabled && c.placed < c.total
        return (
          <button
            key={c.id}
            role="menuitem"
            aria-label={`${c.name}, ${c.cost} ${unit}${partial ? `, ${c.placed} of ${c.total} pieces fit` : ''}`}
            aria-disabled={c.disabled}
            onClick={() => !c.disabled && onApply(c.id)}
            style={{ ...FONT, flex: 'none', boxSizing: 'border-box', width: card.w, height: card.h, padding: card.padPx, borderRadius: card.radiusPx, border: `${card.borderPx}px solid ${c.disabled ? visual.tokens.dimOutline : visual.tokens.ghostBorder}`, background: visual.hud.dock.fill, color: c.disabled ? visual.tokens.muted : visual.hud.ink, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', boxShadow: `0 ${floatShadowPx.y}px ${floatShadowPx.blur}px ${visual.hud.shadow}`, opacity: c.disabled ? card.disabledOpacity : 1, cursor: c.disabled ? 'default' : 'pointer', ...NO_CALLOUT }}
          >
            <StrategyPreview pieces={c.pieces} color={c.disabled ? visual.tokens.muted : color} />
            <span style={{ fontSize: card.fontPx, lineHeight: 1, letterSpacing: `${card.spacingEm}em` }}>{c.name}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: card.costGapPx, fontSize: card.fontPx, lineHeight: 1, color: c.disabled ? visual.tokens.muted : color }}>
              {CREDIT(card.creditPx)}
              {c.cost}
              {partial && <span style={{ color: visual.tokens.muted }}>{` · ${c.placed}/${c.total}`}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
