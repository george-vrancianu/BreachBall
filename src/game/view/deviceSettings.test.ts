// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { loadFlipOnTurn, saveFlipOnTurn } from './deviceSettings'

beforeEach(() => localStorage.clear())

it('is off on a fresh device', () => {
  expect(loadFlipOnTurn()).toBe(false)
})
it('keeps the choice across loads', () => {
  saveFlipOnTurn(true)
  expect(loadFlipOnTurn()).toBe(true)
  saveFlipOnTurn(false)
  expect(loadFlipOnTurn()).toBe(false)
})
it('reads anything else as off, and survives blocked storage', () => {
  localStorage.setItem('breachball.flipOnTurn', 'yes')
  expect(loadFlipOnTurn()).toBe(false)
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  expect(loadFlipOnTurn()).toBe(false)
  vi.restoreAllMocks()
})
