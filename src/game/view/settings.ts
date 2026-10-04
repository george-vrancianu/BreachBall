import { defaultSettings, EXPIRIES, MODES, SLIDERS, sliderLabel, slidersFor, type Settings } from '../../sim/settings'
import type { ButtonSpec } from './hudModel'

export { defaultSettings, type Settings }

/** The mode picker's buttons: the chosen mode reads as pressed (aria-pressed and a filled look), not just bracketed text. */
export const modePicker = (current: Settings['mode'], pick: (mode: Settings['mode']) => void): ButtonSpec[] => MODES.map(({ mode, label }) => ({ label, pressed: mode === current, onClick: () => pick(mode) }))

/** The "On time out" segmented toggle: Shoot fires the held aim on expiry, Burn wastes the shot. */
export const expiryPicker = (current: Settings['expiry'], pick: (expiry: Settings['expiry']) => void): ButtonSpec[] => EXPIRIES.map(({ expiry, label }) => ({ label, pressed: expiry === current, onClick: () => pick(expiry) }))

/** The Flip on turn toggle, a device setting: pressed when the hot-seat stage turns at each handover. Same button in the Side menu and on the settings screen. */
export const flipToggle = (on: boolean, set: (on: boolean) => void): ButtonSpec => ({ label: `Flip on turn: ${on ? 'On' : 'Off'}`, pressed: on, onClick: () => set(!on) })

export type SliderKey = Exclude<keyof Settings, 'mode' | 'expiry'>
export type SliderRow = { key: SliderKey; label: string; min: number; max: number; value: number }

/** The sliders the chosen mode uses, with their current values. */
export const sliderRows = (s: Settings): SliderRow[] => slidersFor(s.mode).map((key) => ({ key, label: sliderLabel(s.mode, key), min: SLIDERS[key].min, max: SLIDERS[key].max, value: s[key] }))
