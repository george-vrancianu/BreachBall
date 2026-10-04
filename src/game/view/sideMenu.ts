import { MODES, sliderLabel, slidersFor, EXPIRIES } from '../../sim/settings'
import type { SimConfig } from '../../sim/step'

/** One read-only line of the match's settings. */
export type SettingRow = { label: string; value: string }

/** What the Side menu draws from. `hotSeat` gates Restart: online has none, and never pauses. */
export type SideMenuView = { open: boolean; hotSeat: boolean; settings: SettingRow[] }

/** The settings the match was started with, as the Side menu lists them: mode, then the sliders its mode uses (Rounds, Credits per round, Refund rate), then On time out. Shots per possession is left to the settings screen. */
export function settingRows(c: Pick<SimConfig, 'mode' | 'rounds' | 'credits' | 'refundRate' | 'expiry'>): SettingRow[] {
  const sliders = slidersFor(c.mode).filter((k) => k !== 'shots')
  return [
    { label: 'Mode', value: MODES.find((m) => m.mode === c.mode)!.label },
    ...sliders.map((k) => ({ label: sliderLabel(c.mode, k), value: String(c[k]) })),
    { label: 'On time out', value: EXPIRIES.find((e) => e.expiry === c.expiry)!.label },
  ]
}

/** Whether an open Side menu stops the sim (and with it the shot clock and build timer): in hot-seat, where every seat is on this device. Online it never does, so both peers' lockstep keeps ticking behind it. */
export const pausesSim = (menuOpen: boolean, mine: (p: 1 | 2) => boolean): boolean => menuOpen && mine(1) && mine(2)
