# Kick-offs and restarts use fixed spots, not ball-in-hand

Every fresh possession used to start with **ball-in-hand**: the ball reset to the centre spot and the shooter could place it anywhere on their own half. Match start, a goal (both modes), a new Rounds round, running out of Move points, refunding the last one, a second consecutive shot-clock expiry and a Steal all did this. With the new Boost ring and Bullseye in the middle of the pitch, free placement would let a player park a Charged ball on demand, and it made every restart feel the same. We replaced it with two fixed spots and no placement:

- **Kick-off**: match start, every goal (the conceder kicks) and every new Rounds round (the coin flip still picks the kicker after a scoreless shot cap). The ball sits at the pitch centre-line x, `rules.kickoffGap` (5 units) out from the kicker's own goal line, which is inside their keep-out arc so no wall can block it.
- **Centre-spot restart**: every non-goal hand-over (a second consecutive expiry, running out of Move points with the ball on your own half, refunding the last Move point). The opponent gets the ball fixed on the centre spot. A ball that rests on the opponent's half still just passes possession there, as before.

**Steal keeps ball-in-hand.** Placing the ball is the tower's reward, and a steal is not a restart.

## Considered Options

- **Keep ball-in-hand and only move the default spot.** Rejected: the player can place it anywhere anyway, so nothing changes.
- **Ball-in-hand limited to an area near your own goal.** Rejected: more UI and rules for a small gain over a fixed spot.
- **Fixed spots, Steal excepted (chosen).**

## Consequences

- A ball put on the centre spot by a restart is not Charged, even though it sits in the Bullseye: only a shot that comes to rest in a ring charges the ball. Rolling out from the centre spot does not count as a Bullseye pass-through either; the ball has to enter from outside.
- The first shot-clock expiry still only burns a shot. Its "place an unplaced ball at the centre of the shooter's half" branch now only applies after a Steal.
- Siege's "a goal hands the conceder ball-in-hand at the pitch center" becomes a kick-off from their own goal. The defence turn still comes first.
- `GameMode.onGoal`, `endRound` and `handOver` stop using `inHand: true` for anything except Steal.
