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
  ViewControls,
  type Preset,
} from '../../../components/explorer'
import { Tex } from '../../../components/tex'
import { formatMovementLines, formatNumber } from '../../../utils/format'
import { curvePath, inPlane, labelPosition, panView, sameView, viewPlane, zoomView, type Plane, type Point, type View, type ZoomAxis } from '../../../utils/plane'
import {
  asymptote,
  behavior,
  domain,
  domainTex,
  endBehavior,
  equivalentShift,
  evaluate,
  generalTokens,
  isUndefinedBase,
  keyPoint,
  limitTex,
  mappingTex,
  parentTex,
  pointTex,
  secondPoint,
  substitutedTokens,
  transformedTex,
  xIntercept,
  yIntercept,
  type LogParams,
  type TermWrap,
} from './math'
import { Glyph } from './glyphs'

/**
 * Logarithmic Transformations Explorer
 *   parent      f(x) = log_b x
 *   transformed g(x) = a · log_b(p(x − h)) + k
 * Math lives in ./math.ts; this file is layout + state.
 */

type ExplorerValues = {
  base: number
  stretch: number
  flipV: boolean
  hStretch: number
  flipH: boolean
  h: number
  k: number
}

const DEFAULT_VALUES: ExplorerValues = {
  base: 2,
  stretch: 1,
  flipV: false,
  hStretch: 1,
  flipH: false,
  h: 0,
  k: 0,
}

const PRESETS: Preset<ExplorerValues>[] = [
  { label: 'Parent', hint: 'Reset to f(x) = log₂ x', values: { ...DEFAULT_VALUES } },
  { label: 'Base 10', hint: 'Common log: (10, 1) replaces (2, 1)', values: { ...DEFAULT_VALUES, base: 10 } },
  { label: 'Base ½', hint: 'A base between 0 and 1 makes the log decrease', values: { ...DEFAULT_VALUES, base: 0.5 } },
  { label: 'Reflected', hint: 'Flip across the x-axis (a < 0)', values: { ...DEFAULT_VALUES, flipV: true } },
  { label: 'Mirror', hint: 'Flip across the y-axis: the domain becomes x < h', values: { ...DEFAULT_VALUES, flipH: true } },
  { label: 'Shifted Right', hint: 'Asymptote moves to x = 2 with the domain', values: { ...DEFAULT_VALUES, h: 2 } },
  { label: 'Shifted Up', hint: 'Every point rises 3; the asymptote stays put', values: { ...DEFAULT_VALUES, k: 3 } },
  { label: 'Compressed', hint: 'p = 2: the same as shifting log₂ x up one unit', values: { ...DEFAULT_VALUES, hStretch: 2 } },
  { label: 'Crosses the y-axis', hint: 'h = −3 puts 0 inside the domain, so a y-intercept appears', values: { ...DEFAULT_VALUES, h: -3 } },
]

const PLANE_BASE = { width: 760, height: 520, margin: { top: 24, right: 28, bottom: 46, left: 52 } }
const DEFAULT_VIEW: View = { xMin: -8, xMax: 8, yMin: -6, yMax: 6 }

function toParams(values: ExplorerValues): LogParams {
  return {
    a: values.flipV ? -values.stretch : values.stretch,
    b: values.base,
    p: values.flipH ? -values.hStretch : values.hStretch,
    h: values.h,
    k: values.k,
  }
}

function statesMatch(a: ExplorerValues, b: ExplorerValues) {
  return (
    Math.abs(a.base - b.base) < 0.001 &&
    Math.abs(a.stretch - b.stretch) < 0.001 &&
    a.flipV === b.flipV &&
    Math.abs(a.hStretch - b.hStretch) < 0.001 &&
    a.flipH === b.flipH &&
    Math.abs(a.h - b.h) < 0.001 &&
    Math.abs(a.k - b.k) < 0.001
  )
}

/**
 * Samples a log-shaped curve from its vertical asymptote at `from` out to the
 * far edge of the visible window on the `direction` side. Spacing follows t²
 * so the samples crowd the asymptote, where the curve is nearly vertical;
 * curvePath drops the non-finite sample at the asymptote itself and clamps the
 * runaway values next to it.
 */
function sampleFromAsymptote(plane: Plane, from: number, direction: 1 | -1, fn: (x: number) => number, count = 321): Point[] {
  const edge = direction > 0 ? plane.xMax : plane.xMin
  // When the asymptote is far outside the window, start just outside it so
  // the samples are spent on the visible part.
  const start = direction > 0 ? Math.max(from, plane.xMin - 1) : Math.min(from, plane.xMax + 1)
  if ((edge - start) * direction <= 0) return []
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1)
    const x = start + (edge - start) * t * t
    return { x, y: fn(x) }
  })
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

const UNDEFINED = '\\text{undefined}'

export default function LogarithmicExplorer() {
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
    document.title = 'Logarithmic Transformations Explorer · Class Resources'
    return () => {
      document.title = previousTitle
    }
  }, [])

  const params = toParams(values)
  const { b, p, h, k } = params
  const undefinedBase = isUndefinedBase(b)
  const kind = behavior(params)
  const P = keyPoint(params)
  const Q = secondPoint(params)
  const yInt = yIntercept(params)
  const xInt = xIntercept(params)
  const asym = asymptote(params)
  const limits = endBehavior(params)
  const shift = equivalentShift(params)
  const horizontalMovement = formatMovementLines(h, 'right', 'left')
  const verticalMovement = formatMovementLines(k, 'up', 'down')

  // Plot geometry. Each curve is sampled only inside its domain, densely
  // next to its asymptote.
  const parentPath = undefinedBase ? '' : curvePath(sampleFromAsymptote(PLANE, 0, 1, x => Math.log(x) / Math.log(b)), PLANE)
  const transformedPath = undefinedBase ? '' : curvePath(sampleFromAsymptote(PLANE, h, p > 0 ? 1 : -1, x => evaluate(x, params)), PLANE)
  const asymptoteVisible = asym !== null && asym >= PLANE.xMin && asym <= PLANE.xMax
  const parentQ = { x: b, y: 1 }
  const keyPointVisible = !undefinedBase && inPlane(PLANE, P)
  const secondPointVisible = !undefinedBase && inPlane(PLANE, Q)
  const keyPointLabelPos = labelPosition(PLANE, P, 110)
  const secondPointLabelPos = labelPosition(PLANE, Q, 110)
  const parentLabelPos = labelPosition(PLANE, { x: 1, y: 0 }, 60)

  const activePreset = PRESETS.find(preset => statesMatch(values, preset.values))?.label ?? null
  const update = (patch: Partial<ExplorerValues>) => setValues(current => ({ ...current, ...patch }))

  const behaviorLabel = kind === 'increasing' ? 'Increasing' : kind === 'decreasing' ? 'Decreasing' : 'Undefined (b = 1)'
  const asymptoteTex = asym === null ? UNDEFINED : `x = ${formatNumber(asym)}`
  const transformedEquationTex = undefinedBase ? UNDEFINED : transformedTex(params)
  const limitsTex = limits && {
    near: `\\text{As } x \\to ${formatNumber(h)}^{${limits.side}},\\ g(x) \\to ${limitTex(limits.nearAsymptote)}`,
    far: `\\text{As } x \\to ${limits.farSide === '-' ? '-' : ''}\\infty,\\ g(x) \\to ${limitTex(limits.far)}`,
  }

  return (
    <main className="page xp-page">
      <div className="container container--wide">
        <section className="panel xp-hero">
          <div className="eyebrow">Math Explorer</div>
          <div className="xp-hero__row">
            <div className="xp-hero__copy">
              <h1 className="h2 xp-hero__title">Logarithmic Transformations Explorer</h1>
              <p className="lead xp-hero__lead">
                Change the base, stretch, reflect, and shift <Tex tex="\log_{b} x" /> and track where the vertical asymptote, the domain, and the key points (1, 0) and (b, 1) go.
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

              <EquationStrip rows={[generalTokens(chip), substitutedTokens(params, chip)]} dense />

              <ControlSection title="Shape">
                <ParamControl
                  id="le-b"
                  term="b"
                  label="Base"
                  value={b}
                  min={0.5}
                  max={5}
                  step={0.1}
                  typedMin={0.1}
                  defaultValue={DEFAULT_VALUES.base}
                  glyph={<Glyph kind="base" />}
                  hint={undefinedBase
                    ? 'b = 1 is not allowed: 1ʸ = 1 for every y, so log₁ x has no value.'
                    : b > 1 ? 'b > 1: the parent increases.' : '0 < b < 1: the parent decreases.'}
                  onChange={base => update({ base })}
                />
                <ParamControl
                  id="le-a"
                  term="a"
                  label="Vertical stretch"
                  value={values.stretch}
                  min={0.1}
                  max={5}
                  step={0.1}
                  typedMin={0.1}
                  defaultValue={DEFAULT_VALUES.stretch}
                  glyph={<Glyph kind="vertical" />}
                  hint="Multiplies every output; (b, 1) rises to y = a + k."
                  onChange={stretch => update({ stretch })}
                />
                <ParamControl
                  id="le-p"
                  term="p"
                  label="Horizontal stretch"
                  value={values.hStretch}
                  min={0.1}
                  max={5}
                  step={0.1}
                  typedMin={0.1}
                  defaultValue={DEFAULT_VALUES.hStretch}
                  glyph={<Glyph kind="horizontal" />}
                  hint="p > 1 compresses toward the asymptote; p < 1 stretches away from it."
                  onChange={hStretch => update({ hStretch })}
                />
                <div className="xp-reflect-row" role="group" aria-label="Reflect across">
                  <span className="xp-reflect-row__label">Reflect</span>
                  <ReflectToggle id="le-flip-v" axis="x" pressed={values.flipV} onToggle={() => update({ flipV: !values.flipV })} />
                  <ReflectToggle id="le-flip-h" axis="y" pressed={values.flipH} onToggle={() => update({ flipH: !values.flipH })} />
                </div>
              </ControlSection>

              <ControlSection title="Position">
                <ParamControl
                  id="le-h"
                  term="h"
                  label="Shift right / left"
                  value={h}
                  min={-5}
                  max={5}
                  step={0.1}
                  defaultValue={DEFAULT_VALUES.h}
                  glyph={<Glyph kind="shift-h" />}
                  hint="Moves the graph and its asymptote to x = h."
                  onChange={h => update({ h })}
                />
                <ParamControl
                  id="le-k"
                  term="k"
                  label="Shift up / down"
                  value={k}
                  min={-5}
                  max={5}
                  step={0.1}
                  defaultValue={DEFAULT_VALUES.k}
                  glyph={<Glyph kind="shift-k" />}
                  hint="Moves the graph k units up (negative: down)."
                  onChange={k => update({ k })}
                />
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
                id="le-graph"
                title="Logarithmic graph"
                desc={undefinedBase
                  ? 'Base 1 is undefined, so there is no curve to draw.'
                  : `Parent curve y equals log base ${formatNumber(b)} of x and transformed curve g of x with vertical asymptote at x equals ${formatNumber(h)}. Drag to move the window, scroll to zoom, double-click to reset.`}
                onPan={pan}
                onZoom={zoom}
                zoomAxis={zoomAxis}
                onResetView={resetView}
                overlay={
                  !undefinedBase && (
                    <>
                      {inPlane(PLANE, parentQ) && (
                        <circle cx={PLANE.mapX(parentQ.x)} cy={PLANE.mapY(parentQ.y)} r="4.5" className="xp-graph__point xp-graph__point--parent" />
                      )}
                      {inPlane(PLANE, { x: 1, y: 0 }) && (
                        <>
                          <circle cx={PLANE.mapX(1)} cy={PLANE.mapY(0)} r="5.5" className="xp-graph__point xp-graph__point--parent" />
                          <text x={parentLabelPos.x} y={parentLabelPos.y} className="xp-graph__point-note xp-graph__point-note--parent">
                            (1, 0)
                          </text>
                        </>
                      )}
                      {secondPointVisible && (
                        <>
                          <circle cx={PLANE.mapX(Q.x)} cy={PLANE.mapY(Q.y)} r="5.5" className="xp-graph__point xp-graph__point--transformed" />
                          <text x={secondPointLabelPos.x} y={secondPointLabelPos.y} className="xp-graph__point-note">
                            Q′ ({formatNumber(Q.x)}, {formatNumber(Q.y)})
                          </text>
                        </>
                      )}
                      {keyPointVisible && (
                        <>
                          <circle cx={PLANE.mapX(P.x)} cy={PLANE.mapY(P.y)} r="6.5" className="xp-graph__point xp-graph__point--transformed" />
                          <text x={keyPointLabelPos.x} y={keyPointLabelPos.y} className="xp-graph__point-note">
                            P′ ({formatNumber(P.x)}, {formatNumber(P.y)})
                          </text>
                        </>
                      )}
                    </>
                  )
                }
              >
                {asymptoteVisible && (
                  <line
                    x1={PLANE.mapX(asym)}
                    y1={PLANE.margin.top}
                    x2={PLANE.mapX(asym)}
                    y2={PLANE.margin.top + PLANE.plotHeight}
                    className="xp-graph__guide"
                  />
                )}
                {!undefinedBase && (
                  <>
                    <path d={parentPath} className="xp-graph__curve xp-graph__curve--parent" />
                    <path d={transformedPath} className="xp-graph__curve xp-graph__curve--transformed" />
                  </>
                )}
                {undefinedBase && (
                  <text x={PLANE.margin.left + PLANE.plotWidth / 2} y={PLANE.margin.top + PLANE.plotHeight * 0.4} textAnchor="middle" className="xp-graph__point-note">
                    log base 1 is undefined — move b away from 1
                  </text>
                )}
              </CoordinatePlane>

              <div className="xp-plot-foot">
                <Legend
                  items={[
                    { kind: 'parent', label: 'Parent' },
                    { kind: 'transformed', label: 'Transformed' },
                    { kind: 'guide', label: asym === null ? 'Asymptote: none' : <>Asymptote <Tex tex={asymptoteTex} /></> },
                    { kind: 'point-transformed', label: 'Key points P′, Q′' },
                  ]}
                />
                <ViewControls axis={zoomAxis} onAxisChange={setZoomAxis} canReset={viewMoved} onReset={resetView} />
              </div>
            </PlotFrame>
          </section>

          <aside className="xp-insights">
            <section className="panel xp-insights-panel">
              <TabbedPanel
                id="le-info"
                tabs={[
                  {
                    id: 'info',
                    label: 'Key Information',
                    content: (
                      <>
                        <InfoSection title="Equations">
                          <InfoRow label="Parent"><Tex tex={`f(x) = ${undefinedBase ? UNDEFINED : parentTex(b)}`} /></InfoRow>
                          <InfoRow label="Transformed"><Tex tex={`g(x) = ${transformedEquationTex}`} /></InfoRow>
                        </InfoSection>
                        <InfoSection title="Points">
                          <InfoRow label="Key point"><Tex tex={undefinedBase ? UNDEFINED : `(1,\\ 0) \\to ${pointTex(P)}`} /></InfoRow>
                          <InfoRow label="Second point"><Tex tex={undefinedBase ? UNDEFINED : `(${formatNumber(b)},\\ 1) \\to ${pointTex(Q)}`} /></InfoRow>
                          <InfoRow label="x-intercept"><Tex tex={xInt === null ? UNDEFINED : pointTex(xInt)} /></InfoRow>
                          <InfoRow label="y-intercept"><Tex tex={undefinedBase ? UNDEFINED : yInt === null ? '\\text{none (0 is not in the domain)}' : pointTex(yInt)} /></InfoRow>
                        </InfoSection>
                        <InfoSection title="Features">
                          <InfoRow label="Domain"><Tex tex={domainTex(domain(params))} /></InfoRow>
                          <InfoRow label="Range"><Tex tex={undefinedBase ? '\\varnothing' : '(-\\infty,\\ \\infty)'} /></InfoRow>
                          <InfoRow label="Asymptote"><Tex tex={asymptoteTex} /></InfoRow>
                          <InfoRow label="Behavior">{behaviorLabel}</InfoRow>
                          <InfoRow label="End behavior" stacked>
                            {limitsTex ? (
                              <>
                                <Tex tex={limitsTex.near} />
                                <Tex tex={limitsTex.far} />
                              </>
                            ) : (
                              <Tex tex={UNDEFINED} />
                            )}
                          </InfoRow>
                        </InfoSection>
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
                          <InfoRow label="Vertical">{scaleLabel(values.stretch, 'steeper', 'flatter')}</InfoRow>
                          <InfoRow label="Reflect (x-axis)">{values.flipV ? 'Yes — increasing and decreasing swap' : 'No'}</InfoRow>
                          <InfoRow label="Horizontal">{scaleLabel(1 / values.hStretch, 'away from the asymptote', 'toward the asymptote')}</InfoRow>
                          <InfoRow label="Reflect (y-axis)">{values.flipH ? `Yes — the domain is now x ${p > 0 ? '>' : '<'} ${formatNumber(h)}` : 'No'}</InfoRow>
                          <InfoRow label="Shift right/left">{horizontalMovement.firstLine === 'No' ? 'None' : `${horizontalMovement.firstLine} ${horizontalMovement.secondLine}`}</InfoRow>
                          <InfoRow label="Shift up/down">{verticalMovement.firstLine === 'No' ? 'None' : `${verticalMovement.firstLine} ${verticalMovement.secondLine}`}</InfoRow>
                        </InfoSection>
                        {shift !== null && (
                          <p className="helper-text xp-insights__note">
                            Logarithm quirk: the horizontal stretch by <Tex tex={`p = ${formatNumber(Math.abs(p))}`} /> is the same as shifting the unstretched curve{' '}
                            <strong>{formatNumber(Math.abs(shift), 2)} {Math.abs(Math.abs(shift) - 1) < 0.005 ? 'unit' : 'units'} {shift > 0 ? 'up' : 'down'}</strong>, because{' '}
                            <Tex tex="\log_b(p\,u) = \log_b u + \log_b p" />.
                          </p>
                        )}
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
            titleId="le-presets-title"
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
