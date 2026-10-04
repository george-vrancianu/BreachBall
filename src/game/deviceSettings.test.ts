// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { loadTabletop, saveTabletop } from './deviceSettings'

beforeEach(() => localStorage.clear())

it('is on for a fresh device', () => {
  expect(loadTabletop()).toBe(true)
})
it('keeps the choice across loads', () => {
  saveTabletop(false)
  expect(loadTabletop()).toBe(false)
  saveTabletop(true)
  expect(loadTabletop()).toBe(true)
})
it('reads anything else as on, and survives blocked storage', () => {
  localStorage.setItem('breachball.tabletop', 'yes')
  expect(loadTabletop()).toBe(true)
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  expect(loadTabletop()).toBe(true)
  vi.restoreAllMocks()
})

it('migrates a stored Flip on turn "true" to Tabletop off, and removes the old key', () => {
  localStorage.setItem('breachball.flipOnTurn', 'true')
  expect(loadTabletop()).toBe(false)
  expect(localStorage.getItem('breachball.tabletop')).toBe('false')
  expect(localStorage.getItem('breachball.flipOnTurn')).toBeNull()
})
it('migrates a stored "false" or anything else to Tabletop on, and removes the old key', () => {
  for (const old of ['false', 'yes']) {
    localStorage.clear()
    localStorage.setItem('breachball.flipOnTurn', old)
    expect(loadTabletop()).toBe(true)
    expect(localStorage.getItem('breachball.tabletop')).toBe('true')
    expect(localStorage.getItem('breachball.flipOnTurn')).toBeNull()
  }
})
it('migrates once: the new key wins over a leftover old one', () => {
  localStorage.setItem('breachball.tabletop', 'false')
  localStorage.setItem('breachball.flipOnTurn', 'false')
  expect(loadTabletop()).toBe(false)
})
