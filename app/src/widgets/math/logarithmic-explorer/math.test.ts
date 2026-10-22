import { describe, expect, it } from 'vitest'
import {
  argumentTex,
  asymptote,
  behavior,
  domain,
  domainTex,
  endBehavior,
  equivalentShift,
  evaluate,
  generalTokens,
  inDomain,
  keyPoint,
  mappingTex,
  pointTex,
  secondPoint,
  substitutedTokens,
  transformedTex,
  xIntercept,
  yIntercept,
  type LogParams,
} from './math'

const parent: LogParams = { a: 1, b: 2, p: 1, h: 0, k: 0 }
const sample: LogParams[] = [
  parent,
  { a: 2, b: 3, p: 1, h: 1, k: 2 },
  { a: -1.5, b: 0.5, p: 2, h: -2.5, k: -1 },
  { a: 0.5, b: 5, p: -1, h: 3, k: 4 },
  { a: 1, b: 10, p: -0.5, h: -3, k: 0 },
  { a: 1, b: 0.5, p: -1, h: 1, k: 2 }, // decreasing base mirrored → increasing
]

describe('invariants that the readouts rely on', () => {
  it.each(sample)('key point and second point lie on the curve: %o', params => {
    const P = keyPoint(params)
    expect(evaluate(P.x, params)).toBeCloseTo(P.y, 10)
    const Q = secondPoint(params)
    expect(evaluate(Q.x, params)).toBeCloseTo(Q.y, 10)
  })

  it.each(sample)('x-intercept is a root inside the domain: %o', params => {
    const root = xIntercept(params)
    expect(root).not.toBeNull()
    if (root) {
      expect(inDomain(root.x, params)).toBe(true)
      expect(evaluate(root.x, params)).toBeCloseTo(0, 8)
    }
  })

  it.each(sample)('y-intercept, when it exists, is g(0): %o', params => {
    const yInt = yIntercept(params)
    if (yInt) expect(yInt.y).toBeCloseTo(evaluate(0, params), 10)
    else expect(Number.isNaN(evaluate(0, params))).toBe(true)
  })

  it.each(sample)('the asymptote is the domain boundary: %o', params => {
    const d = domain(params)
    expect(d.kind).not.toBe('empty')
    if (d.kind !== 'empty') expect(d.bound).toBe(asymptote(params))
    // just inside the domain the function is finite; on the boundary it is not
    const inside = params.p > 0 ? params.h + 1e-6 : params.h - 1e-6
    expect(Number.isFinite(evaluate(inside, params))).toBe(true)
    expect(Number.isNaN(evaluate(params.h, params))).toBe(true)
  })

  it.each(sample)('behavior matches the sign of a secant inside the domain: %o', params => {
    const P = keyPoint(params)
    const Q = secondPoint(params)
    const slope = (Q.y - P.y) / (Q.x - P.x)
    expect(behavior(params)).toBe(slope > 0 ? 'increasing' : 'decreasing')
  })

  it.each(sample)('horizontal stretch equals a vertical shift: %o', params => {
    const shift = equivalentShift(params)
    if (shift === null) return
    const unstretched = { ...params, p: Math.sign(params.p), k: params.k + shift }
    for (const dx of [0.3, 1, 2.5, 7]) {
      const x = params.h + dx * Math.sign(params.p)
      expect(evaluate(x, unstretched)).toBeCloseTo(evaluate(x, params), 8)
    }
  })
})

describe('degenerate and sign cases', () => {
  it('b = 1 is undefined everywhere', () => {
    const params = { ...parent, b: 1 }
    expect(behavior(params)).toBe('undefined')
    expect(domain(params)).toEqual({ kind: 'empty' })
    expect(asymptote(params)).toBeNull()
    expect(xIntercept(params)).toBeNull()
    expect(yIntercept(params)).toBeNull()
    expect(endBehavior(params)).toBeNull()
    expect(equivalentShift({ ...params, p: 2 })).toBeNull()
    expect(Number.isNaN(evaluate(3, params))).toBe(true)
  })

  it('p < 0 flips the domain to the left of h', () => {
    expect(domain({ ...parent, p: -1, h: 2 })).toEqual({ kind: 'left', bound: 2 })
    expect(inDomain(1, { ...parent, p: -1, h: 2 })).toBe(true)
    expect(inDomain(3, { ...parent, p: -1, h: 2 })).toBe(false)
  })

  it('a y-intercept exists only when 0 is in the domain', () => {
    expect(yIntercept(parent)).toBeNull() // domain (0, ∞) excludes 0
    expect(yIntercept({ ...parent, h: 2 })).toBeNull()
    expect(yIntercept({ ...parent, h: -3 })).toEqual({ x: 0, y: Math.log(3) / Math.log(2) })
    expect(yIntercept({ ...parent, p: -1, h: 2 })).toEqual({ x: 0, y: 1 })
  })

  it('direction follows sign(a) · sign(p) · sign(ln b)', () => {
    expect(behavior(parent)).toBe('increasing')
    expect(behavior({ ...parent, b: 0.5 })).toBe('decreasing')
    expect(behavior({ ...parent, b: 0.5, p: -1 })).toBe('increasing')
    expect(behavior({ ...parent, a: -1 })).toBe('decreasing')
    expect(behavior({ ...parent, a: -1, p: -1, b: 0.5 })).toBe('decreasing')
  })

  it('end behavior: parent dives at the asymptote and climbs far away', () => {
    expect(endBehavior(parent)).toEqual({ side: '+', nearAsymptote: '-inf', farSide: '+', far: 'inf' })
    expect(endBehavior({ ...parent, a: -1 })).toEqual({ side: '+', nearAsymptote: 'inf', farSide: '+', far: '-inf' })
    expect(endBehavior({ ...parent, b: 0.5 })).toEqual({ side: '+', nearAsymptote: 'inf', farSide: '+', far: '-inf' })
    expect(endBehavior({ ...parent, p: -1 })).toEqual({ side: '-', nearAsymptote: '-inf', farSide: '-', far: 'inf' })
  })

  it('key points: (1, 0) → (h + 1/p, k) and (b, 1) → (h + b/p, a + k)', () => {
    expect(keyPoint({ a: 2, b: 3, p: 2, h: 1, k: 5 })).toEqual({ x: 1.5, y: 5 })
    expect(secondPoint({ a: 2, b: 3, p: 2, h: 1, k: 5 })).toEqual({ x: 2.5, y: 7 })
    expect(keyPoint({ ...parent, p: -1, h: 2 })).toEqual({ x: 1, y: 0 })
  })

  it('equivalent shift: p = 2 with base 2 is one unit up', () => {
    expect(equivalentShift({ ...parent, p: 2 })).toBeCloseTo(1, 10)
    expect(equivalentShift({ ...parent, p: 0.5 })).toBeCloseTo(-1, 10)
    expect(equivalentShift({ ...parent, p: -2, a: -1 })).toBeCloseTo(-1, 10)
    expect(equivalentShift(parent)).toBeNull()
  })
})

describe('TeX formatting', () => {
  it('simplifies the argument for p = ±1 and h = 0', () => {
    expect(argumentTex(1, 0)).toBe('x')
    expect(argumentTex(1, 1)).toBe('x - 1')
    expect(argumentTex(1, -2.5)).toBe('x + 2.5')
    expect(argumentTex(-1, 0)).toBe('-x')
    expect(argumentTex(-1, 1)).toBe('-(x - 1)')
    expect(argumentTex(2, 0)).toBe('2x')
    expect(argumentTex(2, 1)).toBe('2(x - 1)')
  })

  it('writes the transformed equation without 1·, +0, or stray signs', () => {
    expect(transformedTex(parent)).toBe('\\log_{2} x')
    expect(transformedTex({ ...parent, a: -1 })).toBe('-\\log_{2} x')
    expect(transformedTex({ a: 2, b: 3, p: 1, h: 1, k: 2 })).toBe('2\\log_{3}(x - 1) + 2')
    expect(transformedTex({ a: 1, b: 0.5, p: -1, h: 1, k: -2 })).toBe('\\log_{0.5}(-(x - 1)) - 2')
    expect(transformedTex({ a: 1, b: 10, p: 2, h: 0, k: 0 })).toBe('\\log_{10}(2x)')

    const tag = (term: string, tex: string) => `[${term}:${tex}]`
    expect(transformedTex({ a: -2, b: 3, p: -1, h: -1, k: -4 }, tag)).toBe('[a:-2]\\log_{[b:3]}([p:-](x + [h:1])) - [k:4]')
  })

  it('strip tokens never simplify, so the general and substituted rows share a shape', () => {
    const tag = (term: string, tex: string) => `[${term}:${tex}]`
    expect(generalTokens(tag)).toEqual(['g(x) =', '[a:a]', '\\log_{[b:b]}(', '[p:p]', '(x - {}', '[h:h]', '))', '+', '[k:k]'])
    expect(substitutedTokens(parent, tag)).toEqual(['g(x) =', '[a:1]', '\\log_{[b:2]}(', '[p:1]', '(x - {}', '[h:0]', '))', '+', '[k:0]'])
    expect(substitutedTokens({ a: -2, b: 3, p: -1, h: -1, k: -4 })).toEqual(['g(x) =', '-2', '\\log_{3}(', '-1', '(x - {}', '-1', '))', '+', '-4'])
    expect(generalTokens()).toHaveLength(substitutedTokens({ a: 2.5, b: 0.5, p: -2.5, h: -4.5, k: 4 }).length)
  })

  it('marks rounded points as approximate', () => {
    expect(pointTex({ x: 1, y: 3 })).toBe('(1,\\ 3)')
    expect(pointTex({ x: 1 / 3, y: 0 })).toBe('\\approx (0.3,\\ 0)')
  })

  it('domain and mapping notation', () => {
    expect(domainTex({ kind: 'right', bound: 2 })).toBe('(2,\\ \\infty)')
    expect(domainTex({ kind: 'left', bound: -1 })).toBe('(-\\infty,\\ -1)')
    expect(domainTex({ kind: 'empty' })).toBe('\\varnothing')
    expect(mappingTex(parent)).toBe('(x,\\ y) \\to (x,\\ y)')
    expect(mappingTex({ a: 2, b: 2, p: -1, h: 1, k: 2 })).toBe('(x,\\ y) \\to (-x + 1,\\ 2y + 2)')
    expect(mappingTex({ a: 1, b: 2, p: 0.5, h: 0, k: 0 })).toBe('(x,\\ y) \\to (2x,\\ y)')
    expect(mappingTex({ a: 1, b: 2, p: 3, h: 0, k: 0 })).toBe('(x,\\ y) \\to (\\tfrac{x}{3},\\ y)')
  })
})
