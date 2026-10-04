# BreachBall

A two-player, turn-based pitch game. Shoot a ball into the opponent's goal through walls both players build. Playable in the browser on phones, tablets and desktops.

## Platform and scope

- Web first: Vite, TypeScript, Vitest, canvas 2D. Shipped as a PWA, portrait-locked on phones through the manifest. Wrap with Capacitor only if app stores become a requirement.
- Hobby project. Prove the core loop is fun before anything else.
- Milestones, in order:
  1. Core shoot-and-build loop with wall durability, hot-seat on one device.
  2. Power-ups.
  3. P2P online play.
- Nothing persists between sessions in v1.

## Architecture

- A pure, deterministic simulation: `step(state, input, config)` returns the new state plus a list of events for that tick. No DOM access and no randomness other than a seeded coin flip. Fixed tick at 60 Hz driven by an accumulator.
- Events carry a moment in time that state alone cannot: ball hit wall (with speed), wall cracked, wall destroyed, shot fired (launch position, direction, tier, power), Repulsor fired, Steal triggered, goal, possession changed. The renderer, haptics and a future audio layer consume them. The sim never waits for an animation.
- A game renderer in `src/game/`: a `Game` instance owns an entity tree (`Camera`, `Pitch`, `Ball`, `Structures` with `Wall` and `Tower` children, `Fog`, `EdgeFade`, `Aim`) that animates itself (`Fog` hides the opponent's half in a Siege blind build, `EdgeFade` softens the pane edge where more pitch lies beyond, and `Camera` clamps to the viewer's half; the reveal is the map camera with the fog lifted) and draws on requestAnimationFrame (see ADR-0002). Sim state enters only through `game.apply(state, events)`, which routes events to entity methods (`src/game/events.ts`); entities never see `SimEvent`. Latest sim state only, no interpolation in v1.
- An `InputController` (`src/game/input/`) turns touches, clicks and keys into sim inputs and camera moves.
- A driver feeds the sim to `Game`. `LocalDriver` (`src/game/driver.ts`) is the hot-seat one: it alone calls `step` and feeds both players' inputs into one sim. A P2P peer would be another driver, so P2P is additive.
- The React HUD and screens are fed only from `Game`'s `onView` callback (fired when the view changes) and drive it through `GameActions`. The pure view models live in `src/game/view/`.
- Physics is hand-rolled: one ball, static walls, swept circle-vs-segment collision per tick so the ball cannot tunnel through zero-thickness walls at max speed.
- The sim has unit tests from day one. Entities and `Game` are tested by behaviour, not pixels.

## World

- Pitch is 40 units wide by 108 tall, vertical, one goal at each end. Each player owns the half (54 units, 27 cells) nearest their goal.
- Ball radius 1. Grid cell is 2 units (one ball diameter).
- Goal width 10. Goal counts when the ball's center crosses the goal line. Own goals count for the opponent.
- No-build zone: a semicircle of radius 15 (1.5 goal widths) centered on each goal mouth.
- Pitch edges are boards: the ball bounces, there are no throw-ins.

### Physics starting values

Expect to tune friction and max speed by feel in the first hour of play. A full-power hit travels roughly 69 units before resting, so from near your own goal a single shot reaches a little past halfway.

| Parameter | Value |
|---|---|
| Max ball speed | 60 units/s |
| Friction | exponential decay, speed halves every 0.8 s |
| At-rest threshold | 0.5 units/s |
| Wall and edge restitution | 0.85 |

## Camera

- The view is always the full 40-unit pitch width, filling the screen's width above the HUD band (120 CSS px kept clear on the side the HUD sits, so the top of the canvas when the stage is turned for player 2). Visible height is whatever is left, between 64 and 80 units (59-74% of the pitch).
- Screens too wide to show 64 units across the full width get a pane letterboxed left and right. Screens tall enough to show more than 80 units get a band on the far side, away from the HUD, so the near goal stays next to the controls.
- The camera follows the ball vertically, holding it 70% of the way down the screen of the player at the bottom so more of the pitch shows ahead of the shot than behind it, clamped so it never shows beyond the boards (near the own goal the view rests on the end). While the ball moves it follows with about 150 ms of smoothing lag. At rest it settles on that anchor.
- Free panning at all times, in every phase: drag anywhere but on the ball (see Shooting), or drag with two fingers. Mouse drag and mouse wheel on desktop. A manual pan holds until the next sim event (shot fired, wall placed, possession change), then the camera returns to the ball. A recenter button in the HUD does the same on demand. Panning never pauses the shot clock.
- Map: the minimap chip opens a live view of the whole pitch, drawn by the same renderer through a second camera and fitted (never stretched) into the pane above the HUD band, with the current view drawn as a dashed frame with corner brackets and a `Tap to jump · tap ✕ to close` pill. Tap any point to jump the camera there (it holds like a manual pan until the next sim event or Recenter); the map stays open, so the frame follows. The chip, M or Esc closes it without moving. The Offence and Defence circles are greyed and the power-up badges dim to outlines while it is open. The minimap chip is a 30×74 chip (44px wide tap area) at the near band's bottom-right with a thumbnail of the whole pitch and the live camera frame; while the map is open it is a filled ✕ in the viewer's colour. The thumbnail is fogged like the map in a blind build. The clock keeps running. Available in every phase, including the opponent's turn and while the ball moves. It always draws the whole pitch; during Siege's blind opening build the opponent's half is fogged in it (see Siege), so the map never shows more than the main view may.
- A soft gradient at the view edge shows when more pitch lies beyond it.
- Camera is renderer state. The sim never knows about it.

## Game modes

Match-level rules belong to a game mode (see `docs/adr/0001-game-mode-abstraction.md`); the sim config names it. The settings screen has a mode picker above the sliders, Siege is the default, and only the sliders a mode uses are shown (no rounds slider in Siege). Below them, in every mode, an "On time out: Shoot / Burn" toggle (default Shoot) says what an expiring shot clock does (see Shot clock). Online matches run Siege on default settings.

### Siege

- No score and no rounds. One opening build phase with the Rounds ordering (coin-flip loser builds first, the winner gets ball-in-hand), then play; there are no further build phases.
- Done is refused (`refused` event, the turn continues) until the builder owns a structure, and the Done button is disabled meanwhile; otherwise an empty defence would be an instant loss.
- If the build timer runs out while the builder owns nothing, the sim places a fallback piece (a 1-unit horizontal wall just in front of the goal's no-build zone on the builder's half, or a Repulsor if the wall is unaffordable) and then finishes the turn, with no `refused` event. The build clock never goes below 0.
- A goal emits the goal event and resets the ball to the pitch center. The scorer then takes a defence turn (the opponent of the shooter after an own goal): the sim holds play (no shots, no ball placement, no shot clock) until they choose. The scorer picks with two buttons, Repair and Rearrange, in the phase row of the HUD shell (not an overlay): they appear once the GOAL banner has gone, only on the scorer's own device online, and read the live match at click time. With a build timer (online) the choice runs on the build window: it opens full at the goal and drains while the choice is pending (the HUD clock shows it; in hot-seat, with no build timer, the clock reads "-"); if it runs out, the mode picks for the scorer, which in Siege is Repair, resolved with the usual `repaired` events. A choice made on the expiry tick wins. With no build timer (hot-seat) the choice waits indefinitely. The peer waiting on the scorer sees an "Opponent is choosing" label over the pitch (non-blocking, no band) until the choice is made, then the pitch (Repair) or the Rearrange turn as they watch a build turn. Repair restores every surviving structure they own to full HP and emits one `repaired` event per surviving structure they own, structures already at full HP included, so the label and flash always fire (the renderer flashes it and a REPAIRED label sweeps across); Rearrange instead opens a build-style turn for the scorer (see below). The choice is a `defence` input from the scorer; from anyone else, or outside the window, it is refused. After it the conceder has ball-in-hand at the center with a fresh shot counter.
- Rearrange: the scorer's turn opens with no wall points and every structure they own movable and rotatable under the placement and no-build rules, HP and cracks unchanged. The Defence circle is greyed: a tap does nothing and a hold only pulses it (selecting and dragging one's own structures works on the pitch). Placement and demolish are refused (`refused`), and a REARRANGE label sweeps when it opens. Done ends it (also with nothing moved) and the conceder has ball-in-hand at the center. A Rearrange chosen on the expiry tick opens with 0 s left, so the turn ends on the next tick as a timed-out build. The choice is final: once made, a `defence` input is refused. The Siege match carries `opening`, true until the opening build is over; a build turn with it false is a Rearrange turn, never the blind opening build (fog keys on `opening`). One build window covers the choice and the Rearrange: choosing Rearrange continues the same window (the build-start refill is skipped when the turn opens from a choice), and its expiry ends the turn as a timed-out build, with no fallback piece.
- There is no shot cap: shots never end anything.
- The HUD shows each player's remaining structure count, towers included, in place of the score digit, and no round label.
- Wipe-out: the match ends when a player owns no structures, towers included (a Steal tower consumed as the last piece counts). The check runs only when the ball comes to rest or a goal is scored, never mid-flight, so fragments fly and the ball settles before the winner banner. If both players are at zero, the shooter loses. After `match-ended` the sim ignores input. The end screen shows the winner and their surviving structure count instead of a score.
- The opening build is blind: while it runs, the viewer's opponent's half is fogged out in the main view and the map, including the strip above the halfway line the camera can still show (the 64-unit view is taller than a 54-unit half). The map still shows the whole pitch, with the opponent's half covered by the same fog, so "limited to the builder's half" means what can be seen, not the map's extent. The camera clamp range is the viewer's half plus the halfway line, so panning cannot bring the opponent's half into view. The viewer's own half, structures, grid and no-build arc draw as before. The opponent's HUD structure count reads "?" until play starts, and their tower stock and build points are not shown (stock reads as the starting stock). Online, the waiting player is blind too (the fog follows the viewer, not the builder). Rounds stays open information.
- Hiding is renderer and HUD only: the sim state stays complete and deterministic, so lockstep is untouched.
- Wall points default to 10; a value to tune after play-testing.

### Rounds

The match structure below is Rounds.

- Pre-match settings screen with four sliders: shots per possession (default 3), rounds (default 5), Credits per round (default 10; Siege labels the same slider "Wall points"), and Refund rate, the Credits a refunded Move point is worth (default 2; not in Siege).
- A match is a fixed number of rounds. Most goals after all rounds wins. If tied, sudden-death rounds with no shot cap until someone scores.
- Each round is a build phase followed by a play phase.
- A round ends on a goal or after 30 total shots (scoreless).
- Round start: the player who conceded the last goal gets ball-in-hand on their own half. Round 1, or after a scoreless round, a coin flip decides.

## Build phase

- Rounds: open information, both players see everything. Players build one after the other. Round 1 order is the coin-flip loser first, then order alternates each round. Siege has one blind opening build with the same first order, and Rearrange turns after a goal (see Game modes).
- Rounds: building spends **Credits** (`docs/adr/0004-credits-single-resource.md`). Each build turn grants the builder the configured Credits per round (default 10) on top of what they hold, so unspent Credits carry over for the whole match. A player holds nothing before their first build turn. The HUD phase label reads `Build phase`; the balance is not shown there.
- Siege: the opening build grants the configured wall points (default 10); its Rearrange turns have none.
- A "Done" button ends your build. No timer in hot-seat (add one for P2P). In Rounds, tapping Done with nothing placed skips the phase; Siege refuses it (see Game modes). While a build piece is being drawn or sits unplaced (red), Done is disabled: place it or cancel it (✕ or Esc) first, so finishing never silently discards a piece.
- Walls persist for the whole match.
- Placement: tap the Defence circle (the Wall is selected by default; hold it to pick another Defence item), then drag on the pitch. The build piece starts where the drag starts, its end snaps live to the nearest allowed angle and whole unit, and lifting places it. A drag shorter than half a unit places nothing. Placing commits at once: Credits are spent, with a full refund if the wall is demolished the same turn. A lift on an illegal spot leaves a red, selected, unplaced piece; tapping empty pitch discards it. Towers appear under the finger once it moves (or on a tap), follow the drag and place on lift. There is no Confirm step.
- Walls are segments in free coordinates at an angle from the configured set (default 0°, 45°, 90°, 135°) and a length from the configured unit set (default 1 or 2), see `docs/adr/0005-free-angle-walls.md`. One unit is 4 cells end to end, so a diagonal unit is as long on the pitch as a horizontal one.
- Editing: tap a wall placed this turn to select it (the wall just placed is selected already); only the selected wall shows its two end handles. Because the just-placed wall is selected, its ends are handles: to chain a new wall from one of its ends, tap off first (deselect), then drag from the end. Dragging the body moves the whole wall, with either end snapping onto a nearby wall end. Dragging an end swings and resizes the wall around the other end. On touch, two fingers may take both ends: the wall's midpoint follows the fingers' midpoint and the angle and length follow the fingers. Rotate (↻ or R) turns the selected wall 45° around its start. A new drag that starts near an existing wall end snaps onto it. A second finger off a handle is ignored mid-drag; two-finger pan only works with no drag active.
- Walls may touch end to end or in a T, but may not cross or overlap; parallel or collinear walls closer than a wall's thickness count as overlapping. Corners and boxes are chained walls.
- Placement is illegal unless the whole wall (or tower) lies on your half, inside the pitch, outside your goal's no-build zone and outside the Centre zone (a circle of radius 3 cells around the centre spot, in the rules config).
- Moving a wall by its ends may change its length: the Credit difference is charged or refunded, refused if unaffordable, and Rearrange refuses any length change. Demolishing it the same turn refunds what it now costs, which is the total paid.
- Demolishing your own wall costs 1 point and refunds nothing (a piece placed this turn refunds in full). Siege's Rearrange turn refuses demolishing. You cannot demolish the opponent's walls.
- The camera starts centered on your own half at the beginning of your build turn.

### Shapes and costs

| Item | Geometry | Cost |
|---|---|---|
| Wall | 1 or 2 units, any allowed angle | 2 per unit |

The live cost shows on the build piece while dragging. The angle set, unit set and per-unit price live in the rules config.

### No reachability rule

A player may seal their own goal. The walls are wasted Credits the opponent can break, and the HUD gives no warning (ADR-0005).

### Wall durability

- Every wall has 3 hit points. A 2-unit wall is one object with one pool.
- A ball hitting a wall at more than 50% of max speed removes 1 hit point.
- A Power shot's Splash also damages structures, see Shooting.
- At 0 the wall disappears mid-shot and the ball continues at reduced speed.
- Cracks show the damage. No refund on destruction.

## Play phase

### Possession

- The player whose half the ball is resting on has the shot.
- Each possession starts with the configured number of shots (default 3).
- After every shot the ball must come to rest before anything else happens. Only the resting position matters, not the path.
- If the ball rests on the opponent's half, possession switches and the opponent's counter resets.
- If the ball rests on the shooter's half, the counter decrements. At 0 the opponent gets ball-in-hand on the opponent's half with a fresh counter.
- A ball whose center rests exactly on the halfway line stays with the shooter and burns a shot.
- Refund (Rounds, `docs/adr/0004-credits-single-resource.md`): the shooter may trade unspent shots (Move points) for Credits at the "Refund rate" setting (default 2), with the ball placed and no shot in flight, outside a build turn or a defence choice. Tapping a filled shot dot in the HUD refunds one; a long-press (0.5 s) refunds all but one. A held dot shows pressed, a refund buzzes briefly, and a long-press on the last one refunds nothing and buzzes denied (no haptics under reduced motion). Only the device playing the shooter's seat sends a refund. Refunding the last one hands the opponent ball-in-hand with a fresh counter, as running out of shots does (the shot clock restarts too, so a refund on the tick the clock runs out burns no shot, and a shot in the same input is refused). Refunds are not shots: they never count toward the round's shot cap and work in sudden death. The sim input is `refund: { player, count }` with a whole `count`, and emits `refunded`; anything else is refused. Siege has no refunds.

### Ball-in-hand

- Place the ball anywhere on your own half where it does not overlap a wall or tower. The ball's center must be strictly on your side of the halfway line. The no-build zone does not apply.
- Tap a legal point to set the placement (a half-transparent ball), drag it to move it (dragging elsewhere pans), tap Confirm to fix it. The placement goes red where it is illegal.

### Shot clock

- One 15-second clock per shot, starting when the shot (or ball-in-hand) is granted. It covers placement and the shot. The clock turns red and pulses for the last 5 seconds.
- On expiry, the "On time out" setting decides. Shoot (the default): if the shooter is holding an aim (dragged past the slop and not cancel-armed), it fires as that Shot. Otherwise, or with Burn set, one shot is burned and the ball stays put. If the ball was not yet placed, it is placed at the center of the shooter's half first.
- A second consecutive expiry by the same player in the same possession hands possession to the opponent as ball-in-hand.

### Shooting

- A Shot is pool-style (see `docs/adr/0003-pool-style-shot-replaces-blast.md`): press on the ball, drag back, release. The ball goes opposite the drag at power × max speed. A press counts when it lands within the ball's on-screen radius or 28 pixels of its center, whichever is larger, and only for the shooter, with the ball placed and no shot in flight. A press anywhere else pans.
- Tiers are picked by how long you hold still on the ball before dragging. The tier climbs while the pointer stays within 8 pixels of the press; the first move past that locks it, so a slow Touch shot never turns into Power. Tiers are data in the rules config: a new tier is a new entry.

| Tier | Hold | Control radius | Curve | Power | Ghost | Splash |
|---|---|---|---|---|---|---|
| Touch | none | 220 px | longer drag is stronger | 15-45% | full path to the first contact, green | no |
| Power | 1 s | 90 px | shorter drag is stronger | 50-100% | first 30% of that path, red | yes |

- Drag length is in screen pixels from the press, eased (quadratic) through the tier's curve, with the full range starting at the slop edge. Dragging past the control radius keeps steering at the edge power. The weakest Power shot is always stronger than the strongest Touch shot.
- The Ghost is the ball's predicted path, from the same step function the game runs, so it never lies. It is recomputed only when the aim changes.
- Cancel: release without having dragged past the slop, or release within 24 pixels of any canvas edge, where the Ghost greys out and an ✕ sits on the ball. Moving back out of the edge zone re-arms the same shot, tier unchanged. A second finger pans and abandons the aim. A cancel burns nothing.
- Splash: every Power shot sets off a burst centered on the ball's launch position. Its power is the shot's power rescaled within the tier (50% is a 0 Splash, 100% a full one). Its radius grows with that power from 1 ball diameter to 5 ball diameters (10 units). Pressure at a structure's nearest point is power × (1 − distance / radius). Enemy structures lose 1 HP above 0.4 and 2 HP above 0.8; the shooter's own structures lose 1 HP above 0.8 only. The halfway line shields nothing. Towers use the same rule with their own HP. The Splash does not move the ball.
- The sim input is a direction, tier and power; the sim refuses a shot from anyone but the shooter, with the ball in hand or in flight, for an unknown tier, or with a power outside the tier's range.
- Starting values, tune by feel.

### Hot-seat handover

- At every possession change and at ball-in-hand the screen flips 180 degrees so the active player is always at the bottom.
- A "Player N's turn" overlay appears for 1 second and the next player taps it to dismiss before they can act. The camera re-centers on the ball behind the overlay.

## Power-ups (milestone 2)

- Towers (Repulsor, Steal): each player starts the match with 3 of each. Counts are visible to both players. The Breaker is not stocked in Rounds: it is bought with Credits (below). Siege has no Credits economy and keeps 3 Breakers each.
- Towers follow the wall placement rules: own half only, outside the goal no-build zones and the Centre zone, persistent across rounds, placed in the build phase by appearing under the finger once it moves (or on a tap), following the drag and placing on lift. They cost 0 Credits; the power-up is the cost.

### Breaker shot (play phase)

- The Offence circle (⚡, first of the two circles in the bottom row, beside the Defence circle) opens a column: `Breaker · 2` (its price in Credits, `rules.breakerCost`) and one locked "Overdrive · soon" item. Tap the circle to open or close the column; tap the Breaker to arm it (tap it again to disarm), then shoot as normal (any tier). Outside your own possession (the other seat's possession, a build turn, a pending defence choice) the circle is greyed and the column still opens, with every item greyed.
- Arming is refused when the Credits are short, and the Breaker greys out in the column. Nothing is charged for arming: the 2 Credits are charged when the Shot fires (also when the shot clock fires it), whether or not the ball hits anything. A cancelled aim disarms with nothing charged. The sim refuses an armed shot the shooter cannot pay for.
- Siege has no Credits economy, so its Breaker keeps today's rules: a stock of 3 each, one consumed when the Shot fires, and the column's item reads `Breaker · N left`.
- The ball destroys the first wall or tower it touches, including your own, then continues at full speed.
- A Steal tower hit by a Breaker is destroyed without triggering.
- The Breaker and the Splash are separate mechanics: a Power shot with Breaker armed still splashes as usual.

### Repulsor tower (build phase)

- 1-cell square obstacle with 3 hit points.
- When the ball touches it, the ball is fired away at max speed along the reflected direction.
- Fires once per shot, then acts as a plain wall until the ball comes to rest. Triggers for either player's shot.

### Steal tower (build phase)

- 1-cell square obstacle with 1 hit point.
- Triggers only on the opponent's shot: the ball stops dead and the tower's owner gets ball-in-hand with a fresh counter.
- For the owner's own shots it is a plain wall.
- Consumed when it triggers.

## Presentation

### Visual language

- Minimal flat rendering: solid fills, thin dark outlines on walls and ball, no sprites. Glow is reserved for the hold ring, Repulsor fire and goals.
- Dark night pitch with a lighter board around it. Player 1 cyan, Player 2 orange, ball white, off-white UI text. Player 2 walls carry a diagonal hatch so ownership survives colour-blindness. Your own half has a very faint tint of your colour so you always know which half you are looking at while panning.
- Everything a player owns (walls, towers, goal line, HUD digit) carries their colour. Towers differ from walls by glyph, not colour.
- Type: Bungee for the HUD's digits, the title and Play (fallback Impact); Chakra Petch 700 for all other UI text, uppercase with tabular numerals, 500 for notes (fallback Trebuchet MS). Both load from Google Fonts; offline the fallbacks show.
- The arcade palette lives in `visual.tokens`: bg `#070a14`, pitch dots `#1c2540`, lines `#3b4f7a`, ui muted `#8d94ab`, ghost border `#4a5068`, ghost glyph `#c3c8d6`, dim outline `#2a3147`. The screens use it now; the HUD and pitch move to it in later slices.
- Juice level: moderate. Hit flashes, particles, Splash rings and screen shake, all renderer-only. No slow motion, no hit-stop.

### Pitch markings

- Halfway line always visible.
- Grid dots at cell corners and the no-build arc plus the Centre zone arc on the builder's half (both dashed, in the builder's colour) during build only.
- Goal is a gap in the board with a thick line in the defending player's colour and a shallow net box behind it where a scored ball visibly lands.

### Ball

- A short trail of fading discs at previous positions, length proportional to speed, gone at rest.
- A single darker dot on the disc that orbits with distance travelled so the ball appears to roll. No squash.

### Aim and Shot

- While holding still on the ball: a ring around it fills towards Power in the tier's colour (Touch green, Power red). Reaching Power pulses it for 300 ms and gives a short vibration.
- While aiming: a faint ring shows the tier's control radius, and the Ghost is drawn from the ball in the tier's colour. While cancel-armed the Ghost turns grey and an ✕ sits on the ball.
- While a Power aim is held, structures the Splash would reach are tinted red, own structures darker red, so own-wall damage is always a visible choice.
- On a Power shot, a Splash ring expands to the Splash radius over 250 ms and fades. Any shot of at least 30% power shakes the screen with amplitude scaled by power (max about 4 px, 200 ms).

### Walls and towers

- Damaging hit: wall flashes white for 100 ms with a few particles in its colour at the contact point. Non-damaging hit: dimmer, shorter flash, no particles.
- One jagged crack line per lost HP, deterministic from wall id and HP so P2P peers draw the same cracks.
- Destruction: the wall splits into cell-sized fragments that fly from the impact point, spin and fade over 400 ms.
- Repulsor: square with two concentric rings. On fire the rings burst outward, the tower glows for 300 ms and the ball's trail brightens for 0.5 s. Drawn dimmed once spent for the shot.
- Steal: square with a vortex glyph. On trigger the ball shrinks into the tower center over 300 ms and vanishes, then the tower collapses like a destroyed wall.
- Breaker armed: the Offence circle fills with the shooter's colour, and a pulsing outline on the ball in the shooter's colour. On break, double particles, no speed loss.

### Placement previews and buttons

- The build piece and the ball-in-hand placement are half-transparent in the owner's colour, red when illegal. They are not the Ghost, which is the aim's predicted path.
- One button-row component serves both phases. Build: the Defence circle (tap to enter or leave building with the Wall selected, hold to open the Defence items with their prices, tap again to close that menu), and for a selected wall Demolish, Rotate and Cancel; Done. Ball-in-hand: Confirm. In Rearrange the circle is greyed (no placing, no demolish), and the defence choice is a two-button row (Repair, Rearrange).

### Transitions

- Handover flip: animated 180-degree rotation over 400 ms, with the turn overlay fading in during the second half so nobody sees the pitch upside-down.
- Goal: 1.5 s hold with a full-width "GOAL" banner in the scorer's colour, the HUD digit flipping, the ball resting in the net. Then the normal handover. Behind any blocking hold (flip, goal, turn card, reveal, REPAIRED sweep) the sim is paused and pointer input, Confirm, Enter, an aim in progress, the Defence circle and any ball-in-hand placement are ignored, so nothing tapped during the hold carries into the next turn; only the minimap chip still works (a tap on the map itself is swallowed by the overlay).
- Build and play: a 1 s "BUILD" or "PLAY" label sweeping across the pitch. In Siege a Repair adds a "REPAIRED" label of the same kind, and a Rearrange a "REARRANGE" label; in hot-seat the handover waits until it has finished, and the REPAIRED sweep pauses the sim online as well (both peers see the same event, so they stay in step).
- Reveal (Siege only): when the second builder taps Done in the opening build, the fog lifts into a 1.5 s "REVEAL" hold on the map camera, so both layouts show at once. It replaces the opening PLAY sweep, and its label is pinned to the top edge of the stage (at least 112 px down, a margin kept from the former top HUD band until the HUD is redesigned), with no band so every structure stays visible. The online "Opponent is choosing" label is pinned the same way. It blocks input and the sim like the goal hold, then the normal handover goes to the ball-in-hand player. Reduced motion: the same 1.5 s hold (it has no animation to drop). Online, each peer sees it from their own orientation; it is wall-clock only, like the goal hold. Rounds and Rearrange turns have none.
- All interstitials are one overlay component. In round 1 only, turn overlays carry short hints ("Drag back from the ball to shoot; hold first for Power").

### HUD

- React components in `src/ui` take data and callbacks and never import the sim; `Game` pushes a view up and the HUD drives it through an actions handle.
- All in-match controls sit in one shell at the bottom of the screen and show only the active viewer: the Offence circle (greyed outside your own possession; filled while the Breaker is armed) and the Defence circle (greyed on the other player's build turn), Confirm (ball-in-hand) when due, and the minimap chip (see Camera → Map); the shared row; the player row with the score digit (Siege: each side's structure count, "?" for a hidden opponent) and the viewer's two tower power-up icons (Repulsor, Steal) as plain count badges (dimmed to outlines while either circle's column or the map is open).
- The shared row (36 px, the near band's top row) runs left to right: a text block, the clock ring, the Move point dots, then, pushed right, the Recenter ghost circle (a crosshair, 36 px), and the phase buttons (Done in your build turn, disabled while the mode would refuse it or a build piece is unplaced; Repair and Rearrange for a scorer owing a defence choice). It keeps 44 px of right padding clear for the minimap chip, which sits at the near band's bottom-right.
- The text block is the round line over the phase label. In Rounds the round line is `ROUND 3/7 · 2–1`: the round, then the score with the active player's first; in Siege it is absent and the block is the phase label alone. The phase label (10 px, muted, wide-spaced) reads `Build phase` (the Credits balance is not in it), `Play phase`, `Rearrange`, or `Placing wall`, `Placing Repulsor` or `Placing Steal` while a build piece is drawn or unplaced; `· Drag to aim` is appended to `Play phase` while the first-play hint would show (round 1, a placed ball, no shot fired yet in the possession).
- The score shows once as the big digit, which in Rounds is the active player's only; the other player's score is the second half of the `2–1` in the round line.
- The clock ring is a conic drain around a dark disc holding the seconds (the shot clock in play, the build window in a build turn or a pending defence choice, "-" when no clock runs); at 5 s or less it turns red with a dark-red halo and pulses.
- Move point dots: filled for each one left; refundable for the shooter before a shot (see Possession).
- The shell sits inside the rotating stage, so the HUD turns with the flip and the active player's controls are always at the bottom of the screen.
- Overlays (turn card, GOAL, sweeps, REVEAL, "Opponent is choosing") are their own layer, also inside the stage.

### Screens

- Title screen: `BREACH` / `BALL` stacked in Bungee (cyan over orange) over the centre circle and the ball on the halfway line, the tagline `BUILD · SHOOT · BREACH`, on the dot grid; then the Play pill (a hot-seat match, through the settings screen), the Online pill (the Host/Join overlay; a connection does nothing until the online wave), and two ghost circles, settings and help. Player 1's goal mouth peeks up from the bottom edge.
- Attract loop: the Title screen's hero plays a demo. Two to four pieces (walls, Repulsor and Steal towers, in the player colours) circle the outer ring, Player 1's clockwise and Player 2's the other way, one lap in about 15 s; a refill when fewer than two remain and a slow drip keep the ring stocked. Every 2.5–4.5 s the ball shoots from the centre at one of them: a wall deflects it (the honest reflection, bent up to 35° toward another piece, at most three walls per shot) and shatters into flying fragments; a Repulsor bursts its rings and the ball bounces home; a Steal swallows the ball, collapses, and the ball reappears at the centre. A ball that leaves the ring without a target eases home. It is a seeded toy in the hero's SVG units (`src/ui/screens/attract.ts`), not the match physics, and runs on requestAnimationFrame only while the Title screen is up and the tab visible. Under reduced motion the hero is the design's still: a wall of each colour and the ball at rest. The wordmark stays on top; pieces pass behind it.
- Help screen: a static how-to-play page (goal, build, shoot, breach, Refund, modes) with Back, reachable from the Title screen; the Side menu will reuse it. Its copy is a first draft.
- Settings screen (mode picker with the chosen mode shown as pressed, then the sliders that mode uses, the "On time out: Shoot / Burn" toggle, Start), match end screen (winner in their colour, final score, or surviving structure count in Siege, Rematch, Menu). Each is its own layer, outside the rotating stage. No tutorial screen in v1 beyond Help.

### Feedback and accessibility

- No sound in v1. The event list exists so an audio layer can subscribe later without touching the renderer.
- Haptics through the Vibration API where supported: short pulse on firing a shot scaled by power, double pulse on goal, short buzz when the hold reaches Power.
- Reduced-motion preference disables screen shake, particles, the flip rotation (instant cut with the overlay) and haptics. The hold ring drops its pulse but keeps its colour change. Functional visuals such as the Ghost and placement previews stay.
- Desktop keys: M map (toggles it), Space recenter, R rotate, Enter confirm (ball-in-hand), Esc close map, else deselect the wall, else leave building. The mouse grabs one wall end at a time, with a grab cursor over a handle.
- App icon: a white ball with a cyan-to-orange shockwave ring on the pitch colour, one SVG source exported to the required PNG sizes. Splash is the dark background with the title.

## P2P (milestone 3)

- WebRTC between two browsers. Signaling via a tiny server or a pasted connection string, to be decided then.
- Each peer runs the same deterministic sim and exchanges one input per shot or placement. Wall inputs are float endpoints and every peer receives identical numbers; a shot is a direction, a tier and a power. The aim a shooter is holding travels too (each peer keeps the latest per player until it is replaced, cleared or fired), so a shot clock that fires it does so identically on both peers.
- Each player sees the pitch with themselves at the bottom.
- Add a build-phase timer for P2P. Siege's blind build hides the layout in the renderer and HUD only: a modified client could read the peer's layout from its own sim state. True hidden information (commit-and-reveal of the layout) is a later idea.

### Next wave: online (not done yet)

Online play is deferred to the next wave. The Siege rules work online in automated tests: the lockstep sim stays in step, and the choice timer works. But online is not properly implemented or verified as a product. Treat everything online as untested until this wave lands, then test it end to end.

To implement:
- Online P2 sees the whole screen upside down, HUD text included. P2 reuses the hot-seat 180° rotation of the whole stage (`ui/App.tsx`, `rot()` in `game/view/transition.ts`). Flip the world in the camera or renderer instead, and keep the DOM upright; pointer mapping must follow the flip.
- After a disconnect, a build timeout can show REVEAL under the disconnect notice.
- A Done from the player who isn't building can suppress the build timer.
- A defence input from the wrong player on the choice-expiry tick delays the automatic Repair by one tick. It stays deterministic, and the UI cannot send one.
- Signaling and connection UX are still to be settled (see above).

To test once implemented:
- Two real devices on a real network, with real latency, through the Host/Join flow. Cover a full Siege match: the opening blind build and REVEAL, goals, the choice timeout to Repair, Rearrange under the clock, wipe-out, then Rematch and Menu.
- A full Rounds match online.
- Disconnect and reconnect at each phase.
- Both seats, phone and desktop, checking orientation and that labels clear the HUD.
- Touch drag during Rearrange on a phone.

## Deferred ideas

- Points economy: buying power-ups with points earned from goals or from defensive play.
- Point-generating tower and a tower that throws the ball in a chosen direction.
- Earned power-ups (one per goal) if fixed allotments make matches feel samey.
- Pickups spawned on the pitch.
- Wall shapes beyond straight segments (curves, free angles and lengths).
- Realtime simultaneous play.
- Pinch zoom, frame interpolation on high-refresh screens, sound.
