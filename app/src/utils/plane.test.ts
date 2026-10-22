import { describe, expect, it } from 'vitest'
import { ZOOM_LIMITS, createPlane, curvePath, inPlane, labelPosition, niceStep, panView, samplePoints, viewPlane, zoomView } from './plane'

const plane = createPlane({
  width: 760,
  height: 520,
  margin: { top: 24, right: 28, bottom: 46, left: 52 },
  xMin: -5,
  xMax: 5,
  yMin: -10,
  yMax: 10,
  yStep: 2,
})

describe('createPlane', () => {
  it('maps the data extremes to the plot edges', () => {
    expect(plane.mapX(-5)).toBe(52)
    expect(plane.mapX(5)).toBe(760 - 28)
    expect(plane.mapY(10)).toBe(24)
    expect(plane.mapY(-10)).toBe(520 - 46)
    expect(plane.mapY(0)).toBeCloseTo(24 + plane.plotHeight / 2)
  })

  it('generates ticks at the requested step', () => {
    expect(plane.xTicks).toEqual([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5])
    expect(plane.yTicks).toEqual([-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10])
  })
})

describe('samplePoints / curvePath', () => {
  it('samples endpoints inclusively', () => {
    const points = samplePoints(plane, x => x, 11)
    expect(points[0].x).toBe(-5)
    expect(points[10].x).toBeCloseTo(5)
    expect(points.length).toBe(11)
  })

  it('clamps runaway y values instead of emitting huge coordinates', () => {
    const path = curvePath([{ x: 0, y: 1e18 }, { x: 1, y: -1e18 }], plane)
    const ys = path.match(/-?\d+(\.\d+)?/g)!.map(Number).filter((_, i) => i % 2 === 1)
    for (const y of ys) expect(Math.abs(y)).toBeLessThan(5000)
  })

  it('drops non-finite points', () => {
    expect(curvePath([{ x: 0, y: NaN }, { x: 1, y: 2 }], plane).startsWith('M')).toBe(true)
  })
})

describe('inPlane / labelPosition', () => {
  it('detects points outside the visible plane', () => {
    expect(inPlane(plane, { x: 0, y: 1 })).toBe(true)
    expect(inPlane(plane, { x: 0, y: 11 })).toBe(false)
  })

  it('keeps labels inside the plot area', () => {
    const pos = labelPosition(plane, { x: 5, y: 10 }, 120)
    expect(pos.x).toBeLessThanOrEqual(52 + plane.plotWidth - 120)
    expect(pos.y).toBeGreaterThanOrEqual(24 + 18)
  })
})

describe('pan / zoom views', () => {
  const view = { xMin: -5, xMax: 5, yMin: -10, yMax: 10 }

  it('picks 1-2-5 grid steps that keep about ten lines', () => {
    expect(niceStep(10)).toBe(1)
    expect(niceStep(20)).toBe(2)
    expect(niceStep(50)).toBe(5)
    expect(niceStep(2)).toBe(0.2)
    expect(niceStep(0.7)).toBeCloseTo(0.05)
  })

  it('viewPlane reproduces the default plane grid and relabels when zoomed', () => {
    const base = { width: 760, height: 520, margin: { top: 24, right: 28, bottom: 46, left: 52 } }
    expect(viewPlane(base, view).xTicks).toEqual([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5])
    expect(viewPlane(base, view).yTicks).toEqual([-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10])
    const zoomed = viewPlane(base, zoomView(view, 0.25, { x: 0, y: 0 }))
    expect(zoomed.xTicks[1] - zoomed.xTicks[0]).toBeCloseTo(0.2)
  })

  it('pans by whole units', () => {
    expect(panView(view, 1, -2)).toEqual({ xMin: -4, xMax: 6, yMin: -12, yMax: 8 })
  })

  it('zooms about the anchor so it stays put', () => {
    const z = zoomView(view, 2, { x: 5, y: 10 })
    expect(z).toEqual({ xMin: -15, xMax: 5, yMin: -30, yMax: 10 })
    const back = zoomView(z, 0.5, { x: 5, y: 10 })
    expect(back.xMin).toBeCloseTo(-5)
    expect(back.yMin).toBeCloseTo(-10)
  })

  it('zooms one axis at a time when asked', () => {
    expect(zoomView(view, 2, { x: 0, y: 0 }, 'x')).toEqual({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 })
    expect(zoomView(view, 0.5, { x: 0, y: 0 }, 'y')).toEqual({ xMin: -5, xMax: 5, yMin: -5, yMax: 5 })
  })

  it('refuses to zoom past the span limits', () => {
    let v = view
    for (let i = 0; i < 40; i++) v = zoomView(v, 2, { x: 0, y: 0 })
    expect(v.yMax - v.yMin).toBeLessThanOrEqual(ZOOM_LIMITS.maxSpan + 1e-9)
    for (let i = 0; i < 40; i++) v = zoomView(v, 0.5, { x: 0, y: 0 })
    expect(v.xMax - v.xMin).toBeGreaterThanOrEqual(ZOOM_LIMITS.minSpan - 1e-9)
  })
})
