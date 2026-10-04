# One banked resource, Credits, pays for everything

Players used to have two unrelated stocks: wall points granted per build phase and lost if unspent, and a fixed inventory of 3 of each power-up with no economy. We replaced both with a single resource, **Credits**: each round grants a configured amount (default 10), unspent Credits carry over for the whole match, and every item in the Offence, Defence and Subterfuge menus has its own Credit price. A player can also **Refund** unspent Move points for Credits during their possession (default 2 Credits each), betting that fewer shots are enough; refunding the last one hands the opponent ball-in-hand (superseded by [ADR-0006](0006-fixed-kick-off-spots.md): the opponent now restarts from the Centre spot). Credits are now how the game measures a player's resources, shown against the opponent's in the resource bar under the Defence bar.

## Considered Options

- **Keep wall points and the fixed inventory.** Rejected: no trade-off between building, attacking and shooting, and nothing to do with shots you expect not to need.
- **Separate pools per menu (Defence points, Offence points, Subterfuge points), each with its own Refund.** Rejected: three balances to show and three refund choices for one decision; a single currency with per-item prices keeps the trade-off in the price list.
- **One banked resource with per-item prices (chosen).**

## Consequences

- The "Wall points" setting becomes "Credits per round", and a Refund rate setting joins it. Prices live in the rules config.
- Banking changes the build rule that unspent points are lost, and towers stop being free pieces drawn from stock: they cost Credits like walls.
- Credits and Refund are sim state and sim inputs, so they stay deterministic for lockstep.
- Siege keeps its old rules (wall points, fixed inventory) for now and is not ported; it may be retired.
