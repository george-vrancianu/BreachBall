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
- Events carry a moment in time that state alone cannot: ball hit wall (with speed), wall cracked, wall segment broken, wall destroyed, shot fired (launch position, direction, tier, power), Repulsor fired, Steal triggered, goal, possession changed. The renderer, haptics and a future audio layer consume them. The sim never waits for an animation.
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
- Map: the minimap chip opens a live view of the whole pitch, drawn by the same renderer through a second camera and fitted (never stretched) into the pane above the HUD band, with the current view drawn as a dashed frame with corner brackets and a `Tap to jump · tap ✕ to close` pill. Tap any point to jump the camera there (it holds like a manual pan until the next sim event or Recenter); the map stays open, so the frame follows. The chip, M or Esc closes it without moving. The dock's Build, Powerup and Subterfuge tiles are greyed while it is open. The minimap chip is a 30×74 chip (44px wide tap area) at the top-left, just under the far-edge bars with the ☰ button level with it at the top-right, and a thumbnail of the whole pitch and the live camera frame; while the map is open it is a filled ✕ in the viewer's colour. The thumbnail is fogged like the map in a blind build. The clock keeps running. Available in every phase, including the opponent's turn and while the ball moves. It always draws the whole pitch; during Siege's blind opening build the opponent's half is fogged in it (see Siege), so the map never shows more than the main view may.
- A soft gradient at the view edge shows when more pitch lies beyond it.
- Camera is renderer state. The sim never knows about it.

## Game modes

Match-level rules belong to a game mode (see `docs/adr/0001-game-mode-abstraction.md`); the sim config names it. The settings screen has a mode picker above the sliders, Siege is the default, and only the sliders a mode uses are shown (no rounds slider in Siege). Below them, in every mode, an "On time out: Shoot / Burn" toggle (default Shoot) says what an expiring shot clock does (see Shot clock). Online matches run Siege on default settings.

### Siege

- No score and no rounds. One opening build phase with the Rounds ordering (coin-flip loser builds first, the winner kicks off), then play; there are no further build phases.
- Done (the OK button) is refused (`refused` event, the turn continues) until the builder owns a structure, and the OK button is disabled meanwhile; otherwise an empty defence would be an instant loss.
- If the build timer runs out while the builder owns nothing, the sim places a fallback piece (a 1-unit horizontal wall just in front of the goal's no-build zone on the builder's half, or a Repulsor if the wall is unaffordable) and then finishes the turn, with no `refused` event. The build clock never goes below 0.
- A goal emits the goal event and resets the ball to the conceder's Kick-off spot. The scorer then takes a defence turn (the opponent of the shooter after an own goal): the sim holds play (no shots, no ball placement, no shot clock) until they choose. The scorer picks with two buttons, Repair and Rearrange, in the dock's action row (not an overlay): they appear once the GOAL banner has gone, only on the scorer's own device online, and read the live match at click time. With a build timer (online) the choice runs on the build window: it opens full at the goal and drains while the choice is pending (the HUD clock shows it; in hot-seat, with no build timer, the clock reads "-"); if it runs out, the mode picks for the scorer, which in Siege is Repair, resolved with the usual `repaired` events. A choice made on the expiry tick wins. With no build timer (hot-seat) the choice waits indefinitely. The peer waiting on the scorer sees an "Opponent is choosing" label over the pitch (non-blocking, no band) until the choice is made, then the pitch (Repair) or the Rearrange turn as they watch a build turn. Repair restores every surviving structure they own to full HP (a wall's standing segments to full; a Gap is permanent and stays) and emits one `repaired` event per surviving structure they own, structures already at full HP included, so the label and flash always fire (the renderer flashes it and a REPAIRED label sweeps across); Rearrange instead opens a build-style turn for the scorer (see below). The choice is a `defence` input from the scorer; from anyone else, or outside the window, it is refused. After it the conceder kicks off with a fresh shot counter.
- Rearrange: the scorer's turn opens with no Wall points and every structure they own movable and rotatable under the placement and no-build rules, HP, cracks and Gaps unchanged (a moved wall keeps its per-segment health). The dock offers no piece tiles, only a prompt to drag pieces and OK (selecting and dragging one's own structures works on the pitch). Placement and demolish are refused (`refused`), and a REARRANGE label sweeps when it opens. OK ends it (also with nothing moved) and the conceder kicks off. A Rearrange chosen on the expiry tick opens with 0 s left, so the turn ends on the next tick as a timed-out build. The choice is final: once made, a `defence` input is refused. The Siege match carries `opening`, true until the opening build is over; a build turn with it false is a Rearrange turn, never the blind opening build (fog keys on `opening`). One build window covers the choice and the Rearrange: choosing Rearrange continues the same window (the build-start refill is skipped when the turn opens from a choice), and its expiry ends the turn as a timed-out build, with no fallback piece.
- There is no shot cap: shots never end anything.
- The Defence bar (see HUD) shows each player's remaining structure count, towers included, at its outer ends (a wall counts once while any segment stands); the dock has no round line.
- Wipe-out: the match ends when a player owns no structures, towers included (a Steal tower consumed as the last piece counts). The check runs only when the ball comes to rest or a goal is scored, never mid-flight, so fragments fly and the ball settles before the winner banner. If both players are at zero, the shooter loses. After `match-ended` the sim ignores input. The end screen shows the winner and their surviving structure count instead of a score.
- The opening build is blind: while it runs, the viewer's opponent's half is fogged out in the main view and the map, including the strip above the halfway line the camera can still show (the 64-unit view is taller than a 54-unit half). The map still shows the whole pitch, with the opponent's half covered by the same fog, so "limited to the builder's half" means what can be seen, not the map's extent. The camera clamp range is the viewer's half plus the halfway line, so panning cannot bring the opponent's half into view. The viewer's own half, structures, grid and no-build arc draw as before. The opponent's side of the Defence bar reads "?" (no bar segments) until play starts, and their tower stock and build points are not shown (stock reads as the starting stock). Online, the waiting player is blind too (the fog follows the viewer, not the builder). Rounds stays open information.
- Hiding is renderer and HUD only: the sim state stays complete and deterministic, so lockstep is untouched.
- Wall points default to 30 (the Opening Credits slider, labelled Wall points in Siege); a value to tune after play-testing.

### Rounds

The match structure below is Rounds.

- Pre-match settings screen with five sliders: shots per possession (default 3), rounds (default 5), Credits per round (default 10), Opening Credits, what each player's round-1 build turn holds (10 to 80, default 40), and Refund rate, the Credits a refunded Move point is worth (default 2). Siege shows only shots per possession and the Opening Credits slider, labelled "Wall points" there with a default of 30; switching mode resets that slider to the new mode's default.
- A match is a fixed number of rounds. Most goals after all rounds wins. If tied, sudden-death rounds with no shot cap until someone scores.
- Each round is a build phase followed by a play phase.
- A round ends on a goal or after 30 total shots (scoreless).
- Round start: the player who conceded the last goal kicks off (ADR-0006). Round 1, or after a scoreless round, a coin flip decides.

## Build phase

- Rounds: open information, both players see everything. Players build one after the other. Round 1 order is the coin-flip loser first, then order alternates each round. Siege has one blind opening build with the same first order, and Rearrange turns after a goal (see Game modes).
- Rounds: building spends **Credits** (`docs/adr/0004-credits-single-resource.md`). A player holds nothing before their first build turn. The round-1 build turn holds the configured Opening Credits (default 40) instead of the per-round grant; every later build turn adds the configured Credits per round (default 10) to what they hold, so unspent Credits carry over for the whole match. The HUD phase label reads `Build phase`; the builder's balance is shown on the dock's balance chip (HUD).
- Siege: the opening build holds the Opening Credits slider's amount as Wall points (default 30), spent on walls only (towers come from the stock); its Rearrange turns have none.
- The OK button ends your build (it sends Done, the sim's end-of-build input). No timer in hot-seat (add one for P2P). In Rounds, tapping OK with nothing placed skips the phase; Siege refuses it (see Game modes). While a build piece is being drawn or sits unplaced (red), OK is disabled: place it or cancel it (✕ or Esc) first, so finishing never silently discards a piece.
- Walls persist for the whole match.
- Placement: the build turn opens with the Wall armed; tap a piece tile in the dock (Wall, Repulsor, Steal) to arm another, then drag on the pitch. The build piece starts where the drag starts, its end snaps live to the nearest allowed angle and whole unit, and lifting places it. A drag shorter than half a unit places nothing. Placing commits at once: Credits are spent, with a full refund if the wall is demolished the same turn. A lift on an illegal spot leaves a red, selected, unplaced piece; tapping empty pitch discards it. Towers appear under the finger once it moves (or on a tap), follow the drag and place on lift. There is no Confirm step.
- Walls are straight lines in free coordinates at an angle from the configured set (default 0°, 45°, 90°, 135°) and a length from the configured unit set (default 1 or 2), see `docs/adr/0005-free-angle-walls.md`. One unit is 4 cells end to end, so a diagonal unit is as long on the pitch as a horizontal one. Each wall is cut into one wall segment per unit, from its first end, each with its own health (see Wall durability and `docs/adr/0007-wall-health-per-segment.md`).
- Editing: tap a wall placed this turn to select it (the wall just placed is selected already); only the selected wall shows its two end handles. Because the just-placed wall is selected, its ends are handles: to chain a new wall from one of its ends, tap off first (deselect), then drag from the end. Dragging the body moves the whole wall, with either end snapping onto a nearby wall end. Dragging an end swings and resizes the wall around the other end. On touch, two fingers may take both ends: the wall's midpoint follows the fingers' midpoint and the angle and length follow the fingers. Rotate (↻ or R) turns the selected wall 45° around its start. A new drag that starts near an existing wall end snaps onto it. A second finger off a handle is ignored mid-drag; two-finger pan only works with no drag active.
- Walls may touch end to end or in a T, but may not cross or overlap (a Gap still counts: the wall's full footprint, from end to end, blocks placing); parallel or collinear walls closer than a wall's thickness count as overlapping. Corners and boxes are chained walls.
- Placement is illegal unless the whole wall (or tower) lies on your half, inside the pitch, outside your goal's no-build zone and outside the Centre zone (a circle of radius 3 cells around the centre spot, in the rules config).
- Moving a wall by its ends may change its length: the Credit difference is charged or refunded, refused if unaffordable, and Rearrange refuses any length change. Demolishing it the same turn refunds what it now costs, which is the total paid.
- Demolishing your own wall costs 1 Credit (`rules.demolishCost`) and refunds nothing (a piece placed this turn refunds in full). Siege's Rearrange turn refuses demolishing. You cannot demolish the opponent's walls.
- The camera starts centered on your own half at the beginning of your build turn.

### Shapes and costs

| Item | Geometry | Cost |
|---|---|---|
| Wall | 1 or 2 units, any allowed angle | 1 per unit |

The live cost shows on the build piece while dragging. The angle set, unit set and per-unit price live in the rules config.

### No reachability rule

A player may seal their own goal. The walls are wasted Credits the opponent can break, and the HUD gives no warning (ADR-0005).

### Wall durability

- Every wall is cut into wall segments, one per unit: a 1-unit wall has 1, a 2-unit wall has 2. Each segment has 3 hit points (`rules.wallHp`), so a 2-unit wall holds 6 in total for the same price (`docs/adr/0007-wall-health-per-segment.md`). Siege games may run longer for it.
- A ball hitting a wall at more than 50% of max speed removes 1 hit point from the segment it lands on and no other (`wall-cracked`, carrying the `segment`).
- A Power shot's Splash also damages structures, per segment, see Shooting. The Breaker breaks the one segment it touches, see Breaker shot.
- A segment at 0 is a Gap: it has no collision, and the ball passes through it. The wall keeps standing with its other segments, and the sim emits `segment-broken { id, segment, wall, at }`. The ball continues at reduced speed after a break mid-shot.
- The wall is destroyed (`wall-destroyed`, with the `segment`) only when its last segment breaks, and is then removed. No refund on destruction.
- A Gap is permanent: Repair restores standing segments only. A ball can be placed in a Gap (ball-in-hand checks standing segments only), but a new wall cannot be built over it.
- A wall counts as one structure while any segment stands, for the Defence bar and the Siege wipe-out. Price, refund and demolish cost are by units, unchanged.
- Health is whole numbers per segment, and the rule is integer-only and deterministic for lockstep.

## Play phase

### Possession

- The player whose half the ball is resting on has the shot.
- Each possession starts with the configured number of shots (default 3).
- After every shot the ball must come to rest before anything else happens. Only the resting position matters, not the path.
- If the ball rests on the opponent's half, possession switches and the opponent's counter resets.
- If the ball rests on the shooter's half, the counter decrements. At 0 the opponent gets a Centre-spot restart with a fresh counter (the ball is fixed on the centre spot, ADR-0006).
- A ball whose center rests exactly on the halfway line stays with the shooter and burns a shot.
- Refund (Rounds, `docs/adr/0004-credits-single-resource.md`): the shooter may trade unspent shots (Move points) for Credits at the "Refund rate" setting (default 2), with the ball placed and no shot in flight, outside a build turn or a defence choice. Tapping a filled shot dot in the HUD refunds one; a long-press (0.5 s) refunds all but one. A held dot shows pressed, a refund buzzes briefly, and a long-press on the last one refunds nothing and buzzes denied. Only the device playing the shooter's seat sends a refund. Refunding the last one hands the opponent a Centre-spot restart with a fresh counter, as running out of shots does (the shot clock restarts too, so a refund on the tick the clock runs out burns no shot, and a shot in the same input is refused). Refunds are not shots: they never count toward the round's shot cap and work in sudden death. The sim input is `refund: { player, count }` with a whole `count`, and emits `refunded`; anything else is refused. Siege has no refunds.

### Ball-in-hand, Kick-off and Centre-spot restart

- Only a Steal gives ball-in-hand. Match start, every goal and every new round are a Kick-off: the ball is fixed on the centre line, `kickoffGap` (5) out from the kicker's own goal line. Every other hand-over (second consecutive expiry, running out of Move points on your own half, refunding the last one) is a Centre-spot restart: the ball is fixed on the centre spot. Neither can be placed, and a restart never Charges the ball (ADR-0006).
- Place the ball anywhere on your own half where it does not overlap a wall or tower. The ball's center must be strictly on your side of the halfway line. The no-build zone does not apply.
- Tap a legal point to set the placement (a half-transparent ball), drag it to move it (dragging elsewhere pans), tap Confirm to fix it. The placement goes red where it is illegal.

### Boost ring, Bullseye and Charged

- `rules.boost`: the Boost ring (radius `centreZoneRadius`, ×1.5) and the Bullseye (radius 2, ×2), both centred on the centre spot and measured against the ball's centre; the Bullseye wins. They apply in every game mode.
- A shot that comes to rest in a ring Charges the ball (`SimState.charge`, 1 = not Charged) and the sim emits `{ type: 'charged', factor, at }`. Being put there by a restart, a kick-off or a placement does not, and neither does passing through or rolling out from the centre spot (ADR-0006). Any move of the ball other than a shot's own roll (a restart, kick-off, placement) loses the charge; so does the next shot, which spends it.
- The charge belongs to the ball: whoever shoots next uses it, including the opponent when the ball rested on their half. The next shot's launch speed is `power * maxSpeed * factor`, no cap, in either Tier (its `shot-fired` event carries `charge`). The Splash is not multiplied. A shot burned by the shot clock keeps the charge. The Ghost is predicted through the real step, so it uses the multiplied speed.
- Bullseye pass-through (Rounds only, behind `GameMode.hasCredits`): when the ball's centre enters the Bullseye from outside during a shot (the tick's swept segment against the circle, so a fast ball cannot skip it), the shooter earns `rules.bullseyeCredits` (2) Credits and the sim emits `{ type: 'bullseye-credited', player, credits }`. At most once per shot (`SimState.bullseyePaid`, cleared when a shot fires). Starting inside it, as from a Centre-spot restart, and rolling out does not count; it counts however the shot ends (rest, goal, own goal, Steal), and a shot that rests in it gets the Credits and the Charge. View: the Bullseye flashes, a "+2" in the shooter's colour floats up (`visual.pitch.boost.credit`), and the shooter's digit on the Resource bar flashes.

### Shot clock

- One 15-second clock per shot, starting when the shot (or, after a Steal, ball-in-hand) is granted. It covers placement and the shot. The clock turns red and pulses for the last 5 seconds.
- On expiry, the "On time out" setting decides. Shoot (the default): if the shooter is holding an aim (dragged past the slop and not cancel-armed), it fires as that Shot. Otherwise, or with Burn set, one shot is burned and the ball stays put. If the ball was not yet placed (after a Steal), it is placed at the center of the shooter's half first.
- A second consecutive expiry by the same player in the same possession hands possession to the opponent as a Centre-spot restart, not ball-in-hand.

### Shooting

- A Shot is pool-style (see `docs/adr/0003-pool-style-shot-replaces-blast.md`): press on the ball, drag back, release. The ball goes opposite the drag at power × max speed. A press counts when it lands within the ball's on-screen radius or 28 pixels of its center, whichever is larger, and only for the shooter, with the ball placed and no shot in flight. A press anywhere else pans.
- Tiers are picked by how long you hold still on the ball before dragging. The tier climbs while the pointer stays within 8 pixels of the press; the first move past that locks it, so a slow Touch shot never turns into Power. Tiers are data in the rules config: a new tier is a new entry.

| Tier | Hold | Control radius | Curve | Power | Ghost | Splash |
|---|---|---|---|---|---|---|
| Touch | none | 150 px | longer drag is stronger | 15-45% | up to 3 bounces, 25-60 units, green | no |
| Power | 1 s | 84 px | shorter drag is stronger | 50-100% | up to 1 bounce, 8-20 units, red | yes |

- Drag length is in screen pixels from the ball's on-screen centre (not the press point, which may be off-centre), so the gauge's rings line up with the finger. It is eased (quadratic) through the tier's curve, with the full range starting at the slop edge. Dragging past the control radius keeps steering at the edge power. The weakest Power shot is always stronger than the strongest Touch shot.
- The Ghost is the ball's predicted path, from the same step function the game runs, so it never lies. It is recomputed only when the aim changes.
- The Ghost stops at its tier's bounce cap or reach, whichever comes first (`rules.shot.tiers[].ghost`). Hits on a structure or a board both count as bounces, including those under the Comet. The reach is in world units of path past the Comet's tip, so it is the same at any zoom and with any Comet length, and it grows with the shot's power across its own tier's range: the weakest shot gets the low end, the strongest the high end. So a Touch shot shows far, and a Power shot only a short stub. A goal ends the Ghost, and so does the ball coming to rest. A Charged ball's reach does not change.
- Cancel: release without having dragged past the slop, or back within the slop of the ball's centre (the gauge's inner circle is drawn a little wider, 12 px, so the ball does not cover it; the cancel zone and the power scale still start at the slop), or release within 24 pixels of any canvas edge, where the Ghost greys out and an ✕ sits on the ball. Moving back out of the edge zone re-arms the same shot, tier unchanged. A second finger pans and abandons the aim. A cancel burns nothing.
- Splash: every Power shot sets off a burst centered on the ball's launch position. Its power is the shot's power rescaled within the tier (50% is a 0 Splash, 100% a full one). Its radius grows with that power from 1 ball diameter to 5 ball diameters (10 units). Pressure at a structure's nearest point is power × (1 − distance / radius). Enemy structures lose 1 HP above 0.4 and 2 HP above 0.8; the shooter's own structures lose 1 HP above 0.8 only. A wall is judged per segment: each standing segment takes the pressure at its own nearest point to the origin, so segments at different distances lose different amounts, and a Gap takes nothing. The halfway line shields nothing. Towers use the same rule with their own HP, as one piece. The Splash does not move the ball.
- The sim input is a direction, tier and power; the sim refuses a shot from anyone but the shooter, with the ball in hand or in flight, for an unknown tier, or with a power outside the tier's range.
- Starting values, tune by feel.

### Hot-seat handover

- **Flip on turn** is a device setting (stored in this browser's localStorage, not part of the match settings, never read by the sim or sent to a peer), **off by default**, hot-seat only; online ignores it. It is the toggle in the Side menu (hot-seat only) and on the settings screen.
- On: at every possession change and at ball-in-hand the screen flips 180 degrees so the active player is always at the bottom.
- Off (the default): the stage never rotates. Player 1's goal stays at the bottom and the HUD, ☰ button, minimap chip, Defence and Resource bars stay where Player 1 has them. Player 2 plays from across the table: their controls are at the bottom, but their goal is at the top and they shoot down the screen. Input needs no change (the drag maps through the camera, and the aim is a world vector), and the camera holds the ball 30% down the screen for them, so the pitch ahead of the ball (down the screen) is in view; for Player 1 it is held 70% down as before. The turn overlay and its dismissing are unchanged, so it still announces whose turn it is, and the HUD (round line, balance, Move points, dock) switches to the new player at the handover.
- The setting is read at each handover; a flip already under way is not changed. Turning it on mid-match applies from the next handover. Turning it off while the stage is turned (Player 2 at the bottom) turns it back to Player 1 at the next handover, once.
- A "Player N's turn" overlay appears for 1 second and the next player taps it to dismiss before they can act. The camera re-centers on the ball behind the overlay.

## Power-ups (milestone 2)

- Towers (Repulsor, Steal): in Rounds each is bought with Credits, no stock: `Repulsor · 5` and `Steal · 4` (`rules.towerCost`), shown as price badges on the dock's piece tiles, which grey out when the builder cannot afford the price. The Breaker is bought with Credits too (below). Siege has no Credits economy: each player keeps a fixed stock of 3 of each tower and 3 Breakers, towers cost no Credits, and the tiles carry a stock badge (`×3`) instead.
- Towers follow the wall placement rules: own half only, outside the goal no-build zones and the Centre zone, persistent across rounds, placed in the build phase by appearing under the finger once it moves (or on a tap), following the drag and placing on lift. Placing spends the price at once; demolishing a tower placed this turn refunds it in full, and an older one costs `rules.demolishCost`, as for a wall. Moving a tower is free.

### Breaker shot (play phase)

- The Powerup tile (Offence; a bolt, second of the play dock's three abilities, after Build and before Subterfuge) opens in place to its options: `Breaker` with its price badge (`rules.breakerCost`) and one locked Overdrive. Tap the tile to open or close it; tap the Breaker to arm it (tap it again to disarm), which closes it, then shoot as normal (any tier). Outside your own possession the tile is greyed and still opens, with every option greyed.
- Arming is refused when the Credits are short, and the Breaker greys out among the options. Nothing is charged for arming: the 2 Credits are charged when the Shot fires (also when the shot clock fires it), whether or not the ball hits anything. A cancelled aim disarms with nothing charged. The sim refuses an armed shot the shooter cannot pay for.
- Siege has no Credits economy, so its Breaker keeps today's rules: a stock of 3 each, one consumed when the Shot fires, and the Breaker tile carries a stock badge (`×N`; its label reads `Breaker · N left`).
- The ball destroys the first tower, or the first wall segment, it touches, including your own, then continues at full speed. On a wall it breaks only the segment it touches (a Gap, `segment-broken`); the wall goes (`wall-destroyed`) only if that was its last standing segment.
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

## Subterfuge

The third family of actions (see `GLOSSARY.md`): items that cripple the opponent's next possession rather than improve your own shot or structures. Rounds only; Siege has no Credits, so no Subterfuge tile. Items are bought with Credits (`docs/adr/0004-credits-single-resource.md`).

- Usable in your own possession (ball in hand or placed, never with a shot in flight) or in your build turn, and never during a defence choice or after the match is decided. One Subterfuge item per turn, a turn being one possession or one build turn: a second is refused and costs nothing. A new turn (a hand-over, a build turn starting or ending) allows one again.
- The sim input is `subterfuge: { player, item }`. The Credits are charged at once and the item is queued against the opponent (`subterfuge.queued[opponent]`), with a `subterfuge-queued` event. An input the sim cannot honour (not the actor, shot in flight, already bought one this turn, too few Credits) is refused with a `refused` event and changes nothing.
- The queue holds one item per player: a Jam never stacks, so buying a second while one waits against the same opponent is refused.

### Jam

- Price: 2 Credits (`rules.jamCost`). The opponent's next possession starts with one Move point fewer.
- It lands when that possession begins in play: a hand-over (the ball rests on their half, shots run out, a Steal, a Refund of the last Move point, a clock burn) or, for a Jam queued in a build turn, when the last build turn ends and play begins on a possession that is already theirs. A `subterfuge-landed` event is emitted and the queue entry is cleared, so it affects that possession only and never a later one.
- A possession never drops below one Move point: with one Move point per possession configured the Jam lands without effect.
- A Jam stays queued while the caster keeps the ball, through any number of their own shots, until the possession passes to the opponent. It carries across rounds (a goal ends the round, the build turns follow, and it lands when the opponent's possession begins).

### HUD

- The Subterfuge tile (a theatre mask) is the last of the play dock's three abilities, after Build and Powerup (see HUD). Tap it to open its options in place; tap an option to buy it, which closes it. Each option tile carries its price badge, and its label says when it lands (Jam: "next possession"). The two further slots are locked placeholders (a lock, "Locked · soon").
- The Subterfuge tile is greyed outside the viewer's own possession, and once this turn's Subterfuge is bought; it still opens, with the Jam greyed. A Jam without the Credits, or while one is already queued, is greyed among the options. Subterfuge is offered in the play dock only (not in a build turn's dock).
- A queued Jam shows as a small pill with a Jam icon in its caster's colour under the targeted player's half of the Defence bar (P1 on the stage's left, mirrored with the bar when flipped), to both players, until it lands. It sits below the 20 px row reserved for the Resource bar (`visual.hud.queued.reservedPx`).

## Presentation

### Visual language

- Minimal flat rendering: solid fills, thin dark outlines on walls and ball, no sprites. Glow is reserved for the hold ring, Repulsor fire and goals.
- Dark night pitch with a lighter board around it. Player 1 cyan, Player 2 orange, ball white, off-white UI text. Player 2 walls carry a diagonal hatch so ownership survives colour-blindness. Your own half has a very faint tint of your colour so you always know which half you are looking at while panning.
- Everything a player owns (walls, towers, goal line, HUD digit) carries their colour. Towers differ from walls by glyph, not colour.
- Type: Bungee for the HUD's digits, the title and Play (fallback Impact); Chakra Petch 700 for all other UI text, uppercase with tabular numerals, 500 for notes (fallback Trebuchet MS). Both load from Google Fonts; offline the fallbacks show.
- The arcade palette lives in `visual.tokens`: bg `#070a14`, pitch dots `#1c2540`, lines `#3b4f7a`, ui muted `#8d94ab`, ghost border `#4a5068`, ghost glyph `#c3c8d6`, dim outline `#2a3147`. The screens use it now; the HUD and pitch move to it in later slices.
- Juice level: moderate. Hit flashes, particles, Splash rings and screen shake, all renderer-only. No slow motion, no hit-stop.

### Pitch markings

- All sizes are authored in handoff px on a 390 px wide pitch (`visual.pitch.unit` converts to world units), so the markings scale with the pane width. Colours and sizes live in `visual.pitch`; the drawing is `game/entities/Pitch.ts`.
- Ground `#0f1626` with a dot grid (26 px cell, 1.3 px dots `#1c2540`), centred on the pitch. Board outline: 3 px `#3b4f7a`, radius 14 px, on the pitch edge.
- Snap grid: during a build only, a faint dot (1.6 px, in the builder's colour at 25%, so it reads apart from the ground dots) at every cell corner (`rules.cellSize` spacing) on the builder's own half, so the builder sees the cells towers sit in (walls are drawn freely and don't snap to it). Drawn over the ground and its dots, under the outline, the markings and the pieces; the build-zone edge on the halfway line is stroked over them. The ground dots stay as they are.
- Corner brackets in the owner's colour at 50% opacity (2 px, round elbows, 15 px in from the corner) at each end.
- Goal mouths: the goal line (4 px, in the owner's colour) is drawn over the outline across the mouth, with the net box behind it, where a scored ball visibly lands: chevrons in the owner's colour at 35% (24x12 px, 3 px stroke, pointing into the pitch) and 7 vertical net lines at 45%, 1 px. The box size follows the sim's `goalWidth` and `netDepth`, not the handoff's 160x40.
- Keep-out arc around each goal (the no-build radius): 2 px dashed 6/6, always drawn, neutral `#3b4f7a`; during a build it takes the builder's colour.
- Centre line 3 px `#3b4f7a`, centre circle (the Centre zone radius) tinted as the Boost ring, with the Bullseye ring (its rules radius) dashed (4/6) and tinted inside it, a centre dot, and their "×1.5" and "×2" labels. Both tints pulse slowly and the one holding a Charged ball is stronger. A shot coming to rest in a zone flashes it and sends a ring out of it (`visual.pitch.boost`).
- Build-zone edge: during a build only, the halfway line is overdrawn dashed 10/8, 2 px, in the builder's colour at 35%. It is only a marker; building is allowed on the whole half.
- Quarter marks: 14 px ticks inward on both sidelines at the quarter lines, 3 px `#3b4f7a`.

### Ball

- The Tracer: a shot leaves a glowing tail in the colour of the tier that fired (Touch green, Power red). The tail is the ball's positions over the last 520 ms, with points added every 5 px between frames so fast shots stay smooth, drawn additively as a ribbon in three passes: a wide glow and a narrower band in the tier's colour, then a thin white core. Width and alpha shrink with age and towards the back of the tail; a Power tail is 20 px wide at the ball, a Touch tail 14 px. The colour clears when the ball rests or possession changes, and the last points fade out.
- Sparks: small particles with drag that fade over 250 to 600 ms, shed along the path, with a burst at launch (8 for Touch, 18 faster ones for Power). At most 120 live at once.
- Bounces: each bounce off a wall (a Gap has none, the ball passes through) or board flashes there (a radial white glow and a ring in the tier's colour that snaps out over 360 ms) and sprays sparks, white off a wall, in the tier's colour off a board (more for Power). A damaging hit on a wall is the exception: its burst is in the wall owner's colour, in place of the white sparks.
- A soft halo in the tier's colour around the moving ball, stronger with speed.
- A single darker dot on the disc that orbits with distance travelled so the ball appears to roll. No squash.

All Tracer sizes are screen px, converted with the camera's px per world unit (`visual.ball.tracer`).

A Charged ball wears a pulsing glow ring and a "×1.5" / "×2" badge that pops in on arrival, and its launch runs the Tracer's white core wide until it stops. While aiming, the Ghost's dots are drawn larger with the badge at its tip. (`visual.ball.charged`, `visual.aim.ghost`).

### Aim and Shot

- While holding still on the ball: a ring around it fills towards Power in the tier's colour (Touch green, Power red). Reaching Power pulses it for 300 ms and gives a short vibration.
- While holding or aiming, the Gauge sits around the ball (`visual.aim.gauge`, `game/entities/AimGauge.ts`), drawn in screen px so it is the same size at any zoom, and turned with the stage so its text reads upright. It shows only the current tier:
  - a scale band from the inner cancel circle (12 px) out to the tier's limit, a radial gradient in the tier's colour, strong where the tier's power is high (Touch at the limit, Power near the ball); dashed tick rings at 25 / 50 / 75 %; a faint inner cancel circle;
  - the limit drawn solid with a glow and a slow breathing pulse, a `TOUCH LIMIT` / `POWER LIMIT` chip on it at the upper right (clear of the dock, which sits below the ball), and end labels: Touch `LOW` near the ball and `MAX` at the limit, Power `MAX` near the ball and `MIN` at the limit.
- While aiming, the Gauge adds a lit wedge (about ±18°) on the pull side out to the finger, a ring at the finger's distance, a ripple running out to it (faster at the strong end of the scale), a dashed elastic line from the ball to the knob, the knob at the finger (clamped to the limit), and a readout chip beside the knob (to its screen right, or left near the right edge; above the knob when it would land in the dock band) with the tier name, the power in % and 8 meter segments lit by the scale position. Dragging past the limit flares the limit ring and the knob, easing in and out.
- Reaching Power while holding morphs the Gauge from the Touch size to the Power size over 380 ms with a small overshoot, cross-fading its colour green to red, and a `POWER!` pop rises and fades above the ring over 700 ms.
- While aiming, the Comet points the shot's way from the ball's edge. It is a tapered spear filled from transparent through the tier's colour to ink, with a glow in that colour, a solid ink arrowhead, and 3 dark chevrons running along it toward the tip, faster higher in the tier's range. It is 34 px long for the weakest shot and 154 px for the strongest (power normalised from 15% to 100%), and its base is 9 to 14 px wide on each side, growing across the tier's range; a Touch Comet is half that size (17 to 38 px long, arrowhead unchanged), so the Ghost shows more of a weak Touch shot's short roll. Its sizes are screen pixels, so it looks the same at any zoom (`visual.aim.comet`; the look is `comet()` in `docs/prototypes/shot-aim-prototype.html`).
- The Ghost is drawn in the tier's colour as dots from the Comet's tip that shrink and fade toward its end and drift forward, faster with more power, with a small ring at each bounce, ink off a structure and the tier's colour off a board (`visual.aim.ghost`). Its reach is measured from the Comet's tip, so the dots always show `reach` units of path; the path under the Comet is not drawn.
- A Power aim also shows a dashed ring in its colour around the ball at the Splash radius it would set off.
- While cancel-armed the Comet and the Ghost turn grey, an ✕ sits on the ball, and there is no Splash preview.
- While a Power aim is held, structures the Splash would reach are tinted red, own structures darker red, so own-wall damage is always a visible choice.
- On a Power shot, a Splash ring expands to the Splash radius over 250 ms and fades. Any shot of at least 30% power shakes the screen with amplitude scaled by power (max about 4 px, 200 ms).

### Walls and towers

- Each wall segment draws as its own bar, in the owner's colour (Player 2 keeps its stripes): a bevel gradient across a drawn thickness of about 1.4 world units (`visual.wall.look.thickness`, visual only: collision stays at `rules.wallHalf`), a drop shadow, a top highlight and a dark outline. The light is fixed in screen space: the shadow always falls down-right, and the highlight and lit side go on the long edge facing screen-up (the left edge of a vertical wall), through the hot-seat 180-degree flip. Towers get the same body treatment, with no segments.
- Ends and Joints: rounded caps at the wall's real ends; a dark Joint with a small bolt where two standing segments meet, perpendicular to the wall at every angle; jagged ends, seeded so they do not flicker, beside a Gap. A slow white sheen sweeps along every wall (over Player 2's stripes too), each wall's phase offset by its id.
- Damage ladder, darker as health falls: 3 is clean; 2 has two short cracks from the hit and one chip bitten from the hit edge; 1 has three longer cracks that glow and pulse in the owner's colour, a second chip on the far edge, dark pits and a scorch. Cracks are a dark line with a thin bright edge; chips and cracks stay clear of caps and Joints. Everything is seeded from wall id, segment and health so P2P peers draw the same damage; cracks start at the event's hit point when this client saw it, else at a seeded spot.
- Health pips: three small marks centred on a segment, on damaged segments only, behind the `visual.wall.showPips` flag.
- Breach mark: a Gap leaves a low-alpha dark smudge the size of the segment, with 4 to 6 rubble specks in the owner's colour, drawn at pitch level under walls and the ball. It stays while the wall stands, so players see why building there is illegal, and fades out when the wall is destroyed.
- Build pieces (drawn, landing, illegal red) draw clean segments with their Joints in the translucent style, with no pips or damage. A damaged wall moved in a Rearrange draws its real segments, Gaps included, translucent; the selection outline and handles cover the full wall.
- Map view: below a scale threshold (`visual.wall.look.simplifiedBelowPx`) walls draw simplified: body, Joints and Gaps only, with no cracks, pits, pips or shine.
- Damaging hit (`wall-cracked`): a white flash on that segment only (`visual.wall.flashMs`) and a short sideways jolt of it. The Tracer's bounce burst is in the wall owner's colour for the hit, so there is one burst per hit. Non-damaging hit: the dim flash and the Tracer's white sparks.
- Segment break (`segment-broken`, and `wall-destroyed` as a wall's final break): that segment shatters into spinning chunks in its colour, with a dark outline, that fade, with a dust puff, an expanding elliptical ring along the wall, white sparks, and a camera shake of about 3 px (`visual.wall.break.shake`; the Breaker's is `break.breakerShake`) through `Camera.shake`; the neighbours switch to jagged ends. A tower still shatters whole. The shake is only on breaks, never on cracks, and several breaks in one tick (a Splash) each play in full but shake once, at the largest amplitude. Particles share one capped, reused pool (about 150).
- Repulsor: square with two concentric rings. On fire the rings burst outward, the tower glows for 300 ms and the Tracer's white core runs wide for 0.5 s. Drawn dimmed once spent for the shot.
- Steal: square with a vortex glyph. On trigger the ball shrinks into the tower center over 300 ms and vanishes, then the tower collapses like a destroyed tower.
- Breaker armed: the Powerup tile fills with the shooter's colour, and a pulsing outline on the ball in the shooter's colour. On break, about 1.5 times the chunks and sparks and a bigger shake than a plain break, no speed loss.

### Placement previews and buttons

- The build piece and the ball-in-hand placement are half-transparent in the owner's colour, red when illegal. They are not the Ghost, which is the aim's predicted path.
- The dock (see HUD) serves every phase. Build: Build tile, the piece tiles with their prices (an item the builder cannot afford is greyed, and an armed tower that becomes unaffordable falls back to the Wall), Strategies, and OK; a selected structure's Demolish, Rotate and Deselect float above the dock. Ball-in-hand: Confirm floats above the dock. In Rearrange the action row is a prompt (no placing, no demolish), and the defence choice is a two-button row (Repair, Rearrange).

### Transitions

- Handover flip: animated 180-degree rotation over 400 ms, with the turn overlay fading in during the second half so nobody sees the pitch upside-down.
- Goal: 1.5 s hold with a full-width "GOAL" banner in the scorer's colour, the score in the dock's round line updating, the ball resting in the net. Then the normal handover. Behind any blocking hold (flip, goal, turn card, reveal, REPAIRED sweep) the sim is paused and pointer input, Confirm, Enter, an aim in progress, the dock's Build tools and any ball-in-hand placement are ignored, so nothing tapped during the hold carries into the next turn; only the minimap chip still works (a tap on the map itself is swallowed by the overlay).
- Build and play: a 1 s "BUILD" or "PLAY" label sweeping across the pitch. In Siege a Repair adds a "REPAIRED" label of the same kind, and a Rearrange a "REARRANGE" label; in hot-seat the handover waits until it has finished, and the REPAIRED sweep pauses the sim online as well (both peers see the same event, so they stay in step).
- Reveal (Siege only): when the second builder taps OK in the opening build, the fog lifts into a 1.5 s "REVEAL" hold on the map camera, so both layouts show at once. It replaces the opening PLAY sweep, and its label is pinned to the top edge of the stage, a margin down that clears the Defence bar, with no band so every structure stays visible. The online "Opponent is choosing" label is pinned the same way. It blocks input and the sim like the goal hold, then the normal handover goes to the kicker, who takes the Kick-off (the ball is fixed, so there is no placement). Online, each peer sees it from their own orientation; it is wall-clock only, like the goal hold. Rounds and Rearrange turns have none.
- All interstitials are one overlay component. In round 1 only, turn overlays carry short hints ("Drag back from the ball to shoot; hold first for Power").

### HUD

- React components in `src/ui` take data and callbacks and never import the sim; `Game` pushes a view up and the HUD drives it through an actions handle.
- All in-match controls sit in one dock at the bottom of the screen and show only the active viewer. It has two rows. The status row: the balance chip (a Credit token and the amount in Bungee, ringed in the player's colour, `CR` in Rounds and `PTS` in a Siege opening build; none in Siege play or a Rearrange turn), the text block, the clock ring (only while a clock runs), the Recenter ghost circle, and in a build turn the OK pill (it sends Done: filled in the player's colour with a check, disabled while the mode would refuse it or a build piece is unplaced). The action row depends on the turn (`HudModel.dock`): **build** (a build turn that places pieces): the Build tile (a chess rook; filled while in build mode, tap to leave or re-enter it), a divider, the piece tiles Wall, Repulsor, Steal and Cannon (soon, locked) with a price badge (Rounds) or stock badge (`×3`, Siege), and the Strategies tile on the right; Powerup and Subterfuge are not offered. **play**: the abilities aligned left — the Build tile (greyed unless an in-play build is open), the Powerup tile (a bolt; filled while the Breaker is armed) and the Subterfuge tile (a theatre mask) — and the shot balls (`Shots 2/3`) and the Refund tile (Rounds only) on the right. Tapping an ability opens it: it slides to the left edge, the other abilities fold away, the shots and Refund step aside, and its options take the row (Build: the pieces at in-play prices; Powerup: Breaker and the locked Overdrive; Subterfuge: the Jam and two locked slots). Tapping it again, or Escape, closes it and the row returns. Picking a Powerup or Subterfuge option closes it; Build stays open while build mode is on. Powerup and Subterfuge still open greyed outside the viewer's turn, their options greyed, so they can be looked at. **rearrange**: a prompt to drag pieces, with OK. **choice**: Repair and Rearrange side by side. Floating over the pitch above the dock: the Strategies tray, the selected structure's controls, Confirm (ball-in-hand) and the map hint. There is no score digit row: the score is in the round line and the structure counts in the Defence bar. The minimap chip sits at the top-left under the far-edge bars, and the ☰ button level with it at the top-right (see Camera → Map).
- A build turn that places pieces opens in build mode with the Wall armed, so the first drag draws.
- In-play build (Rounds): in play, the shooter may place pieces before the round's first shot (ball in hand or placed), at in-play prices (`rules.playBuild`: a wall 2 Credits per unit, a Repulsor 6, a Steal 5; a premium over the build turn's 1, 5 and 4). Such a piece is final: it never joins `built`, so it can be neither moved nor demolished, and it is not selected once placed. The play dock's Build tile enters build mode with the Wall armed and opens to the pieces (no Strategies); Build again leaves it, and the first shot of the round (or the possession changing hands) ends it. While an item is armed, presses on the pitch build instead of aiming or placing the ball. Never in Siege (the mode's `mayPlayBuild` hook). The sim takes it through the same `placeWall` input.
- Strategies: the Strategies tile opens a tray of ready-made layouts floating above the dock, as rounded cards (a preview of the builder's half with the goal at the bottom, the name, the net cost). Tapping one clears this turn's own pieces (refunded in full), then places the layout a piece a tick through the normal `placeWall` input, skipping any piece that does not fit or cannot be paid for; earlier turns' pieces stay. A card where nothing fits is greyed; one that only partly fits shows `placed/total`. The tray closes when a layout is chosen or the turn changes hands. Layouts live in `game/view/strategies.ts`, authored on Player 1's half and point-reflected for Player 2; the plan is a dry run of the sim's own `step`. There are sixteen, in archetype order with no tags on the cards: wall-heavy (Bulwark, Fortress, Honeycomb, Bastion, Layers, Labyrinth), hybrid (Chevron, Zigzag, Net, Pinball, Wings, Gauntlet, Spider), tower-heavy (Turrets, Crossfire, Watchtowers). Each places whole within the Rounds Opening Credits (40) and spends at least 35 of them, and lists its core first.
- The text block is the round line over the phase label. In Rounds the round line is `ROUND 3/7 · 2–1`: the round, then the score with the active player's first; in Siege it is absent and the block is the phase label alone. The phase label (10 px, muted, wide-spaced) reads `Build phase`, `Play phase`, `Rearrange`, or `Placing wall`, `Placing Repulsor` or `Placing Steal` while a build piece is drawn or unplaced; `· Drag to aim` is appended to `Play phase` while the first-play hint would show (round 1, a placed ball, no shot fired yet in the possession).
- The clock ring is a conic drain around a dark disc holding the seconds (the shot clock in play, the build window in a build turn or a pending defence choice, "-" when no clock runs); at 5 s or less it turns red with a dark-red halo and pulses.
- Shots: a ball per Move point, filled while unspent. Refund (Rounds): a button with a refund icon and the rate (`+2 CR`); a tap refunds one Move point, a long-press all but one; greyed when a refund is not allowed (see Possession).
- The Defence bar is a 28 px strip over the far edge of the pitch (the stage's top, or its bottom when seat 2 is at the bottom), two bars meeting in the middle with the structure counts at the outer ends (Bungee 16, in the player's colour). It takes no pointer input and shows in both modes. It reads structure counts only, never hit points. Each player has one slanted bar segment (12 px tall, 3 px gap, 4 px slant) for each structure standing plus one for each of theirs destroyed in play this match (a wall destroyed, a Steal tower sprung), filled from the middle out; a destroyed structure empties the outermost bar segment and the count drops; a broken wall segment (`segment-broken`) leaves the bar as it is, so a wall empties its bar segment only on `wall-destroyed`. A piece the owner takes back (demolished or refunded) leaves no bar segment, so the bar shrinks with it. Bar segments share the bar's width and so narrow as there are more. Player 1 is solid cyan, Player 2 striped orange over dark orange (4 px and 2 px bands at 45 degrees), empty `#1c2540`. Player 1 is on the stage's left, and the 180-degree flip swaps the sides on screen. During the blind opening build the viewer's opponent's side reads `?` with no bar segments. The look (`visual.hud.bar`, `ui/hud/barStyle.ts`) is shared with the Resource bar under it. The pure model is `game/view/defenceBar.ts`; `Game` counts destroyed structures from the sim's `wall-destroyed` and `steal-triggered` events (not `segment-broken`), reset each match, because destroyed structures leave the board.
- The Resource bar is a full-width tug-of-war of the Credits both players hold, a 20 px row directly under the Defence bar (so the stage's top edge, or its bottom when seat 2 is at the bottom, and the 180-degree flip swaps its sides too). It is Rounds only: Siege has no Credits economy (the mode's `hasCredits` hook), so it is not drawn there. Each end shows that player's banked Credits (Bungee 16, in the player's colour, in the same 28 px digit column as the Defence bar), and between them a 12 px slanted bar is filled from each player's side with that player's share of the total (Player 1 solid cyan, Player 2 striped orange, as the Defence bar; empty `#1c2540`). It counts banked Credits only, so it moves at once when anyone spends, refunds or receives the round grant. When both hold 0 it splits evenly (half each); when one holds 0 the other fills it. A change eases over 400 ms (the fills' width). A player's Credits digit flashes when they earn a Bullseye Credit, growing and glowing white for 300 ms (`visual.hud.bar.flash`). It takes no pointer input. The top-pinned overlay labels (Reveal, "Opponent is choosing") clear it as well as the Defence bar when it is shown. The pure model is `game/view/resourceBar.ts`; the look is `ui/hud/ResourceBar.tsx` over `visual.hud.bar`.
- The shell sits inside the rotating stage, so the HUD turns with the flip and the active player's controls are always at the bottom of the screen.
- Overlays (turn card, GOAL, sweeps, REVEAL, "Opponent is choosing") are their own layer, also inside the stage.

### Screens

- Title screen: `BREACH` / `BALL` stacked in Bungee (cyan over orange) over the centre circle and the ball on the halfway line, the tagline `BUILD · SHOOT · BREACH`, on the dot grid; then the Play pill (a hot-seat match, through the settings screen), the Online pill (the Host/Join overlay; a connection does nothing until the online wave), and two ghost circles, settings and help. Player 1's goal mouth peeks up from the bottom edge.
- Attract loop: the Title screen's hero plays a demo. Two to four pieces (walls, Repulsor and Steal towers, in the player colours) circle the outer ring, Player 1's clockwise and Player 2's the other way, one lap in about 15 s; a refill when fewer than two remain and a slow drip keep the ring stocked. Every 2.5–4.5 s the ball shoots from the centre at one of them: a wall deflects it (the honest reflection, bent up to 35° toward another piece, at most three walls per shot) and shatters into flying fragments; a Repulsor bursts its rings and the ball bounces home; a Steal swallows the ball, collapses, and the ball reappears at the centre. A ball that leaves the ring without a target eases home. It is a seeded toy in the hero's SVG units (`src/ui/screens/attract.ts`), not the match physics, and runs on requestAnimationFrame only while the Title screen is up and the tab visible. Until its first frame the hero is the design's still: a wall of each colour and the ball at rest. The wordmark stays on top; pieces pass behind it.
- Help screen: a static how-to-play page (goal, build, shoot, breach, Refund, modes) with Back, reachable from the Title screen and the Side menu (Back returns to where it came from). Its copy is a first draft.
- Side menu: the in-match menu, in the rotating stage so it opens from the viewer's left whichever seat is at the bottom. It opens by a swipe in from the viewer's left edge (a press within 20 px that travels 40 px inward, more across than down) or by the ☰ ghost button at the stage's top-right, level with the minimap chip just inside the far-edge bars (8 px below the 28 px Defence bar, and below the Resource bar's row when it shows; above them when the bars are at the stage's bottom); neither is on the Title, settings, Help or end screens. The edge press is never a pan, an aim or a piece drag (it starts nothing on the board, and a second finger during it is ignored); it works behind a hold too, but not while the map is open. It lists Resume, Help (the static page; Back returns to the menu), the match's settings read-only (mode, then Rounds, Credits per round, Opening Credits and Refund rate in Rounds or Wall points in Siege, then On time out), a device-settings slot holding the Flip on turn toggle (hot-seat only; it shows `Flip on turn: On/Off` and takes effect at the next handover), Restart and Quit to title. Restart (a new match with the same settings) is hot-seat only and absent online; Quit tears the match down and returns to the Title screen, leaving a fresh default match behind it. Each asks for a second tap. Resume, Esc or a tap on the backdrop closes it. While it is open the board ignores pointer and keys. In hot-seat it pauses the sim, so the shot clock and build timer stop and resume where they were; online it never pauses (the clocks and lockstep keep running behind it). Wall-clock holds (flip, goal, turn card) keep running behind it, and a new match closes it.
- Settings screen (mode picker with the chosen mode shown as pressed, then the sliders that mode uses, the "On time out: Shoot / Burn" toggle, Start), match end screen (winner in their colour, final score, or surviving structure count in Siege, Rematch, Menu). Each is its own layer, outside the rotating stage. No tutorial screen in v1 beyond Help.

### Feedback and accessibility

- No sound in v1. The event list exists so an audio layer can subscribe later without touching the renderer.
- Haptics through the Vibration API where supported: short pulse on firing a shot scaled by power, double pulse on goal, short buzz when the hold reaches Power.
- The app ignores the OS reduced-motion preference: animations, screen shake, particles, the flip rotation and haptics always run.
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
