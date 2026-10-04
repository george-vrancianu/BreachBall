# Walls are drawn segments at 45° steps, not grid pieces

Walls were grid pieces: a pivot vertex, a shape (Straight 4 cells or L 3+3) and a rotation in 90° steps, placed through a palette, drag, Rotate, Confirm flow, with "no diagonals" written into the spec. Building was slow and the pieces were coarse. We replaced the piece model with a **drawn segment**: a wall is two endpoints in free world coordinates, at an angle from a configured set (default 0°, 45°, 90°, 135°) and a length from a configured set of whole units (default 1 or 2, one unit being the old straight wall's length end to end). The builder draws it in one drag and lifts to place; a placed wall is edited by its ends or by its body. Every unit costs the same Credits whatever its angle. The L wall is gone: corners are two walls whose ends touch, and overlap is now forbidden instead of allowed.

## Considered Options

- **Keep the grid pieces and only change the gesture** (drag sets the pivot and one of four rotations). Rejected: no diagonals, so defences stay boxy, and the L needs a second gesture or a menu pick.
- **Grid-aligned walls of variable length, no diagonals.** Rejected: same boxiness; the grid buys nothing once the drag sets the length.
- **Free angle and free length.** Rejected: pricing by length makes every wall max length or needs fractional Credits, and free angles make chaining ends imprecise. A small angle set and whole units keep prices flat and corners clean.
- **Segments at 45° steps with whole-unit lengths (chosen).**

## Consequences

- The sim loses `wallCells`, the L shape and the rotation quarter-turns; segments are the only geometry. Ball collision already runs on segments.
- The **reachability rule** is dropped rather than rebuilt for diagonals. A player who seals their own goal wastes Credits on walls the opponent can break; the economy is the deterrent.
- Overlap and crossing are illegal (end-to-end and T touches are fine). The old "L shapes can form boxes" is replaced by chained walls.
- Towers keep their single grid cell and their own pricing; the angle and length sets only apply to walls.
- A 2-unit wall is one structure with one HP pool, like the old L.
- Siege's timeout fallback becomes a 1-unit horizontal wall. Rearrange moves and rotates segments the same way.
- A centre no-build circle (radius 3 cells) joins the goal no-build zone and the own-half rule.
- Issue #81's `Straight · 2` and `L wall · 3` pills collapse to one Wall item priced per unit, and its menu opens on a hold of the Defence circle instead of a tap.
