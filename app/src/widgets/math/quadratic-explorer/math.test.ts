import { describe, expect, it } from 'vitest'
import {
  domainTex,
  endBehavior,
  evaluate,
  generalTokens,
  mappingTex,
  pointTex,
  range,
  rangeTex,
  squaredTermTex,
  standardCoefficients,
  standardFormExact,
  standardFormTex,
  substitutedTokens,
  vertex,
  vertexFormTex,
  xIntercepts,
  yIntercept,
  type QuadraticParams,
} from './math'

const parent: QuadraticParams = { a: 1, h: 0, k: 0 }
const sample: QuadraticParams[] = [
  parent,
  { a: 2.5, h: 0, k: 0 },
  { a: -0.5, h: 0, k: 0 },
  { a: 1, h: 2, k: 3 },
  { a: 1.5, h: -2.5, k: -2 },
  { a: -2, h: 1.5, k: 4 },
  { a: 1, h: -3, k: 0 },
]

describe('invariants that the readouts rely on', () => {
  it.each(sample)('vertex lies on the curve: %o', params => {
    const v = vertex(params)
    expect(evaluate(v.x, params)).toBeCloseTo(v.y, 10)
  })

  it.each(sample)('y-intercept is g(0): %o', params => {
    expect(yIntercept(params)?.y).toBeCloseTo(evaluate(0, params), 10)
  })

  it.each(sample)('every x-intercept is a root: %o', params => {
    const result = xIntercepts(params)
    const roots = result.kind === 'two' ? result.points : result.kind === 'one' ? [result.point] : []
    for (const root of roots) expect(evaluate(root.x, params)).toBeCloseTo(0, 8)
  })

  it.each(sample)('standard-form coefficients expand the vertex form: %o', params => {
    const { a, b, c } = standardCoefficients(params)
    for (const x of [-3, -1, 0, 0.7, 2.5]) {
      expect(a * x * x + b * x + c).toBeCloseTo(evaluate(x, params), 8)
    }
  })

  it.each(sample)('range bound is the vertex height: %o', params => {
    expect(range(params).bound).toBe(params.k)
  })
})

describe('x-intercept cases', () => {
  it('two roots when the vertex and the opening straddle the axis', () => {
    const result = xIntercepts({ a: 1, h: 1, k: -4 })
    expect(result.kind).toBe('two')
    if (result.kind === 'two') {
      expect(result.points[0].x).toBeCloseTo(-1, 10)
      expect(result.points[1].x).toBeCloseTo(3, 10)
    }
    expect(xIntercepts({ a: -2, h: 1.5, k: 4 }).kind).toBe('two')
  })

  it('one root when the vertex touches the axis', () => {
    expect(xIntercepts({ a: 1, h: -3, k: 0 })).toEqual({ kind: 'one', point: { x: -3, y: 0 } })
    expect(xIntercepts({ a: -2, h: 1, k: 0 })).toEqual({ kind: 'one', point: { x: 1, y: 0 } })
  })

  it('no roots when the parabola opens away from the axis', () => {
    expect(xIntercepts({ a: 1, h: 2, k: 3 })).toEqual({ kind: 'none' })
    expect(xIntercepts({ a: -1, h: 2, k: -3 })).toEqual({ kind: 'none' })
  })
})

describe('restricted domain (one branch, the one-to-one case)', () => {
  it('keeps only that branch’s root', () => {
    expect(xIntercepts({ a: 1, h: 1, k: -4 }, 'right')).toEqual({ kind: 'one', point: { x: 3, y: 0 } })
    expect(xIntercepts({ a: 1, h: 1, k: -4 }, 'left')).toEqual({ kind: 'one', point: { x: -1, y: 0 } })
    // a touching vertex is in both branches
    expect(xIntercepts({ a: 1, h: -3, k: 0 }, 'right')).toEqual({ kind: 'one', point: { x: -3, y: 0 } })
    expect(xIntercepts({ a: 1, h: -3, k: 0 }, 'left')).toEqual({ kind: 'one', point: { x: -3, y: 0 } })
    expect(xIntercepts({ a: 1, h: 2, k: 3 }, 'right')).toEqual({ kind: 'none' })
  })

  it('has a y-intercept only when 0 is in the domain', () => {
    expect(yIntercept({ a: 1, h: 2, k: 3 }, 'right')).toBeNull()
    expect(yIntercept({ a: 1, h: 2, k: 3 }, 'left')).toEqual({ x: 0, y: 7 })
    expect(yIntercept({ a: 1, h: -2, k: 3 }, 'right')).toEqual({ x: 0, y: 7 })
    expect(yIntercept({ a: 1, h: -2, k: 3 }, 'left')).toBeNull()
    // h = 0: the vertex is on the y-axis and belongs to both branches
    expect(yIntercept({ a: 1, h: 0, k: 3 }, 'right')).toEqual({ x: 0, y: 3 })
    expect(yIntercept({ a: 1, h: 0, k: 3 }, 'left')).toEqual({ x: 0, y: 3 })
  })

  it('drops the missing arm from the end behavior', () => {
    expect(endBehavior({ a: 1, h: 0, k: 0 })).toEqual({ left: 'inf', right: 'inf' })
    expect(endBehavior({ a: -1, h: 0, k: 0 })).toEqual({ left: '-inf', right: '-inf' })
    expect(endBehavior({ a: -1, h: 0, k: 0 }, 'right')).toEqual({ left: null, right: '-inf' })
    expect(endBehavior({ a: -1, h: 0, k: 0 }, 'left')).toEqual({ left: '-inf', right: null })
  })

  it('writes the domain as a closed interval ending at h', () => {
    expect(domainTex({ a: 1, h: 2.5, k: 0 })).toBe('(-\\infty,\\ \\infty)')
    expect(domainTex({ a: 1, h: 2.5, k: 0 }, 'right')).toBe('[2.5,\\ \\infty)')
    expect(domainTex({ a: 1, h: -1, k: 0 }, 'right')).toBe('[-1,\\ \\infty)')
    expect(domainTex({ a: 1, h: -1, k: 0 }, 'left')).toBe('(-\\infty,\\ -1]')
  })
})

describe('TeX formatting', () => {
  it('simplifies the squared term for h = 0 and writes the sign of h as the operator', () => {
    expect(squaredTermTex(0)).toBe('x^{2}')
    expect(squaredTermTex(2)).toBe('(x - 2)^{2}')
    expect(squaredTermTex(-2.5)).toBe('(x + 2.5)^{2}')
  })

  it('writes the vertex form without 1·, +0, or stray signs', () => {
    expect(vertexFormTex(parent)).toBe('x^{2}')
    expect(vertexFormTex({ a: -1, h: 0, k: 0 })).toBe('-x^{2}')
    expect(vertexFormTex({ a: 2.5, h: 0, k: 0 })).toBe('2.5x^{2}')
    expect(vertexFormTex({ a: 1, h: 2, k: 3 })).toBe('(x - 2)^{2} + 3')
    expect(vertexFormTex({ a: 1.5, h: -2.5, k: -2 })).toBe('1.5(x + 2.5)^{2} - 2')
    expect(vertexFormTex({ a: -1, h: 1, k: -4 })).toBe('-(x - 1)^{2} - 4')

    // A wrap tags each parameter's value; signs stay outside the h and k chips.
    const tag = (term: string, tex: string) => `[${term}:${tex}]`
    expect(vertexFormTex({ a: -2, h: -1, k: -4 }, tag)).toBe('[a:-2](x + [h:1])^{2} - [k:4]')
  })

  it('expands to standard form with the right signs and drops zero terms', () => {
    expect(standardFormTex(parent)).toBe('x^{2}')
    expect(standardFormTex({ a: 1, h: 2, k: 3 })).toBe('x^{2} - 4x + 7')
    expect(standardFormTex({ a: -1, h: -1, k: 0 })).toBe('-x^{2} - 2x - 1')
    expect(standardFormTex({ a: 2, h: 0, k: -5 })).toBe('2x^{2} - 5')
    expect(standardFormTex({ a: 0.5, h: 1, k: -0.5 })).toBe('0.5x^{2} - x')
    expect(standardFormTex({ a: 1, h: -0.5, k: 0 })).toBe('x^{2} + x + 0.25')
    expect(standardFormExact({ a: 1, h: -0.5, k: 0 })).toBe(true)
    // c = 1.5 · 2.5² = 9.375 has three decimals, so the equation must be written with ≈
    expect(standardFormTex({ a: 1.5, h: 2.5, k: 0 })).toBe('1.5x^{2} - 7.5x + 9.38')
    expect(standardFormExact({ a: 1.5, h: 2.5, k: 0 })).toBe(false)
    expect(standardFormTex({ a: 0.3, h: 0.7, k: 0 })).toBe('0.3x^{2} - 0.42x + 0.15')
    expect(standardFormExact({ a: 0.3, h: 0.7, k: 0 })).toBe(false)
  })

  it('strip tokens never simplify, so the general and substituted rows share a shape', () => {
    const tag = (term: string, tex: string) => `[${term}:${tex}]`
    expect(generalTokens(tag)).toEqual(['g(x) =', '[a:a]', '(x - {}', '[h:h]', ')^{2}', '+', '[k:k]'])
    expect(substitutedTokens(parent, tag)).toEqual(['g(x) =', '[a:1]', '(x - {}', '[h:0]', ')^{2}', '+', '[k:0]'])
    expect(substitutedTokens({ a: -2, h: -1, k: -4 })).toEqual(['g(x) =', '-2', '(x - {}', '-1', ')^{2}', '+', '-4'])
    expect(generalTokens()).toHaveLength(substitutedTokens({ a: 2.5, h: -2.5, k: 4 }).length)
  })

  it('marks rounded points as approximate', () => {
    expect(pointTex({ x: 1, y: 3 })).toBe('(1,\\ 3)')
    expect(pointTex({ x: 1 - Math.sqrt(2), y: 0 })).toBe('\\approx (-0.4,\\ 0)')
  })

  it('range and mapping notation', () => {
    expect(rangeTex(range({ a: 1, h: 0, k: 2 }))).toBe('[2,\\ \\infty)')
    expect(rangeTex(range({ a: -1, h: 0, k: -1 }))).toBe('(-\\infty,\\ -1]')
    expect(mappingTex(parent)).toBe('(x,\\ y) \\to (x,\\ y)')
    expect(mappingTex({ a: 2, h: 1, k: 2 })).toBe('(x,\\ y) \\to (x + 1,\\ 2y + 2)')
    expect(mappingTex({ a: -1, h: -2.5, k: -2 })).toBe('(x,\\ y) \\to (x - 2.5,\\ -y - 2)')
  })
})
