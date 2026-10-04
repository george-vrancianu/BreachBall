/** The two layers of the stage: the pitch canvas, and the in-match HUD (Shell dock, bars, Overlay, Minimap, Side menu). */
export type StageLayers = { canvasAngle: number; hudAngle: number }

/** Each layer's rotation in degrees. Both follow the flip angle today, so the stage still turns as one; a layer of its own is what lets the HUD turn without the pitch. */
export const stageLayers = (angle: number): StageLayers => ({ canvasAngle: angle, hudAngle: angle })
