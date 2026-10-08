# Presentation is OOP entities over a pure sim

The client splits into a game renderer and a React HUD. The renderer is OOP: a `Game` instance owns entity objects (camera, pitch, ball, structures, fog, aim) that animate themselves and expose imperative methods to their parents. The sim in `src/sim` stays a pure, deterministic step function, and entities only read `SimState` snapshots and own visual state (trails, fragments, flashes, smoothing). We kept the sim pure because lockstep online play needs every peer to compute the same state from the same inputs, and ADR-0001's game modes are pure hooks over that sim.

## Considered Options

- **Entities are the game (a `Ball` steps its own physics).** Rejected: it rewrites a tested sim, reverses ADR-0001, and makes determinism depend on mutable objects updating in a fixed order.
- **Entities as views over a pure sim (chosen).**

## Consequences

- `Game` routes `SimEvent`s to entity methods (`hit()`, `shatter()`, `shake()`); entities never see sim events, so they stay reusable outside a match.
- Entities may take pure view models from `game/view` as input (the Build overlay from `buildOverlay`), still never sim events: the rules stay in the view model, the entity only draws them.
- `Game` and the HUD share a parent React component. `Game` pushes a HUD view up through a callback (only when it changes) into the parent's state; the HUD drives the game through an imperative actions handle. `Game` never reads that state back: the sim and `Game` stay the source of truth.
- Rendering stays on Canvas 2D, but entities follow a scene graph (parent, children, local transform), so a later move to a WebGL library such as PixiJS maps one entity to one container.
