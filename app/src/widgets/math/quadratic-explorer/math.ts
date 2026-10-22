/**
 * Pure math for the Quadratic Transformations Explorer.
 *
 *   parent       f(x) = x²
 *   transformed  g(x) = a(x − h)² + k        (vertex form; h IS the shift)
 *
 * There is no horizontal-stretch parameter p: a·(p(x − h))² = (a·p²)(x − h)²,
 * so for a parabola a horizontal stretch is indistinguishable from a vertical
 * one. Keeping only `a` avoids teaching a distinction that does not exist.
 *
 * A `DomainRestriction` keeps one branch only (x ≥ h or x ≤ h) so g is
 * one-to-one; the class uses it when it reaches inverse functions. It changes
 * the domain, the intercepts, and the end behavior — nothing else.
 *
 * No React here; everything is unit-tested in math.test.ts. TeX strings are
 * rendered by components/tex.tsx.
 */
import { formatAbs, formatAddend, formatNumber, isApproximate, nearlyZero } from '../../../utils/format'
import type { Point } from '../../../utils/plane'

export type QuadraticParams = {
  a: number
  h: number
  k: number
}

/** 'right' keeps x ≥ h, 'left' keeps x ≤ h, 'none' is the whole parabola. */
export type DomainRestriction = 'none' | 'right' | 'left'

const EPS = 0.0001
const isOne = (v: number) => Math.abs(v - 1) < EPS
const isMinusOne = (v: number) => Math.abs(v + 1) < EPS

export function evaluate(x: number, { a, h, k }: QuadraticParams) {
  return a * (x - h) * (x - h) + k
}

/** Image of the parent's vertex (0, 0). */
export function vertex({ h, k }: QuadraticParams): Point {
  return { x: h, y: k }
}

export function axisOfSymmetry({ h }: QuadraticParams) {
  return h
}

export function opensUpward({ a }: QuadraticParams) {
  return a > 0
}

export type XIntercepts =
  | { kind: 'none' }
  | { kind: 'one'; point: Point }
  | { kind: 'two'; points: [Point, Point] }

/**
 * a(x − h)² + k = 0  ⇔  (x − h)² = −k/a. Two roots when −k/a > 0 (the vertex
 * sits on the other side of the x-axis from where the parabola opens), one
 * when k = 0 (the vertex touches the axis), none when −k/a < 0.
 * With the domain restricted to one branch only that branch's root remains.
 */
export function xIntercepts(params: QuadraticParams, restriction: DomainRestriction = 'none'): XIntercepts {
  const { a, h, k } = params
  const ratio = -k / a
  if (nearlyZero(k)) return { kind: 'one', point: { x: h, y: 0 } }
  if (ratio < 0) return { kind: 'none' }
  const r = Math.sqrt(ratio)
  if (restriction === 'right') return { kind: 'one', point: { x: h + r, y: 0 } }
  if (restriction === 'left') return { kind: 'one', point: { x: h - r, y: 0 } }
  return { kind: 'two', points: [{ x: h - r, y: 0 }, { x: h + r, y: 0 }] }
}

/** 0 ∈ [h, ∞) needs h ≤ 0; 0 ∈ (−∞, h] needs h ≥ 0. */
export function inDomain(x: number, { h }: QuadraticParams, restriction: DomainRestriction = 'none') {
  if (restriction === 'right') return x >= h - EPS
  if (restriction === 'left') return x <= h + EPS
  return true
}

/** g(0), or null when the restricted domain does not contain 0. */
export function yIntercept(params: QuadraticParams, restriction: DomainRestriction = 'none'): Point | null {
  if (!inDomain(0, params, restriction)) return null
  return { x: 0, y: evaluate(0, params) }
}

export type Range =
  | { kind: 'above'; bound: number }
  | { kind: 'below'; bound: number }

/** [k, ∞) when the parabola opens upward, (−∞, k] when downward. */
export function range({ a, k }: QuadraticParams): Range {
  return a > 0 ? { kind: 'above', bound: k } : { kind: 'below', bound: k }
}

export type Limit = 'inf' | '-inf'

/**
 * Both arms go the same way: up when a > 0, down when a < 0. A restricted
 * domain has only one arm; the missing side is null.
 */
export function endBehavior({ a }: QuadraticParams, restriction: DomainRestriction = 'none'): { left: Limit | null; right: Limit | null } {
  const far: Limit = a > 0 ? 'inf' : '-inf'
  return { left: restriction === 'right' ? null : far, right: restriction === 'left' ? null : far }
}

/** Coefficients of the expanded form ax² + bx + c. */
export function standardCoefficients({ a, h, k }: QuadraticParams) {
  return { a, b: -2 * a * h, c: a * h * h + k }
}

/* ---------------------------------------------------------------------------
 * TeX formatting
 * ------------------------------------------------------------------------- */

/** "" for 1, "-" for −1, otherwise the number. */
export function coefficientTex(value: number, decimals = 1) {
  if (isOne(value)) return ''
  if (isMinusOne(value)) return '-'
  return formatNumber(value, decimals)
}

/** One of the three parameters; used to tag the pieces of a TeX string. */
export type Term = 'a' | 'h' | 'k'
/** Decorates the TeX for one parameter's value (e.g. wraps it in a colored chip). */
export type TermWrap = (term: Term, tex: string) => string
const plain: TermWrap = (_term, tex) => tex

export function parentTex() {
  return 'x^{2}'
}

/** (x − h)² simplified for h = 0: x², (x − 2)², (x + 2.5)². */
export function squaredTermTex(h: number, wrap: TermWrap = plain) {
  if (nearlyZero(h)) return 'x^{2}'
  return `(x ${h > 0 ? '-' : '+'} ${wrap('h', formatAbs(h))})^{2}`
}

/** Vertex form a(x − h)² + k without 1·, +0, or stray signs. */
export function vertexFormTex({ a, h, k }: QuadraticParams, wrap: TermWrap = plain) {
  const squared = squaredTermTex(h, wrap)
  let body: string
  if (isOne(a)) body = squared
  else if (isMinusOne(a)) body = `${wrap('a', '-')}${squared}`
  else body = `${wrap('a', formatNumber(a))}${squared}`
  const tail = nearlyZero(k) ? '' : ` ${k > 0 ? '+' : '-'} ${wrap('k', formatAbs(k))}`
  return `${body}${tail}`
}

/**
 * Standard form ax² + bx + c with b = −2ah and c = ah² + k. Zero terms are
 * dropped and ±1 coefficients are written as a bare sign. Coefficients show
 * two decimals (b has at most two for slider values; c can have three), so
 * check standardFormExact() and write ≈ instead of = when it is false.
 */
export function standardFormTex(params: QuadraticParams, decimals = 2) {
  const { a, b, c } = standardCoefficients(params)
  const pieces = [`${coefficientTex(a, decimals)}x^{2}`]
  if (!nearlyZero(b)) pieces.push(`${b > 0 ? '+' : '-'} ${coefficientTex(Math.abs(b), decimals)}x`)
  if (!nearlyZero(c)) pieces.push(`${c > 0 ? '+' : '-'} ${formatAbs(c, decimals)}`)
  return pieces.join(' ')
}

/** False when a displayed standard-form coefficient had to be rounded. */
export function standardFormExact(params: QuadraticParams, decimals = 2) {
  const { a, b, c } = standardCoefficients(params)
  return ![a, b, c].some(v => isApproximate(v, decimals))
}

/**
 * The equation as one token per column for the control-panel strip:
 * `g(x) =` · a · `(x −` · h · `)²` · `+` · k. The general form and the
 * substituted form produce the same seven tokens so the strip can lay them
 * out as two rows of one grid, with every operator centered in its own
 * column. Nothing is simplified here (a 1, a 0, or `x − −1` is fine); the
 * simplified equation is vertexFormTex(). The trailing `{}` keeps the minus
 * a binary operator (KaTeX would otherwise drop the space before it).
 */
export function equationTokens(values: Record<Term, string>, wrap: TermWrap = plain) {
  const v = (term: Term) => wrap(term, values[term])
  return ['g(x) =', v('a'), '(x - {}', v('h'), ')^{2}', '+', v('k')]
}

export function generalTokens(wrap: TermWrap = plain) {
  return equationTokens({ a: 'a', h: 'h', k: 'k' }, wrap)
}

export function substitutedTokens({ a, h, k }: QuadraticParams, wrap: TermWrap = plain) {
  return equationTokens({ a: formatNumber(a), h: formatNumber(h), k: formatNumber(k) }, wrap)
}

export function pointTex({ x, y }: Point, decimals = 1) {
  const approx = isApproximate(x, decimals) || isApproximate(y, decimals)
  return `${approx ? '\\approx ' : ''}(${formatNumber(x, decimals)},\\ ${formatNumber(y, decimals)})`
}

export function limitTex(limit: Limit) {
  return limit === 'inf' ? '\\infty' : '-\\infty'
}

/** Closed at the vertex: [k, ∞) or (−∞, k]. */
export function rangeTex(r: Range) {
  if (r.kind === 'above') return `[${formatNumber(r.bound)},\\ \\infty)`
  return `(-\\infty,\\ ${formatNumber(r.bound)}]`
}

/** (−∞, ∞), [h, ∞) for the right branch, (−∞, h] for the left. */
export function domainTex({ h }: QuadraticParams, restriction: DomainRestriction = 'none') {
  if (restriction === 'right') return `[${formatNumber(h)},\\ \\infty)`
  if (restriction === 'left') return `(-\\infty,\\ ${formatNumber(h)}]`
  return '(-\\infty,\\ \\infty)'
}

/** Where a parent point lands: (x, y) → (x + h, a·y + k). */
export function mappingTex({ a, h, k }: QuadraticParams) {
  return `(x,\\ y) \\to (x${formatAddend(h)},\\ ${coefficientTex(a)}y${formatAddend(k)})`
}
