import type React from 'react'
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { clamp, formatNumber } from '../utils/format'
import { Tex } from './tex'
import type { Plane, Point, ZoomAxis } from '../utils/plane'

/**
 * Shared building blocks for the "transformation explorer" family of math
 * widgets (quadratic, exponential, logarithmic, …). Styled by the `.xp-*`
 * block in secondary.css. Pure plot math (createPlane, curvePath, …) lives in
 * utils/plane.ts so this file only exports components.
 *
 * Page anatomy these pieces assume:
 *
 *   <main className="page xp-page">
 *     <div className="container container--wide">
 *       <section className="panel xp-hero">…</section>
 *       <div className="xp-layout">
 *         <aside className="xp-sidebar">   ← EquationStrip, ControlSection > ParamControl / ReflectToggle, Presets + Reset
 *         <section className="xp-center">  ← PlotFrame + CoordinatePlane + Legend
 *         <aside className="xp-insights">  ← TabbedPanel of InfoSections
 *       </div>
 *       <PresetsModal … />
 */

/* ============================================================
 * Controls
 *
 * One ParamControl per parameter. Each is a solid tile tinted with the
 * parameter's color (`.xp-param--<term>`), the same color as that term's
 * chip in the EquationStrip, so a student can see which knob moves which
 * part of the equation. Tiles are grouped under ControlSection headings
 * (Shape / Position) that match the InfoSection headings on the right.
 * ============================================================ */

/** Rounds to the nearest multiple of `step` and strips float noise. */
function snapToStep(value: number, step: number) {
  return Math.round(Math.round(value / step) * step * 1e6) / 1e6
}

export function ControlSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="xp-control-section">
      <div className="xp-control-section__title">{title}</div>
      <div className="xp-control-section__body">{children}</div>
    </section>
  )
}

export type ParamControlProps = {
  id: string
  /** Parameter letter: shown in the chip and picks the tile color (`.xp-param--<term>`). */
  term: string
  label: ReactNode
  value: number
  /** Slider range. Typed and stepped values may go beyond it (see `typedMin`/`typedMax`). */
  min: number
  max: number
  step: number
  /**
   * Hard limits for the text field and −/+ buttons, for parameters that are
   * undefined past a point (e.g. a base must stay positive). Default: none,
   * other than a ±1,000,000 sanity cap.
   */
  typedMin?: number
  typedMax?: number
  /** Double-clicking the slider snaps back to this value. */
  defaultValue?: number
  /** Small before/after sketch of what the parameter does. */
  glyph?: ReactNode
  hint?: ReactNode
  format?: (value: number) => string
  onChange: (value: number) => void
}

const TYPED_CAP = 1_000_000

export function ParamControl({
  id, term, label, value, min, max, step, typedMin = -TYPED_CAP, typedMax = TYPED_CAP, defaultValue, glyph, hint,
  format = formatNumber, onChange,
}: ParamControlProps) {
  // Typed and stepped values land on the slider's grid so the number shown
  // in the equation is exactly the number being graphed. They are not held to
  // the slider's range: the slider just parks at its end when the value is
  // beyond it.
  const set = (next: number) => onChange(clamp(snapToStep(next, step), typedMin, typedMax))

  return (
    <div className={`xp-param xp-param--${term}`}>
      {glyph && <div className="xp-param__glyph" aria-hidden="true">{glyph}</div>}
      <div className="xp-param__body">
        <div className="xp-param__head">
          <label className="xp-param__label" htmlFor={id}>
            <span className={`xp-term xp-term--${term}`}>{term}</span>
            {label}
          </label>
          <Stepper term={term} value={value} step={step} format={format} onChange={set} />
        </div>
        <input
          id={id}
          className="range xp-param__range"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={event => onChange(Number(event.target.value))}
          onDoubleClick={defaultValue === undefined ? undefined : () => onChange(defaultValue)}
          title={defaultValue === undefined ? undefined : `Double-click to reset to ${format(defaultValue)}`}
        />
        {hint && <p className="helper-text xp-control__hint">{hint}</p>}
      </div>
    </div>
  )
}

type StepperProps = {
  term: string
  value: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
}

/** −/+ buttons around a typeable value. Typing commits on Enter or blur. */
function Stepper({ term, value, step, format, onChange }: StepperProps) {
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    if (draft !== null) {
      const parsed = Number(draft.replace('−', '-').trim())
      if (draft.trim() !== '' && Number.isFinite(parsed)) onChange(parsed)
    }
    setDraft(null)
  }

  return (
    <div className="xp-stepper">
      <button type="button" className="xp-stepper__btn" aria-label={`Decrease ${term}`} onClick={() => onChange(value - step)}>
        −
      </button>
      <input
        className="xp-stepper__input"
        type="text"
        inputMode="decimal"
        aria-label={`Value of ${term}`}
        value={draft ?? format(value)}
        onChange={event => setDraft(event.target.value)}
        onFocus={event => event.target.select()}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Enter') event.currentTarget.blur()
          else if (event.key === 'Escape') setDraft(null)
        }}
      />
      <button type="button" className="xp-stepper__btn" aria-label={`Increase ${term}`} onClick={() => onChange(value + step)}>
        +
      </button>
    </div>
  )
}

export type ReflectToggleProps = {
  id?: string
  axis: 'x' | 'y'
  pressed: boolean
  onToggle: () => void
}

/** "Reflect across the x/y-axis" button with a tiny mirrored-curve icon. */
export function ReflectToggle({ id, axis, pressed, onToggle }: ReflectToggleProps) {
  return (
    <button
      id={id}
      type="button"
      className={`xp-reflect${pressed ? ' xp-reflect--active' : ''}`}
      aria-pressed={pressed}
      onClick={onToggle}
    >
      <svg viewBox="0 0 20 20" className="xp-reflect__icon" aria-hidden="true">
        {axis === 'x' ? (
          <>
            <path d="M2 10H18" className="xp-reflect__axis" />
            <path d="M4 7C8 7 12 5 16 2" className="xp-reflect__before" />
            <path d="M4 13C8 13 12 15 16 18" className="xp-reflect__after" />
          </>
        ) : (
          <>
            <path d="M10 2V18" className="xp-reflect__axis" />
            <path d="M12 16C13 12 15 8 18 4" className="xp-reflect__before" />
            <path d="M8 16C7 12 5 8 2 4" className="xp-reflect__after" />
          </>
        )}
      </svg>
      <span>{axis}-axis</span>
    </button>
  )
}

/**
 * The equation at the top of the controls as a grid: one column per token,
 * one row per form (the general form with letters, then the same form with
 * the current values). Operators sit centered in their own columns and the
 * rows line up exactly, whatever the values are. Each row must have the same
 * number of tokens; the widget's math.ts builds them.
 */
export function EquationStrip({ rows }: { rows: string[][] }) {
  const columns = rows[0]?.length ?? 0
  return (
    <div className="xp-equation-strip" style={{ gridTemplateColumns: `repeat(${columns}, auto)` }}>
      {rows.map((tokens, r) =>
        tokens.map((tex, c) => (
          <span key={`${r}-${c}`} className={`xp-equation-strip__cell${r < rows.length - 1 ? ' xp-equation-strip__cell--general' : ''}`}>
            <Tex tex={tex} />
          </span>
        )),
      )}
    </div>
  )
}

/* ============================================================
 * Presets
 * ============================================================ */
export type Preset<T> = {
  label: string
  hint: string
  values: T
}

export function PresetBadge({ activeLabel }: { activeLabel: string | null }) {
  return (
    <span className={`badge ${activeLabel ? 'badge--accent' : 'badge--neutral'} xp-preset-badge`}>
      {activeLabel ? `Preset: ${activeLabel}` : 'Custom state'}
    </span>
  )
}

export type PresetsModalProps<T> = {
  titleId: string
  presets: Preset<T>[]
  isActive: (preset: Preset<T>) => boolean
  onSelect: (values: T) => void
  onClose: () => void
}

/** Modal list of presets. Escape closes; body scroll is locked while open. */
export function PresetsModal<T>({ titleId, presets, isActive, onSelect, onClose }: PresetsModalProps<T>) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <div className="popup-overlay" role="presentation" onClick={onClose}>
      <section
        className="panel popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={event => event.stopPropagation()}
      >
        <div className="popup__header">
          <div className="eyebrow" id={titleId}>Presets</div>
          <button type="button" className="btn btn--outline btn--sm popup__close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="xp-preset-grid">
          {presets.map(preset => (
            <button
              key={preset.label}
              className={`xp-preset${isActive(preset) ? ' xp-preset--active' : ''}`}
              onClick={() => onSelect(preset.values)}
            >
              <span className="xp-preset__label">{preset.label}</span>
              <span className="xp-preset__hint">{preset.hint}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

/* ============================================================
 * Fit-to-width
 * ============================================================ */

/** Scales its content down (to 72%) so a long equation stays on one line. */
export function ShrinkToFitInline({ children }: { children: ReactNode }) {
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
    <span ref={wrapperRef} className="xp-fit-wrap">
      <span ref={contentRef} className="xp-fit-content" style={{ transform: `scale(${scale})` }}>
        {children}
      </span>
    </span>
  )
}

/* ============================================================
 * Coordinate plane (SVG scaffold)
 * ============================================================ */
export type CoordinatePlaneProps = {
  plane: Plane
  id: string
  title: string
  desc: string
  /** Drawn inside the plot clip (curves, guides). */
  children?: ReactNode
  /** Drawn on top, unclipped (markers, labels). */
  overlay?: ReactNode
  /** Drag moves the window by (dx, dy) plane units. */
  onPan?: (dx: number, dy: number) => void
  /**
   * Wheel scales the window by `factor` (>1 zooms out) about `anchor`.
   * `axis` is Shift → 'x', Alt/Option → 'y', otherwise `zoomAxis`.
   */
  onZoom?: (factor: number, anchor: Point, axis: ZoomAxis) => void
  /** Default zoom direction when no modifier key is held. */
  zoomAxis?: ZoomAxis
  /** Double-click. */
  onResetView?: () => void
}

export function CoordinatePlane({
  plane, id, title, desc, children, overlay, onPan, onZoom, zoomAxis = 'both', onResetView,
}: CoordinatePlaneProps) {
  const { width, height, margin, plotWidth, plotHeight, mapX, mapY, xTicks, yTicks, xLabelEvery = 1, yLabelEvery = 1 } = plane
  const clipId = `${id}-clip`
  const showXAxis = plane.yMin <= 0 && plane.yMax >= 0
  const showYAxis = plane.xMin <= 0 && plane.xMax >= 0
  const svgRef = useRef<SVGSVGElement | null>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  // Plane units per rendered pixel (the SVG is scaled to fit its column).
  const unitsPerPixel = () => {
    const scale = (svgRef.current?.getBoundingClientRect().width ?? width) / width
    return {
      x: (plane.xMax - plane.xMin) / (plotWidth * scale),
      y: (plane.yMax - plane.yMin) / (plotHeight * scale),
    }
  }

  const toPlane = (clientX: number, clientY: number): Point => {
    const rect = svgRef.current?.getBoundingClientRect()
    const scale = (rect?.width ?? width) / width
    const px = (clientX - (rect?.left ?? 0)) / scale
    const py = (clientY - (rect?.top ?? 0)) / scale
    return {
      x: plane.xMin + ((px - margin.left) / plotWidth) * (plane.xMax - plane.xMin),
      y: plane.yMax - ((py - margin.top) / plotHeight) * (plane.yMax - plane.yMin),
    }
  }

  // React registers wheel listeners as passive, so preventDefault (keeping
  // the page from scrolling under the graph) needs a native listener.
  const zoomRef = useRef(onZoom)
  zoomRef.current = onZoom
  const zoomAxisRef = useRef(zoomAxis)
  zoomAxisRef.current = zoomAxis
  const toPlaneRef = useRef(toPlane)
  toPlaneRef.current = toPlane
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || !onZoom) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      // Shift+wheel arrives as deltaX on macOS, so take the larger component.
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      const factor = Math.exp(Math.max(-60, Math.min(60, delta)) * 0.003)
      const axis: ZoomAxis = event.shiftKey ? 'x' : event.altKey ? 'y' : zoomAxisRef.current
      zoomRef.current?.(factor, toPlaneRef.current(event.clientX, event.clientY), axis)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [onZoom])

  const pointerHandlers = onPan
    ? {
        onPointerDown: (event: React.PointerEvent<SVGSVGElement>) => {
          if (event.button !== 0) return
          drag.current = { x: event.clientX, y: event.clientY }
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragging(true)
        },
        onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => {
          if (!drag.current) return
          const upp = unitsPerPixel()
          onPan(-(event.clientX - drag.current.x) * upp.x, (event.clientY - drag.current.y) * upp.y)
          drag.current = { x: event.clientX, y: event.clientY }
        },
        onPointerUp: (event: React.PointerEvent<SVGSVGElement>) => {
          drag.current = null
          event.currentTarget.releasePointerCapture(event.pointerId)
          setDragging(false)
        },
        onPointerCancel: () => {
          drag.current = null
          setDragging(false)
        },
      }
    : {}

  return (
    <div className="xp-graph-shell">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className={`xp-graph${onPan ? ' xp-graph--pannable' : ''}${dragging ? ' xp-graph--dragging' : ''}`}
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
        onDoubleClick={onResetView}
        {...pointerHandlers}
      >
        <title id={`${id}-title`}>{title}</title>
        <desc id={`${id}-desc`}>{desc}</desc>

        <defs>
          <clipPath id={clipId}>
            <rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} />
          </clipPath>
        </defs>

        <rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} className="xp-graph__backdrop" />

        {xTicks.map((tick, i) => (
          <g key={`x-${tick}`}>
            <line x1={mapX(tick)} y1={margin.top} x2={mapX(tick)} y2={margin.top + plotHeight} className="xp-graph__grid" />
            {i % xLabelEvery === 0 && (
              <text x={mapX(tick)} y={height - 16} textAnchor="middle" className="xp-graph__tick">{tick}</text>
            )}
          </g>
        ))}

        {yTicks.map((tick, i) => (
          <g key={`y-${tick}`}>
            <line x1={margin.left} y1={mapY(tick)} x2={margin.left + plotWidth} y2={mapY(tick)} className="xp-graph__grid" />
            {i % yLabelEvery === 0 && (
              <text x={margin.left - 12} y={mapY(tick) + 4} textAnchor="end" className="xp-graph__tick">{tick}</text>
            )}
          </g>
        ))}

        {showXAxis && (
          <line x1={margin.left} y1={mapY(0)} x2={margin.left + plotWidth} y2={mapY(0)} className="xp-graph__axis" />
        )}
        {showYAxis && (
          <line x1={mapX(0)} y1={margin.top} x2={mapX(0)} y2={margin.top + plotHeight} className="xp-graph__axis" />
        )}

        <g clipPath={`url(#${clipId})`}>{children}</g>

        {overlay}

        {showXAxis && (
          <text x={margin.left + plotWidth - 10} y={mapY(0) - 8} textAnchor="end" className="xp-graph__axis-label">x</text>
        )}
        {showYAxis && (
          <text x={mapX(0) + 10} y={margin.top + 16} className="xp-graph__axis-label">y</text>
        )}
      </svg>
    </div>
  )
}

export type ViewControlsProps = {
  axis: ZoomAxis
  onAxisChange: (axis: ZoomAxis) => void
  /** Disabled when the view is already the default. */
  canReset: boolean
  onReset: () => void
}

const ZOOM_AXES: { value: ZoomAxis; label: string; title: string }[] = [
  { value: 'both', label: 'Both', title: 'Scrolling zooms both axes' },
  { value: 'x', label: 'X only', title: 'Scrolling zooms horizontally (or hold Shift)' },
  { value: 'y', label: 'Y only', title: 'Scrolling zooms vertically (or hold Alt / Option)' },
]

/** Zoom-direction switch + "Reset view" + a one-line how-to; sits next to the legend under the plot. */
export function ViewControls({ axis, onAxisChange, canReset, onReset }: ViewControlsProps) {
  return (
    <div className="xp-view-controls">
      <p className="xp-view-controls__hint">
        Drag to move · scroll to zoom (Shift: x only, Alt: y only) · double-click to reset
      </p>
      <span className="xp-view-controls__label">Zoom</span>
      <div className="xp-seg" role="group" aria-label="Zoom direction">
        {ZOOM_AXES.map(option => (
          <button
            key={option.value}
            type="button"
            className={`xp-seg__btn${axis === option.value ? ' xp-seg__btn--active' : ''}`}
            aria-pressed={axis === option.value}
            title={option.title}
            onClick={() => onAxisChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn btn--outline btn--sm xp-view-controls__reset"
        disabled={!canReset}
        title="Back to the default window (or double-click the graph)"
        onClick={onReset}
      >
        Reset view
      </button>
    </div>
  )
}

export function PlotFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="xp-plot-frame" data-label={label}>
      {children}
    </section>
  )
}

/* ============================================================
 * Tabbed panel — Key Features / Key Points / Transformations
 * Uses the style guide's .tabs / .tab / .tab-panel classes.
 * ============================================================ */
export type TabDef = {
  id: string
  label: ReactNode
  content: ReactNode
}

export function TabbedPanel({ id, tabs, initial = 0 }: { id: string; tabs: TabDef[]; initial?: number }) {
  const [active, setActive] = useState(initial)

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1
    let next: number | null = null
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    if (next === null) return
    event.preventDefault()
    setActive(next)
    document.getElementById(`${id}-tab-${tabs[next].id}`)?.focus()
  }

  return (
    <div className="xp-tabbed">
      <div className="tabs xp-tabs" role="tablist">
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            id={`${id}-tab-${tab.id}`}
            type="button"
            role="tab"
            className={`tab${active === i ? ' active' : ''}`}
            aria-selected={active === i}
            aria-controls={`${id}-panel-${tab.id}`}
            tabIndex={active === i ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={event => onKeyDown(event, i)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, i) => (
        <div
          key={tab.id}
          id={`${id}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${tab.id}`}
          className={`tab-panel xp-tab-panel${active === i ? ' active' : ''}`}
        >
          {tab.content}
        </div>
      ))}
    </div>
  )
}

/* ============================================================
 * Legend
 * ============================================================ */
export type LegendItem = {
  label: ReactNode
  /** Visual style of the swatch. */
  kind: 'parent' | 'transformed' | 'guide' | 'point-parent' | 'point-transformed'
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <div className="legend-key xp-legend">
      {items.map((item, i) => (
        <div key={i} className="legend-key__item">
          <span className={`xp-legend__swatch xp-legend__swatch--${item.kind}`} />
          {item.label}
        </div>
      ))}
    </div>
  )
}
