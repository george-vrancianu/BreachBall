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

/** The keep-out arc's stroke, shared by the Pallets' Activation rings (both are no-build zones). */
const noBuildStroke = { widthPx: 2, dashPx: [6, 6] }
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
  /** Text boxes for layout (no measuring): the average width of a glyph as a share of the font size (em), used to size the box of a label that must be kept clear of. */
  text: { glyphEm: 0.62 },
  /** The decimal point of a "x1.5" label, drawn as a disc so it reads at phone size: its radius, the gap on each side of it and how far below the text's middle it sits, as shares of the font size (em). */
  decimalPoint: { radiusEm: 0.12, gapEm: 0.1, dropEm: 0.2 },
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
    keepOut: noBuildStroke,
    /** Each Pallet's Activation ring during a build, a no-build zone drawn like the keep-out arc (the same stroke) in the builder's colour. */
    palletRing: noBuildStroke,
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
      label: { px: 14, alpha: 0.7, weight: 700, ringAt: 0.75, bullseyeAt: 0.55 },
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
    /** The dark under-stroke of a tower's shatter fragments, world units (a wall segment's outline is `look.outlineWidth`). */
    outlineWidth: 1,
    /** The width of a tower's crack lines, world units. */
    crackWidth: 0.12,
    /** Whether a damaged wall segment shows its health pips (never on an undamaged one). */
    showPips: true,
    /** A tower's crack shape (a wall segment's cracks are `look.crack`): how far along its cell it may sit (fraction of a cell), where its four points lie across the wall, and the jitter on each (world units). */
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
    /** Hit sparks (square, in the owner's colour) from a crack not caused by a ball hit (a Splash), and a tower's destruction: life ms, speed range in world units per second, count per crack, count when a tower is destroyed, count when a Breaker destroys a tower, side in world units. `cap`: the most particles of every kind (sparks, chunks, dust, rings) alive in the one reused pool. */
    particles: { ms: 400, minSpeed: 4, speedRange: 8, crack: 4, destroy: 12, breaker: 24, size: 0.3, cap: 150 },
    /**
     * A wall segment breaking (the pool's particles):
     * `chunks`: spinning pieces of the segment (count; side range in world units; speed range in world units per second; life range in ms; spin in radians per second; `drag` is the fraction of speed left after one second; `throwSpread` the total angle, in radians, a chunk's throw direction scatters over around straight across the wall; `startSpin` the most a chunk's starting rotation may be, radians; `shade` how much darker than the owner's colour it is, -1 to 0; `alphaGain` the factor on its fading alpha, so it stays opaque for the first part of its life; `outline` its outline width as a fraction of `look.outlineWidth`);
     * `sparks`: white sparks (count; speed in world units per second; life range in ms; radius in world units; `speedRange` the factor range on that speed, per spark);
     * `dust`: the puff (life ms; its radius grows from `from` to `to` world units; peak alpha; `color` a hex colour);
     * `ring`: the ellipse along the wall (life ms; x and y radii grow from the first to the second value, world units; line width in world units; peak alpha);
     * `shake`: the camera shake in px, and the Breaker's; `breakerScale`: the Breaker multiplies the chunks and sparks by this.
     */
    break: {
      chunks: { count: 14, size: [0.3, 0.8], speed: [6, 22], lifeMs: [600, 1100], spin: 14, drag: 0.08, throwSpread: 1.8, startSpin: 6, shade: -0.15, alphaGain: 1.5, outline: 0.6 },
      sparks: { count: 16, speed: 22, lifeMs: [200, 500], radius: 0.25, speedRange: [0.3, 1.3] },
      dust: { ms: 700, from: 2, to: 7, alpha: 0.35, color: '#c8d2e6' },
      ring: { ms: 700, rx: [1, 7], ry: [0.6, 3.6], width: 0.2, alpha: 0.8 },
      shake: 3,
      breakerShake: 5,
      breakerScale: 1.5,
    },
    /**
     * The wall segment look (world units unless named; the prototype's px / 10, as a 390 px phone shows about 10 px per world unit):
     * `thickness` is the drawn thickness (collision stays `rules.wallHalf`); `outlineWidth` the dark outline; `jointWidth` and `boltRadius` the dark joint between two standing segments and its bolt; `boltShade` how much darker than the owner's colour the bolt is (-1 to 0); `cacheCap` the most looks a wall keeps cached before it clears them (count); `capSteps` the points of a rounded cap's half circle.
     * `shadow`: the drop shadow's offset on screen (down-right) and alpha. `bevel`: the body gradient's colour shifts (-1 darker to 1 lighter) at the lit edge, at `midAt` (0-1 across) and at the dark edge, and how far each shifts per fraction of health lost; `tower` the tower body's bevel: the white alpha at its lit edge and the black alpha at its dark edge (0-1).
     * `highlight`: the lit edge's bright line (width, alpha, alpha lost per fraction of health lost). `stripes`: Player 2's stripes (spacing, width, alpha, alpha gained per fraction of health lost).
     * `shine`: the sheen along a wall (speed in world units per second, rest between sweeps in world units, half width, alpha, and each wall id's start offset in world units).
     * `ladder`: the damage ladder by remaining health: how many cracks and how long they run. `crack`: a crack's shape (steps; start margin from a segment's ends; `endClear` how close to a segment's ends a crack point may come, world units, at least half a joint plus the crack's width so it never runs into a joint or cap; `stepAcross` the range of the fraction of an even step across the thickness each step takes; length range added to the ladder's; drift jitter; bend; heading spread in radians; line, edge width and edge offset; dark and edge colours; the glow of a health-1 crack: width, alpha base, alpha swing, period ms, colour lightening).
     * `chip`: bites out of an edge (width range; depth by remaining health; the far edge's chip: width range, depth, how far it may sit from the first). `pit`: dark pits and the scorch at health 1 (count, margin, radius range, alpha, scorch radius and alpha, `spread` the fraction of the thickness the pits scatter over). `jag`: a jagged end (reach, notch, points).
     * `pips`: the health marks (pitch, width, height, corner radius, filled and empty colours). `flash` (alpha of a bright flash) and `jolt` (life ms, amplitude, wobble period ms) of a hit.
     * `breach`: the Breach mark (smudge alpha and colour, which is also the near-black of the pits and scorch, speck count range, speck radius range, speck alpha, margin from the ends, `spread` the fraction of the thickness the specks scatter over, `reach` the ellipse's half height as a multiple of half the thickness). `simplifiedBelowPx`: below this many CSS px per world unit (the map view) walls draw simplified.
     */
    look: {
      thickness: 1.4,
      outlineWidth: 0.16,
      jointWidth: 0.3,
      boltRadius: 0.2,
      boltShade: -0.5,
      cacheCap: 64,
      capSteps: 8,
      shadow: { dx: 0.15, dy: 0.3, alpha: 0.35 },
      bevel: { lit: 0.45, mid: 0.05, midAt: 0.35, dark: -0.35, tower: { lit: 0.35, dark: 0.35 }, damage: { lit: 0.5, mid: 0.45, dark: 0.3 } },
      highlight: { width: 0.16, alpha: 0.35, damage: 0.2 },
      stripes: { pitch: 0.7, width: 0.3, alpha: 0.55, damageAlpha: 0.2 },
      shine: { speed: 5.5, gap: 8, halfWidth: 2, alpha: 0.28, phase: 3.7 },
      ladder: { 2: { cracks: 2, len: 1 }, 1: { cracks: 3, len: 1.8 } } as Record<number, { cracks: number; len: number }>,
      crack: { steps: 5, margin: 1.6, endClear: 0.5, stepAcross: [0.7, 1.2], lenRange: 1, jitter: 0.4, bend: 0.8, heading: 1.6, width: 0.11, edgeWidth: 0.06, edgeOffset: 0.07, dark: 'rgba(5,7,13,0.85)', edge: 'rgba(255,255,255,0.35)', glow: { width: 0.32, alpha: 0.35, swing: 0.35, periodMs: 160, lighten: 0.6 } },
      chip: { width: [0.5, 0.9], depth: { 2: 0.25, 1: 0.4 } as Record<number, number>, far: { width: [0.6, 1], depth: 0.35, spread: 3 } },
      pit: { count: 7, margin: 1, radius: [0.08, 0.21], alpha: 0.45, scorchRadius: 1.8, scorchAlpha: 0.45, spread: 0.7 },
      jag: { reach: 0.4, notch: 0.3, points: 4 },
      pips: { pitch: 0.7, width: 0.4, height: 0.32, radius: 0.12, on: 'rgba(255,255,255,0.95)', off: 'rgba(5,7,13,0.55)' },
      flash: { alpha: 0.75 },
      jolt: { ms: 200, amp: 0.22, periodMs: 18 },
      breach: { alpha: 0.28, color: '#05070d', specks: [4, 6], speckRadius: [0.12, 0.3], speckAlpha: 0.8, margin: 0.8, spread: 0.9, reach: 1.2 },
      simplifiedBelowPx: 7.5,
    },
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
    /** The Title screen's Attract ball trail colour. */
    trail: 'rgba(255,255,255,0.5)',
    /**
     * The Tracer: the glowing tail behind a shot, its sparks and its bounce flashes, drawn additively. Sizes are screen px (converted with the camera's px per world unit),
     * speeds screen px per second, times ms.
     */
    tracer: {
      /** Tail points older than this drop off. */
      tailMs: 520,
      /** Points are added this far apart between frames, so a fast shot's tail stays smooth. */
      stepPx: 5,
      /** The most tail points kept; the oldest go first. */
      maxPoints: 240,
      /** The tail's width at the ball, by the tier that fired: Power's is heavier. */
      widthPx: { Touch: 14, Power: 20 } satisfies Record<TierName, number>,
      /** The narrowest a tail segment is drawn, screen px. */
      minWidthPx: 0.5,
      /** The ribbon's three passes, back to front: a wide glow and a narrower band in the tier's colour, then the white core. Each has its width (share of the tail width) and peak alpha; width and alpha shrink with age and with distance back along the tail. */
      glow: { width: 1, alpha: 0.35 },
      band: { width: 0.45, alpha: 0.9 },
      core: { width: 0.18, alpha: 1, color: white },
      /** The core's width (share of the tail width) while a Repulsor has just fired or a Charged shot is in flight. */
      brightCore: 0.35,
      /** After a Repulsor fires, the core runs bright for this long. */
      brightMs: 500,
      /** The tail's colour once the ball has rested (or before any shot), while its last points fade. */
      idle: cream,
      /** Sparks: at most `max` alive (past it, new sparks take over old ones' slots); each lives a random time in `lifeMs` with a radius in `radiusPx`, flies at the burst's speed times a random share in `spread`, and keeps `drag` of its speed per second. It shrinks as it fades, from `1 + shrink` to `shrink` times its radius. The tail sheds one every `everyPx` travelled, at `trailSpeedPx`. */
      sparks: { max: 120, lifeMs: [250, 600], radiusPx: [1, 2.8], spread: [0.4, 1.4], drag: 0.002, shrink: 0.5, everyPx: 24, trailSpeedPx: 40 },
      /** The burst at launch, by the tier that fired: how many sparks, at what speed. */
      launch: { count: { Touch: 8, Power: 18 } satisfies Record<TierName, number>, speedPx: { Touch: 140, Power: 220 } satisfies Record<TierName, number> },
      /** The spray at a bounce, by the tier that fired: how many sparks, at what speed. Wall hits spray `wall` (white), board hits the tier's colour. */
      bounce: { count: { Touch: 10, Power: 16 } satisfies Record<TierName, number>, speedPx: 160, wall: white },
      /** A bounce flash, gone after `ms` (at most `max` at once): a radial glow `glowPx` wide, white at `glowAlpha` in the middle, and a ring in the tier's colour that snaps out from `ringFromPx` to `ringToPx` (easing out with power `ringEase`: higher snaps harder), thinning from `ringWidthPx[1]` to `ringWidthPx[0]`. */
      flash: { ms: 360, max: 12, glowPx: 26, glowAlpha: 0.8, ringFromPx: 6, ringToPx: 28, ringEase: 3, ringWidthPx: [0.5, 3] },
      /** The halo around a moving ball: `radius` ball radii out, fading from `inner` ball radii; its alpha rises with speed to `alpha` at `fullSpeedPx`. */
      halo: { radius: 3, inner: 0.5, alpha: 0.5, fullSpeedPx: 600 },
    },
    outlineWidth: 0.12,
    /** The dot that rolls with the distance travelled. */
    dot: { offset: 0.55, radius: 0.2 },
    stealMs: 300,
    /** The ball-in-hand placement disc. */
    placementAlpha: 0.5,
    /** A Charged ball: its glow ring (offset past the ball's radius, width, and the pulse swing and period), the "x1.5" / "x2" badge (size, height above the ball, weight; world units). It sits above the ball on the screen, and tries below, then right, then left (`sideOffset` from the ball's centre, world units) for the first spot that keeps clear of the zone labels and the Gauge's end label (at most one); `margin` is the clearance kept round those, world units. Then the badge's pop-in (`popMs`, growing from `popScale`). Its launch runs the tracer's core bright (`tracer.brightCore`). */
    charged: { glow: { offset: 0.5, width: 0.2, swing: 0.15, periodMs: 2500 }, badge: { size: 1.6, offset: 2.6, weight: 700, sideOffset: 4.4, margin: 0.3 }, popMs: 250, popScale: 0.5 },
    /** The Breaker outline. */
    armed: { radius: 1.5, swing: 0.25, periodMs: 120, width: 0.3 },
    /** The hold ring, `radiusPx` screen px out, filling while the shooter holds still; reaching a new tier pulses it (up to `grow` larger) over `pulseMs`. */
    hold: { radiusPx: 36, width: 0.3, trackAlpha: 0.25, pulseMs: 300, grow: 0.35 },
  },
  /**
   * The Pallets (ADR-0009), neutral, so drawn in `color` rather than a player's. The arm is a tapered capsule (the radii are the sim's `rules.pallet`) filled at `fillAlpha` with an outline;
   * the pivot is a dark disc with a ring. The Activation ring is stroked like the build-time ring (`pitch.palletRing`, so the two overlay exactly) at `idleAlpha`, and at `trackAlpha` only while that Pallet tracks. A swing leaves
   * `ghosts` copies of the arm behind it, `ghostGap` radians apart, fading from `ghostAlpha`. A swat flashes for `flash.ms`: the arm glows (`armGlow` blur, world units), a radial glow
   * (`glowRadius`, `glowAlpha`) and a ring snap out (`ringFrom` to `ringTo`, easing out with power `ringEase`, thinning from `ringWidth`), and `sparks` go into the shared particle pool.
   * A Palleted ball wears a pulsing halo (`radius` in ball radii, `alpha`, and the pulse's `swing` and `periodMs`) and a ring `offset` past its edge, until its pierces run out.
   */
  pallet: {
    color: '#a78bfa',
    fillAlpha: 0.85,
    outline: white,
    outlineAlpha: 0.6,
    outlineWidth: 0.1,
    pivot: { fill: dark, radius: 0.55, width: 0.15 },
    ring: { idleAlpha: 0.22, trackAlpha: 0.6 },
    ghosts: 6,
    ghostGap: 0.09,
    ghostAlpha: 0.3,
    flash: { ms: 320, armGlow: 1.5, glowRadius: 3, glowAlpha: 0.8, ringFrom: 0.6, ringTo: 3.2, ringEase: 3, ringWidth: 0.35 },
    sparks: { count: 12, speed: 18, lifeMs: [250, 500] as readonly number[] },
    palleted: { halo: { radius: 3, alpha: 0.55, swing: 0.15, periodMs: 700 }, ring: { offset: 0.35, width: 0.15 } },
  },
  aim: {
    /** A press this close to the ball's centre (or within its on-screen radius, if larger) starts aiming, in screen px. */
    ballHitPx: 28,
    /** Pointer travel from the press, in screen px, before a drag counts (until then the hold climbs tiers); the drag's distance from the ball's centre must pass it too: releasing within it cancels, and full power range starts at its edge. */
    slopPx: 8,
    /** Within this many screen px of any canvas edge the aim is cancel-armed: releasing cancels, moving back out re-arms. */
    edgeCancelPx: 24,
    /** The Ghost: the ball's predicted path while aiming, drawn as dots from the Comet's tip that fade toward the end and drift forward. World units throughout. */
    ghost: {
      /** `gap` between dots along the path; `radius` and `alpha` run from the first dot's value to the last's. */
      dots: { gap: 1.35, radius: [0.33, 0.16], alpha: [0.9, 0.15] },
      /** How fast the dots drift forward, world units per second: `speed + perPower * power` (power 0-1 of maxSpeed). */
      drift: { speed: 2.5, perPower: 4 },
      /** The ring marking each bounce on the path: its radius, line width and alpha; `wallColor` (ink) for a structure, a board's ring takes the tier's colour. */
      bounce: { radius: 0.6, width: 0.2, alpha: 0.8, wallColor: ink },
      /** A Charged ball's Ghost: dots this many times larger, with its "x1.5" / "x2" badge at the tip (size and distance past it). */
      chargedScale: 2,
      badge: { size: 1.6, offset: 1.6, weight: 700 },
    },
    /**
     * The Comet: the direction indicator while aiming, a tapered spear from the ball's edge along the shot with an ink arrowhead and chevrons running along it.
     * Screen px throughout (divided by the aim's `pxPerUnit`), so it looks the same at any zoom; `glowBlur` aside. The Ghost's dots start at its tip. Cancel-armed, it is all in the cancel grey but its chevrons.
     */
    comet: {
      /** The spear's length, from the ball's edge to the arrowhead: `base + perPower * power`, the power normalised from the weakest tier's lowest to the strongest's highest; times the tier's `tierScale`. */
      lengthPx: { base: 34, perPower: 120 },
      /**
       * The spear's length and base width (`lengthPx`, `widthPx`) scaled by tier, the arrowhead left as is: Touch's is half as long, so the Ghost's dots, which start at its tip,
       * show more of a weak Touch shot's short roll; Power's as given.
       */
      tierScale: { Touch: 0.5, Power: 1 } satisfies Record<TierName, number>,
      /** The gap between the ball's edge and the spear's base. */
      gapPx: 2,
      /** The spear's half-width at its base: `base + perPower * power`, the power taken across its own tier's range (0 at the bottom, 1 at the top); times the tier's `tierScale`. */
      widthPx: { base: 9, perPower: 5 },
      /** The spear's sides curve in through a point `at` of its length, `width` of its base half-width from the centre line. */
      bend: { at: 0.6, width: 0.5 },
      /** The fill, base to tip: transparent, then the tier colour at `mid` along it with alpha `midAlpha`, then `tipColor` with alpha `tipAlpha`. */
      gradient: { mid: 0.55, midAlpha: 0.55, tipColor: ink, tipAlpha: 0.95 },
      /** The glow around the spear in its colour: the canvas shadow blur, in canvas (device) pixels, which the stage's transform does not scale; as the prototype draws it. */
      glowBlur: 14,
      /** The solid arrowhead past the spear's end: half its width, its length and its colour. */
      head: { widthPx: 9, lengthPx: 13, color: ink },
      /**
       * The chevrons running from the base toward the tip: `count` of them, evenly spaced, each lap taking `1 / (speed + perPower * power)` seconds (power across its tier's range);
       * their travel from `startPx` past the ball's edge to `endPx` short of the spear's end; arm length shrinking from `sizePx[0]` to `sizePx[1]` as they go; stroke width, colour,
       * and alpha peaking at `alpha` midway, fading in and out at the ends.
       */
      chevrons: { count: 3, speed: 0.5, perPower: 1.8, startPx: 6, endPx: 4, sizePx: [6, 4], widthPx: 2.5, color: dark, alpha: 0.75 },
      /** A splash tier's dashed preview of its Splash radius around the ball: dash and gap lengths, line width and alpha, in its tier colour. */
      splash: { dashPx: [4, 5], widthPx: 1.5, alpha: 0.5 },
    },
    /** Each tier's colour, by name: the Comet, the Ghost, the Splash preview, the hold ring and the Gauge. */
    tierColors: { Touch: '#4ade80', Power: '#f87171' } satisfies Record<TierName, string>,
    /** Cancel-armed: the Comet and the Ghost grey out, the Splash preview goes, and an ✕ (half-size `size`, world units) sits on the ball. */
    cancel: { color: '#9ca3af', size: 1.2, width: 0.35 },
    /** The Splash ring of a fired Power shot: expands to the Splash radius over `ms`. */
    splash: { ms: 250, color: cream, width: 0.3 },
    /**
     * The control gauge around the ball while aiming (the prototype's `gauge()`), showing only the current tier. Sizes in screen px (converted with the aim's `pxPerUnit`),
     * alphas 0-1, colours from `tierColors` unless named. The scale runs from the inner cancel circle (radius `cancelPx`) out to the limit.
     */
    gauge: {
      /** The inner cancel circle's drawn radius, where the scale band starts: larger than the gesture's `slopPx` so the ball does not cover it. Drawing only: releasing within `slopPx` still cancels, and the power scale (and its tick rings) still starts at `slopPx`. */
      cancelPx: 12,
      /** The end labels, by the tier's curve: the scale's reading near the ball and at the limit. */
      ends: { direct: { near: 'LOW', limit: 'MAX' }, inverted: { near: 'MAX', limit: 'MIN' } } satisfies Record<Tier['curve'], { near: string; limit: string }>,
      /** The scale band's alpha at the inner circle and at the limit, by curve: strong where the tier's power is high. */
      band: { direct: [0.03, 0.3], inverted: [0.5, 0.03] } satisfies Record<Tier['curve'], readonly [number, number]>,
      /** Dashed tick rings at these shares of the power scale (from `slopPx` to the limit, so they line up with the finger): alpha, line width and dash (px). */
      ticks: { at: [0.25, 0.5, 0.75], alpha: 0.22, widthPx: 1, dashPx: [2, 5] },
      /** The faint inner cancel circle. */
      cancel: { color: ink, alpha: 0.25, widthPx: 1.5 },
      /** The limit ring: line width, glow blur, and its breathing (swing in px, period in ms), which stills as it flares. */
      limit: { widthPx: 2.5, glowPx: 10, breathePx: 1.5, breatheMs: 2640 },
      /** Past the limit the limit ring and the knob flare: `rate` is how fast the flare eases in and out (share of the gap closed per second, x dt); at full flare the ring is `widthPx` wider with `glowPx` more blur, and the knob `knobPx` larger. */
      flare: { rate: 10, widthPx: 2, glowPx: 18, knobPx: 3 },
      /**
       * The label chips (end labels and the "TOUCH LIMIT" chip): font size and weight, the near-ball label's smaller size and its gap past the inner circle, side padding, height, border width and alpha, and fill.
       * `near`, by curve: the near-ball label's text alpha and fill (Touch's LOW is dimmer). The limit chip sits on the ring at the first of `chipDegs` (screen degrees clockwise from right: -45 is upper right, clear of the dock below the ball, which the camera holds low on the screen) where it covers neither the readout nor an end chip; then upper left, then either side.
       */
      label: {
        sizePx: 10, weight: 700, nearSizePx: 8, nearGapPx: 12, padPx: 12, heightPx: 18, borderPx: 1.5, borderAlpha: 0.7, fill: 'rgba(11,15,26,0.8)', chipDegs: [-45, -135, -15, -165],
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
       * when its bottom edge would come within `dockClearPx` of the dock band (the camera's `hudReservePx`; the dock can stand a little taller, with the safe-area inset), it sits `risePx` above the knob instead;
       * the tier name (`namePx`, `nameWeight`, `nameDyPx` from the centre), the percentage (Bungee, `percentPx`, `percentWeight`, `percentDyPx`), and `segments` meter segments (`segWPx` x `segHPx`, `segPitchPx` apart, `segDyPx` down; unlit at `unlitAlpha`).
       */
      readout: { offsetPx: 54, dropPx: 2, edgePx: 90, dockClearPx: 24, risePx: 34, wPx: 80, hPx: 40, radiusPx: 10, fill: 'rgba(11,15,26,0.9)', borderPx: 1.5, borderAlpha: 0.8, namePx: 9, nameWeight: 700, nameDyPx: -10, percentPx: 15, percentWeight: 400, percentDyPx: 5, segments: 8, segWPx: 6, segHPx: 3, segPitchPx: 8, segDyPx: 14, unlitAlpha: 0.18 },
    },
    /** `tier`: the short buzz on reaching a higher tier while holding. */
    vibration: { shotBase: 10, shotPerPower: 40, goal: [60, 40, 60], tier: 30 },
  },
  input: { tapSlopPx: 12, dragSlopPx: 6, /** A wall drawn from within this many screen px of a wall end starts exactly on it, and a dragged wall's end snaps to one. */ snapPx: 16, edgeScrollSpeed: 30, edgeBand: 0.1, touchTargetPx: 22, /** A landing still unseen after this many ticks is dropped, so a lost input cannot block the turn. */ landingTimeoutTicks: 30 },
  /** `flipMs` is the whole-stage flip and the hold at a match's start; goal, sweep and reveal hold for their `Ms`. `slide` is the Tabletop handover (the Dock slides off the bottom of the layer, `outMs` with an ease-in of power `easeIn`, the layer turns while nothing shows, `gapMs` later it slides back in, `inMs` with an ease-out of power `easeOut`; the edge strips and corner chips fade out and in over the same spans). The sim waits for the whole of it: `outMs + gapMs + inMs`. */
  transition: { flipMs: 400, goalMs: 1500, sweepMs: 1000, revealMs: 1500, slide: { outMs: 250, gapMs: 100, inMs: 300, easeIn: 2, easeOut: 3 } },
  hud: {
    /** UI text: Chakra Petch 700, uppercase, tabular numerals. `display` is Bungee, for digits, the title and Play. Both load from Google Fonts in `index.html`. */
    font: '"Chakra Petch","Trebuchet MS",sans-serif', display: 'Bungee,Impact,sans-serif', ink, dark, panel: '#141a2a', track: '#3b4256', urgent: '#ff4d4d', urgentSeconds: 5, urgentPulse: 0.15, scrim: 'rgba(11,15,26,0.85)', scrimLight: 'rgba(11,15,26,0.7)', pressed: '#2a3350', pressedBorder: white, scoreFlipMs: 400, /** Hold on a Move point dot this long to refund all but one. */ longPressMs: 500,
    /** The queued Subterfuge icons (px): the pill's height, the gap under the bars' rows, the gap between icons, the font size and the pill's border; inside a pill, the item's icon and the gap between it and its text. The pill sits `bar.heightPx + bar.resourceRowPx + edgePx` from the far edge (clear of the Resource bar's row), under the targeted player's half; Player 1's is kept clear of the minimap chip at the stage's left and Player 2's of the ☰ button (`sideMenu.buttonPx`) at its right. */
    queued: { px: 28, edgePx: 4, gapPx: 8, fontPx: 12, iconPx: 18, iconGapPx: 4, borderPx: 2 },
    /** The near band's shared row (px unless noted): its height, the clock ring and the disc inside it, the urgent halo's width and colour, the round line's and phase label's font sizes, the round line's and phase label's letter spacing (em), the Recenter circle's size, border and crosshair icon (size, stroke), the right padding left for the minimap chip at the band's bottom-right, the gap between its items, and the row's pills (OK, Repair, Rearrange): height, side padding, border, and the tap target around them (the pill is drawn smaller than the hit area). Width budget at a 390 px viewport: 390 - 2x8 shell padding - 44 chip padding = 330 for the row; clock 36 + Move dots (3 x 9 + 2 x 4 gaps = 35) + Recenter 36 + OK ~64 + 4 gaps x 8 = 203, so the text block keeps ~127 and truncates with an ellipsis past that. Siege's Repair and Rearrange do not fit beside it and go on their own row above. */
    sharedRow: { heightPx: 36, ringPx: 36, discPx: 28, haloPx: 3, haloColor: '#7f1d1d', roundPx: 14, labelPx: 10, roundSpacingEm: 0.08, labelSpacingEm: 0.16, recenterPx: 36, recenterBorderPx: 2, iconPx: 20, iconStroke: 2, chipPadPx: 44, gapPx: 8, pillPx: 36, pillPadPx: 14, pillBorderPx: 2, hitPx: 44 },
    /**
     * The dock: the bottom panel holding the viewer's controls (px). `tilePx` is an action tile (Build, a piece, Strategies, Powerup, Subterfuge) with its corner `radiusPx`, `iconPx` and the label under the icon; the play dock's ability tiles (Build, Powerup, Subterfuge) share one width, `abilityPx`, fitting the longest label (SUBTERFUGE, at the option tiles' label size) and keeping the row within a 360 px screen;
     * `rowGapPx` between the dock's two rows, `gapPx` between tiles and `padPx` inside the panel; the status row's `chipPx` height (Credits, OK, Refund); the panel's fill, top border colour and corner radius;
     * the divider's width (`dividerPx`); the Strategies tray's z-index over the pitch (`trayZ`); the balance's font size (`creditFontPx`) and the OK pill's minimum width (`okMinPx`). The groups below hold the rest.
     */
    dock: {
      tilePx: 52, abilityPx: 64, radiusPx: 14, iconPx: 22, labelPx: 9, labelSpacingEm: 0.08, rowGapPx: 8, gapPx: 6, padPx: 8, chipPx: 40, fill: 'rgba(14,19,33,0.94)', border: '#232b42', cornerPx: 18, dividerPx: 1, trayZ: 9, creditFontPx: 20, okMinPx: 84,
      /** The wider gap (px) between the items of the dock's two rows, between the shots and Refund, and between the Strategies cards. */
      wideGapPx: 8,
      /** The panel's top border (px; the selection bar's border too), and its shadow toward the pitch: offset and blur (px). */
      borderPx: 1, shadowPx: { y: 8, blur: 24 },
      /** The shadow under what floats over the pitch above the dock (the Strategies cards, the selection bar): offset and blur (px). */
      floatShadowPx: { y: 6, blur: 18 },
      /** The divider between Build (or an open ability) and its options: its height, and the extra space beside it on top of `gapPx` (px): on both sides in the build dock, on the options' side in the play dock. Its width is `dividerPx`. */
      dividerHeightPx: 36, dividerPadPx: 2,
      /** Every dock tile (px unless noted): the gap between its icon and label, its border, the glow around a filled tile, and how long a fill change eases (ms). Its corner badge (a price, a stock count): how far it overhangs the corner (negative offset), its height (also its minimum width; its corners are fully round), its side padding and font size. */
      tile: { gapPx: 3, borderPx: 2, glowPx: 14, easeMs: 120, badge: { offsetPx: -6, px: 18, padPx: 4, fontPx: 11 } },
      /** An option tile (a piece in the build dock, or an option beside an open ability), px unless noted: its width, the padlock on a locked (soon) item, and its label's font size and letter spacing (em). The ability tiles' labels use the same font size. */
      option: { px: 48, lockPx: 18, labelPx: 8, labelSpacingEm: 0.02 },
      /** Opening an ability: its options slide in from `px` to the right over `ms`, while the other abilities fold away (width and margin over `ms`, fading over `fadeShare` of it). */
      slide: { ms: 220, px: 24, fadeShare: 0.7 },
      /** The Refund tile's width (px), a little wider than `tilePx` to fit its `+2 CR` label. */
      refundPx: 58,
      /** The balance chip (px unless noted): padding before the token and after the unit, the gap between its parts, the ring in the player's colour and the inner glow; the Credit token's disc and icon; the unit's font size and letter spacing (em). A change in the amount pops it to `pop.scale` and back over `pop.ms`. The amount's font size is `creditFontPx`. */
      credits: { padStartPx: 6, padEndPx: 12, gapPx: 6, borderPx: 2, glowPx: 12, tokenPx: 28, iconPx: 18, unitFontPx: 10, unitSpacingEm: 0.1, pop: { scale: 1.35, ms: 260 } },
      /** The primary pill (OK, Confirm, Repair, Rearrange), px unless noted: side padding, border, the gap between check and label, font size, letter spacing (em), the glow around it, the check icon (OK's and Confirm's), and its height as one of the defence choice's two halves (it is `chipPx` elsewhere). Its minimum width is `okMinPx`. */
      primary: { padPx: 14, borderPx: 2, gapPx: 6, fontPx: 15, spacingEm: 0.06, glowPx: 16, iconPx: 18, choicePx: 48 },
      /** The shots left (px): a ball per Move point, its border and the glow of an unspent one, the gap between balls and the gap above the `Shots 2/3` label; an unspent ball shades from `shine` through the ball's fill to `shade`. */
      shots: { px: 14, borderPx: 2, glowPx: 6, gapPx: 5, labelGapPx: 4, shine: white, shade: '#c9c9c0' },
      /** The selected piece's controls over the pitch (px unless noted): each round button, its border and icon, the gap between buttons, the bar's padding and corner radius, and a greyed button's opacity (0 to 1). */
      selection: { buttonPx: 40, buttonBorderPx: 2, iconPx: 20, gapPx: 8, padPx: 6, radiusPx: 26, disabledOpacity: 0.4 },
      /** The action row's prompt (Rearrange, waiting for the defence choice): font size (px) and letter spacing (em). */
      prompt: { fontPx: 12, spacingEm: 0.08 },
      /** The Strategies tray's padding (px), vertical and horizontal; the dock widens the sides to `padPx` where it mounts the tray. */
      trayPadPx: { y: 4, x: 2 },
      /** A Strategies card (px unless noted): its size, corner radius, padding and border; how much narrower than the card its preview is; the name's and cost's font size and letter spacing (em), the gap between the Credit icon and the cost, the icon's size, and the card's opacity (0 to 1) where nothing fits. */
      card: { w: 84, h: 126, radiusPx: 16, padPx: 6, borderPx: 2, previewInsetPx: 12, fontPx: 11, spacingEm: 0.06, costGapPx: 3, creditPx: 12, disabledOpacity: 0.55 },
      /**
       * A Strategy's preview, in world units: `crop` of the half next to the halfway line is left out, with `margin` around the rest; the half's corner radius and outline width,
       * the centre zone's and no-build zone's line width and the no-build zone's dash (on, off); the goal line's width; a wall's width; a Repulsor's ring (radius in cells, line width); a Steal's square, `stealPad` bigger than its cell on each side, with corner radius `stealR`.
       */
      preview: { crop: 10, margin: 1, cornerR: 2.5, outline: 0.6, zoneLine: 0.5, dash: [1.5, 1.5], goal: 1.2, wall: 2, repulsorCells: 1.1, repulsorLine: 1.2, stealPad: 0.6, stealR: 0.6 },
    },
    /** Move point dots: size and ring in px; a refund buzzes `vibration` ms, a refund that cannot happen buzzes `denied`. */
    refund: { dotPx: 9, ringPx: 2, gap: 4, vibration: 20, denied: [15, 40, 15] }, shadow: '#0008', gap: 8, /** The gap between the Offence, Defence and Subterfuge circles in their row (px). */ circleGapPx: 10,
    /** The minimap chip (px): the chip and its thumbnail, the chip's border and radius, its inset from the band's corner and its tap area, the glyph's font size and the thumbnail's line width; the frame's fill over the thumbnail, and the fog's fill. */
    minimap: { chipW: 30, chipH: 74, thumbW: 21, thumbH: 70, borderPx: 2, radiusPx: 6, insetPx: 8, hitPx: 44, fontPx: 18, linePx: 1, frame: 'rgba(232,234,240,0.12)', fog: 'rgba(11,15,26,0.7)' },
    /** The hint pill above the dock (the map view's hint and the first-round coaching line), px: its height, side padding, the vertical padding when the text wraps, border and font size. */
    hintPill: { heightPx: 36, padPx: 18, wrapPadPx: 6, borderPx: 2, fontPx: 13 },
    /** The far-edge bars (Defence bar, then the Resource bar) share this look: the strip's height, a segment's height and widest width (a segment never narrows below twice the slant), the gap between segments, how far a segment's ends slant (px), the end digit's size and width, the P2 stripe's two band widths at 45 degrees (px) and its dark stripe, and the empty fill. The Resource bar sits under the Defence bar in a row `resourceRowPx` tall, its bar `resourcePx` thick, and eases a share change over `resourceMs`. A player's Credits digit flashes on a Bullseye Credit: it grows to `flash.scale` and glows white, settling back over `flash.ms`. */
    bar: { heightPx: 28, segmentPx: 12, segmentMaxPx: 36, gapPx: 3, slantPx: 4, digitPx: 16, digitWidthPx: 28, stripePx: [4, 2], stripeDark: '#7c2d12', empty: pitchDots, resourceRowPx: 20, resourcePx: 12, resourceMs: 400, flash: { ms: 300, scale: 1.5 } } },
  /** The Side menu: a press within `edgePx` of the viewer's left edge and a drag in `swipePx` opens it (screen px); the ☰ ghost button's size, its inset from the stage's right and from the Defence bar (which it sits just inside), the glyph size, `buttonZ` (above the HUD and the Strategies tray, under the panel's layer; the Minimap chip shares it), the panel's width cap and share (%), padding and gaps, and the layer's z-index (above the HUD, under the full-screen screens). */
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
