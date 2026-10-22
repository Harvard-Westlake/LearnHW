import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'

type ExplorerValues = {
  stretch: number
  flip: boolean
  h: number
  k: number
}

type Preset = {
  label: string
  hint: string
  values: ExplorerValues
}

type SliderControlProps = {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  hint: string
  onChange: (value: number) => void
}

type EquationCardProps = {
  label: string
  equation: string
  note: string
}

type Point = {
  x: number
  y: number
}

const DEFAULT_VALUES: ExplorerValues = {
  stretch: 1,
  flip: false,
  h: 0,
  k: 0,
}

const PRESETS: Preset[] = [
  {
    label: 'Parent',
    hint: 'Reset to p(x) = x²',
    values: { stretch: 1, flip: false, h: 0, k: 0 },
  },
  {
    label: 'Narrower',
    hint: 'Strong vertical stretch',
    values: { stretch: 2.5, flip: false, h: 0, k: 0 },
  },
  {
    label: 'Wider Down',
    hint: 'Reflect and compress',
    values: { stretch: 0.5, flip: true, h: 0, k: 0 },
  },
  {
    label: 'Right and Up',
    hint: 'Shift the vertex to (2, 3)',
    values: { stretch: 1, flip: false, h: 2, k: 3 },
  },
  {
    label: 'Left and Down',
    hint: 'Move the vertex to (-2.5, -2)',
    values: { stretch: 1.5, flip: false, h: -2.5, k: -2 },
  },
  {
    label: 'Touching Axis',
    hint: 'Vertex sits on the x-axis',
    values: { stretch: 1, flip: false, h: -3, k: 0 },
  },
]

const GRAPH_WIDTH = 760
const GRAPH_HEIGHT = 520
const MARGIN = { top: 24, right: 28, bottom: 46, left: 52 }
const X_MIN = -6
const X_MAX = 6
const Y_MIN = -8
const Y_MAX = 12
const X_TICKS = Array.from({ length: X_MAX - X_MIN + 1 }, (_, i) => X_MIN + i)
const Y_TICKS = Array.from({ length: Y_MAX - Y_MIN + 1 }, (_, i) => Y_MIN + i)
const SAMPLE_COUNT = 241

function roundToTenth(value: number) {
  return Math.round(value * 10) / 10
}

function nearlyZero(value: number) {
  return Math.abs(value) < 0.0001
}

function isApproximate(value: number) {
  return Math.abs(value - roundToTenth(value)) > 0.00001
}

function formatPoint(x: number, y: number) {
  const approx = isApproximate(x) || isApproximate(y)
  return `${approx ? '~' : ''}(${formatNumber(x)}, ${formatNumber(y)})`
}

function formatNumber(value: number) {
  const rounded = nearlyZero(value) ? 0 : roundToTenth(value)

  if (Number.isInteger(rounded)) {
    return String(rounded)
  }

  return rounded.toFixed(1).replace(/\.0$/, '')
}

function formatAbs(value: number) {
  return formatNumber(Math.abs(value))
}

function formatMovementLines(value: number, positiveDirection: string, negativeDirection: string) {
  if (nearlyZero(value)) return { firstLine: 'No', secondLine: 'shift' }

  return {
    firstLine: `${formatAbs(value)} ${Math.abs(value) === 1 ? 'unit' : 'units'}`,
    secondLine: value > 0 ? positiveDirection : negativeDirection,
  }
}

function formatShiftedX(value: number) {
  if (nearlyZero(value)) return 'x + 0'
  return value > 0 ? `x + ${formatNumber(value)}` : `x - ${formatAbs(value)}`
}

function formatScaledShiftedY(a: number, k: number) {
  const aPart = `${formatNumber(a)}y`
  if (nearlyZero(k)) return `${aPart} + 0`
  return k > 0 ? `${aPart} + ${formatNumber(k)}` : `${aPart} - ${formatAbs(k)}`
}

function evaluateQuadratic(x: number, a: number, h: number, k: number) {
  return a * (x - h) * (x - h) + k
}

function formatVertexForm(a: number, h: number, k: number) {
  const aPart = Math.abs(Math.abs(a) - 1) < 0.001 ? (a < 0 ? '-' : '') : formatNumber(a)
  const hPart = nearlyZero(h) ? 'x' : h > 0 ? `(x - ${formatNumber(h)})` : `(x + ${formatAbs(h)})`
  const kPart = nearlyZero(k) ? '' : k > 0 ? ` + ${formatNumber(k)}` : ` - ${formatAbs(k)}`
  return `${aPart}${hPart}²${kPart}`
}

function formatQuadraticTerm(a: number) {
  if (Math.abs(a - 1) < 0.001) return 'x²'
  if (Math.abs(a + 1) < 0.001) return '-x²'
  return `${formatNumber(a)}x²`
}

function formatLinearTerm(b: number) {
  if (Math.abs(b - 1) < 0.001) return 'x'
  if (Math.abs(b + 1) < 0.001) return '-x'
  return `${formatNumber(b)}x`
}

function formatStandardForm(a: number, h: number, k: number) {
  const b = roundToTenth(-2 * a * h)
  const c = roundToTenth(a * h * h + k)
  const pieces: string[] = [formatQuadraticTerm(a)]

  if (!nearlyZero(b)) {
    pieces.push(`${b > 0 ? '+' : '-'} ${formatLinearTerm(Math.abs(b))}`)
  }

  if (!nearlyZero(c)) {
    pieces.push(`${c > 0 ? '+' : '-'} ${formatNumber(Math.abs(c))}`)
  }

  return pieces.join(' ')
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function makeCurvePath(points: Point[], mapX: (value: number) => number, mapY: (value: number) => number) {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${mapX(point.x).toFixed(2)} ${mapY(point.y).toFixed(2)}`)
    .join(' ')
}

function statesMatch(a: ExplorerValues, b: ExplorerValues) {
  return (
    Math.abs(a.stretch - b.stretch) < 0.001 &&
    a.flip === b.flip &&
    Math.abs(a.h - b.h) < 0.001 &&
    Math.abs(a.k - b.k) < 0.001
  )
}

function SliderControl({ id, label, value, min, max, step, hint, onChange }: SliderControlProps) {
  return (
    <div className="field qe-control">
      <div className="qe-control__row">
        <label className="label" htmlFor={id}>{label}</label>
        <code className="qe-control__value">{formatNumber(value)}</code>
      </div>
      <input
        id={id}
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
      />
      <p className="helper-text qe-control__hint">{hint}</p>
    </div>
  )
}

function ShrinkToFitInline({ children }: { children: ReactNode }) {
  const wrapperRef = useRef<HTMLSpanElement | null>(null)
  const contentRef = useRef<HTMLSpanElement | null>(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current
    const content = contentRef.current
    if (!wrapper || !content) return

    const updateScale = () => {
      const availableWidth = wrapper.clientWidth
      const contentWidth = content.scrollWidth

      if (availableWidth <= 0 || contentWidth <= 0) {
        setScale(1)
        return
      }

      setScale(Math.max(0.72, Math.min(1, availableWidth / contentWidth)))
    }

    updateScale()

    const observer = new ResizeObserver(updateScale)
    observer.observe(wrapper)
    observer.observe(content)

    return () => observer.disconnect()
  }, [children])

  return (
    <span ref={wrapperRef} className="qe-fit-wrap">
      <span
        ref={contentRef}
        className="qe-fit-content"
        style={{ transform: `scale(${scale})` }}
      >
        {children}
      </span>
    </span>
  )
}

function EquationCard({ label, equation, note }: EquationCardProps) {
  return (
    <div className="canvas-card qe-equation-card">
      <span className="canvas-card__label">{label}</span>
      <div className="qe-equation-card__equation">
        <span className="qe-equation-card__fn">g(x)=</span>
        <ShrinkToFitInline>
          <code>{equation}</code>
        </ShrinkToFitInline>
      </div>
      <p className="muted qe-equation-card__note">{note}</p>
    </div>
  )
}

export default function QuadraticExplorer() {
  const [values, setValues] = useState<ExplorerValues>(DEFAULT_VALUES)
  const [showPresets, setShowPresets] = useState(false)
  const [restrictDomain, setRestrictDomain] = useState(false)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Quadratic Transformations Explorer · Class Resources'
    return () => {
      document.title = previousTitle
    }
  }, [])

  useEffect(() => {
    if (!showPresets) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowPresets(false)
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [showPresets])

  const aSigned = values.flip ? -values.stretch : values.stretch
  const vertex = { x: values.h, y: values.k }
  const opensLabel = aSigned >= 0 ? 'Upward' : 'Downward'
  const widthLabel = Math.abs(values.stretch - 1) < 0.001 ? 'Same' : values.stretch > 1 ? 'Narrower' : 'Wider'
  const parentEquation = 'p(x) = x²'
  const geometricNotation = `(x,y) → (${formatShiftedX(values.h)}, ${formatScaledShiftedY(aSigned, values.k)})`
  const absoluteExtremumLabel = aSigned >= 0 ? 'Vertex is Absolute Min' : 'Vertex is Absolute Max'
  const vertexEquation = formatVertexForm(aSigned, values.h, values.k)
  const standardEquation = formatStandardForm(aSigned, values.h, values.k)
  const domainLabel = restrictDomain
    ? `[${formatNumber(values.h)}, ∞)`
    : '(-∞, ∞)'

  const xInterceptsDiscriminant = nearlyZero(aSigned) ? NaN : -values.k / aSigned
  let xInterceptsLabel: string
  if (isNaN(xInterceptsDiscriminant) || xInterceptsDiscriminant < -0.0001) {
    xInterceptsLabel = 'No real roots'
  } else if (Math.abs(xInterceptsDiscriminant) <= 0.0001) {
    xInterceptsLabel = formatPoint(values.h, 0)
  } else {
    const sqrtD = Math.sqrt(xInterceptsDiscriminant)
    const x1 = values.h - sqrtD
    const x2 = values.h + sqrtD
    xInterceptsLabel = restrictDomain
      ? formatPoint(x2, 0)
      : `${formatPoint(x1, 0)},  ${formatPoint(x2, 0)}`
  }

  let yInterceptLabel: string
  if (restrictDomain && values.h > 0.0001) {
    yInterceptLabel = 'Not in domain'
  } else {
    const yInt = evaluateQuadratic(0, aSigned, values.h, values.k)
    yInterceptLabel = formatPoint(0, yInt)
  }
  const rangeLabel = aSigned >= 0
    ? `[${formatNumber(values.k)}, ∞)`
    : `(-∞, ${formatNumber(values.k)}]`
  const horizontalMovementLines = formatMovementLines(values.h, 'right', 'left')
  const verticalMovementLines = formatMovementLines(values.k, 'up', 'down')
  const activePreset = PRESETS.find(preset => statesMatch(values, preset.values))?.label ?? null

  const plotWidth = GRAPH_WIDTH - MARGIN.left - MARGIN.right
  const plotHeight = GRAPH_HEIGHT - MARGIN.top - MARGIN.bottom

  const mapX = (value: number) => MARGIN.left + ((value - X_MIN) / (X_MAX - X_MIN)) * plotWidth
  const mapY = (value: number) => GRAPH_HEIGHT - MARGIN.bottom - ((value - Y_MIN) / (Y_MAX - Y_MIN)) * plotHeight

  const sampleStep = (X_MAX - X_MIN) / (SAMPLE_COUNT - 1)
  const parentPoints = Array.from({ length: SAMPLE_COUNT }, (_, index) => {
    const x = X_MIN + index * sampleStep
    return { x, y: x * x }
  })
  const allTransformedPoints = Array.from({ length: SAMPLE_COUNT }, (_, index) => {
    const x = X_MIN + index * sampleStep
    return { x, y: evaluateQuadratic(x, aSigned, values.h, values.k) }
  })
  const transformedPoints = restrictDomain
    ? [{ x: values.h, y: values.k }, ...allTransformedPoints.filter(p => p.x > values.h + 0.001)]
    : allTransformedPoints

  const parentPath = makeCurvePath(parentPoints, mapX, mapY)
  const transformedPath = makeCurvePath(transformedPoints, mapX, mapY)
  const vertexX = mapX(vertex.x)
  const vertexY = mapY(vertex.y)
  const axisX = mapX(values.h)
  const xAxisY = mapY(0)
  const yAxisX = mapX(0)
  const vertexLabelX = clamp(vertexX + 12, MARGIN.left + 12, MARGIN.left + plotWidth - 128)
  const vertexLabelY = clamp(vertexY - 12, MARGIN.top + 18, MARGIN.top + plotHeight - 10)
  const handlePresetSelect = (presetValues: ExplorerValues) => {
    setValues(presetValues)
    setShowPresets(false)
  }

  return (
    <main className="page qe-page">
      <div className="container container--wide">
        <section className="panel qe-hero">
          <div className="eyebrow">Math Explorer</div>
          <div className="qe-hero__row">
            <div className="qe-hero__copy">
              <h1 className="h2 qe-hero__title">Quadratic Transformations Explorer</h1>
              <p className="lead qe-hero__lead">
                Watch the parent parabola turn into <code>g(x)</code> as you stretch, reflect, and shift it in real time.
              </p>
            </div>
          </div>
        </section>

        <div className="qe-layout">
          <aside className="qe-sidebar">
            <section className="panel qe-controls-panel">
              <div className="widget-panel__head qe-side-panel__head">
                <div className="eyebrow">Controls</div>
              </div>
              <span className={`badge ${activePreset ? 'badge--accent' : 'badge--neutral'} qe-preset-badge`}>
                {activePreset ? `Preset: ${activePreset}` : 'Custom state'}
              </span>
              <button
                type="button"
                className="btn btn--block btn--caps qe-presets-trigger"
                aria-haspopup="dialog"
                aria-expanded={showPresets}
                onClick={() => setShowPresets(true)}
              >
                Presets
              </button>

              <div className="qe-control-stack">
                <div className="qe-control-group">
                  <div className="qe-control-group__title">Vertical Stretch + Reflection</div>
                  <SliderControl
                    id="qe-a"
                    label="a"
                    value={values.stretch}
                    min={0.1}
                    max={5}
                    step={0.1}
                    hint="Larger |a| makes the parabola narrower."
                    onChange={stretch => setValues(current => ({ ...current, stretch }))}
                  />

                  <div className="field qe-control">
                    <button
                      id="qe-flip"
                      type="button"
                      className={`qe-toggle-btn${values.flip ? ' qe-toggle-btn--active' : ''}`}
                      aria-pressed={values.flip}
                      onClick={() => setValues(current => ({ ...current, flip: !current.flip }))}
                    >
                      Reflect vertically
                    </button>
                    <p className="helper-text qe-control__hint">This changes the sign of <code>a</code>.</p>
                  </div>
                </div>

                <div className="qe-control-group">
                  <div className="qe-control-group__title">Horizontal Shift</div>
                  <SliderControl
                    id="qe-h"
                    label="h"
                    value={values.h}
                    min={-5}
                    max={5}
                    step={0.1}
                    hint="Positive h shifts right; negative h shifts left."
                    onChange={h => setValues(current => ({ ...current, h }))}
                  />
                </div>

                <div className="qe-control-group">
                  <div className="qe-control-group__title">Vertical Shift</div>
                  <SliderControl
                    id="qe-k"
                    label="k"
                    value={values.k}
                    min={-5}
                    max={5}
                    step={0.1}
                    hint="Positive k moves the graph up; negative k moves it down."
                    onChange={k => setValues(current => ({ ...current, k }))}
                  />
                </div>

                <div className="qe-control-group">
                  <div className="qe-control-group__title">Invertibility</div>
                  <div className="field qe-control">
                    <button
                      type="button"
                      className={`qe-toggle-btn${restrictDomain ? ' qe-toggle-btn--active' : ''}`}
                      aria-pressed={restrictDomain}
                      onClick={() => setRestrictDomain(r => !r)}
                    >
                      Restrict domain
                    </button>
                    <p className="helper-text qe-control__hint">
                      {restrictDomain
                        ? `Domain restricted to x ≥ ${formatNumber(values.h)}. g(x) is now invertible.`
                        : 'Restrict to the right branch to make g(x) one-to-one.'}
                    </p>
                  </div>
                </div>
              </div>

              <button className="btn btn--outline btn--block" onClick={() => { setValues(DEFAULT_VALUES); setRestrictDomain(false) }}>
                Reset
              </button>
            </section>
          </aside>

          <section className="qe-center">
            <div className="qe-equation-grid">
              <EquationCard
                label="Vertex Form"
                equation={vertexEquation}
                note="Best for seeing transformations and the vertex directly."
              />
              <EquationCard
                label="Standard Form"
                equation={standardEquation}
                note="Best for using the quadratic formula."
              />
            </div>

            <section className="qe-plot-frame" data-label="Coordinate Plane">
              <div className="qe-graph-shell">
                <svg
                  viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
                  className="qe-graph"
                  role="img"
                  aria-labelledby="qe-graph-title qe-graph-desc"
                >
                  <title id="qe-graph-title">Quadratic graph</title>
                  <desc id="qe-graph-desc">
                    Parent parabola y equals x squared and transformed parabola g of x equals {vertexEquation}.
                  </desc>

                  <defs>
                    <clipPath id="qe-plot-clip">
                      <rect
                        x={MARGIN.left}
                        y={MARGIN.top}
                        width={plotWidth}
                        height={plotHeight}
                        rx="0"
                      />
                    </clipPath>
                  </defs>

                  <rect
                    x={MARGIN.left}
                    y={MARGIN.top}
                    width={plotWidth}
                    height={plotHeight}
                    rx="0"
                    className="qe-graph__backdrop"
                  />

                  {X_TICKS.map(tick => (
                    <g key={`x-${tick}`}>
                      <line
                        x1={mapX(tick)}
                        y1={MARGIN.top}
                        x2={mapX(tick)}
                        y2={MARGIN.top + plotHeight}
                        className="qe-graph__grid"
                      />
                      <text x={mapX(tick)} y={GRAPH_HEIGHT - 16} textAnchor="middle" className="qe-graph__tick">
                        {tick}
                      </text>
                    </g>
                  ))}

                  {Y_TICKS.map(tick => (
                    <g key={`y-${tick}`}>
                      <line
                        x1={MARGIN.left}
                        y1={mapY(tick)}
                        x2={MARGIN.left + plotWidth}
                        y2={mapY(tick)}
                        className="qe-graph__grid"
                      />
                      <text x={MARGIN.left - 12} y={mapY(tick) + 4} textAnchor="end" className="qe-graph__tick">
                        {tick}
                      </text>
                    </g>
                  ))}

                  <line
                    x1={MARGIN.left}
                    y1={xAxisY}
                    x2={MARGIN.left + plotWidth}
                    y2={xAxisY}
                    className="qe-graph__axis"
                  />
                  <line
                    x1={yAxisX}
                    y1={MARGIN.top}
                    x2={yAxisX}
                    y2={MARGIN.top + plotHeight}
                    className="qe-graph__axis"
                  />

                  <g clipPath="url(#qe-plot-clip)">
                    <path d={parentPath} className="qe-graph__curve qe-graph__curve--parent" />
                    <path d={transformedPath} className="qe-graph__curve qe-graph__curve--transformed" />
                    <line
                      x1={axisX}
                      y1={MARGIN.top}
                      x2={axisX}
                      y2={MARGIN.top + plotHeight}
                      className="qe-graph__axis-of-symmetry"
                    />
                  </g>

                  <circle cx={vertexX} cy={vertexY} r="6.5" className="qe-graph__vertex" />
                  <text x={vertexLabelX} y={vertexLabelY} className="qe-graph__vertex-note">
                    Vertex ({formatNumber(vertex.x)}, {formatNumber(vertex.y)})
                  </text>

                  <text x={MARGIN.left + plotWidth - 10} y={xAxisY - 8} textAnchor="end" className="qe-graph__axis-label">
                    x
                  </text>
                  <text x={yAxisX + 10} y={MARGIN.top + 16} className="qe-graph__axis-label">
                    y
                  </text>
                </svg>
              </div>

              <div className="legend-key qe-legend qe-legend--below">
                <div className="legend-key__item">
                  <span className="qe-legend__line qe-legend__line--parent" />
                  Parent
                </div>
                <div className="legend-key__item">
                  <span className="qe-legend__line qe-legend__line--transformed" />
                  Transformed
                </div>
                <div className="legend-key__item">
                  <span className="qe-legend__line qe-legend__line--axis" />
                  Axis of symmetry
                </div>
              </div>
            </section>

            <section className="panel qe-key-points-panel">
              <div className="widget-panel__head qe-side-panel__head">
                <div className="eyebrow">Key Points</div>
              </div>
              <div className="metrics-grid qe-key-points-grid">
                <div className="metric">
                  <span className="metric__label">Vertex</span>
                  <span className="metric__value qe-metric-value">({formatNumber(vertex.x)}, {formatNumber(vertex.y)})</span>
                </div>
                <div className="metric">
                  <span className="metric__label">x-intercepts</span>
                  <span className="metric__value qe-metric-value">{xInterceptsLabel}</span>
                </div>
                <div className="metric">
                  <span className="metric__label">y-intercept</span>
                  <span className="metric__value qe-metric-value">{yInterceptLabel}</span>
                </div>
              </div>
            </section>
          </section>

          <aside className="qe-insights">
            <section className="panel">
              <div className="widget-panel__head qe-side-panel__head">
                <div className="eyebrow">Key Features</div>
              </div>
              <div className="metrics-grid qe-snapshot-grid">
                <div className="metric">
                  <span className="metric__label">Domain</span>
                  <span className="metric__value qe-metric-value">{domainLabel}</span>
                </div>
                <div className="metric">
                  <span className="metric__label">Range</span>
                  <span className="metric__value qe-metric-value">{rangeLabel}</span>
                </div>
                <div className="metric">
                  <span className="metric__label">Parent</span>
                  <span className="metric__value qe-metric-value">{parentEquation}</span>
                </div>
                <div className="metric">
                  <span className="metric__label">Axis</span>
                  <span className="metric__value">x = {formatNumber(values.h)}</span>
                </div>
                <div className="metric qe-metric--span-2">
                  <span className="metric__label">Geometric Notation</span>
                  <span className="metric__value qe-metric-value">{geometricNotation}</span>
                </div>
                <div className="metric qe-metric--span-2">
                  <span className="metric__label">Absolute Min/Max</span>
                  <span className="metric__value qe-metric-value">{absoluteExtremumLabel}</span>
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="widget-panel__head qe-side-panel__head">
                <div className="eyebrow">Transformations</div>
              </div>
              <div className="metrics-grid">
                <div className="metric">
                  <span className="metric__label">Opens</span>
                  <span className="metric__value">{opensLabel}</span>
                </div>
                <div className="metric">
                  <span className="metric__label">Width</span>
                  <span className="metric__value">{widthLabel}</span>
                </div>
                <div className="metric">
                  <span className="metric__label">Horizontal<br />Movement</span>
                  <span className="metric__value qe-metric-value qe-metric-value--stacked">
                    <span>{horizontalMovementLines.firstLine}</span>
                    <span>{horizontalMovementLines.secondLine}</span>
                  </span>
                </div>
                <div className="metric">
                  <span className="metric__label">Vertical<br />Movement</span>
                  <span className="metric__value qe-metric-value qe-metric-value--stacked">
                    <span>{verticalMovementLines.firstLine}</span>
                    <span>{verticalMovementLines.secondLine}</span>
                  </span>
                </div>
              </div>
            </section>
          </aside>
        </div>

        {showPresets && (
          <div className="popup-overlay" role="presentation" onClick={() => setShowPresets(false)}>
            <section
              className="panel popup"
              role="dialog"
              aria-modal="true"
              aria-labelledby="qe-presets-title"
              onClick={event => event.stopPropagation()}
            >
              <div className="popup__header">
                <div className="eyebrow" id="qe-presets-title">Presets</div>
                <button
                  type="button"
                  className="btn btn--outline btn--sm popup__close"
                  onClick={() => setShowPresets(false)}
                >
                  Close
                </button>
              </div>

              <div className="qe-preset-grid qe-preset-grid--wide qe-preset-grid--modal">
                {PRESETS.map(preset => {
                  const isActive = statesMatch(values, preset.values)

                  return (
                    <button
                      key={preset.label}
                      className={`qe-preset${isActive ? ' qe-preset--active' : ''}`}
                      onClick={() => handlePresetSelect(preset.values)}
                    >
                      <span className="qe-preset__label">{preset.label}</span>
                      <span className="qe-preset__hint">{preset.hint}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
