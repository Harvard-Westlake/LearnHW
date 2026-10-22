import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ControlSection,
  CoordinatePlane,
  EquationStrip,
  Legend,
  ParamControl,
  PlotFrame,
  PresetBadge,
  PresetsModal,
  ReflectToggle,
  TabbedPanel,
  ToggleButton,
  ViewControls,
  type Preset,
} from '../../../components/explorer'
import { Tex } from '../../../components/tex'
import { formatMovementLines, formatNumber } from '../../../utils/format'
import { curvePath, inPlane, labelPosition, panView, sameView, samplePoints, viewPlane, zoomView, type Point, type View, type ZoomAxis } from '../../../utils/plane'
import {
  axisOfSymmetry,
  domainTex,
  endBehavior,
  evaluate,
  generalTokens,
  limitTex,
  mappingTex,
  opensUpward,
  parentTex,
  pointTex,
  range,
  rangeTex,
  standardFormExact,
  standardFormTex,
  substitutedTokens,
  vertex,
  vertexFormTex,
  xIntercepts,
  yIntercept,
  type DomainRestriction,
  type QuadraticParams,
  type TermWrap,
} from './math'
import { Glyph, RestrictIcon } from './glyphs'

/**
 * Quadratic Transformations Explorer
 *   parent      f(x) = x²
 *   transformed g(x) = a(x − h)² + k
 * Math lives in ./math.ts; this file is layout + state.
 */

type ExplorerValues = {
  stretch: number
  flip: boolean
  h: number
  k: number
  /** Keep only one branch (x ≥ h or x ≤ h) so g is one-to-one (for the inverse-functions lesson). */
  domain: DomainRestriction
}

const DEFAULT_VALUES: ExplorerValues = {
  stretch: 1,
  flip: false,
  h: 0,
  k: 0,
  domain: 'none',
}

const PRESETS: Preset<ExplorerValues>[] = [
  { label: 'Parent', hint: 'Reset to f(x) = x²', values: { ...DEFAULT_VALUES } },
  { label: 'Narrower', hint: 'Strong vertical stretch', values: { ...DEFAULT_VALUES, stretch: 2.5 } },
  { label: 'Wider Down', hint: 'Reflect and compress', values: { ...DEFAULT_VALUES, stretch: 0.5, flip: true } },
  { label: 'Right and Up', hint: 'Shift the vertex to (2, 3)', values: { ...DEFAULT_VALUES, h: 2, k: 3 } },
  { label: 'Left and Down', hint: 'Move the vertex to (−2.5, −2)', values: { ...DEFAULT_VALUES, stretch: 1.5, h: -2.5, k: -2 } },
  { label: 'Touching Axis', hint: 'Vertex sits on the x-axis', values: { ...DEFAULT_VALUES, h: -3 } },
  { label: 'One-to-One', hint: 'Keep only x ≥ 1 so g has an inverse', values: { ...DEFAULT_VALUES, h: 1, k: -3, domain: 'right' } },
]

const PLANE_BASE = { width: 760, height: 520, margin: { top: 24, right: 28, bottom: 46, left: 52 } }
const DEFAULT_VIEW: View = { xMin: -6, xMax: 6, yMin: -8, yMax: 12 }

function toParams(values: ExplorerValues): QuadraticParams {
  return {
    a: values.flip ? -values.stretch : values.stretch,
    h: values.h,
    k: values.k,
  }
}

function statesMatch(a: ExplorerValues, b: ExplorerValues) {
  return (
    Math.abs(a.stretch - b.stretch) < 0.001 &&
    a.flip === b.flip &&
    Math.abs(a.h - b.h) < 0.001 &&
    Math.abs(a.k - b.k) < 0.001 &&
    a.domain === b.domain
  )
}

/**
 * Wraps a parameter's value in a chip colored like its control row. The outer
 * braces matter: KaTeX gives a bare \htmlClass no operator spacing on its
 * left.
 */
const chip: TermWrap = (term, tex) => `{\\htmlClass{xp-term xp-term--${term}}{${tex}}}`

function scaleLabel(factor: number, moreWord: string, lessWord: string) {
  if (Math.abs(factor - 1) < 0.001) return 'None'
  return factor > 1 ? `Stretch ×${formatNumber(factor, 2)} (${moreWord})` : `Compress ×${formatNumber(factor, 2)} (${lessWord})`
}

/* ---- Tabbed info panel building blocks ---- */
function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="xp-info-section">
      <div className="xp-info-section__title">{title}</div>
      <div className="xp-info">{children}</div>
    </section>
  )
}

function InfoRow({ label, children, stacked = false }: { label: ReactNode; children: ReactNode; stacked?: boolean }) {
  return (
    <div className={`xp-info-row${stacked ? ' xp-info-row--stacked' : ''}`}>
      <span className="xp-info-row__label">{label}</span>
      <span className="xp-info-row__value">{children}</span>
    </div>
  )
}

export default function QuadraticExplorer() {
  const [values, setValues] = useState<ExplorerValues>(DEFAULT_VALUES)
  const [showPresets, setShowPresets] = useState(false)
  const closePresets = useCallback(() => setShowPresets(false), [])
  const [view, setView] = useState<View>(DEFAULT_VIEW)
  const PLANE = useMemo(() => viewPlane(PLANE_BASE, view), [view])
  const pan = useCallback((dx: number, dy: number) => setView(v => panView(v, dx, dy)), [])
  const [zoomAxis, setZoomAxis] = useState<ZoomAxis>('both')
  const zoom = useCallback((factor: number, anchor: Point, axis: ZoomAxis) => setView(v => zoomView(v, factor, anchor, axis)), [])
  const resetView = useCallback(() => setView(DEFAULT_VIEW), [])
  const viewMoved = !sameView(view, DEFAULT_VIEW)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Quadratic Transformations Explorer · Class Resources'
    return () => {
      document.title = previousTitle
    }
  }, [])

  const params = toParams(values)
  const { h, k } = params
  const restriction = values.domain
  const restricted = restriction !== 'none'
  const upward = opensUpward(params)
  const V = vertex(params)
  const axis = axisOfSymmetry(params)
  const yInt = yIntercept(params, restriction)
  const xInts = xIntercepts(params, restriction)
  const limits = endBehavior(params, restriction)
  const horizontalMovement = formatMovementLines(h, 'right', 'left')
  const verticalMovement = formatMovementLines(k, 'up', 'down')

  // Plot geometry. With the domain restricted, keep the samples on that side
  // of h and include the vertex itself so the branch starts exactly there,
  // not one sample step past it.
  const parentPath = curvePath(samplePoints(PLANE, x => x * x), PLANE)
  const transformedSamples = samplePoints(PLANE, x => evaluate(x, params))
  const transformedPath = curvePath(
    restriction === 'right'
      ? [V, ...transformedSamples.filter(p => p.x > h)]
      : restriction === 'left'
        ? [...transformedSamples.filter(p => p.x < h), V]
        : transformedSamples,
    PLANE,
  )
  const axisVisible = axis >= PLANE.xMin && axis <= PLANE.xMax
  const vertexVisible = inPlane(PLANE, V)
  const vertexLabelPos = labelPosition(PLANE, V, 120)

  const activePreset = PRESETS.find(preset => statesMatch(values, preset.values))?.label ?? null
  const update = (patch: Partial<ExplorerValues>) => setValues(current => ({ ...current, ...patch }))

  const xInterceptsTex =
    xInts.kind === 'none' ? ['\\text{none}'] : xInts.kind === 'one' ? [pointTex(xInts.point)] : xInts.points.map(p => pointTex(p))
  const yInterceptTex = yInt === null ? '\\text{none (0 is not in the domain)}' : pointTex(yInt)
  const standardRelation = standardFormExact(params) ? '=' : '\\approx'

  return (
    <main className="page xp-page">
      <div className="container container--wide">
        <section className="panel xp-hero">
          <div className="eyebrow">Math Explorer</div>
          <div className="xp-hero__row">
            <div className="xp-hero__copy">
              <h1 className="h2 xp-hero__title">Quadratic Transformations Explorer</h1>
              <p className="lead xp-hero__lead">
                Stretch, reflect, and shift <Tex tex="x^{2}" /> and watch the vertex, the intercepts, and both forms of the equation move together.
              </p>
            </div>
          </div>
        </section>

        <div className="xp-layout">
          <aside className="xp-sidebar">
            <section className="panel xp-controls-panel">
              {/* Same tab markup as the info panel so the three panel titles match. */}
              <div className="tabs xp-tabs xp-side-panel__head">
                <span className="tab active">Controls</span>
                <PresetBadge activeLabel={activePreset} />
              </div>

              <EquationStrip rows={[generalTokens(chip), substitutedTokens(params, chip)]} />

              <ControlSection title="Shape">
                <ParamControl
                  id="qe-a"
                  term="a"
                  label="Vertical stretch"
                  value={values.stretch}
                  min={0.1}
                  max={5}
                  step={0.1}
                  typedMin={0.1}
                  defaultValue={DEFAULT_VALUES.stretch}
                  glyph={<Glyph kind="vertical" />}
                  hint="Larger a makes the parabola narrower; a < 1 makes it wider."
                  onChange={stretch => update({ stretch })}
                />
                <div className="xp-reflect-row" role="group" aria-label="Reflect across">
                  <span className="xp-reflect-row__label">Reflect</span>
                  <ReflectToggle id="qe-flip" axis="x" pressed={values.flip} onToggle={() => update({ flip: !values.flip })} />
                </div>
              </ControlSection>

              <ControlSection title="Position">
                <ParamControl
                  id="qe-h"
                  term="h"
                  label="Shift right / left"
                  value={h}
                  min={-5}
                  max={5}
                  step={0.1}
                  defaultValue={DEFAULT_VALUES.h}
                  glyph={<Glyph kind="shift-h" />}
                  hint="Moves the vertex and the axis of symmetry to x = h."
                  onChange={h => update({ h })}
                />
                <ParamControl
                  id="qe-k"
                  term="k"
                  label="Shift up / down"
                  value={k}
                  min={-5}
                  max={5}
                  step={0.1}
                  defaultValue={DEFAULT_VALUES.k}
                  glyph={<Glyph kind="shift-k" />}
                  hint="Moves the vertex to y = k."
                  onChange={k => update({ k })}
                />
              </ControlSection>

              <ControlSection title="Domain">
                <div className="xp-reflect-row" role="group" aria-label="Restrict the domain to one branch">
                  <span className="xp-reflect-row__label">Restrict</span>
                  <ToggleButton id="qe-restrict-left" pressed={restriction === 'left'} icon={<RestrictIcon side="left" />} onToggle={() => update({ domain: restriction === 'left' ? 'none' : 'left' })}>
                    x ≤ h
                  </ToggleButton>
                  <ToggleButton id="qe-restrict-right" pressed={restriction === 'right'} icon={<RestrictIcon side="right" />} onToggle={() => update({ domain: restriction === 'right' ? 'none' : 'right' })}>
                    x ≥ h
                  </ToggleButton>
                </div>
              </ControlSection>

              <div className="xp-controls-panel__actions">
                <button
                  type="button"
                  className="btn btn--caps xp-presets-trigger"
                  aria-haspopup="dialog"
                  aria-expanded={showPresets}
                  onClick={() => setShowPresets(true)}
                >
                  Presets
                </button>
                <button type="button" className="btn btn--outline" onClick={() => setValues(DEFAULT_VALUES)}>
                  Reset
                </button>
              </div>
            </section>
          </aside>

          <section className="xp-center">
            <PlotFrame label="Coordinate Plane">
              <CoordinatePlane
                plane={PLANE}
                id="qe-graph"
                title="Quadratic graph"
                desc={`Parent parabola y equals x squared and transformed parabola g of x with vertex at (${formatNumber(V.x)}, ${formatNumber(V.y)})${restriction === 'right' ? ', right branch only' : restriction === 'left' ? ', left branch only' : ''}. Drag to move the window, scroll to zoom, double-click to reset.`}
                onPan={pan}
                onZoom={zoom}
                zoomAxis={zoomAxis}
                onResetView={resetView}
                overlay={
                  vertexVisible && (
                    <>
                      <circle cx={PLANE.mapX(V.x)} cy={PLANE.mapY(V.y)} r="6.5" className="xp-graph__point xp-graph__point--transformed" />
                      <text x={vertexLabelPos.x} y={vertexLabelPos.y} className="xp-graph__point-note">
                        Vertex ({formatNumber(V.x)}, {formatNumber(V.y)})
                      </text>
                    </>
                  )
                }
              >
                {axisVisible && (
                  <line
                    x1={PLANE.mapX(axis)}
                    y1={PLANE.margin.top}
                    x2={PLANE.mapX(axis)}
                    y2={PLANE.margin.top + PLANE.plotHeight}
                    className="xp-graph__guide"
                  />
                )}
                <path d={parentPath} className="xp-graph__curve xp-graph__curve--parent" />
                <path d={transformedPath} className="xp-graph__curve xp-graph__curve--transformed" />
              </CoordinatePlane>

              <div className="xp-plot-foot">
                <Legend
                  items={[
                    { kind: 'parent', label: 'Parent' },
                    { kind: 'transformed', label: restriction === 'right' ? 'Transformed (x ≥ h)' : restriction === 'left' ? 'Transformed (x ≤ h)' : 'Transformed' },
                    { kind: 'guide', label: <>Axis of symmetry <Tex tex={`x = ${formatNumber(axis)}`} /></> },
                    { kind: 'point-transformed', label: 'Vertex' },
                  ]}
                />
                <ViewControls axis={zoomAxis} onAxisChange={setZoomAxis} canReset={viewMoved} onReset={resetView} />
              </div>
            </PlotFrame>
          </section>

          <aside className="xp-insights">
            <section className="panel xp-insights-panel">
              <TabbedPanel
                id="qe-info"
                tabs={[
                  {
                    id: 'info',
                    label: 'Key Information',
                    content: (
                      <>
                        <InfoSection title="Equations">
                          <InfoRow label="Parent"><Tex tex={`f(x) = ${parentTex()}`} /></InfoRow>
                          <InfoRow label="Vertex form"><Tex tex={`g(x) = ${vertexFormTex(params)}`} /></InfoRow>
                          <InfoRow label="Standard form"><Tex tex={`g(x) ${standardRelation} ${standardFormTex(params)}`} /></InfoRow>
                        </InfoSection>
                        <InfoSection title="Points">
                          <InfoRow label="Vertex"><Tex tex={`(0,\\ 0) \\to ${pointTex(V)}`} /></InfoRow>
                          <InfoRow label={xInts.kind === 'two' ? 'x-intercepts' : 'x-intercept'} stacked={xInts.kind === 'two'}>
                            {xInterceptsTex.map((tex, i) => <Tex key={i} tex={tex} />)}
                          </InfoRow>
                          <InfoRow label="y-intercept"><Tex tex={yInterceptTex} /></InfoRow>
                        </InfoSection>
                        <InfoSection title="Features">
                          <InfoRow label="Domain"><Tex tex={domainTex(params, restriction)} /></InfoRow>
                          <InfoRow label="Range"><Tex tex={rangeTex(range(params))} /></InfoRow>
                          <InfoRow label="Axis of symmetry"><Tex tex={`x = ${formatNumber(axis)}`} /></InfoRow>
                          <InfoRow label="Opens">{upward ? 'Upward — the vertex is the minimum' : 'Downward — the vertex is the maximum'}</InfoRow>
                          <InfoRow label="End behavior" stacked>
                            {limits.left !== null && <Tex tex={`\\text{As } x \\to -\\infty,\\ g(x) \\to ${limitTex(limits.left)}`} />}
                            {limits.right !== null && <Tex tex={`\\text{As } x \\to \\infty,\\ g(x) \\to ${limitTex(limits.right)}`} />}
                          </InfoRow>
                        </InfoSection>
                        {restricted && (
                          <p className="helper-text xp-insights__note">
                            Restricted to <Tex tex={`x ${restriction === 'right' ? '\\geq' : '\\leq'} ${formatNumber(h)}`} />, each output comes from exactly one input, so{' '}
                            <Tex tex="g" /> passes the horizontal line test and has an inverse.
                          </p>
                        )}
                      </>
                    ),
                  },
                  {
                    id: 'transformations',
                    label: 'Transformations',
                    content: (
                      <>
                        <InfoSection title="Mapping">
                          <InfoRow label="Each point" stacked>
                            <Tex tex={mappingTex(params)} />
                          </InfoRow>
                        </InfoSection>
                        <InfoSection title="Steps">
                          <InfoRow label="Vertical">{scaleLabel(values.stretch, 'narrower', 'wider')}</InfoRow>
                          <InfoRow label="Reflect (x-axis)">{values.flip ? 'Yes — now opens downward' : 'No'}</InfoRow>
                          <InfoRow label="Shift right/left">{horizontalMovement.firstLine === 'No' ? 'None' : `${horizontalMovement.firstLine} ${horizontalMovement.secondLine}`}</InfoRow>
                          <InfoRow label="Shift up/down">{verticalMovement.firstLine === 'No' ? 'None' : `${verticalMovement.firstLine} ${verticalMovement.secondLine}`}</InfoRow>
                        </InfoSection>
                        <p className="helper-text xp-insights__note">
                          There is no horizontal-stretch slider because a parabola cannot tell the difference:{' '}
                          <Tex tex="(px)^{2} = p^{2}x^{2}" />, so stretching sideways by <Tex tex="p" /> is the same as stretching vertically by <Tex tex="p^{2}" />.
                        </p>
                      </>
                    ),
                  },
                ]}
              />
            </section>
          </aside>
        </div>

        {showPresets && (
          <PresetsModal
            titleId="qe-presets-title"
            presets={PRESETS}
            isActive={preset => statesMatch(values, preset.values)}
            onSelect={presetValues => {
              setValues(presetValues)
              setShowPresets(false)
            }}
            onClose={closePresets}
          />
        )}
      </div>
    </main>
  )
}
