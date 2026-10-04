# BreachBall

A two-player pitch game: build structures, then shoot a ball into the opponent's goal. A game mode decides how a match is won.

## Language

**Shot**:
How the shooter moves the ball, pool-style: press on the ball, drag back, release. The ball goes in the opposite direction to the drag, with power from the drag length. Releasing without having dragged, or at the canvas edge (where the Ghost greys out with an ✕), does nothing. It replaced the radial blast (ADR-0003).
_Avoid_: Blast, kick, charge

**Tier**:
The kind of Shot, picked by how long the shooter holds still on the ball before dragging; the first drag locks it. Each tier sets its control radius, power curve and range, and Ghost. **Touch** (drag right away) is weak and precise: a large radius, a longer drag is stronger, a full green Ghost. **Power** (hold 1 s) is strong: a small radius, a shorter drag is stronger, a short red Ghost.
_Avoid_: Mode, level, charge

**Ghost**:
The ball's predicted path, drawn from the ball while aiming a Shot in its Tier's colour, showing where it will go. Only this is the Ghost: the translucent ball-in-hand disc is the placement, and the translucent piece dragged in a build turn is the build piece.
_Avoid_: Preview, arrow, trajectory; "ghost" for the ball-in-hand placement or the build piece

**Splash**:
The burst every Power Shot sets off where the ball starts, damaging every structure in range, the shooter's own included and across the halfway line. It grows with power within the Tier; the shooter's own structures lose hit points only to its strongest part. It doesn't move the ball.
_Avoid_: Blast, explosion, area damage

**On time out**:
The match setting, shown in every mode, for what an expiring shot clock does with the shooter's turn: **Shoot** (the default) fires the aim they are holding, or burns the shot if they hold none (not yet dragged, or cancel-armed at the edge); **Burn** always burns the shot. In code, `expiry: 'shoot' | 'burn'`.
_Avoid_: Auto-fire, expiry mode, Fire

**Rounds**:
The game mode where a match is a series of rounds, each with its own build phase, decided by score after the configured number of rounds (a tie goes to sudden death).
_Avoid_: Classic, standard mode

**Siege**:
The game mode with no score and no rounds: each player builds once, then play continues, a goal handing the conceder ball-in-hand at the pitch center.
_Avoid_: Endless mode, sandbox

**Game mode**:
The set of rules that owns a match's match-level transitions: how it starts, what a goal and a consumed shot do, and who has won.
_Avoid_: Variant, ruleset

**Defence turn**:
The scorer's reward for a goal in Siege: after the GOAL banner they choose how to improve their defence (Repair or Rearrange) before the conceder gets ball-in-hand. An own goal gives it to the opponent of the shooter. Online, the build timer covers the choice and any Rearrange together; an unanswered choice becomes Repair.
_Avoid_: Bonus turn, power-up

**Repair**:
The defence-turn choice that restores every surviving structure the scorer owns to full HP; destroyed structures stay gone.
_Avoid_: Heal, rebuild

**Rearrange**:
The defence-turn choice that opens a build-style turn for the scorer in which every structure they own can be moved and rotated to any legal spot on their half, HP unchanged. Placing and demolishing are refused, so the structure count can only fall. Done ends it, and Done with nothing moved is the escape hatch. The choice is final: there is no way back to Repair.
_Avoid_: Reposition, rebuild

**Wipe-out**:
Siege's end condition: a player owns no structures (towers included) when the ball comes to rest or a goal is scored, never mid-flight. If both players are at zero, the shooter loses.
_Avoid_: Elimination, knockout

**Blind build**:
Siege's opening build, during which each viewer sees only their own half; the opponent's structure count, tower stock and build points are hidden. Hiding is renderer and HUD only, the sim state is complete.
_Avoid_: Hidden build, secret build

**Reveal**:
The 1.5 s hold after the second Done of a Siege opening build: the fog lifts and the map camera shows both layouts at once, then play begins. Same hold under reduced motion; Rounds and Rearrange have none.
_Avoid_: Unveil, showdown

**Fog**:
The renderer's cover over the opponent's half (up to the halfway line, boards and nets included) during a blind build, in the main view and the map.
_Avoid_: Mask, blackout

**Minimap chip**:
The small chip at the near band's bottom-right showing a thumbnail of the whole pitch with the main camera's frame on it (and the Fog over the opponent's half in a blind build). Tapping it opens the Map view; while open it is a filled ✕ that closes it.
_Avoid_: Radar, overview button

**Map view**:
The whole pitch fitted above the HUD band, opened from the Minimap chip. The main camera's frame is drawn on it, dashed with solid corner brackets, and tapping the pitch jumps the main camera there. The Reveal holds the same camera.
_Avoid_: Overview, zoom-out

**Title screen**:
The menu shown when no match is running, where a match is started or joined: start a hot-seat match, go online, settings, help. Quitting a match returns here.
_Avoid_: Title, main menu, main screen, home, start screen

**Attract loop**:
The demo the Title screen's hero plays while nobody presses Play: pieces circle the centre ring and the ball shoots at them. A toy with its own rules, not the match physics; it only hints at what the pieces do.
_Avoid_: Demo, screensaver, background animation, idle animation

**Side menu**:
The in-match menu, opened by a swipe in from the viewer's left edge or its ☰ button: Resume, Help, the match's settings (read-only), the flip toggle, Restart (hot-seat only) and Quit to the Title screen. It pauses the clocks in hot-seat, never online.
_Avoid_: Pause menu, main menu, drawer

**Move point**:
One shot of a possession: each possession starts with the configured number (default 3), and every shot spends one. Unspent Move points can be refunded for Credits.
_Avoid_: Shot (for the counter), move, action point

**Defence bar**:
The segmented bar at the far edge showing how many structures each player still has standing, one segment per structure. It counts structures, not their hit points.
_Avoid_: Health, health strip, HP bar

**Subterfuge**:
The third family of actions, beside Offence and Defence: actions that cripple the opponent's next round rather than improving your own shot or structures.
_Avoid_: Sabotage, debuff, special

**Credits**:
The single resource every Offence, Defence and Subterfuge item is bought with, each item at its own price. A player gets a grant each round and keeps unspent Credits for the rest of the match.
_Avoid_: Wall points, build points, power-up points, resources, energy

**Refund**:
Trading an unspent Move point for Credits during your own possession, before a shot. It is a bet that the remaining shots are enough: refunding the last Move point hands the opponent ball-in-hand, as running out of shots does.
_Avoid_: Convert, cash in, sell

**Offence**:
The family of items that power up your own shot, bought with Credits during your possession. The Breaker is the first.
_Avoid_: Attack, power-ups (as the family name)

**Defence**:
The family of items you build on your half (walls, towers), bought with Credits during your build turn.
_Avoid_: Build menu, structures (as the family name)

**Wall**:
The Defence item drawn on your half as one straight segment in a single drag: it starts where the drag starts and ends where it ends, at one of the allowed angles (default 0°, 45°, 90°, 135°) and a whole number of units long (default 1 or 2). Walls may touch end to end or in a T but never cross or overlap; a corner is two walls whose ends meet (ADR-0005).
_Avoid_: Straight wall, L wall, piece (for a placed wall; "build piece" and "fallback piece" stay), block, barrier

**Unit**:
The length a wall is measured in and priced by: every unit costs the same Credits at any angle. One unit is the old straight wall's length end to end.
_Avoid_: Segment, cell (for wall length), tile

**Centre zone**:
The no-build circle around the centre spot that walls and towers must stay wholly outside, beside the goal no-build zone and the own-half rule.
_Avoid_: Kick-off circle, centre ring (that is the Attract loop's), middle zone

**Breaker**:
The Offence item that makes the armed shot destroy the first structure it touches, either player's, then carry on.
_Avoid_: Breach Ball, piercing shot

**Resource bar**:
The full-width bar under the Defence bar showing each player's share of the Credits both hold, filling from each player's side. Beside the Defence bar it shows what a player can still deploy against what they have standing.
_Avoid_: Mana bar, economy bar, credit meter

**Jam**:
The first Subterfuge item: the opponent's next possession starts with one Move point fewer.
_Avoid_: Freeze, stun
