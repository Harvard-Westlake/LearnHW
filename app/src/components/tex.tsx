import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

/**
 * Typeset a TeX string with KaTeX. Use for every piece of math a student
 * reads (equations, intervals, limits) so ∞, superscripts, and arrows use real
 * math fonts instead of the UI font.
 *
 *   <Tex tex="(-\infty,\ \infty)" />
 *   <Tex tex="g(x) = 2\left(3^{x - 1}\right) + 2" display />
 */
export function Tex({ tex, display = false, className }: { tex: string; display?: boolean; className?: string }) {
  const html = useMemo(
    () => katex.renderToString(tex, {
      throwOnError: false,
      displayMode: display,
      output: 'html',
      // \htmlClass lets math.ts tag a term (e.g. a chip around the value of h)
      // so CSS can color it. Nothing else from the HTML extension is enabled.
      trust: context => context.command === '\\htmlClass',
      strict: (code: string) => (code === 'htmlExtension' ? 'ignore' : 'warn'),
    }),
    [tex, display],
  )
  return (
    <span
      className={['tex', display ? 'tex--display' : '', className].filter(Boolean).join(' ')}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
