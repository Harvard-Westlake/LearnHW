/**
 * Pure math for the Exponential Transformations Explorer.
 *
 *   parent       f(x) = b^x
 *   transformed  g(x) = a · b^(p(x − h)) + k        (Algebra 2 convention: h IS the shift)
 *
 * No React here; everything is unit-tested in math.test.ts. TeX strings are
 * rendered by components/tex.tsx.
 */
import { formatAbs, formatAddend, formatNumber, isApproximate, nearlyZero } from '../../../utils/format'
import type { Point } from '../../../utils/plane'

export type ExponentialParams = {
  a: number
  b: number
  p: number
  h: number
  k: number
}

const EPS = 0.0001
const isOne = (v: number) => Math.abs(v - 1) < EPS
const isMinusOne = (v: number) => Math.abs(v + 1) < EPS

export function evaluate(x: number, { a, b, p, h, k }: ExponentialParams) {
  return a * Math.pow(b, p * (x - h)) + k
}

/** b = 1 collapses b^x to the constant 1: not exponential, no asymptote. */
export function isConstantBase(b: number) {
  return isOne(b)
}

export type Behavior = 'growth' | 'decay' | 'constant'

/** Growth/decay is decided by the effective base b^p (a y-axis flip turns decay into growth). */
export function behavior({ b, p }: ExponentialParams): Behavior {
  if (isConstantBase(b)) return 'constant'
  return Math.pow(b, p) > 1 ? 'growth' : 'decay'
}

/** Image of the parent's key point (0, 1). */
export function keyPoint({ a, h, k }: ExponentialParams): Point {
  return { x: h, y: a + k }
}

export function yIntercept(params: ExponentialParams): Point {
  return { x: 0, y: evaluate(0, params) }
}

export type XIntercept =
  | { kind: 'none' }
  | { kind: 'point'; point: Point }
  | { kind: 'everywhere' }

/**
 * a·b^(p(x−h)) + k = 0  ⇔  b^(p(x−h)) = −k/a, which needs −k/a > 0: the curve
 * crosses the x-axis only when it lies on the other side of its asymptote from
 * the axis. k = 0 gives "none" — the curve approaches the axis but never meets it.
 */
export function xIntercept(params: ExponentialParams): XIntercept {
  const { a, b, p, h, k } = params
  if (isConstantBase(b)) return nearlyZero(a + k) ? { kind: 'everywhere' } : { kind: 'none' }
  const ratio = -k / a
  if (ratio <= 0) return { kind: 'none' }
  const x = h + Math.log(ratio) / Math.log(b) / p
  return { kind: 'point', point: { x, y: 0 } }
}

export type Range =
  | { kind: 'single'; value: number }
  | { kind: 'above'; bound: number }
  | { kind: 'below'; bound: number }

export function range({ a, b, k }: ExponentialParams): Range {
  if (isConstantBase(b)) return { kind: 'single', value: a + k }
  return a > 0 ? { kind: 'above', bound: k } : { kind: 'below', bound: k }
}

export function asymptote({ b, k }: ExponentialParams): number | null {
  return isConstantBase(b) ? null : k
}

export type Limit = number | 'inf' | '-inf'

export function endBehavior(params: ExponentialParams): { left: Limit; right: Limit } {
  const { a, k } = params
  const kind = behavior(params)
  if (kind === 'constant') {
    const value = a + k
    return { left: value, right: value }
  }
  const far: Limit = a > 0 ? 'inf' : '-inf'
  return kind === 'growth' ? { left: k, right: far } : { left: far, right: k }
}

/**
 * a·b^(p(x−h)) = b^(p(x−h) + log_b|a|) = b^(p(x − (h − log_b|a| / p))): for an
 * exponential, a vertical stretch by |a| is the same as a horizontal shift of
 * log_b|a| / p units to the LEFT (negative result = right). null when it does
 * not apply (|a| = 1 or b = 1).
 */
export function equivalentShift({ a, b, p }: ExponentialParams): number | null {
  if (isConstantBase(b) || isOne(Math.abs(a))) return null
  return Math.log(Math.abs(a)) / Math.log(b) / p
}

/* ---------------------------------------------------------------------------
 * TeX formatting
 * ------------------------------------------------------------------------- */

/** "" for 1, "-" for −1, otherwise the number. */
export function coefficientTex(value: number) {
  if (isOne(value)) return ''
  if (isMinusOne(value)) return '-'
  return formatNumber(value)
}

/** One of the five parameters; used to tag the pieces of a TeX string. */
export type Term = 'a' | 'b' | 'p' | 'h' | 'k'
/** Decorates the TeX for one parameter's value (e.g. wraps it in a colored chip). */
export type TermWrap = (term: Term, tex: string) => string
const plain: TermWrap = (_term, tex) => tex

/** The exponent p(x − h), simplified for p = ±1 and h = 0. */
export function exponentTex(p: number, h: number, wrap: TermWrap = plain) {
  const shifted = nearlyZero(h) ? 'x' : `x ${h > 0 ? '-' : '+'} ${wrap('h', formatAbs(h))}`
  if (isOne(p)) return shifted
  const inner = nearlyZero(h) ? 'x' : `(${shifted})`
  if (isMinusOne(p)) return `${wrap('p', '-')}${inner}`
  return `${wrap('p', formatNumber(p))}${inner}`
}

export function parentTex(b: number) {
  return `${formatNumber(b)}^{x}`
}

export function transformedTex({ a, b, p, h, k }: ExponentialParams, wrap: TermWrap = plain) {
  const power = `${wrap('b', formatNumber(b))}^{${exponentTex(p, h, wrap)}}`
  let body: string
  if (isOne(a)) body = power
  else if (isMinusOne(a)) body = `${wrap('a', '-')}${power}`
  else body = `${wrap('a', formatNumber(a))}\\left(${power}\\right)`
  const tail = nearlyZero(k) ? '' : ` ${k > 0 ? '+' : '-'} ${wrap('k', formatAbs(k))}`
  return `${body}${tail}`
}

/**
 * The unsimplified form a · b^{p(x − h)} + k with every value filled in,
 * for the control-panel strip: each chip keeps its place and the width stays
 * constant while sliders move. The simplified equation is transformedTex().
 */
/**
 * The equation as one token per column for the control-panel strip:
 * `g(x) =` · a · `⋅` · b · `^{p(x − h)}` · `+` · k. The general form and the
 * substituted form produce the same seven tokens so the strip can lay them
 * out as two rows of one grid, with every operator centered in its own
 * column. Nothing is simplified here (a 1, a 0, or `x − −1` is fine); the
 * simplified equation is transformedTex().
 */
export function equationTokens(values: Record<Term, string>, wrap: TermWrap = plain) {
  const v = (term: Term) => wrap(term, values[term])
  return ['g(x) =', v('a'), '\\cdot', v('b'), `{}^{${v('p')}(x - ${v('h')})}`, '+', v('k')]
}

export function generalTokens(wrap: TermWrap = plain) {
  return equationTokens({ a: 'a', b: 'b', p: 'p', h: 'h', k: 'k' }, wrap)
}

export function substitutedTokens({ a, b, p, h, k }: ExponentialParams, wrap: TermWrap = plain) {
  return equationTokens({ a: formatNumber(a), b: formatNumber(b), p: formatNumber(p), h: formatNumber(h), k: formatNumber(k) }, wrap)
}

export function pointTex({ x, y }: Point, decimals = 1) {
  const approx = isApproximate(x, decimals) || isApproximate(y, decimals)
  return `${approx ? '\\approx ' : ''}(${formatNumber(x, decimals)},\\ ${formatNumber(y, decimals)})`
}

export function limitTex(limit: Limit) {
  if (limit === 'inf') return '\\infty'
  if (limit === '-inf') return '-\\infty'
  return formatNumber(limit)
}

export function rangeTex(r: Range) {
  if (r.kind === 'single') return `\\{${formatNumber(r.value)}\\}`
  if (r.kind === 'above') return `(${formatNumber(r.bound)},\\ \\infty)`
  return `(-\\infty,\\ ${formatNumber(r.bound)})`
}

/** Where a parent point lands: (x, y) → (x/p + h, a·y + k). */
export function mappingTex({ a, p, h, k }: ExponentialParams) {
  let xImage: string
  if (isOne(p)) xImage = 'x'
  else if (isMinusOne(p)) xImage = '-x'
  else if (Number.isInteger(Math.round((1 / p) * 1000) / 1000)) xImage = `${coefficientTex(1 / p)}x`
  else xImage = `\\tfrac{x}{${formatNumber(p)}}`
  const yImage = `${coefficientTex(a)}y`
  return `(x,\\ y) \\to (${xImage}${formatAddend(h)},\\ ${yImage}${formatAddend(k)})`
}
