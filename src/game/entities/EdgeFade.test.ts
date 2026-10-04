import { describe, expect, it } from 'vitest'
import { rules } from '../../config/rules'
import { Camera } from './Camera'
import { fadeEdges } from './EdgeFade'

const canvas = { width: 400, height: 640 }

describe('fadeEdges', () => {
  it('fades the top once the view has scrolled off the top board, and the bottom while more pitch lies below', () => {
    expect(fadeEdges(new Camera(-rules.board + 32), canvas)).toEqual({ top: false, bottom: true })
    expect(fadeEdges(new Camera(54), canvas)).toEqual({ top: true, bottom: true })
    expect(fadeEdges(new Camera(rules.pitchHeight + rules.board - 32), canvas)).toEqual({ top: true, bottom: false })
  })

  it('fades nothing on the map, which shows the whole pitch', () => {
    expect(fadeEdges(new Camera(rules.mapY, true), canvas)).toEqual({ top: false, bottom: false })
  })
})
