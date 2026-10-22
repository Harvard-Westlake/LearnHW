import { describe, expect, it } from 'vitest'
import {
  behavior,
  endBehavior,
  equivalentShift,
  evaluate,
  exponentTex,
  keyPoint,
  mappingTex,
  pointTex,
  range,
  rangeTex,
  generalTokens,
  substitutedTokens,
  transformedTex,
  xIntercept,
  yIntercept,
  type ExponentialParams,
} from './math'

const parent: ExponentialParams = { a: 1, b: 2, p: 1, h: 0, k: 0 }
const sample: ExponentialParams[] = [
  parent,
  { a: 2, b: 3, p: 1, h: 1, k: 2 },
  { a: -1.5, b: 0.5, p: 2, h: -2.5, k: -1 },
  { a: 0.5, b: 5, p: -1, h: 3, k: 4 },
  { a: 1, b: 0.5, p: -1, h: 1, k: 2 }, // decay base mirrored → growth
]

describe('invariants that the readouts rely on', () => {
  it.each(sample)('key point lies on the curve: %o', params => {
    const point = keyPoint(params)
    expect(evaluate(point.x, params)).toBeCloseTo(point.y, 10)
  })

  it.each(sample)('y-intercept is g(0): %o', params => {
    expect(yIntercept(params).y).toBeCloseTo(evaluate(0, params), 10)
  })

  it.each(sample)('x-intercept, when it exists, is a root: %o', params => {
    const result = xIntercept(params)
    if (result.kind === 'point') expect(evaluate(result.point.x, params)).toBeCloseTo(0, 8)
  })

  it.each(sample)('vertical stretch equals a horizontal shift: %o', params => {
    const shift = equivalentShift(params)
    if (shift === null) return
    const unstretched = { ...params, a: Math.sign(params.a), h: params.h - shift }
    for (const x of [-3, -1, 0, 0.7, 2.5]) {
      expect(evaluate(x, unstretched)).toBeCloseTo(evaluate(x, params), 8)
    }
  })
})

describe('degenerate and sign cases', () => {
  it('b = 1 is a constant function with no asymptote and a single-value range', () => {
    const params = { a: 2, b: 1, p: 1, h: 0, k: 3 }
    expect(behavior(params)).toBe('constant')
    expect(range(params)).toEqual({ kind: 'single', value: 5 })
    expect(endBehavior(params)).toEqual({ left: 5, right: 5 })
    expect(xIntercept(params)).toEqual({ kind: 'none' })
    expect(xIntercept({ ...params, k: -2 })).toEqual({ kind: 'everywhere' })
  })

  it('growth/decay follows the effective base b^p', () => {
    expect(behavior({ ...parent, b: 0.5 })).toBe('decay')
    expect(behavior({ ...parent, b: 0.5, p: -1 })).toBe('growth')
    expect(behavior({ ...parent, b: 3, p: -2 })).toBe('decay')
  })

  it('k = 0 has no x-intercept (the curve only approaches the axis)', () => {
    expect(xIntercept(parent)).toEqual({ kind: 'none' })
    expect(xIntercept({ ...parent, a: -1 })).toEqual({ kind: 'none' })
  })

  it('x-intercept exists only when the curve and asymptote straddle the axis', () => {
    expect(xIntercept({ ...parent, k: 2 })).toEqual({ kind: 'none' })
    const crossing = xIntercept({ ...parent, k: -2 })
    expect(crossing.kind).toBe('point')
    if (crossing.kind === 'point') expect(crossing.point.x).toBeCloseTo(1, 10)
  })

  it('range and end behavior flip with a reflection', () => {
    expect(range({ ...parent, a: -1, k: 2 })).toEqual({ kind: 'below', bound: 2 })
    expect(endBehavior({ ...parent, a: -1, k: 2 })).toEqual({ left: 2, right: '-inf' })
    expect(endBehavior({ ...parent, b: 0.5, k: 2 })).toEqual({ left: 'inf', right: 2 })
  })

  it('equivalent shift: a = 2 with base 2 is one unit left', () => {
    expect(equivalentShift({ ...parent, a: 2 })).toBeCloseTo(1, 10)
    expect(equivalentShift({ ...parent, a: 1 })).toBeNull()
    expect(equivalentShift({ ...parent, a: 2, b: 1 })).toBeNull()
  })
})

describe('TeX formatting', () => {
  it('simplifies the exponent for p = ±1 and h = 0', () => {
    expect(exponentTex(1, 0)).toBe('x')
    expect(exponentTex(1, 1)).toBe('x - 1')
    expect(exponentTex(1, -2.5)).toBe('x + 2.5')
    expect(exponentTex(-1, 0)).toBe('-x')
    expect(exponentTex(-1, 1)).toBe('-(x - 1)')
    expect(exponentTex(2, 0)).toBe('2x')
    expect(exponentTex(2, 1)).toBe('2(x - 1)')
  })

  it('writes the transformed equation without 1·, +0, or stray signs', () => {
    expect(transformedTex(parent)).toBe('2^{x}')

    // A wrap tags each parameter's value; signs stay outside the h and k chips
    // so students see (x − h) and + k as written.
    const tag = (term: string, tex: string) => `[${term}:${tex}]`
    expect(transformedTex({ a: -2, b: 3, p: -1, h: -1, k: -4 }, tag)).toBe('[a:-2]\\left([b:3]^{[p:-](x + [h:1])}\\right) - [k:4]')
    expect(transformedTex(parent, tag)).toBe('[b:2]^{x}')
    // The strip's tokens never simplify, so columns never move; general and
    // substituted rows have the same shape.
    expect(substitutedTokens(parent, tag)).toEqual(['g(x) =', '[a:1]', '\\cdot', '[b:2]', '{}^{[p:1](x - [h:0])}', '+', '[k:0]'])
    expect(substitutedTokens({ a: -2, b: 3, p: -1, h: -1, k: -4 })).toEqual(['g(x) =', '-2', '\\cdot', '3', '{}^{-1(x - -1)}', '+', '-4'])
    expect(generalTokens(tag)).toEqual(['g(x) =', '[a:a]', '\\cdot', '[b:b]', '{}^{[p:p](x - [h:h])}', '+', '[k:k]'])
    expect(transformedTex({ ...parent, a: -1 })).toBe('-2^{x}')
    expect(transformedTex({ a: 2, b: 3, p: 1, h: 1, k: 2 })).toBe('2\\left(3^{x - 1}\\right) + 2')
    expect(transformedTex({ a: 1, b: 0.5, p: -1, h: 1, k: -2 })).toBe('0.5^{-(x - 1)} - 2')
  })

  it('marks rounded points as approximate', () => {
    expect(pointTex({ x: 1, y: 3 })).toBe('(1,\\ 3)')
    expect(pointTex({ x: 1 / 3, y: 0 })).toBe('\\approx (0.3,\\ 0)')
  })

  it('range and mapping notation', () => {
    expect(rangeTex({ kind: 'above', bound: 2 })).toBe('(2,\\ \\infty)')
    expect(rangeTex({ kind: 'below', bound: -1 })).toBe('(-\\infty,\\ -1)')
    expect(rangeTex({ kind: 'single', value: 5 })).toBe('\\{5\\}')
    expect(mappingTex(parent)).toBe('(x,\\ y) \\to (x,\\ y)')
    expect(mappingTex({ a: 2, b: 2, p: -1, h: 1, k: 2 })).toBe('(x,\\ y) \\to (-x + 1,\\ 2y + 2)')
    expect(mappingTex({ a: 1, b: 2, p: 0.5, h: 0, k: 0 })).toBe('(x,\\ y) \\to (2x,\\ y)')
    expect(mappingTex({ a: 1, b: 2, p: 3, h: 0, k: 0 })).toBe('(x,\\ y) \\to (\\tfrac{x}{3},\\ y)')
  })
})
