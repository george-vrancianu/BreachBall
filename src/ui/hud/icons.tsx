import type { ReactNode } from 'react'

/** A 24-unit stroked icon drawn in `currentColor`. Drawn rather than an emoji, which some fonts lack. */
export const icon = (size: number, d: ReactNode, fill = 'none') => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
)

/** The three action families. Build: a chess rook. Powerup (Offence): a lightning bolt. Subterfuge: a theatre mask. */
export const TOWER = (size = 24) => icon(size, <path d="M5 21h14M7 21l1-4h8l1 4M8.5 17 9 10h6l.5 7M6 10h12V4h-2.5v2.5h-2V4h-3v2.5h-2V4H6z" />)
export const BOLT = (size = 24) => icon(size, <path d="M13 2 4 14h7l-1 8 9-12h-7z" />)
export const MASK = (size = 24) => icon(size, <><path d="M4.5 3.5c4.6 1.4 10.4 1.4 15 0v8a7.5 7.5 0 0 1-15 0z" /><path d="M7.3 10.2q1.9-1.7 3.8 0q-1.9 1.1-3.8 0zM12.9 10.2q1.9-1.7 3.8 0q-1.9 1.1-3.8 0z" fill="currentColor" /><path d="M8.8 15q3.2 2.6 6.4 0" /></>)

/** The Defence pieces: a small brick wall, a ring with arcs pushing out, a magnet, a cannon on its wheel. */
export const WALL = (size = 24) => icon(size, <><rect x="2" y="4" width="20" height="16" rx="1" /><path d="M2 9.3h20M2 14.7h20M8 4v5.3M16 4v5.3M12 9.3v5.4M8 14.7V20M16 14.7V20" /></>)
export const REPULSOR = (size = 24) => icon(size, <><circle cx="12" cy="12" r="3" /><path d="M6.3 8a7 7 0 0 1 11.4 0M6.3 16a7 7 0 0 0 11.4 0" /></>)
export const STEAL = (size = 24) => icon(size, <path d="M5 3h5v9a2 2 0 0 0 4 0V3h5v9a7 7 0 0 1-14 0zM5 7h5M14 7h5" />)
export const CANNON = (size = 24) => icon(size, <><circle cx="8" cy="17" r="3" /><path d="M10.5 15 19 6.5l2 2-8.5 8.5M3 21h11" /></>)

/** A Credit: a hexagonal token. */
export const CREDIT = (size = 24) => icon(size, <><path d="M12 2.5 20.2 7v10L12 21.5 3.8 17V7z" /><path d="M12 8l3.5 4-3.5 4-3.5-4z" /></>)
/** Refund: an arrow coming back around a coin. */
export const REFUND = (size = 24) => icon(size, <><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M3.5 3.5v4h4" /><circle cx="12" cy="12" r="2.5" /></>)
/** Strategies: stacked blueprint sheets. */
export const LAYERS = (size = 24) => icon(size, <path d="M12 3 21 7.5 12 12 3 7.5zM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5" />)
export const CHECK = (size = 24) => icon(size, <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />)
export const CLOSE = (size = 24) => icon(size, <path d="M6 6l12 12M18 6 6 18" />)
export const TRASH = (size = 24) => icon(size, <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />)
export const ROTATE = (size = 24) => icon(size, <><path d="M20 12a8 8 0 1 1-2.4-5.7" /><path d="M20.5 3.5v4h-4" /></>)
export const RECENTER = (size = 20) => icon(size, <><circle cx="12" cy="12" r="4" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></>)
/** The Jam: a spiked hub. */
export const JAM = (size = 24) => icon(size, <><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3" /></>)
/** The Breaker: a wall cracked through by a shot. Overdrive: a spark. */
export const BREAKER = (size = 24) => icon(size, <><path d="M3 4h7v6H3zM14 4h7v6h-7zM3 14h7v6H3zM14 14h7v6h-7z" /><path d="M12 2v20" strokeDasharray="3 2" /></>)
export const OVERDRIVE = (size = 24) => icon(size, <path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3" />)
export const LOCK = (size = 24) => icon(size, <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>)
