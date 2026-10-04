// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ButtonRow } from './ButtonRow'
import { DefenceCircle } from './hud/DefenceCircle'

afterEach(cleanup)

it('ButtonRow renders its children after the buttons', () => {
  render(<ButtonRow specs={[{ label: 'A', onClick: () => {} }]}><i>extra</i></ButtonRow>)
  expect(screen.getByText('extra')).toBeTruthy()
})

it('DefenceCircle renders its children with and without a selection', () => {
  const { rerender } = render(<DefenceCircle defence={{ building: false, items: [], available: true }} color="#fff" onToggle={() => {}} onArm={() => {}}><i>extra</i></DefenceCircle>)
  expect(screen.getByText('extra')).toBeTruthy()
  rerender(<DefenceCircle defence={{ building: false, items: [], available: true, selection: { buttons: [] } }} color="#fff" onToggle={() => {}} onArm={() => {}}><i>more</i></DefenceCircle>)
  expect(screen.getByText('more')).toBeTruthy()
})
