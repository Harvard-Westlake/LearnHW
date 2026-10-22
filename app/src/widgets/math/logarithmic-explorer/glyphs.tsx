/**
 * Before/after sketches for the control tiles: the dashed parent log curve,
 * the transformed curve in the tile's color (currentColor), and an arrow for
 * the direction of the change. The y-axis at x = 12 is the parent's
 * asymptote. Styled by `.xp-glyph__*` in secondary.css.
 */
export type GlyphKind = 'base' | 'vertical' | 'horizontal' | 'shift-h' | 'shift-k'

/** Rises steeply out of the asymptote at x = 12, crosses the x-axis, then flattens. */
const PARENT = 'M13 42C13 24 22 14 42 8'

const AFTER: Record<GlyphKind, string> = {
  base: 'M13 42C13 30 22 22 42 18',
  vertical: 'M13 44C13 14 20 6 42 2',
  horizontal: 'M13 42C13 14 16 10 42 6',
  'shift-h': 'M23 42C23 24 32 14 42 10',
  'shift-k': 'M13 32C13 14 22 4 42 0',
}

const ARROW: Record<GlyphKind, string | null> = {
  base: null,
  vertical: 'M36 30V12M32 16L36 12L40 16',
  horizontal: 'M38 30H24M28 26L24 30L28 34',
  'shift-h': 'M18 28H30M27 25L30 28L27 31',
  'shift-k': 'M36 32V18M32 22L36 18L40 22',
}

export function Glyph({ kind }: { kind: GlyphKind }) {
  const arrow = ARROW[kind]
  return (
    <svg viewBox="0 0 44 44" className="xp-glyph">
      <path d="M2 36H42M12 2V42" className="xp-glyph__axis" />
      <path d={PARENT} className="xp-glyph__before" />
      <path d={AFTER[kind]} className="xp-glyph__after" />
      {arrow && <path d={arrow} className="xp-glyph__arrow" />}
    </svg>
  )
}
