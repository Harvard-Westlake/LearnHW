import { clamp } from './format'

/**
 * Pure geometry for the explorer coordinate plane: value ↔ pixel mapping,
 * tick generation, curve sampling, and label placement. No React here so it
 * can be unit-tested directly.
 */

export type PlaneConfig = {
  width: number
  height: number
  margin: { top: number; right: number; bottom: number; left: number }
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  /** Grid line spacing (default 1). */
  xStep?: number
  yStep?: number
  /** Label every Nth grid line (default 1). */
  xLabelEvery?: number
  yLabelEvery?: number
}

export type Plane = PlaneConfig & {
  plotWidth: number
  plotHeight: number
  mapX: (value: number) => number
  mapY: (value: number) => number
  xTicks: number[]
  yTicks: number[]
}

function ticks(min: number, max: number, step: number) {
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6)
  return out
}

export function createPlane(config: PlaneConfig): Plane {
  const { width, height, margin, xMin, xMax, yMin, yMax, xStep = 1, yStep = 1 } = config
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  return {
    ...config,
    plotWidth,
    plotHeight,
    mapX: value => margin.left + ((value - xMin) / (xMax - xMin)) * plotWidth,
    mapY: value => height - margin.bottom - ((value - yMin) / (yMax - yMin)) * plotHeight,
    xTicks: ticks(xMin, xMax, xStep),
    yTicks: ticks(yMin, yMax, yStep),
  }
}

export type Point = { x: number; y: number }

/**
 * SVG path through sampled points. Y values are clamped to a band just
 * outside the plane so runaway values (e.g. 5^25) don't produce absurd
 * coordinates; the plane's clip path hides the overshoot.
 */
export function curvePath(points: Point[], plane: Plane) {
  const pad = (plane.yMax - plane.yMin) * 2
  return points
    .filter(p => Number.isFinite(p.y))
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${plane.mapX(p.x).toFixed(2)} ${plane.mapY(clamp(p.y, plane.yMin - pad, plane.yMax + pad)).toFixed(2)}`)
    .join(' ')
}

export function samplePoints(plane: Plane, fn: (x: number) => number, count = 241): Point[] {
  const step = (plane.xMax - plane.xMin) / (count - 1)
  return Array.from({ length: count }, (_, i) => {
    const x = plane.xMin + i * step
    return { x, y: fn(x) }
  })
}

export function inPlane(plane: Plane, p: Point) {
  return p.x >= plane.xMin && p.x <= plane.xMax && p.y >= plane.yMin && p.y <= plane.yMax
}

/** Position for a label near a marker, kept inside the plot area. */
export function labelPosition(plane: Plane, p: Point, labelWidth = 120) {
  const px = plane.mapX(p.x)
  const py = plane.mapY(p.y)
  return {
    x: clamp(px + 12, plane.margin.left + 12, plane.margin.left + plane.plotWidth - labelWidth),
    y: clamp(py - 12, plane.margin.top + 18, plane.margin.top + plane.plotHeight - 10),
  }
}

/* ------------------------------------------------------------
 * Pan / zoom. A View is just the visible window; viewPlane() turns a base
 * config plus a view into a Plane whose grid spacing follows the zoom.
 * ------------------------------------------------------------ */
export type View = { xMin: number; xMax: number; yMin: number; yMax: number }

/** 1, 2, or 5 × 10ⁿ so that `span / step` is about `target` grid lines. */
export function niceStep(span: number, target = 10) {
  const raw = span / target
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const r = raw / pow
  const m = r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10
  return m * pow
}

export function viewPlane(base: Omit<PlaneConfig, keyof View>, view: View): Plane {
  return createPlane({
    ...base,
    ...view,
    xStep: niceStep(view.xMax - view.xMin),
    yStep: niceStep(view.yMax - view.yMin),
    xLabelEvery: 1,
    yLabelEvery: 1,
  })
}

export function panView(view: View, dx: number, dy: number): View {
  return { xMin: view.xMin + dx, xMax: view.xMax + dx, yMin: view.yMin + dy, yMax: view.yMax + dy }
}

/** Widest / narrowest window allowed, as a span in plane units. */
export const ZOOM_LIMITS = { minSpan: 0.5, maxSpan: 400 }

export type ZoomAxis = 'both' | 'x' | 'y'

function clampFactor(span: number, factor: number) {
  return Math.max(ZOOM_LIMITS.minSpan / span, Math.min(factor, ZOOM_LIMITS.maxSpan / span))
}

/**
 * Scales the window by `factor` (>1 zooms out) keeping `anchor` fixed on
 * screen. `axis` limits the zoom to one direction; with 'both' the axes move
 * together, so whichever one hits a limit first stops both.
 */
export function zoomView(view: View, factor: number, anchor: Point, axis: ZoomAxis = 'both'): View {
  const xSpan = view.xMax - view.xMin
  const ySpan = view.yMax - view.yMin
  let fx = axis === 'y' ? 1 : clampFactor(xSpan, factor)
  let fy = axis === 'x' ? 1 : clampFactor(ySpan, factor)
  if (axis === 'both') fx = fy = factor > 1 ? Math.min(fx, fy) : Math.max(fx, fy)
  return {
    xMin: anchor.x - (anchor.x - view.xMin) * fx,
    xMax: anchor.x + (view.xMax - anchor.x) * fx,
    yMin: anchor.y - (anchor.y - view.yMin) * fy,
    yMax: anchor.y + (view.yMax - anchor.y) * fy,
  }
}

export function sameView(a: View, b: View) {
  return Math.abs(a.xMin - b.xMin) < 1e-9 && Math.abs(a.xMax - b.xMax) < 1e-9 && Math.abs(a.yMin - b.yMin) < 1e-9 && Math.abs(a.yMax - b.yMax) < 1e-9
}
