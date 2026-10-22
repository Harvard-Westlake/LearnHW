/**
 * Pure math for the Logarithmic Transformations Explorer.
 *
 *   parent       f(x) = log_b x
 *   transformed  g(x) = a · log_b(p(x − h)) + k      (Algebra 2 convention: h IS the shift)
 *
 * The static widget used a·log_b(p·x − h) + k, where the real shift was h/p;
 * this port uses the Algebra 2 form so h is the vertical asymptote.
 *
 * b = 1 is undefined (1^y = 1 for every y, so log_1 has no value) — unlike the
 * exponential's b = 1, which is a constant function. Every readout reports
 * that honestly instead of inventing a curve.
 *
 * No React here; everything is unit-tested in math.test.ts. TeX strings are
 * rendered by components/tex.tsx.
 */
import { formatAbs, formatAddend, formatNumber, isApproximate, nearlyZero } from '../../../utils/format'
import type { Point } from '../../../utils/plane'

export type LogParams = {
  a: number
  b: number
  p: number
  h: number
  k: number
}

const EPS = 0.0001
const isOne = (v: number) => Math.abs(v - 1) < EPS
const isMinusOne = (v: number) => Math.abs(v + 1) < EPS

/** log_1 does not exist; neither does a log with base ≤ 0. */
export function isUndefinedBase(b: number) {
  return b <= 0 || isOne(b)
}

/** Argument of the log: the parent's x after the horizontal moves. */
export function argument(x: number, { p, h }: LogParams) {
  return p * (x - h)
}

/** NaN outside the domain (argument ≤ 0) or when the base is undefined. */
export function evaluate(x: number, params: LogParams) {
  const { a, b, k } = params
  const u = argument(x, params)
  if (isUndefinedBase(b) || u <= 0) return NaN
  return (a * Math.log(u)) / Math.log(b) + k
}

export type Domain = { kind: 'right'; bound: number } | { kind: 'left'; bound: number } | { kind: 'empty' }

/** p(x − h) > 0: x > h when p > 0, x < h when p < 0. */
export function domain({ b, p, h }: LogParams): Domain {
  if (isUndefinedBase(b)) return { kind: 'empty' }
  return p > 0 ? { kind: 'right', bound: h } : { kind: 'left', bound: h }
}

export function inDomain(x: number, params: LogParams) {
  return !isUndefinedBase(params.b) && argument(x, params) > 0
}

/** The vertical asymptote is always x = h (null when the base is undefined). */
export function asymptote({ b, h }: LogParams): number | null {
  return isUndefinedBase(b) ? null : h
}

export type Behavior = 'increasing' | 'decreasing' | 'undefined'

/**
 * g′(x) = a / ((x − h) ln b) and (x − h) has the sign of p inside the domain,
 * so the direction is sign(a) · sign(p) · sign(ln b). A base between 0 and 1
 * flips it — the same trap as the exponential's b^p.
 */
export function behavior({ a, b, p }: LogParams): Behavior {
  if (isUndefinedBase(b)) return 'undefined'
  return a * p * Math.log(b) > 0 ? 'increasing' : 'decreasing'
}

/** Image of the parent's key point (1, 0). */
export function keyPoint({ p, h, k }: LogParams): Point {
  return { x: h + 1 / p, y: k }
}

/** Image of the parent's second anchor (b, 1) — together with P′ it fixes the sketch. */
export function secondPoint({ a, b, p, h, k }: LogParams): Point {
  return { x: h + b / p, y: a + k }
}

/** a·log_b(p(x − h)) + k = 0  ⇔  p(x − h) = b^(−k/a); always one solution. */
export function xIntercept({ a, b, p, h, k }: LogParams): Point | null {
  if (isUndefinedBase(b)) return null
  return { x: h + Math.pow(b, -k / a) / p, y: 0 }
}

/** g(0) exists only when 0 is in the domain: −p·h > 0. */
export function yIntercept(params: LogParams): Point | null {
  if (!inDomain(0, params)) return null
  return { x: 0, y: evaluate(0, params) }
}

export type Limit = 'inf' | '-inf'

export type EndBehavior = {
  /** Which side of h the domain lies on; the asymptote is approached from there. */
  side: '+' | '-'
  /** g as x → h from inside the domain. */
  nearAsymptote: Limit
  /** g as x → ∞ (p > 0) or x → −∞ (p < 0). */
  farSide: '+' | '-'
  far: Limit
}

/**
 * Near the asymptote the argument → 0⁺, so log_b → −∞ when b > 1 and +∞ when
 * b < 1; far away the argument → ∞ and the signs swap. `a` flips both.
 */
export function endBehavior({ a, b, p }: LogParams): EndBehavior | null {
  if (isUndefinedBase(b)) return null
  const farSign = Math.sign(a) * Math.sign(Math.log(b))
  return {
    side: p > 0 ? '+' : '-',
    nearAsymptote: farSign > 0 ? '-inf' : 'inf',
    farSide: p > 0 ? '+' : '-',
    far: farSign > 0 ? 'inf' : '-inf',
  }
}

/**
 * log_b(p·u) = log_b u + log_b p, so a·log_b(p(x − h)) = a·log_b(±(x − h)) + a·log_b|p|:
 * for a log, a horizontal stretch by 1/|p| is the same as a vertical shift of
 * a·log_b|p| units UP (negative result = down). null when it does not apply
 * (|p| = 1 or b undefined).
 */
export function equivalentShift({ a, b, p }: LogParams): number | null {
  if (isUndefinedBase(b) || isOne(Math.abs(p))) return null
  return (a * Math.log(Math.abs(p))) / Math.log(b)
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

/** The argument p(x − h), simplified for p = ±1 and h = 0. */
export function argumentTex(p: number, h: number, wrap: TermWrap = plain) {
  const shifted = nearlyZero(h) ? 'x' : `x ${h > 0 ? '-' : '+'} ${wrap('h', formatAbs(h))}`
  if (isOne(p)) return shifted
  const inner = nearlyZero(h) ? 'x' : `(${shifted})`
  if (isMinusOne(p)) return `${wrap('p', '-')}${inner}`
  return `${wrap('p', formatNumber(p))}${inner}`
}

export function parentTex(b: number) {
  return `\\log_{${formatNumber(b)}} x`
}

/** log_b x for a bare x, log_b(…) otherwise. */
function logTex(b: string, argument: string) {
  return argument === 'x' ? `\\log_{${b}} x` : `\\log_{${b}}(${argument})`
}

export function transformedTex({ a, b, p, h, k }: LogParams, wrap: TermWrap = plain) {
  const log = logTex(wrap('b', formatNumber(b)), argumentTex(p, h, wrap))
  let body: string
  if (isOne(a)) body = log
  else if (isMinusOne(a)) body = `${wrap('a', '-')}${log}`
  else body = `${wrap('a', formatNumber(a))}${log}`
  const tail = nearlyZero(k) ? '' : ` ${k > 0 ? '+' : '-'} ${wrap('k', formatAbs(k))}`
  return `${body}${tail}`
}

/**
 * The equation as one token per column for the control-panel strip:
 * `g(x) =` · a · `log_b(` · p · `(x −` · h · `))` · `+` · k. The general form
 * and the substituted form produce the same nine tokens so the strip can lay
 * them out as two rows of one grid, with every operator centered in its own
 * column. Nothing is simplified here; the simplified equation is
 * transformedTex(). The trailing `{}` keeps the minus a binary operator.
 */
export function equationTokens(values: Record<Term, string>, wrap: TermWrap = plain) {
  const v = (term: Term) => wrap(term, values[term])
  return ['g(x) =', v('a'), `\\log_{${v('b')}}(`, v('p'), '(x - {}', v('h'), '))', '+', v('k')]
}

export function generalTokens(wrap: TermWrap = plain) {
  return equationTokens({ a: 'a', b: 'b', p: 'p', h: 'h', k: 'k' }, wrap)
}

export function substitutedTokens({ a, b, p, h, k }: LogParams, wrap: TermWrap = plain) {
  return equationTokens({ a: formatNumber(a), b: formatNumber(b), p: formatNumber(p), h: formatNumber(h), k: formatNumber(k) }, wrap)
}

export function pointTex({ x, y }: Point, decimals = 1) {
  const approx = isApproximate(x, decimals) || isApproximate(y, decimals)
  return `${approx ? '\\approx ' : ''}(${formatNumber(x, decimals)},\\ ${formatNumber(y, decimals)})`
}

export function limitTex(limit: Limit) {
  return limit === 'inf' ? '\\infty' : '-\\infty'
}

export function domainTex(d: Domain) {
  if (d.kind === 'empty') return '\\varnothing'
  if (d.kind === 'right') return `(${formatNumber(d.bound)},\\ \\infty)`
  return `(-\\infty,\\ ${formatNumber(d.bound)})`
}

/** Where a parent point lands: (x, y) → (x/p + h, a·y + k). */
export function mappingTex({ a, p, h, k }: LogParams) {
  let xImage: string
  if (isOne(p)) xImage = 'x'
  else if (isMinusOne(p)) xImage = '-x'
  else if (Number.isInteger(Math.round((1 / p) * 1000) / 1000)) xImage = `${coefficientTex(1 / p)}x`
  else xImage = `\\tfrac{x}{${formatNumber(p)}}`
  const yImage = `${coefficientTex(a)}y`
  return `(x,\\ y) \\to (${xImage}${formatAddend(h)},\\ ${yImage}${formatAddend(k)})`
}
