import type { CSSProperties } from 'react'

// A long press on touch would otherwise open the context menu, select text or show the callout.
export const NO_CALLOUT: CSSProperties = { userSelect: 'none', WebkitTouchCallout: 'none' }
export const noMenu = (e: { preventDefault(): void }) => e.preventDefault()
