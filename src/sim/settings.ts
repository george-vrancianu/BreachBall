import type { GameModeName } from './match'
import { defaultConfig, type SimConfig } from './step'

export type Settings = { mode: GameModeName; shots: number; rounds: number; credits: number; openingCredits: number; refundRate: number; expiry: SimConfig['expiry'] }
type SliderKey = Exclude<keyof Settings, 'mode' | 'expiry'>

export const SLIDERS: Record<SliderKey, { label: string; siegeLabel?: string; min: number; max: number; def: number }> = {
  shots: { label: 'Shots per possession', min: 1, max: 10, def: 3 },
  rounds: { label: 'Rounds', min: 1, max: 15, def: 5 },
  credits: { label: 'Credits per round', siegeLabel: 'Wall points', min: 1, max: 30, def: 10 },
  openingCredits: { label: 'Opening Credits', min: 10, max: 80, def: 40 },
  refundRate: { label: 'Refund rate', min: 1, max: 10, def: 2 },
}

/** Modes in picker order. */
export const MODES: { mode: GameModeName; label: string }[] = [
  { mode: 'siege', label: 'Siege' },
  { mode: 'rounds', label: 'Rounds' },
]

/** The "On time out" choices in toggle order; shown in every mode. */
export const EXPIRIES: { expiry: Settings['expiry']; label: string }[] = [
  { expiry: 'shoot', label: 'Shoot' },
  { expiry: 'burn', label: 'Burn' },
]

/** The sliders a mode uses; Siege has no rounds and no refunds. */
export const slidersFor = (mode: GameModeName): SliderKey[] => {
  switch (mode) {
    case 'rounds':
      return ['shots', 'rounds', 'credits', 'openingCredits', 'refundRate']
    case 'siege':
      return ['shots', 'credits']
  }
}

/** What the builder's balance is called in each mode: `short` beside a number (side menu), `long` on the Defence circle's badge. Rounds banks Credits (ADR-0004), Siege keeps wall points. */
export const UNITS: Record<GameModeName, { short: string; long: string }> = {
  rounds: { short: 'credits', long: 'Credits' },
  siege: { short: 'pts', long: 'wall points' },
}

/** A slider's label in `mode`: Siege keeps wall points for its one opening build, Rounds banks Credits (ADR-0004). */
export const sliderLabel = (mode: GameModeName, key: SliderKey): string => {
  switch (mode) {
    case 'rounds':
      return SLIDERS[key].label
    case 'siege':
      return SLIDERS[key].siegeLabel ?? SLIDERS[key].label
  }
}

/** What the settings screen starts with: Siege is the default mode. */
export const defaultSettings: Settings = { mode: 'siege', shots: SLIDERS.shots.def, rounds: SLIDERS.rounds.def, credits: SLIDERS.credits.def, openingCredits: SLIDERS.openingCredits.def, refundRate: SLIDERS.refundRate.def, expiry: 'shoot' }

const clamp = (k: SliderKey, v: number) => Math.min(SLIDERS[k].max, Math.max(SLIDERS[k].min, Math.round(v)))

export const configFrom = (s: Settings): SimConfig => ({ ...defaultConfig, mode: s.mode, shots: clamp('shots', s.shots), rounds: clamp('rounds', s.rounds), credits: clamp('credits', s.credits), openingCredits: clamp('openingCredits', s.openingCredits), refundRate: clamp('refundRate', s.refundRate), expiry: s.expiry })
