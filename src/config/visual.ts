import type { TierName } from './rules'

const ink = '#e8eaf0'
const dark = '#0b0f1a'
const outline = '#05070d'
const illegal = '#ef4444'
const white = '#fff'
const cream = '#f4f4f0'
const bg = '#070a14'

/** The arcade palette from the design handoff; screens and later HUD slices read their colours from here. */
const pitchDots = '#1c2540'
const tokens = { bg, pitchDots, /** The ring around a primary circle: a gap in the background colour, then a dotted-grid line. */ halo: `0 0 0 4px ${bg}, 0 0 0 6px ${pitchDots}`, lines: '#3b4f7a', muted: '#8d94ab', ghostBorder: '#4a5068', ghostGlyph: '#c3c8d6', dimOutline: '#2a3147' }

/** Every visual value, grouped by the entity that draws or animates it. Times are ms unless named otherwise. */
export const visual = {
  /** The frame loop never advances more than this many seconds at once. */
  frame: { maxDtS: 0.25 },
  tokens,
  player: { colors: { 1: '#22d3ee', 2: '#fb923c' } },
  camera: {
    /** World units the view shows: never fewer than `minVisibleHeight` (wider screens get side bands), never more than `maxVisibleHeight` (taller ones get a band on the far side). */
    minVisibleHeight: 64,
    maxVisibleHeight: 80,
    /** How far down the screen the camera holds the ball, so more of the pitch shows ahead of it. */
    anchor: 0.7,
    /** CSS px kept clear of the pitch for the HUD band, on the side the HUD sits. */
    hudReservePx: 120,
    smoothingS: 0.15,
    bg: dark,
    mapOutline: white,
    mapOutlinePx: 2,
    /** A shot of at least `minPower` shakes the view by `max * power` px, decaying over `ms`. */
    shake: { ms: 200, max: 4, minPower: 0.3, freqX: 0.11, freqY: 0.137 },
  },
  /** How far the blind-build cover bleeds past the pitch sides. */
  fog: { bleed: 1 },
  /** The soft gradient at a pane edge where more pitch lies beyond: its height as a fraction of the pane, and its colours. */
  edgeFade: { fraction: 0.06, color: dark, clear: 'rgba(11,15,26,0)' },
  pitch: {
    board: '#3a4258',
    pitch: '#121a2b',
    line: '#2c3a57',
    net: '#1d2740',
    halfTint: 0.05,
    goalLineWidth: 0.5,
    halfLineWidth: 0.3,
    gridDot: 0.16,
    /** The builder's no-build semicircle. */
    noBuild: { dash: [0.8, 0.6], lineWidth: 0.15 },
  },
  /** Walls, and the parts every structure shares (outline, cracks, flash, shatter, build pieces). */
  wall: {
    outline,
    illegal,
    ownTint: '#7f1d1d',
    hatchStripe: '#7c2d12',
    /** Player 2's diagonal-stripe tile: size px, stripe px, scale into world units. */
    hatch: { tile: 8, stripe: 2, scale: 0.25 },
    outlineWidth: 1,
    crackWidth: 0.12,
    /** One crack's shape: how far along its cell it may sit (fraction of a cell), where its four points lie across the wall, and the jitter on each (world units). */
    crack: { spread: 0.6, across: [-0.4, -0.13, 0.13, 0.4], jitter: 0.5 },
    shatterMs: 400,
    shatterFly: 6,
    shatterSpin: 4,
    flash: white,
    flashMs: 100,
    dimFlashMs: 50,
    dimFlashAlpha: 0.35,
    buildPieceAlpha: 0.5,
    /** The live Credit cost beside an unplaced build piece's midpoint: text size and distance from the midpoint (world units). */
    cost: { size: 1.6, offset: 1.4, weight: 700 },
    /** The two end handles of the selected wall: radius and stroke width in world units (a touch finger's hit radius may be larger). */
    handle: { radius: 1.1, width: 0.2, stroke: white, fill: ink },
    /** The dashed outline on this turn's pieces and the breathing one on a selection. */
    mark: { pad: 0.6, width: 0.15, movableDash: [0.4, 0.4] },
    selected: { periodMs: 150, alpha: 0.6, alphaSwing: 0.4, pad: 0.8, padSwing: 0.15 },
    particles: { ms: 400, minSpeed: 4, speedRange: 8, crack: 4, destroy: 12, breaker: 24, size: 0.3 },
  },
  tower: {
    outline,
    glow: white,
    glowMs: 300,
    spentAlpha: 0.3,
    outlineWidth: 0.3,
    innerWidth: 0.1,
    innerInset: 0.5,
    /** Repulsor glyph rings and the Steal spiral (turns in radians, step, radius per radian). */
    rings: [0.7, 0.35],
    spiral: { turns: Math.PI * 4, step: 0.2, grow: 0.1 },
    /** Fire effect: ring line width and how far the rings burst outward. */
    pulse: { lineWidth: 0.2, grow: 4 },
  },
  ball: {
    fill: cream,
    outline,
    illegal,
    trail: 'rgba(255,255,255,0.5)',
    trailBright: white,
    trailClear: 'rgba(255,255,255,0)',
    trailMs: 500,
    trailLength: 0.08,
    trailWidth: 2,
    trailWidthBright: 3,
    outlineWidth: 0.12,
    /** The dot that rolls with the distance travelled. */
    dot: { offset: 0.55, radius: 0.2 },
    stealMs: 300,
    /** The ball-in-hand placement disc. */
    placementAlpha: 0.5,
    /** The Breaker outline. */
    armed: { radius: 1.5, swing: 0.25, periodMs: 120, width: 0.3 },
    /** The faint control-radius ring while aiming. */
    control: { color: white, alpha: 0.25, width: 0.15 },
    /** The hold ring, `radiusPx` screen px out, filling while the shooter holds still; reaching a new tier pulses it (up to `grow` larger) over `pulseMs`. */
    hold: { radiusPx: 36, width: 0.3, trackAlpha: 0.25, pulseMs: 300, grow: 0.35 },
  },
  aim: {
    /** A press this close to the ball's centre (or within its on-screen radius, if larger) starts aiming, in screen px. */
    ballHitPx: 28,
    /** Pointer travel from the press, in screen px, before a drag counts: releasing within it cancels, and full power range starts at its edge. */
    slopPx: 8,
    /** Within this many screen px of any canvas edge the aim is cancel-armed: releasing cancels, moving back out re-arms. */
    edgeCancelPx: 24,
    /** The Ghost: the ball's predicted path while aiming. */
    ghost: { width: 0.3 },
    /** Each tier's colour, by name: the Ghost and the hold ring. */
    tierColors: { Touch: '#4ade80', Power: '#f87171' } satisfies Record<TierName, string>,
    /** Cancel-armed: the Ghost greys out and an ✕ (half-size `size`, world units) sits on the ball. */
    cancel: { color: '#9ca3af', size: 1.2, width: 0.35 },
    /** The Splash ring of a fired Power shot: expands to the Splash radius over `ms`. */
    splash: { ms: 250, color: cream, width: 0.3 },
    /** `tier`: the short buzz on reaching a higher tier while holding. */
    vibration: { shotBase: 10, shotPerPower: 40, goal: [60, 40, 60], tier: 30 },
  },
  input: { tapSlopPx: 12, dragSlopPx: 6, /** A wall drawn from within this many screen px of a wall end starts exactly on it, and a dragged wall's end snaps to one. */ snapPx: 16, edgeScrollSpeed: 30, edgeBand: 0.1, touchTargetPx: 22, /** A landing still unseen after this many ticks is dropped, so a lost input cannot block the turn. */ landingTimeoutTicks: 30 },
  transition: { flipMs: 400, goalMs: 1500, sweepMs: 1000, dismissMs: 1000, revealMs: 1500 },
  hud: {
    /** UI text: Chakra Petch 700, uppercase, tabular numerals. `display` is Bungee, for digits, the title and Play. Both load from Google Fonts in `index.html`. */
    font: '"Chakra Petch","Trebuchet MS",sans-serif', display: 'Bungee,Impact,sans-serif', ink, dark, panel: '#141a2a', track: '#3b4256', urgent: '#ff4d4d', urgentSeconds: 5, urgentPulse: 0.15, scrim: 'rgba(11,15,26,0.85)', scrimLight: 'rgba(11,15,26,0.7)', pressed: '#2a3350', pressedBorder: white, scoreFlipMs: 400, /** Hold on a Move point dot this long to refund all but one. */ longPressMs: 500,
    /** Hold the Defence circle this long (still: moving past `input.tapSlopPx` cancels) to open its piece column. */ holdMs: 350,
    /** The Defence circle and its piece column (px): the primary circle and its border, the piece circles, their label pills and the gap between them; how long the circle pulses when a hold has nothing to offer, how far it swells (scale), the piece column's z-index (above the HUD rows it may open across), the font sizes of circle, piece and pill (px), and the pill's offset from its piece, side padding and border (px). */
    defence: { circlePx: 60, borderPx: 3, itemPx: 56, pillPx: 32, gap: 10, pulseMs: 300, pulseScale: 1.18, columnZ: 10, circleFontPx: 24, itemFontPx: 20, pillFontPx: 13, pillOffsetPx: 8, pillPadPx: 12, pillBorderPx: 2, itemBorderPx: 2, shadowPx: { y: 2, blur: 8 } },
    /** Move point dots: size and ring in px; a refund buzzes `vibration` ms, a refund that cannot happen buzzes `denied`. */
    /** The near band's shared row: its height, the clock ring and the disc inside it, the urgent halo's width and colour, the round line's and phase label's font sizes and the phase label's letter spacing (px, em), the Recenter circle's size, and the right padding left for the minimap chip. */
    sharedRow: { heightPx: 36, ringPx: 36, discPx: 28, haloPx: 3, haloColor: '#7f1d1d', roundPx: 14, labelPx: 10, labelSpacingEm: 0.16, recenterPx: 36, chipPadPx: 44 },
    refund: { dotPx: 12, ringPx: 2, gap: 4, vibration: 20, denied: [15, 40, 15] }, shadow: '#0008', gap: 8 },
  /** The Title screen: the dot grid's cell and dot (px), the Play and Online pills' heights, the ghost circles' size, and the widest the pills grow. */
  titleScreen: { gridPx: 26, dotPx: 1.3, playPx: 64, onlinePx: 56, ghostPx: 48, pillMaxPx: 300, halo: tokens.halo },
  /** The Attract loop on the Title screen, in the hero's SVG units (the ring is r150): the pieces' sizes, how many circle at once and how fast, the shot's timing, the ricochet cheat and the effects' lengths. */
  attract: {
    ring: 150, ballR: 14, wall: { w: 110, h: 13 }, towerPx: 28,
    /** Live pieces are kept between min and max: a refill below min, a drip every dripSec while below max, each at least gapDeg apart. Kinds by cumulative share: wall, then Repulsor, the rest Steal. */
    min: 2, max: 4, dripSec: 4, gapDeg: 40, kinds: { wall: 0.6, repulsor: 0.8 },
    /** One lap in lapSec, with ±jitter per piece. */
    lapSec: 15, jitter: 0.2,
    /** The ball shoots after a random rest in shotSec, crosses the ring radius in flightSec, and eases home in returnSec; the first shot after firstSec. */
    shotSec: [2.5, 4.5], flightSec: 0.4, returnSec: 0.5, firstSec: 1.5,
    /** A ricochet may bend up to bendDeg toward another piece, for at most `bounces` walls per shot; a ball that leaves the ring without a target returns from exitPad beyond it. */
    bendDeg: 35, bounces: 3, exitPad: 40, hitDeg: 20,
    /** Entrance scale-in, wall shatter, Repulsor burst and Steal swallow, in seconds. */
    spawnSec: 0.3, shatterSec: 0.4, burstSec: 0.4, swallowSec: 0.3, fragments: 4, flyPx: 40,
    trailPx: 36,
  },
} as const
