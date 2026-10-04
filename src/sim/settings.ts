import type { GameModeName } from './match'
import { modeNamed } from './mode'
import { defaultConfig, type SimConfig } from './step'

export type Settings = { mode: GameModeName; shots: number; rounds: number; credits: number; openingCredits: number; refundRate: number; expiry: SimConfig['expiry']; /** The mode's Pallets, or none. */ palletsOn: boolean }
type SliderKey = Exclude<keyof Settings, 'mode' | 'expiry' | 'palletsOn'>

export const SLIDERS: Record<SliderKey, { label: string; siegeLabel?: string; min: number; max: number; def: number; siegeDef?: number }> = {
  shots: { label: 'Shots per possession', min: 1, max: 10, def: 3 },
  rounds: { label: 'Rounds', min: 1, max: 15, def: 5 },
  credits: { label: 'Credits per round', min: 1, max: 30, def: 10 },
  openingCredits: { label: 'Opening Credits', siegeLabel: 'Wall points', min: 10, max: 80, def: 40, siegeDef: 30 },
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

/** The Pallets toggle in order; shown in every mode. */
export const PALLETS: { palletsOn: boolean; label: string }[] = [
  { palletsOn: true, label: 'On' },
  { palletsOn: false, label: 'Off' },
]

/** The sliders a mode uses; Siege has no rounds and no refunds. */
export const slidersFor = (mode: GameModeName): SliderKey[] => {
  switch (mode) {
    case 'rounds':
      return ['shots', 'rounds', 'credits', 'openingCredits', 'refundRate']
    case 'siege':
      return ['shots', 'openingCredits']
  }
}

/** A slider's label in `mode`: Siege's Opening Credits slider reads as Wall points for its one opening build, Rounds banks Credits (ADR-0004). */
export const sliderLabel = (mode: GameModeName, key: SliderKey): string => {
  switch (mode) {
    case 'rounds':
      return SLIDERS[key].label
    case 'siege':
      return SLIDERS[key].siegeLabel ?? SLIDERS[key].label
  }
}

/** A slider's default in `mode`: Siege's budget buys only walls, so its Opening Credits slider starts lower than Rounds'. */
export const sliderDefault = (mode: GameModeName, key: SliderKey): number => {
  switch (mode) {
    case 'rounds':
      return SLIDERS[key].def
    case 'siege':
      return SLIDERS[key].siegeDef ?? SLIDERS[key].def
  }
}

/** `s` switched to `mode`, with that mode's default Opening Credits amount (the other sliders keep their values: they mean the same in both modes); the current mode leaves `s` as it is. */
export const withMode = (s: Settings, mode: GameModeName): Settings => (s.mode === mode ? s : { ...s, mode, openingCredits: sliderDefault(mode, 'openingCredits') })

/** What the settings screen starts with: Siege is the default mode, with Pallets. */
export const defaultSettings: Settings = { mode: 'siege', shots: SLIDERS.shots.def, rounds: SLIDERS.rounds.def, credits: SLIDERS.credits.def, openingCredits: sliderDefault('siege', 'openingCredits'), refundRate: SLIDERS.refundRate.def, expiry: 'shoot', palletsOn: true }

const clamp = (k: SliderKey, v: number) => Math.min(SLIDERS[k].max, Math.max(SLIDERS[k].min, Math.round(v)))

export const configFrom = (s: Settings): SimConfig => ({ ...defaultConfig, mode: s.mode, shots: clamp('shots', s.shots), rounds: clamp('rounds', s.rounds), credits: clamp('credits', s.credits), openingCredits: clamp('openingCredits', s.openingCredits), refundRate: clamp('refundRate', s.refundRate), expiry: s.expiry, pallets: s.palletsOn ? modeNamed(s.mode).pallets : [] })
