# Pallets: neutral map pieces that move, substepped locally, with a frozen-arm Ghost

Matches need a source of chaos that both players can try to use. We add **Pallets**: rotating bats that are part of the map, not built by players, following the prototype in `docs/breachball-pallets.html` ("Pallet physics" model, "Head-on" aim). A Pallet spins in place. When the ball enters its **Activation ring** during a live shot, it tracks the ball and swats it. The swatted ball becomes a **Palleted ball** that pierces up to 2 Wall segments or towers.

Until now every collider in the sim was static and every piece of the map had an owner. Pallets break both rules, so we decided:

- **Neutral entity, not a `Structure`.** Pallets live in their own `SimState.pallets` list. They have no owner, can't be damaged, and are always solid while a shot is live. Every `Structure` keeps its `owner`.
- **Moving collision, substepped locally.** The arm is a tapered capsule. Its surface velocity (ω×r) feeds the bounce, so the exit speed depends on where the arm strikes the ball and how fast it is swinging. While the ball is inside an Activation ring, that tick is split into about 10 substeps. Every other tick keeps the existing swept circle-vs-segment `rollBall`.
- **Deterministic chaos, no RNG.** Each Pallet's starting angle is a hash of `match.seed`. The idle spin runs every tick, including while the ball is at rest between shots, so the shooter can time the release against the spin. There is no other jitter.
- **Inert between shots.** The arm keeps spinning, but it only collides while the shot is live, so it never restarts a ball at rest.
- **Exit speed** is clamped to [`maxSpeed`, 2 × `maxSpeed`].
- **Frozen-arm Ghost.** `predictPath` runs the real `step`, so a straight replay would give away exactly where the swat sends the ball. While aiming, the Ghost is recomputed every frame with the arm treated as a static bat at its current angle: no tracking, no swing. The Ghost ends at the first contact with the arm, or where it leaves the ring. It helps with timing without revealing the result.

## Considered Options

- **Entry-angle model** (mirror off the ring plus a fixed boost, with the swing only drawn). Rejected: it is cheap and fits the static sweep, but it is predictable, and the Pallet would read as a bumper.
- **Aim toward a goal.** Rejected: a neutral piece of the map shouldn't pick a team.
- **Seeded jitter on the exit angle.** Rejected: pure randomness would cancel out the timing skill.
- **A full-replay Ghost** gives away the outcome. **Cutting the Ghost at the ring** gives no help with timing. **Ignoring the Pallet in the Ghost** lies to the player. All three rejected in favour of the frozen arm.
- **Pallets as owned `Structure`s.** Rejected: ownership feeds build legality, Splash leniency, Steal and the Defence bar, and none of these apply to Pallets.

## Consequences

- **Config:** `SimConfig.pallets: PalletSpot[]`, with a default per game mode. Both Rounds and Siege default to two spots on the halfway line at (6, 54) and (34, 54): Activation ring radius 5, arm length 2.5 (the ring must cover the arm, its tip and a ball on each side), swing and idle tunables in `rules`. A Settings toggle turns Pallets off.
- **Build rules:** each Activation ring is a no-build zone, like the Centre zone. This covers ball-in-hand placement too.
- **Palleted ball:** a Pallet hit sets 2 pierces. While pierces remain, each touched Wall segment breaks fully and each tower is destroyed outright, either player's, with no speed threshold. The ball keeps its speed, as with the Breaker. A destroyed Repulsor or Steal does not fire. Bouncing off the boards keeps the pierces. The state ends when both pierces are spent or the ball comes to rest. A new Pallet hit resets it to 2.
- **Ghost cost:** one `predictPath` per frame while aiming.
- **Rendering:** a faint dashed ring that brightens while tracking, swing ghosts and a hit flash, always visible through Fog. Pallets are not drawn on the Minimap chip.
- **Determinism:** the substeps are fixed-count and float-only, the same as the rest of the sim. Determinism tests must cover a Pallet swat.
