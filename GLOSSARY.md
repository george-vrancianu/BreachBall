# BreachBall

A two-player pitch game: build structures, then shoot a ball into the opponent's goal. A game mode decides how a match is won.

## Language

**Shot**:
How the shooter moves the ball, pool-style: press on the ball, drag back, release. The ball goes in the opposite direction to the drag, with power from the drag length. Releasing without having dragged, or at the canvas edge (where the Ghost greys out with an ✕), does nothing. It replaced the radial blast (ADR-0003).
_Avoid_: Blast, kick, charge

**Tier**:
The kind of Shot, picked by how long the shooter holds still on the ball before dragging; the first drag locks it. Each tier sets its control radius (how far the drag can usefully go, drawn as the Gauge's limit), power curve and range, and Ghost. **Touch** (drag right away) is weak and precise: a large radius, a longer drag is stronger, a long green Ghost. **Power** (hold 1 s) is strong: a small radius, a shorter drag is stronger, a short red Ghost.
_Avoid_: Mode, level, charge

**Ghost**:
The ball's predicted path, drawn while aiming a Shot in its Tier's colour as drifting, fading dots from the Comet's tip, showing where it will go. Each Tier caps it at a number of bounces (off structures or boards, those under the Comet included) and a reach past the Comet's tip that grows with the shot's power: Touch shows up to 3 bounces and far, Power 1 bounce and a short stub. A goal ends it. Only this is the Ghost: the translucent ball-in-hand disc is the placement, and the translucent piece dragged in a build turn is the build piece.
_Avoid_: Preview, arrow, trajectory; "ghost" for the ball-in-hand placement or the build piece

**Gauge**:
The control gauge drawn around the ball while aiming a Shot: a scale band in the Tier's colour from the inner cancel circle out to the Tier's limit (its control radius), with end labels saying where power is high and low, and a knob at the finger with a power readout. It shows only the current Tier's limit; reaching Power morphs it from the Touch size to the Power size. It replaced the faint control ring.
_Avoid_: Control ring, power ring, dial

**Comet**:
The direction indicator while aiming a Shot: a glowing spear with an arrowhead from the ball's edge along the shot, in its Tier's colour, longer with more power, chevrons running along it. It shows only the direction and strength; the Ghost starts at its tip, its reach measured from there, and shows where the ball will go.
_Avoid_: Trajectory, Ghost, arrow

**Splash**:
The burst every Power Shot sets off where the ball starts, damaging every structure in range (a wall segment by segment), the shooter's own included and across the halfway line. It grows with power within the Tier; the shooter's own structures lose hit points only to its strongest part. It doesn't move the ball.
_Avoid_: Blast, explosion, area damage

**Tracer**:
The glowing tail a fired Shot leaves behind the moving ball, in the colour of the Tier that fired, with the sparks it sheds and the flashes at its bounces. It shows where the ball has been; the Ghost shows where it will go. It loses its colour when the ball rests or possession changes.
_Avoid_: Trail, streak, trajectory; "Ghost" for the path already travelled

**On time out**:
The match setting, shown in every mode, for what an expiring shot clock does with the shooter's turn: **Shoot** (the default) fires the aim they are holding, or burns the shot if they hold none (not yet dragged, or cancel-armed at the edge); **Burn** always burns the shot. In code, `expiry: 'shoot' | 'burn'`.
_Avoid_: Auto-fire, expiry mode, Fire

**Rounds**:
The game mode where a match is a series of rounds, each with its own build phase, decided by score after the configured number of rounds (a tie goes to sudden death).
_Avoid_: Classic, standard mode

**Siege**:
The game mode with no score and no rounds: each player builds once, then play continues, a goal handing the conceder a Kick-off.
_Avoid_: Endless mode, sandbox

**Game mode**:
The set of rules that owns a match's match-level transitions: how it starts, what a goal and a consumed shot do, and who has won.
_Avoid_: Variant, ruleset

**Defence turn**:
The scorer's reward for a goal in Siege: after the GOAL banner they choose how to improve their defence (Repair or Rearrange) before the conceder kicks off. An own goal gives it to the opponent of the shooter. Online, the build timer covers the choice and any Rearrange together; an unanswered choice becomes Repair.
_Avoid_: Bonus turn, power-up

**Repair**:
The defence-turn choice that restores every surviving structure the scorer owns to full HP; destroyed structures stay gone, and so do Gaps (only standing Wall segments are restored).
_Avoid_: Heal, rebuild

**Rearrange**:
The defence-turn choice that opens a build-style turn for the scorer in which every structure they own can be moved and rotated to any legal spot on their half, HP and Gaps unchanged. Placing and demolishing are refused, so the structure count can only fall. OK ends it, and OK with nothing moved is the escape hatch. The choice is final: there is no way back to Repair.
_Avoid_: Reposition, rebuild

**Wipe-out**:
Siege's end condition: a player owns no structures (towers included) when the ball comes to rest or a goal is scored, never mid-flight. If both players are at zero, the shooter loses.
_Avoid_: Elimination, knockout

**Blind build**:
Siege's opening build, during which each viewer sees only their own half; the opponent's structure count, tower stock and build points are hidden. Hiding is renderer and HUD only, the sim state is complete.
_Avoid_: Hidden build, secret build

**Reveal**:
The 1.5 s hold after the second OK of a Siege opening build: the fog lifts and the map camera shows both layouts at once, then play begins. Rounds and Rearrange have none.
_Avoid_: Unveil, showdown

**Fog**:
The renderer's cover over the opponent's half (up to the halfway line, boards and nets included) during a blind build, in the main view and the map.
_Avoid_: Mask, blackout

**Minimap chip**:
The small chip at the top-left, just under the far-edge bars (the ☰ button sits level with it at the top-right), showing a thumbnail of the whole pitch with the main camera's frame on it (and the Fog over the opponent's half in a blind build). Tapping it opens the Map view; while open it is a filled ✕ that closes it.
_Avoid_: Radar, overview button

**Dock**:
The panel at the active player's edge of the screen (the bottom for Player 1; in Tabletop mode the top for Player 2) holding the active viewer's controls, in two rows: the status row (balance chip, round and phase, clock, Recenter, and OK in a build turn) and the action row. The action row depends on the turn: the build dock has Build (a chess rook) on the left, the Defence pieces beside it and Strategies on the right; the play dock has the abilities on the left, Build (for an in-play build), Powerup (a bolt) and Subterfuge (a theatre mask), each opening in place to its options, and the shots and Refund on the right; a Rearrange turn shows a prompt and a defence choice shows Repair and Rearrange.
_Avoid_: Bottom menu, HUD bar, toolbar

**In-play build**:
Placing Defence pieces in play, in Rounds, by the shooter before the round's first shot, at a premium (`rules.playBuild`): a wall 2 per unit, a Repulsor 6 and a Steal 5. The pieces are final: they can be neither moved nor demolished.
_Avoid_: Mid-game build, quick build

**Strategy**:
A ready-made defence layout offered in the build dock's tray, drawn as a card with a preview of the builder's half and its net cost. Tapping one clears this turn's own pieces (refunded in full) and places the layout a piece a tick through the normal placing rules; a piece that does not fit or cannot be paid for is skipped. Each declares its core, the number of leading pieces that form its essential shape and fit one round's Credits per round (and, in Siege, the default Wall points (30) and the tower stock), so a full-budget Strategy tapped in a later, poorer round still drops its core. Every Strategy is full-budget: it spends 35 to 40 of the default Opening Credits (40; the setting runs 10 to 80). Authored on Player 1's half and point-reflected for Player 2.
_Avoid_: Preset, template, formation, plan (the tile's short label is Plans)

**Map view**:
The whole pitch fitted above the HUD band, opened from the Minimap chip. The main camera's frame is drawn on it, dashed with solid corner brackets, and tapping the pitch jumps the main camera there. The Reveal holds the same camera.
_Avoid_: Overview, zoom-out

**Title screen**:
The menu shown when no match is running, where a match is started or joined: start a hot-seat match, go online, settings, help. Quitting a match returns here.
_Avoid_: Title, main menu, main screen, home, start screen

**Attract loop**:
The demo the Title screen's hero plays while nobody presses Play: pieces circle the centre ring and the ball shoots at them. A toy with its own rules, not the match physics; it only hints at what the pieces do.
_Avoid_: Demo, screensaver, background animation, idle animation

**Tabletop mode**:
The device setting, on by default and for hot-seat only, that decides what turns when the turn passes. On, the pitch stays put and only the HUD layer turns 180 degrees to face the active player, so one device lying flat between two players works for both. Off, the whole stage, pitch included, flips so the active player's end is at the bottom. It replaces Flip on turn.
_Avoid_: Flip on turn, flip mode, table mode

**Canvas layer** / **HUD layer**:
The two layers of the in-match stage: the canvas layer is the pitch, and the HUD layer is everything the player reads and taps over it (the Dock, bars, chips, the Overlay and the Side menu). Tabletop mode turns only the HUD layer; with it off they turn together.
_Avoid_: Stage (when only one layer is meant), canvas and DOM

**Side menu**:
The in-match menu, opened by a swipe in from the viewer's left edge or its ☰ button: Resume, Help, the match's settings (read-only), the Tabletop mode toggle (a device setting, on by default; hot-seat only), Restart (hot-seat only) and Quit to the Title screen. It pauses the clocks in hot-seat, never online.
_Avoid_: Pause menu, main menu, drawer

**Move point**:
One shot of a possession: each possession starts with the configured number (default 3), and every shot spends one. Unspent Move points can be refunded for Credits.
_Avoid_: Shot (for the counter), move, action point

**Defence bar**:
The segmented bar at the far edge showing how many structures each player still has standing, one Bar segment per structure. It counts structures, not their hit points: a wall is one structure while any of its Wall segments stands.
_Avoid_: Health, health strip, HP bar

**Bar segment**:
One slanted piece of the Defence bar, standing for one structure of a player's (or one destroyed in play this match). It empties only when that structure is destroyed; a wall's Gap does not empty it.
_Avoid_: Segment (bare, for the bar's piece), pip, block

**Subterfuge**:
The third family of actions, beside Offence and Defence: actions that cripple the opponent's next possession rather than improving your own shot or structures.
_Avoid_: Sabotage, debuff, special

**Credits**:
The single resource every Offence, Defence and Subterfuge item is bought with, each item at its own price. A player's round-1 build turn holds the Opening Credits; every later build turn adds a grant, and unspent Credits are kept for the rest of the match.
_Avoid_: Build points, power-up points, resources, energy (and Wall points in Rounds; see below)

**Opening Credits**:
The Credits each player's round-1 build turn holds in Rounds, instead of (not on top of) the Credits-per-round grant; nothing is banked before it. From round 2 on every build turn adds the grant to the bank. A setting alongside Credits per round (10 to 80, default 40), shown in the Side menu. Siege's opening build holds it too, as Wall points (default 30).
_Avoid_: Start points, starting credits

**Wall points**:
Siege's build balance: what its one opening build is paid in, spent on walls (Siege towers come from its fixed stock). It comes from the Opening Credits setting, labelled Wall points in Siege (default 30, so matches do not drag on), and Siege has no Credits-per-round slider. Siege has no Credits economy, so it never says Credits. It shares the Rounds wall price: 1 wall point per unit.
_Avoid_: Credits (in Siege), build points

**Refund**:
Trading an unspent Move point for Credits during your own possession, before a shot. It is a bet that the remaining shots are enough: refunding the last Move point hands the opponent a Centre-spot restart, as running out of shots does.
_Avoid_: Convert, cash in, sell

**Offence**:
The family of items that power up your own shot, bought with Credits during your possession. The Breaker is the first.
_Avoid_: Attack, power-ups (as the family name)

**Defence**:
The family of items you build on your half (walls, towers), bought with Credits during your build turn: a wall by its units (1 each), a Repulsor 5 and a Steal 4. A tower placed this turn is refunded in full if demolished, as a wall is. Siege keeps its fixed tower stock instead.
_Avoid_: Build menu, structures (as the family name)

**Wall**:
The Defence item drawn on your half as one straight line in a single drag: it starts where the drag starts and ends where it ends, at one of the allowed angles (default 0°, 45°, 90°, 135°) and a whole number of units long (default 1 or 2). Walls may touch end to end or in a T but never cross or overlap; a corner is two walls whose ends meet (ADR-0005). It is cut into Wall segments, one per Unit, each with its own health (ADR-0007).
_Avoid_: Straight wall, L wall, piece (for a placed wall; "build piece" and "fallback piece" stay), block, barrier

**Unit**:
The length a wall is measured in and priced by: every unit costs the same Credits at any angle (1 in a build turn, 2 in an in-play build). One unit is the old straight wall's length end to end. A unit is the length; a Wall segment is the piece of wall of that length.
_Avoid_: Cell (for wall length), tile

**Wall segment**:
One unit's length of a Wall, with its own health (3 hit points): a hit, a Splash or a Breaker acts on the segment it reaches. A 2-unit wall has two. At 0 it breaks and leaves a Gap; the wall is destroyed only when its last segment breaks (ADR-0007).
_Avoid_: Segment (bare: say Wall segment or Bar segment), cell, piece, section

**Gap**:
What a broken Wall segment leaves: a hole in the wall with no collision, which the ball passes through while the rest of the wall keeps standing. It is permanent (Repair restores standing segments only) and still blocks placing a new wall over it.
_Avoid_: Hole, opening (and Breach, which is the Breach mark)

**Joint**:
Where two standing Wall segments of one wall meet, drawn as a dark seam with a small bolt. It has no effect on play.
_Avoid_: Seam, hinge (a corner is two walls, not a Joint)

**Breach mark**:
The smudge and rubble a Gap leaves on the pitch, under walls and the ball, for as long as the wall stands, so players see why building there is illegal. It fades when the wall is destroyed.
_Avoid_: Scorch (that is damage on a wall), crater

**Centre zone**:
The no-build circle around the centre spot that walls and towers must stay wholly outside, beside the goal no-build zone and the own-half rule. It has the same radius as the Boost ring, but it is a build rule, not a shot rule.
_Avoid_: Kick-off circle, centre ring (that is the Attract loop's), middle zone

**Goal no-build zone**:
The semicircle around each goal mouth that walls and towers must stay wholly outside (the no-build radius in the rules config).
_Avoid_: Goal box, protected area

**Keep-out arc**:
The drawn edge of the goal no-build zone: a dashed arc around each goal, neutral, taking the builder's colour while that player builds.
_Avoid_: No-build line, goal arc

**Snap grid**:
The faint dots, in the builder's colour, at every cell corner (`rules.cellSize`) drawn on the builder's own half during a build, marking the cells a tower sits in (walls are free lines, so they don't snap to it). Separate from the ground's decorative dot grid.
_Avoid_: Build grid

**Build-zone edge**:
The dashed halfway-line marker drawn during a build in the builder's colour. It is only a marker; building is allowed on the whole half.
_Avoid_: Build line, half line

**Breaker**:
The Offence item that makes the armed shot destroy the first tower or Wall segment it touches, either player's, then carry on. It breaks one segment of a wall, not the whole wall.
_Avoid_: Breach Ball, piercing shot

**Resource bar**:
The full-width bar under the Defence bar showing each player's share of the Credits both hold, filling from each player's side. Beside the Defence bar it shows what a player can still deploy against what they have standing.
_Avoid_: Mana bar, economy bar, credit meter

**Jam**:
The first Subterfuge item: the opponent's next possession starts with one Move point fewer.
_Avoid_: Freeze, stun

**Kick-off**:
How a possession starts at match start, after every goal (the conceder kicks) and at every new Rounds round: the ball sits fixed on the centre-line x, `rules.kickoffGap` out from the kicker's own goal line. There is no placement (ADR-0006).
_Avoid_: Ball-in-hand (for a kick-off), serve

**Centre-spot restart**:
How the opponent gets the ball after a non-goal hand-over (two shot-clock expiries in a row, running out of Move points on your own half, or refunding the last Move point): fixed on the centre spot, with no placement. It never Charges the ball (ADR-0006).
_Avoid_: Drop ball, ball-in-hand (for a restart)

**Ball-in-hand**:
Placing the ball anywhere on your own half before shooting. Only a Steal gives it (ADR-0006).
_Avoid_: Free kick

**Boost ring**:
The circle around the centre spot, with the same radius as the Centre zone. A shot that comes to rest with the ball's centre inside it Charges the ball ×1.5.
_Avoid_: Centre zone (that is the no-build rule), hot zone, power zone

**Bullseye**:
The small circle (radius 2) at the centre spot, inside the Boost ring. A shot that comes to rest in it Charges the ball ×2, and in Rounds a ball entering it from outside earns the shooter 2 Credits, once per shot, however the shot ends.
_Avoid_: Inner ring, inner circle

**Charged**:
A ball resting in the Boost ring or Bullseye because a shot came to rest there. The next shot fired from it, by whoever holds possession and in either Tier, has its speed multiplied (×1.5 or ×2, no cap), and the Ghost shows that. A burned shot keeps the charge; a hand-over or restart moves the ball and loses it.
_Avoid_: Boosted, powered

**Pallet**:
A neutral rotating bat that is part of the map: it is not built, has no owner and cannot be damaged. It spins in place all the time. During a live shot, a ball inside its Activation ring is tracked and swatted head-on, and the exit depends on where the arm strikes and how fast it swings. The game mode decides where Pallets go; by default there are two on the halfway line, one near each side board. Between shots the arm spins but does not collide (ADR-0009).
_Avoid_: Palette, bat, deflector, flipper

**Activation ring**:
The circle around a Pallet's pivot inside which it tracks the ball. It is drawn as a faint dashed ring that brightens while tracking, and it is a no-build zone, ball-in-hand included. While aiming, the Ghost treats the Pallet arm as frozen at its current angle and ends at the arm or where it leaves the ring.
_Avoid_: Pallet radius, range

**Palleted ball**:
A ball a Pallet has just swatted. It carries 2 pierces: each Wall segment or tower it touches, either player's, breaks or is destroyed outright and uses up one pierce, and the ball keeps its speed. A destroyed Repulsor or Steal does not fire. Bouncing off the boards keeps the pierces. The state ends when both are spent or the ball comes to rest, and a new swat resets it to 2. Not the same as Charged.
_Avoid_: Charged, swatted, super ball
