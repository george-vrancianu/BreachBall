# Wall health is per segment, and a broken segment leaves a Gap

ADR-0005 made a 2-unit wall "one structure with one HP pool", so a ball that cracked one end cracked the whole wall and a break removed every unit at once. We cut each wall into **wall segments**, one per unit (`rules.wall.unit`), each with its own health (`rules.wallHp`, 3), held in `Wall.segments` (index 0 at end `a`). A hit, a Splash and the Breaker act on the segment they reach. A segment at 0 is a **Gap**: it has no collision, the rest of the wall keeps standing, and the Gap is permanent (Repair restores standing segments only). The wall is destroyed, and removed, only when its last segment breaks. This replaces ADR-0005's one-pool line; towers keep their single `hp`.

## Considered Options

- **Keep one pool per wall.** Rejected: a long wall reads as one lump, nothing can be breached part-way, and the Breaker and Splash cannot tell a glancing end from a direct hit.
- **Split a wall into separate objects when a segment breaks.** Rejected: the survivors would need new ids, prices, selection and Rearrange rules, and the Defence bar would count extra structures.
- **Per-segment health inside one wall (chosen).** A wall keeps its id, price, refund and demolish cost (all by units), and its bar segment.

## Consequences

- **Balance:** health stays at 3 per segment, so a 2-unit wall now holds 6 HP in total for the same price, and opening a Gap still takes 3 hits. Splash and the Breaker no longer reach past the segment they touch. Siege games may run longer, because a wipe-out needs every segment of every wall gone; watch this in play-testing and tune `rules.wallHp` if it drags.
- **Events:** `wall-cracked` gains `segment`; the new `segment-broken { id, segment, wall, at }` reports a Gap; `wall-destroyed` gains `segment` and fires only for a wall's last segment (a Breaker sets `breaker: true` on it). The damage path is `damageSegment`; `damageWall` finds the segment from the hit point.
- **Splash** is judged per segment: each standing segment takes the pressure at its own nearest point to the origin, with the existing thresholds.
- **Counting:** a wall is one structure while any segment stands, so the Defence bar and the Siege wipe-out are unchanged and a bar segment empties only on `wall-destroyed`.
- **Geometry:** collision (`wallSegments`) offers only standing segments, so the ball, the Ghost and ball-in-hand pass through a Gap. Placement legality still uses the wall's full footprint, Gaps included, so a new wall cannot be built over one.
- **Moves:** a Rearrange moves the whole wall with its per-segment health and Gaps. A build turn's own pieces change length only while undamaged, so a resize re-creates full segments.
- The renderer draws each segment as its own bar, with joints between standing segments, jagged ends beside a Gap and a Breach mark where one is. Drawn thickness is visual only; collision stays at `rules.wallHalf`.
