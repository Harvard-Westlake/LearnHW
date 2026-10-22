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
import { curvePath, inPlane, labelPosition, panView, sameView, samplePoints, viewPlane, zoomView, type Point, type View, type ZoomAxis } from '../../../utils/plane'
import {
  asymptote,
  behavior,
  endBehavior,
  equivalentShift,
  evaluate,
  generalTokens,
  keyPoint,
  limitTex,
  mappingTex,
  parentTex,
  pointTex,
  range,
  rangeTex,
  substitutedTokens,
  transformedTex,
  xIntercept,
  yIntercept,
  type ExponentialParams,
  type TermWrap,
} from './math'
import { Glyph } from './glyphs'

/**
 * Exponential Transformations Explorer
 *   parent      f(x) = b^x
 *   transformed g(x) = a · b^(p(x − h)) + k
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
  { label: 'Parent', hint: 'Reset to f(x) = 2ˣ', values: { ...DEFAULT_VALUES } },
  { label: 'Faster Growth', hint: 'Base 3 climbs more steeply', values: { ...DEFAULT_VALUES, base: 3 } },
  { label: 'Decay', hint: 'Base ½ shrinks toward the asymptote', values: { ...DEFAULT_VALUES, base: 0.5 } },
  { label: 'Reflected', hint: 'Flip across the x-axis (a < 0)', values: { ...DEFAULT_VALUES, flipV: true } },
  { label: 'Mirror', hint: 'Flip across the y-axis turns growth into decay', values: { ...DEFAULT_VALUES, flipH: true } },
  { label: 'Up and Right', hint: 'Asymptote at y = 2, key point at (1, 3)', values: { ...DEFAULT_VALUES, h: 1, k: 2 } },
  { label: 'Compressed', hint: 'p = 2 squeezes the graph toward the y-axis', values: { ...DEFAULT_VALUES, hStretch: 2 } },
  { label: 'Crosses the Axis', hint: 'Dropped below zero, so an x-intercept appears', values: { ...DEFAULT_VALUES, k: -2 } },
]

const PLANE_BASE = { width: 760, height: 520, margin: { top: 24, right: 28, bottom: 46, left: 52 } }
const DEFAULT_VIEW: View = { xMin: -5, xMax: 5, yMin: -10, yMax: 10 }

function toParams(values: ExplorerValues): ExponentialParams {
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
 * Wraps a parameter's value in a chip colored like its control row. The outer
 * braces matter: KaTeX gives a bare \htmlClass no operator spacing on its
 * left, which put the · in a · b off-center.
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

export default function ExponentialExplorer() {
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
    document.title = 'Exponential Transformations Explorer · Class Resources'
    return () => {
      document.title = previousTitle
    }
  }, [])

  const params = toParams(values)
  const { a, b, h, k } = params
  const constantBase = behavior(params) === 'constant'
  const kind = behavior(params)
  const P = keyPoint(params)
  const yInt = yIntercept(params)
  const xInt = xIntercept(params)
  const asym = asymptote(params)
  const limits = endBehavior(params)
  const shift = equivalentShift(params)
  const horizontalMovement = formatMovementLines(h, 'right', 'left')
  const verticalMovement = formatMovementLines(k, 'up', 'down')

  // Plot geometry
  const parentPath = curvePath(samplePoints(PLANE, x => Math.pow(b, x)), PLANE)
  const transformedPath = curvePath(samplePoints(PLANE, x => evaluate(x, params)), PLANE)
  const asymptoteVisible = asym !== null && asym >= PLANE.yMin && asym <= PLANE.yMax
  const keyPointVisible = inPlane(PLANE, P)
  const keyPointLabelPos = labelPosition(PLANE, P, 110)
  const parentLabelPos = labelPosition(PLANE, { x: 0, y: 1 }, 60)

  const activePreset = PRESETS.find(preset => statesMatch(values, preset.values))?.label ?? null
  const update = (patch: Partial<ExplorerValues>) => setValues(current => ({ ...current, ...patch }))

  const behaviorLabel = kind === 'growth' ? 'Growth' : kind === 'decay' ? 'Decay' : 'Constant'
  const asymptoteTex = asym === null ? '\\text{none}' : `y = ${formatNumber(asym)}`
  const xInterceptTex = xInt.kind === 'point' ? pointTex(xInt.point) : xInt.kind === 'everywhere' ? '\\text{every point}' : '\\text{none}'

  return (
    <main className="page xp-page">
      <div className="container container--wide">
        <section className="panel xp-hero">
          <div className="eyebrow">Math Explorer</div>
          <div className="xp-hero__row">
            <div className="xp-hero__copy">
              <h1 className="h2 xp-hero__title">Exponential Transformations Explorer</h1>
              <p className="lead xp-hero__lead">
                Change the base, stretch, reflect, and shift <Tex tex="b^{x}" /> and track where the key point (0, 1) and the asymptote go.
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
                  id="ee-b"
                  term="b"
                  label="Base"
                  value={b}
                  min={0.5}
                  max={5}
                  step={0.1}
                  typedMin={0.1}
                  defaultValue={DEFAULT_VALUES.base}
                  glyph={<Glyph kind="base" />}
                  hint={constantBase
                    ? 'b = 1 makes every power equal 1, so the graph is flat.'
                    : b > 1 ? 'b > 1: the parent grows.' : '0 < b < 1: the parent decays.'}
                  onChange={base => update({ base })}
                />
                <ParamControl
                  id="ee-a"
                  term="a"
                  label="Vertical stretch"
                  value={values.stretch}
                  min={0.1}
                  max={5}
                  step={0.1}
                  typedMin={0.1}
                  defaultValue={DEFAULT_VALUES.stretch}
                  glyph={<Glyph kind="vertical" />}
                  hint="Multiplies every output; the key point rises to y = a + k."
                  onChange={stretch => update({ stretch })}
                />
                <ParamControl
                  id="ee-p"
                  term="p"
                  label="Horizontal stretch"
                  value={values.hStretch}
                  min={0.1}
                  max={5}
                  step={0.1}
                  typedMin={0.1}
                  defaultValue={DEFAULT_VALUES.hStretch}
                  glyph={<Glyph kind="horizontal" />}
                  hint="p > 1 compresses toward the y-axis; p < 1 stretches away from it."
                  onChange={hStretch => update({ hStretch })}
                />
                <div className="xp-reflect-row" role="group" aria-label="Reflect across">
                  <span className="xp-reflect-row__label">Reflect</span>
                  <ReflectToggle id="ee-flip-v" axis="x" pressed={values.flipV} onToggle={() => update({ flipV: !values.flipV })} />
                  <ReflectToggle id="ee-flip-h" axis="y" pressed={values.flipH} onToggle={() => update({ flipH: !values.flipH })} />
                </div>
              </ControlSection>

              <ControlSection title="Position">
                <ParamControl
                  id="ee-h"
                  term="h"
                  label="Shift right / left"
                  value={h}
                  min={-5}
                  max={5}
                  step={0.1}
                  defaultValue={DEFAULT_VALUES.h}
                  glyph={<Glyph kind="shift-h" />}
                  hint="Moves the graph h units right (negative: left)."
                  onChange={h => update({ h })}
                />
                <ParamControl
                  id="ee-k"
                  term="k"
                  label="Shift up / down"
                  value={k}
                  min={-5}
                  max={5}
                  step={0.1}
                  defaultValue={DEFAULT_VALUES.k}
                  glyph={<Glyph kind="shift-k" />}
                  hint="Moves the graph and asymptote to y = k."
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
                id="ee-graph"
                title="Exponential graph"
                desc={`Parent curve y equals ${formatNumber(b)} to the x and transformed curve g of x. ${asym === null ? 'No asymptote.' : `Horizontal asymptote at y equals ${formatNumber(asym)}.`} Drag to move the window, scroll to zoom, double-click to reset.`}
                onPan={pan}
                onZoom={zoom}
                zoomAxis={zoomAxis}
                onResetView={resetView}
                overlay={
                  <>
                    <circle cx={PLANE.mapX(0)} cy={PLANE.mapY(1)} r="5.5" className="xp-graph__point xp-graph__point--parent" />
                    <text x={parentLabelPos.x} y={parentLabelPos.y} className="xp-graph__point-note xp-graph__point-note--parent">
                      (0, 1)
                    </text>
                    {keyPointVisible && (
                      <>
                        <circle cx={PLANE.mapX(P.x)} cy={PLANE.mapY(P.y)} r="6.5" className="xp-graph__point xp-graph__point--transformed" />
                        <text x={keyPointLabelPos.x} y={keyPointLabelPos.y} className="xp-graph__point-note">
                          P′ ({formatNumber(P.x)}, {formatNumber(P.y)})
                        </text>
                      </>
                    )}
                  </>
                }
              >
                {asymptoteVisible && (
                  <line
                    x1={PLANE.margin.left}
                    y1={PLANE.mapY(asym)}
                    x2={PLANE.margin.left + PLANE.plotWidth}
                    y2={PLANE.mapY(asym)}
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
                    { kind: 'transformed', label: 'Transformed' },
                    { kind: 'guide', label: asym === null ? 'Asymptote: none' : <>Asymptote <Tex tex={asymptoteTex} /></> },
                    { kind: 'point-transformed', label: 'Key point P′' },
                  ]}
                />
                <ViewControls axis={zoomAxis} onAxisChange={setZoomAxis} canReset={viewMoved} onReset={resetView} />
              </div>
            </PlotFrame>
          </section>

          <aside className="xp-insights">
            <section className="panel xp-insights-panel">
              <TabbedPanel
                id="ee-info"
                tabs={[
                  {
                    id: 'info',
                    label: 'Key Information',
                    content: (
                      <>
                        <InfoSection title="Equations">
                          <InfoRow label="Parent"><Tex tex={`f(x) = ${parentTex(b)}`} /></InfoRow>
                          <InfoRow label="Transformed"><Tex tex={`g(x) = ${transformedTex(params)}`} /></InfoRow>
                        </InfoSection>
                        <InfoSection title="Points">
                          <InfoRow label="Key point"><Tex tex={`(0,\\ 1) \\to ${pointTex(P)}`} /></InfoRow>
                          <InfoRow label="y-intercept"><Tex tex={pointTex(yInt)} /></InfoRow>
                          <InfoRow label="x-intercept"><Tex tex={xInterceptTex} /></InfoRow>
                        </InfoSection>
                        <InfoSection title="Features">
                          <InfoRow label="Domain"><Tex tex="(-\infty,\ \infty)" /></InfoRow>
                          <InfoRow label="Range"><Tex tex={rangeTex(range(params))} /></InfoRow>
                          <InfoRow label="Asymptote"><Tex tex={asymptoteTex} /></InfoRow>
                          <InfoRow label="Behavior">{behaviorLabel}</InfoRow>
                          <InfoRow label="End behavior" stacked>
                            <Tex tex={`\\text{As } x \\to -\\infty,\\ g(x) \\to ${limitTex(limits.left)}`} />
                            <Tex tex={`\\text{As } x \\to \\infty,\\ g(x) \\to ${limitTex(limits.right)}`} />
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
                          <InfoRow label="Reflect (x-axis)">{values.flipV ? `Yes — now ${a > 0 ? 'above' : 'below'} the asymptote` : 'No'}</InfoRow>
                          <InfoRow label="Horizontal">{scaleLabel(1 / values.hStretch, 'wider', 'toward the y-axis')}</InfoRow>
                          <InfoRow label="Reflect (y-axis)">{values.flipH ? 'Yes — growth and decay swap' : 'No'}</InfoRow>
                          <InfoRow label="Shift right/left">{horizontalMovement.firstLine === 'No' ? 'None' : `${horizontalMovement.firstLine} ${horizontalMovement.secondLine}`}</InfoRow>
                          <InfoRow label="Shift up/down">{verticalMovement.firstLine === 'No' ? 'None' : `${verticalMovement.firstLine} ${verticalMovement.secondLine}`}</InfoRow>
                        </InfoSection>
                        {shift !== null && (
                          <p className="helper-text xp-insights__note">
                            Exponential quirk: multiplying by <Tex tex={`a = ${formatNumber(a)}`} /> is the same as shifting the unstretched curve{' '}
                            <strong>{formatNumber(Math.abs(shift), 2)} {Math.abs(Math.abs(shift) - 1) < 0.005 ? 'unit' : 'units'} {shift < 0 ? 'right' : 'left'}</strong>
                            {a < 0 ? ' and reflecting' : ''}, because <Tex tex="a \cdot b^{x} = b^{\,x + \log_b a}" />.
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
            titleId="ee-presets-title"
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
