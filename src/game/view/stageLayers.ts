/** The two layers of the stage: the pitch canvas, and the in-match HUD (the Dock, bars, Overlay, Minimap, Side menu). */
export type StageLayers = { canvasAngle: number; hudAngle: number }

/**
 * Each layer's rotation in degrees. `stageAngle` is the whole-stage flip's (`transition.angle`) and `seatAngle` the one facing the HUD's seat (`transition.seatAngle`).
 * Tabletop mode on: the canvas layer never turns and only the HUD layer faces its seat. Off: both follow the stage flip, so the stage turns as one.
 */
export const stageLayers = ({ tabletop, stageAngle, seatAngle }: { tabletop: boolean; stageAngle: number; seatAngle: number }): StageLayers =>
  tabletop ? { canvasAngle: 0, hudAngle: seatAngle } : { canvasAngle: stageAngle, hudAngle: stageAngle }
