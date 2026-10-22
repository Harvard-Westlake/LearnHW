/**
 * Before/after sketches for the control tiles: the dashed parent parabola,
 * the transformed parabola in the tile's color (currentColor), and an arrow
 * for the direction of the change. A quadratic Bézier is exactly a parabola,
 * so each curve is one `Q` command. Styled by `.xp-glyph__*` in secondary.css.
 */
export type GlyphKind = 'vertical' | 'shift-h' | 'shift-k'

/** Vertex (22, 30), arms through (6, 6) and (38, 6). */
const PARENT = 'M6 6Q22 54 38 6'

const AFTER: Record<GlyphKind, string> = {
  vertical: 'M13 6Q22 54 31 6',
  'shift-h': 'M14 6Q30 54 46 6',
  'shift-k': 'M8 2Q22 40 36 2',
}

const ARROW: Record<GlyphKind, string> = {
  vertical: 'M39 28V10M35 14L39 10L43 14',
  'shift-h': 'M14 40H26M23 37L26 40L23 43',
  'shift-k': 'M39 30V18M35 22L39 18L43 22',
}

export function Glyph({ kind }: { kind: GlyphKind }) {
  return (
    <svg viewBox="0 0 44 44" className="xp-glyph">
      <path d="M2 36H42M22 2V42" className="xp-glyph__axis" />
      <path d={PARENT} className="xp-glyph__before" />
      <path d={AFTER[kind]} className="xp-glyph__after" />
      <path d={ARROW[kind]} className="xp-glyph__arrow" />
    </svg>
  )
}

/** Icon for a Restrict-domain toggle: the full parabola dashed, the kept branch solid. */
export function RestrictIcon({ side }: { side: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 20 20" className="xp-reflect__icon" aria-hidden="true">
      <path d="M2 16H18M10 2V18" className="xp-reflect__axis" />
      <path d="M3 3Q10 25 17 3" className="xp-reflect__before" />
      <path d={side === 'right' ? 'M10 14Q13.5 14 17 3' : 'M10 14Q6.5 14 3 3'} className="xp-reflect__after" />
      <circle cx="10" cy="14" r="1.6" fill="currentColor" />
    </svg>
  )
}
