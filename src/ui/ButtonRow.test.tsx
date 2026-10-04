// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ButtonRow } from './ButtonRow'

afterEach(cleanup)

it('ButtonRow renders its children after the buttons', () => {
  render(<ButtonRow specs={[{ label: 'A', onClick: () => {} }]}><i>extra</i></ButtonRow>)
  expect(screen.getByText('extra')).toBeTruthy()
})
