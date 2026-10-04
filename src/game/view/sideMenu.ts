import { MODES, UNITS, sliderLabel, slidersFor, EXPIRIES } from '../../sim/settings'
import type { SimConfig } from '../../sim/step'

/** One read-only line of the match's settings. */
export type SettingRow = { label: string; value: string }

/** What the Side menu draws from. `hotSeat` gates Restart: online has none, and never pauses. */
export type SideMenuView = { open: boolean; hotSeat: boolean; settings: SettingRow[] }

/** The settings the match was started with, as the Side menu lists them: mode, then the sliders its mode uses (Rounds: Rounds, Credits per round, Opening Credits, Refund rate; Siege: Wall points), with the balance's unit where it has one (the refund rate is credits back per refunded piece, not a percentage), then On time out. Shots per possession is left to the settings screen. */
export function settingRows(c: Pick<SimConfig, 'mode' | 'rounds' | 'credits' | 'openingCredits' | 'refundRate' | 'expiry'>): SettingRow[] {
  const sliders = slidersFor(c.mode).filter((k) => k !== 'shots')
  return [
    { label: 'Mode', value: MODES.find((m) => m.mode === c.mode)!.label },
    ...sliders.map((k) => ({ label: sliderLabel(c.mode, k), value: k === 'rounds' ? String(c[k]) : `${c[k]} ${UNITS[c.mode].short}` })),
    { label: 'On time out', value: EXPIRIES.find((e) => e.expiry === c.expiry)!.label },
  ]
}

/** Whether an open Side menu stops the sim (and with it the shot clock and build timer): in hot-seat, where every seat is on this device (`hotSeat`). Online it never does, so both peers' lockstep keeps ticking behind it. */
export const pausesSim = (menuOpen: boolean, hotSeat: boolean): boolean => menuOpen && hotSeat
