/**
 * Before/after sketches for the control tiles: a dashed parent curve, the
 * transformed curve in the tile's color (currentColor), and an arrow for the
 * direction of the change. Styled by `.xp-glyph__*` in secondary.css.
 */
export type GlyphKind = 'base' | 'vertical' | 'horizontal' | 'shift-h' | 'shift-k'

const PARENT = 'M2 34C16 34 28 28 42 6'

const AFTER: Record<GlyphKind, string> = {
  base: 'M2 35C22 35 30 30 36 4',
  vertical: 'M2 33C14 33 24 24 34 2',
  horizontal: 'M2 35C20 35 26 28 30 4',
  'shift-h': 'M10 34C22 34 32 28 40 6',
  'shift-k': 'M2 26C16 26 26 22 36 2',
}

const ARROW: Record<GlyphKind, string | null> = {
  base: null,
  vertical: 'M38 8V30M34 12L38 8L42 12M34 26L38 30L42 26',
  horizontal: 'M6 10H26M10 6L6 10L10 14M22 6L26 10L22 14',
  'shift-h': 'M16 14H28M24 10L28 14L24 18',
  'shift-k': 'M38 30V16M34 20L38 16L42 20',
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
