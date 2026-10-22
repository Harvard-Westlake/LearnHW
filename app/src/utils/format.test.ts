import { describe, expect, it } from 'vitest'
import { clamp, formatAddend, formatMovementLines, formatNumber, formatPoint, nearlyZero } from './format'

describe('formatNumber', () => {
  it('drops trailing zeros and never shows -0', () => {
    expect(formatNumber(2)).toBe('2')
    expect(formatNumber(2.5)).toBe('2.5')
    expect(formatNumber(2.04)).toBe('2')
    expect(formatNumber(-0.00001)).toBe('0')
    expect(formatNumber(-0.04)).toBe('0')
  })

  it('honours the decimals argument', () => {
    expect(formatNumber(1 / 3, 2)).toBe('0.33')
    expect(formatNumber(0.1 + 0.2, 2)).toBe('0.3')
  })
})

describe('formatPoint', () => {
  it('prefixes ~ when either coordinate was rounded', () => {
    expect(formatPoint(1, 3)).toBe('(1, 3)')
    expect(formatPoint(1 / 3, 0)).toBe('~(0.3, 0)')
  })
})

describe('formatAddend', () => {
  it('writes signed constants or nothing for zero', () => {
    expect(formatAddend(2)).toBe(' + 2')
    expect(formatAddend(-2.5)).toBe(' - 2.5')
    expect(formatAddend(0)).toBe('')
    expect(formatAddend(-0.00001)).toBe('')
  })
})

describe('formatMovementLines', () => {
  it('uses singular for one unit and picks the direction by sign', () => {
    expect(formatMovementLines(1, 'right', 'left')).toEqual({ firstLine: '1 unit', secondLine: 'right' })
    expect(formatMovementLines(-2.5, 'right', 'left')).toEqual({ firstLine: '2.5 units', secondLine: 'left' })
    expect(formatMovementLines(0, 'up', 'down')).toEqual({ firstLine: 'No', secondLine: 'shift' })
  })
})

describe('helpers', () => {
  it('nearlyZero and clamp', () => {
    expect(nearlyZero(0.00005)).toBe(true)
    expect(nearlyZero(0.001)).toBe(false)
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-1, 0, 3)).toBe(0)
  })
})
