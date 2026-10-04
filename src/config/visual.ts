import { rules, type Tier, type TierName } from './rules'

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

/** The pitch width the design handoff is authored at, px. */
const referencePitchPx = 390

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
    /** The main view's frame on the map: dashed outline (dash and gap, px), with solid corner brackets (arm length and line width, px). */
    mapOutline: white,
    mapOutlinePx: 2,
    mapDashPx: [8, 6],
    mapBracket: { armPx: 16, linePx: 4 },
    /** A shot of at least `minPower` shakes the view by `max * power` px, decaying over `ms`. */
    shake: { ms: 200, max: 4, minPower: 0.3, freqX: 0.11, freqY: 0.137 },
  },
  /** How far the blind-build cover bleeds past the pitch sides. */
  fog: { bleed: 1 },
  /** The soft gradient at a pane edge where more pitch lies beyond: its height as a fraction of the pane, and its colours. */
  edgeFade: { fraction: 0.06, color: dark, clear: 'rgba(11,15,26,0)' },
  /** The pitch markings from the design handoff, authored in reference px (a 390 px wide pitch) and scaled to world units by `unit`, so everything follows the pane width. */
  pitch: {
    /** The pitch width the handoff is authored at, px. */
    referencePitchPx,
    /** World units per reference px: the sim's pitch width over the reference width. */
    unit: rules.pitchWidth / referencePitchPx,
    ground: '#0f1626',
    dot: pitchDots,
    /** The dot grid: cell and dot size, px. */
    grid: { cellPx: 26, dotPx: 1.3 },
    /** The snap grid shown on the builder's half during a build: dot size px and alpha. Drawn in the builder's colour so it reads apart from the ground dots, and faint so it stays under the markings. */
    snapGrid: { dotPx: 1.6, alpha: 0.25 },
    /** Every neutral line: the outline, centre line and circle, keep-out arc and quarter marks. */
    line: tokens.lines,
    outline: { widthPx: 3, radiusPx: 14 },
    /** Corner brackets: inset from the corner and arm length, px; line width px; owner colour alpha. */
    bracket: { insetPx: 15, armPx: 28, widthPx: 2, alpha: 0.5 },
    /** The goal mouth behind the end line: chevron size and stroke, px; net line count, alpha and width px; alphas; goal line px. */
    goal: { chevronPx: [24, 12], chevronWidthPx: 3, chevronAlpha: 0.35, netLines: 7, netAlpha: 0.45, netWidthPx: 1, lineWidthPx: 4 },
    /** The keep-out arc around each goal: line width and dash, px. */
    keepOut: { widthPx: 2, dashPx: [6, 6] },
    /** The centre circle (the Centre zone, in the rules config) and the Bullseye's outline inside it (radius in the rules config; line width and dash, px), and the dot radius, px. */
    centre: { widthPx: 3, bullseyeWidthPx: 2, bullseyeDashPx: [4, 6], dotRadiusPx: 6 },
    /**
     * The Boost ring and Bullseye zones: each one's colour; the tint's alpha at rest and while it holds a Charged ball (`litAlpha`); the slow pulse (period and alpha swing);
     * the arrival of a shot that comes to rest in one (the zone flashes at `flashAlpha`, and a ring grows `grow` times the zone's radius outward over `ms`, `widthPx` wide); and the "x1.5" / "x2" labels (px, alpha, weight, and each one's distance from the centre spot as a fraction of its zone's radius).
     */
    boost: {
      colors: { ring: '#fbbf24', bullseye: '#f472b6' },
      alpha: 0.1, litAlpha: 0.3,
      pulse: { periodMs: 3000, alphaSwing: 0.04 },
      arrive: { ms: 700, grow: 0.6, widthPx: 3, flashAlpha: 0.4 },
      /** The Bullseye Credit: the zone flashes and a "+Credits" in the shooter's colour floats up `rise` world units, over `ms`. */
      credit: { ms: 900, flashAlpha: 0.6, rise: 5, px: 16, weight: 800 },
      label: { px: 12, alpha: 0.7, weight: 700, ringAt: 0.75, bullseyeAt: 0.55 },
    },
    /** The build-zone edge on the halfway line, drawn during a build in the builder's colour. */
    buildEdge: { widthPx: 2, dashPx: [10, 8], alpha: 0.35 },
    /** Ticks on both sidelines at the quarter lines: length and width, px. */
    quarter: { lengthPx: 14, widthPx: 3 },
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
    /** A Charged ball: its glow ring (offset past the ball's radius, width, and the pulse swing and period), the "x1.5" / "x2" badge (size, height above the ball, weight; world units), the badge's pop-in (`popMs`, growing from `popScale`), and the launch trail, brighter and `trailWidth` wide. */
    charged: { glow: { offset: 0.5, width: 0.2, swing: 0.15, periodMs: 2500 }, badge: { size: 1.6, offset: 2.6, weight: 700 }, popMs: 250, popScale: 0.5, trailWidth: 4 },
    /** The Breaker outline. */
    armed: { radius: 1.5, swing: 0.25, periodMs: 120, width: 0.3 },
    /** The hold ring, `radiusPx` screen px out, filling while the shooter holds still; reaching a new tier pulses it (up to `grow` larger) over `pulseMs`. */
    hold: { radiusPx: 36, width: 0.3, trackAlpha: 0.25, pulseMs: 300, grow: 0.35 },
  },
  aim: {
    /** A press this close to the ball's centre (or within its on-screen radius, if larger) starts aiming, in screen px. */
    ballHitPx: 28,
    /** Pointer travel from the press, in screen px, before a drag counts (until then the hold climbs tiers); the drag's distance from the ball's centre must pass it too: releasing within it cancels, and full power range starts at its edge. */
    slopPx: 8,
    /** Within this many screen px of any canvas edge the aim is cancel-armed: releasing cancels, moving back out re-arms. */
    edgeCancelPx: 24,
    /** The Ghost: the ball's predicted path while aiming. */
    ghost: { width: 0.3, /** A Charged ball's Ghost: drawn this much wider, with its "x1.5" / "x2" badge at the tip (size and distance past it, world units). */ chargedWidth: 0.6, badge: { size: 1.6, offset: 1.6, weight: 700 } },
    /** Each tier's colour, by name: the Ghost, the hold ring and the gauge. */
    tierColors: { Touch: '#4ade80', Power: '#f87171' } satisfies Record<TierName, string>,
    /** Cancel-armed: the Ghost greys out and an ✕ (half-size `size`, world units) sits on the ball. */
    cancel: { color: '#9ca3af', size: 1.2, width: 0.35 },
    /** The Splash ring of a fired Power shot: expands to the Splash radius over `ms`. */
    splash: { ms: 250, color: cream, width: 0.3 },
    /**
     * The control gauge around the ball while aiming (the prototype's `gauge()`), showing only the current tier. Sizes in screen px (converted with the aim's `pxPerUnit`),
     * alphas 0-1, colours from `tierColors` unless named. The scale runs from the inner cancel circle (radius `slopPx`) out to the limit.
     */
    gauge: {
      /** The end labels, by the tier's curve: the scale's reading near the ball and at the limit. */
      ends: { direct: { near: 'LOW', limit: 'MAX' }, inverted: { near: 'MAX', limit: 'MIN' } } satisfies Record<Tier['curve'], { near: string; limit: string }>,
      /** The scale band's alpha at the inner circle and at the limit, by curve: strong where the tier's power is high. */
      band: { direct: [0.03, 0.3], inverted: [0.5, 0.03] } satisfies Record<Tier['curve'], readonly [number, number]>,
      /** Dashed tick rings at these shares of the scale: alpha, line width and dash (px). */
      ticks: { at: [0.25, 0.5, 0.75], alpha: 0.22, widthPx: 1, dashPx: [2, 5] },
      /** The faint inner cancel circle. */
      cancel: { color: ink, alpha: 0.25, widthPx: 1.5 },
      /** The limit ring: line width, glow blur, and its breathing (swing in px, period in ms), which stills as it flares. */
      limit: { widthPx: 2.5, glowPx: 10, breathePx: 1.5, breatheMs: 2640 },
      /** Past the limit the limit ring and the knob flare: `rate` is how fast the flare eases in and out (share of the gap closed per second, x dt); at full flare the ring is `widthPx` wider with `glowPx` more blur, and the knob `knobPx` larger. */
      flare: { rate: 10, widthPx: 2, glowPx: 18, knobPx: 3 },
      /**
       * The label chips (end labels and the "TOUCH LIMIT" chip): font size and weight, the near-ball label's smaller size and its gap past the inner circle, side padding, height, border width and alpha, and fill.
       * `near`, by curve: the near-ball label's text alpha and fill (Touch's LOW is dimmer). The limit chip sits on the ring at `chipDeg` (screen degrees clockwise from right: 135 is lower left).
       */
      label: {
        sizePx: 10, weight: 700, nearSizePx: 8, nearGapPx: 12, padPx: 12, heightPx: 18, borderPx: 1.5, borderAlpha: 0.7, fill: 'rgba(11,15,26,0.8)', chipDeg: 135,
        near: { direct: { alpha: 0.85, fill: 'rgba(11,15,26,0.6)' }, inverted: { alpha: 1, fill: 'rgba(11,15,26,0.8)' } } satisfies Record<Tier['curve'], { alpha: number; fill: string }>,
      },
      /** The lit wedge on the pull side while aiming: half its angle (degrees) and its alpha at the inner circle and at the finger, by curve. */
      wedge: { halfDeg: 18, direct: [0.08, 0.55], inverted: [0.55, 0.12] } satisfies { halfDeg: number } & Record<Tier['curve'], readonly [number, number]>,
      /** The ring at the finger's distance: alpha at the scale's weak and strong ends, and line width. */
      level: { alpha: [0.55, 1], widthPx: 2 },
      /** A ring rippling from the ball out to the finger's ring, once per period: `slowMs` at the scale's weak end, `fastMs` at its strong end; starting alpha and line width. */
      ripple: { slowMs: 900, fastMs: 400, alpha: 0.5, widthPx: 1.5 },
      /** The dashed elastic line from the ball to the knob: colour, alpha, width and dash (px). */
      elastic: { color: ink, alpha: 0.5, widthPx: 2, dashPx: [4, 4] },
      /** The knob at the finger: radius, ring width, fill, and the centre dot's radius. */
      knob: { radiusPx: 9, widthPx: 3, fill: dark, dotPx: 3.5 },
      /** On reaching a higher tier the gauge morphs to the new tier's radius over `ms`, overshooting (back ease, `overshoot` its strength) as the colour cross-fades. */
      morph: { ms: 380, overshoot: 1.7 },
      /** The tier name ("POWER!") popping above the ring on a switch, in the new tier's colour: over `ms` it fades and rises `risePx` from `gapPx` above the ring, its Bungee text (`weight`) growing from `sizePx` by `growPx` over the first `growShare` of it. */
      pop: { ms: 700, sizePx: 22, weight: 400, growPx: 10, growShare: 1 / 3, gapPx: 26, risePx: 20 },
      /**
       * The readout chip beside the knob: `offsetPx` to the knob's screen right (or left, within `edgePx` of the pitch's right edge as the viewer sees it, which on a phone is the screen's) and `dropPx` lower; its size, corner radius, fill, border width and alpha;
       * the tier name (`namePx`, `nameWeight`, `nameDyPx` from the centre), the percentage (Bungee, `percentPx`, `percentWeight`, `percentDyPx`), and `segments` meter segments (`segWPx` x `segHPx`, `segPitchPx` apart, `segDyPx` down; unlit at `unlitAlpha`).
       */
      readout: { offsetPx: 54, dropPx: 2, edgePx: 90, wPx: 80, hPx: 40, radiusPx: 10, fill: 'rgba(11,15,26,0.9)', borderPx: 1.5, borderAlpha: 0.8, namePx: 9, nameWeight: 700, nameDyPx: -10, percentPx: 15, percentWeight: 400, percentDyPx: 5, segments: 8, segWPx: 6, segHPx: 3, segPitchPx: 8, segDyPx: 14, unlitAlpha: 0.18 },
    },
    /** `tier`: the short buzz on reaching a higher tier while holding. */
    vibration: { shotBase: 10, shotPerPower: 40, goal: [60, 40, 60], tier: 30 },
  },
  input: { tapSlopPx: 12, dragSlopPx: 6, /** A wall drawn from within this many screen px of a wall end starts exactly on it, and a dragged wall's end snaps to one. */ snapPx: 16, edgeScrollSpeed: 30, edgeBand: 0.1, touchTargetPx: 22, /** A landing still unseen after this many ticks is dropped, so a lost input cannot block the turn. */ landingTimeoutTicks: 30 },
  transition: { flipMs: 400, goalMs: 1500, sweepMs: 1000, dismissMs: 1000, revealMs: 1500 },
  hud: {
    /** UI text: Chakra Petch 700, uppercase, tabular numerals. `display` is Bungee, for digits, the title and Play. Both load from Google Fonts in `index.html`. */
    font: '"Chakra Petch","Trebuchet MS",sans-serif', display: 'Bungee,Impact,sans-serif', ink, dark, panel: '#141a2a', track: '#3b4256', urgent: '#ff4d4d', urgentSeconds: 5, urgentPulse: 0.15, scrim: 'rgba(11,15,26,0.85)', scrimLight: 'rgba(11,15,26,0.7)', pressed: '#2a3350', pressedBorder: white, scoreFlipMs: 400, /** Hold on a Move point dot this long to refund all but one. */ longPressMs: 500,
    /** Hold the Defence circle this long (still: moving past `input.tapSlopPx` cancels) to open its piece column. */ holdMs: 350,
    /** The Defence circle and its piece column (px): the primary circle and its border, the piece circles, their label pills and the gap between them; how long the circle pulses when a hold has nothing to offer, how far it swells (scale), the piece column's z-index (above the HUD rows it may open across), the font sizes of circle, piece and pill (px), and the pill's offset from its piece, side padding and border (px); `balance`, the builder's balance badge: its font size, its offset from the circle's top-right edge (negative, so it overhangs) and its minimum width, which also sets the corner radius (`minPx / 2`), all in px. */
    defence: { circlePx: 60, borderPx: 3, itemPx: 56, pillPx: 32, gap: 10, pulseMs: 300, pulseScale: 1.18, columnZ: 10, circleFontPx: 24, itemFontPx: 20, pillFontPx: 13, pillOffsetPx: 8, pillPadPx: 12, pillBorderPx: 2, itemBorderPx: 2, balance: { fontPx: 12, offsetPx: -6, minPx: 18 }, shadowPx: { y: 2, blur: 8 } },
    /** The queued Subterfuge icons (px): the pill's height, the gap under the bars' rows, the gap between icons and the font size. The pill sits `bar.heightPx + bar.resourceRowPx + edgePx` from the far edge (clear of the Resource bar's row), under the targeted player's half, and Player 1's is kept clear of the ☰ button (`sideMenu.buttonPx`) at the stage's left. */
    queued: { px: 28, edgePx: 4, gapPx: 8, fontPx: 12 },
    /** The near band's shared row (px unless noted): its height, the clock ring and the disc inside it, the urgent halo's width and colour, the round line's and phase label's font sizes, the round line's and phase label's letter spacing (em), the Recenter circle's size, border and crosshair icon (size, stroke), the right padding left for the minimap chip at the band's bottom-right, the gap between its items, and the row's pills (Done, Repair, Rearrange): height, side padding, border, and the tap target around them (the pill is drawn smaller than the hit area). Width budget at a 390 px viewport: 390 - 2x8 shell padding - 44 chip padding = 330 for the row; clock 36 + Move dots (3 x 9 + 2 x 4 gaps = 35) + Recenter 36 + Done ~64 + 4 gaps x 8 = 203, so the text block keeps ~127 and truncates with an ellipsis past that. Siege's Repair and Rearrange do not fit beside it and go on their own row above. */
    sharedRow: { heightPx: 36, ringPx: 36, discPx: 28, haloPx: 3, haloColor: '#7f1d1d', roundPx: 14, labelPx: 10, roundSpacingEm: 0.08, labelSpacingEm: 0.16, recenterPx: 36, recenterBorderPx: 2, iconPx: 20, iconStroke: 2, chipPadPx: 44, gapPx: 8, pillPx: 36, pillPadPx: 14, pillBorderPx: 2, hitPx: 44 },
    /**
     * The dock: the bottom panel holding the viewer's controls (px). `tilePx` is an action tile (Build, a piece, Strategies, Powerup, Subterfuge) with its corner `radiusPx`, `iconPx` and the label under the icon; the play dock's ability tiles (Build, Powerup, Subterfuge) share one width, `abilityPx`, fitting the longest label (SUBTERFUGE, at the option tiles' label size) and keeping the row within a 360 px screen;
     * `rowGapPx` between the dock's two rows and `gapPx` between tiles; the status row's `chipPx` height (Credits, OK, Refund); the panel's fill, top border and corner radius;
     * the Strategies tray's cards (`cardW` x `cardH`, the preview's height) and its z-index over the pitch.
     */
    dock: { tilePx: 52, abilityPx: 64, radiusPx: 14, iconPx: 22, labelPx: 9, labelSpacingEm: 0.08, rowGapPx: 8, gapPx: 6, padPx: 8, chipPx: 40, fill: 'rgba(14,19,33,0.94)', border: '#232b42', cornerPx: 18, dividerPx: 1, card: { w: 84, h: 126, radiusPx: 16 }, trayZ: 9, creditFontPx: 20, okMinPx: 84 },
    /** Move point dots: size and ring in px; a refund buzzes `vibration` ms, a refund that cannot happen buzzes `denied`. */
    refund: { dotPx: 9, ringPx: 2, gap: 4, vibration: 20, denied: [15, 40, 15] }, shadow: '#0008', gap: 8, /** The gap between the Offence, Defence and Subterfuge circles in their row (px). */ circleGapPx: 10,
    /** The minimap chip (px): the chip and its thumbnail, the chip's border and radius, its inset from the band's corner and its tap area, the glyph's font size and the thumbnail's line width; the frame's fill over the thumbnail, the fog's fill, and the map view's hint pill (height, side padding, border, font size). */
    minimap: { chipW: 30, chipH: 74, thumbW: 21, thumbH: 70, borderPx: 2, radiusPx: 6, insetPx: 8, hitPx: 44, fontPx: 18, linePx: 1, frame: 'rgba(232,234,240,0.12)', fog: 'rgba(11,15,26,0.7)', pill: { heightPx: 36, padPx: 18, borderPx: 2, fontPx: 13 } },
    /** The far-edge bars (Defence bar, then the Resource bar) share this look: the strip's height, a segment's height and widest width (a segment never narrows below twice the slant), the gap between segments, how far a segment's ends slant (px), the end digit's size and width, the P2 stripe's two band widths at 45 degrees (px) and its dark stripe, and the empty fill. The Resource bar sits under the Defence bar in a row `resourceRowPx` tall, its bar `resourcePx` thick, and eases a share change over `resourceMs`. A player's Credits digit flashes on a Bullseye Credit: it grows to `flash.scale` and glows white, settling back over `flash.ms`. */
    bar: { heightPx: 28, segmentPx: 12, segmentMaxPx: 36, gapPx: 3, slantPx: 4, digitPx: 16, digitWidthPx: 28, stripePx: [4, 2], stripeDark: '#7c2d12', empty: pitchDots, resourceRowPx: 20, resourcePx: 12, resourceMs: 400, flash: { ms: 300, scale: 1.5 } } },
  /** The Side menu: a press within `edgePx` of the viewer's left edge and a drag in `swipePx` opens it (screen px); the ☰ ghost button's size, its inset from the stage's left and from the Defence bar (which it sits just inside), the glyph size, `buttonZ` (above the Defence circle's column, so it can't cover the button), the panel's width cap and share (%), padding and gaps, and the layer's z-index (above the HUD and the Defence circle's column, under the full-screen screens). */
  sideMenu: { edgePx: 20, swipePx: 40, buttonPx: 40, buttonInsetPx: 8, panelMaxPx: 320, panelWidthPct: 80, panelPadPx: 16, gapPx: 12, rowGap: '4px 12px', glyphPx: 20, buttonZ: 12, z: 15 },
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
