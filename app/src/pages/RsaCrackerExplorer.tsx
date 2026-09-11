import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { MetricsDisplay, WidgetShell } from '../components/widget'

/* ============================================================
 * Cracking RSA — Period Finding & Quantum Interference
 *
 * Three linked stages that share one toy RSA key (N = p · q):
 *   1. Build the lock — pick p, q (or type N); see where N sits in
 *      the RSA equations, and why an attacker who only sees N has
 *      to "fold" the pile of N squares back into a p × q rectangle.
 *   2. Find the period — walk a^k mod N around the remainder clock
 *      until it loops back to 1. The loop length r plus the
 *      difference of squares exposes p and q.
 *   3. Quantum interferometer — the same period read off an
 *      interference pattern: slits spaced r apart make fringes
 *      spaced 1/r apart. The Quantum Fourier Transform is the screen.
 *
 * All arithmetic is on small numbers (N ≤ 2500) so every value the
 * student sees is computed live from their own inputs.
 * ============================================================ */

type Stage = 1 | 2 | 3
type LockMode = 'primes' | 'number'
type LockView = 'owner' | 'attacker'

const PRIME_CHOICES = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]
const MIN_N = 15
const MAX_N = 2500
const MIN_QUBITS = 5
const MAX_QUBITS = 14
const DEFAULT_QUBITS = 12
const MAX_MEASUREMENTS = 12

const STAGES: { id: Stage; label: string; hint: string }[] = [
  { id: 1, label: 'Build the lock', hint: 'Two secret primes, one public N' },
  { id: 2, label: 'Find the period', hint: 'Powers of a loop back to 1' },
  { id: 3, label: 'Quantum interferometer', hint: 'Read the period from light' },
]

/* ============================================================
 * Number theory helpers
 * ============================================================ */

function gcd(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y !== 0) {
    const t = x % y
    x = y
    y = t
  }
  return x
}

function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return (a / gcd(a, b)) * b
}

function isPrime(n: number): boolean {
  if (n < 2) return false
  if (n % 2 === 0) return n === 2
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false
  }
  return true
}

function primeFactors(n: number): number[] {
  const out: number[] = []
  let m = n
  for (let d = 2; d * d <= m; d++) {
    while (m % d === 0) {
      out.push(d)
      m /= d
    }
  }
  if (m > 1) out.push(m)
  return out
}

function modPow(base: number, exp: number, mod: number): number {
  let result = 1 % mod
  let b = base % mod
  let e = exp
  while (e > 0) {
    if (e % 2 === 1) result = (result * b) % mod
    b = (b * b) % mod
    e = Math.floor(e / 2)
  }
  return result
}

function modInverse(e: number, phi: number): number | null {
  let oldR = e
  let r = phi
  let oldS = 1
  let s = 0
  while (r !== 0) {
    const quotient = Math.floor(oldR / r)
    const nextR = oldR - quotient * r
    oldR = r
    r = nextR
    const nextS = oldS - quotient * s
    oldS = s
    s = nextS
  }
  if (oldR !== 1) return null
  return ((oldS % phi) + phi) % phi
}

function pickPublicExponent(phi: number): number {
  for (let e = 3; e < phi; e += 2) {
    if (gcd(e, phi) === 1) return e
  }
  return 1
}

/** Smallest r > 0 with a^r ≡ 1 (mod n). Null if a and n share a factor. */
function multiplicativeOrder(a: number, n: number): number | null {
  if (gcd(a, n) !== 1) return null
  let x = a % n
  let k = 1
  while (x !== 1) {
    x = (x * a) % n
    k++
    if (k > n) return null
  }
  return k
}

/** [a^0, a^1, …, a^(length-1)] mod n. */
function orbitValues(a: number, n: number, length: number): number[] {
  const out: number[] = []
  let x = 1 % n
  for (let i = 0; i < length; i++) {
    out.push(x)
    x = (x * a) % n
  }
  return out
}

function bigPowerString(a: number, k: number): string {
  let value = BigInt(1)
  const b = BigInt(a)
  for (let i = 0; i < k; i++) value *= b
  const digits = value.toString()
  if (digits.length <= 22) return digits
  return `${digits.slice(0, 8)}…${digits.slice(-6)} (${digits.length} digits)`
}

function formatFactorization(factors: number[]): string {
  const counts = new Map<number, number>()
  factors.forEach(f => counts.set(f, (counts.get(f) ?? 0) + 1))
  return [...counts.entries()].map(([b, c]) => (c > 1 ? `${b}^${c}` : `${b}`)).join(' × ')
}

type LockCheck = { ok: true; p: number; q: number } | { ok: false; reason: string }

function checkLockNumber(n: number): LockCheck {
  if (!Number.isInteger(n) || n < MIN_N || n > MAX_N) {
    return { ok: false, reason: `Pick a whole number from ${MIN_N} to ${MAX_N}.` }
  }
  if (n % 2 === 0) {
    return { ok: false, reason: `${n} is even, so 2 is a factor and there is nothing hidden. Try an odd number.` }
  }
  if (isPrime(n)) {
    return { ok: false, reason: `${n} is prime. It has no hidden factors, so it cannot be an RSA modulus.` }
  }
  const factors = primeFactors(n)
  if (factors.length !== 2) {
    return { ok: false, reason: `${n} = ${formatFactorization(factors)}. An RSA modulus is exactly two different primes multiplied together.` }
  }
  if (factors[0] === factors[1]) {
    return { ok: false, reason: `${n} = ${factors[0]}², one prime squared. RSA needs two different primes.` }
  }
  return { ok: true, p: factors[0], q: factors[1] }
}

/** Last continued-fraction convergent of c/Q with denominator ≤ maxDen. */
function nearestFraction(c: number, Q: number, maxDen: number): { num: number; den: number } {
  let num = c
  let den = Q
  let hPrev = 0
  let hCurr = 1
  let kPrev = 1
  let kCurr = 0
  let best = { num: 0, den: 1 }
  while (den !== 0) {
    const a = Math.floor(num / den)
    const hNext = a * hCurr + hPrev
    const kNext = a * kCurr + kPrev
    if (kNext > maxDen) break
    best = { num: hNext, den: kNext }
    hPrev = hCurr
    hCurr = hNext
    kPrev = kCurr
    kCurr = kNext
    const remainder = num - a * den
    num = den
    den = remainder
  }
  return best
}

/* ============================================================
 * Interference helpers
 * ============================================================ */

/** Normalised intensity of `slits` equally spaced slits (spacing r) at frequency θ ∈ [0, 1). */
function combIntensity(theta: number, slits: number, spacing: number): number {
  if (slits <= 1) return 1
  const x = Math.PI * spacing * theta
  const s = Math.sin(x)
  if (Math.abs(s) < 1e-9) return 1
  const v = Math.sin(slits * x) / (slits * s)
  return v * v
}

/** Probability of measuring each c ∈ [0, Q) after the QFT of a comb k0, k0 + r, k0 + 2r, … */
function qftDistribution(Q: number, spacing: number, k0: number): { probs: number[]; slits: number } {
  const slits = Math.floor((Q - 1 - k0) / spacing) + 1
  const raw = new Array<number>(Q)
  let total = 0
  for (let c = 0; c < Q; c++) {
    const v = (combIntensity(c / Q, slits, spacing) * slits) / Q
    raw[c] = v
    total += v
  }
  return { probs: raw.map(v => v / total), slits }
}

function sampleIndex(probs: number[]): number {
  let u = Math.random()
  for (let i = 0; i < probs.length; i++) {
    u -= probs[i]
    if (u <= 0) return i
  }
  return probs.length - 1
}

function polar(cx: number, cy: number, radius: number, fraction: number) {
  const angle = -Math.PI / 2 + 2 * Math.PI * fraction
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/* ============================================================
 * Small presentational pieces
 * ============================================================ */

function Pow({ base, exp }: { base: ReactNode; exp: ReactNode }) {
  return (
    <span className="rc-pow">
      {base}
      <sup>{exp}</sup>
    </span>
  )
}

function PanelHead({ children, badge }: { children: ReactNode; badge?: ReactNode }) {
  return (
    <div className="widget-panel__head rc-panel-head">
      <div className="eyebrow">{children}</div>
      {badge}
    </div>
  )
}

function EquationRow({ label, tag, children, note }: { label: string; tag: 'public' | 'secret' | 'anyone'; children: ReactNode; note?: ReactNode }) {
  return (
    <div className={`rc-eq rc-eq--${tag}`}>
      <div className="rc-eq__head">
        <span className="rc-eq__label">{label}</span>
        <span className={`badge ${tag === 'secret' ? 'badge--primary' : tag === 'public' ? 'badge--accent' : 'badge--neutral'}`}>
          {tag === 'secret' ? 'Secret' : tag === 'public' ? 'Public' : 'Anyone can do'}
        </span>
      </div>
      <div className="rc-eq__math">{children}</div>
      {note && <p className="helper-text rc-eq__note">{note}</p>}
    </div>
  )
}

function PrimePicker({ id, label, value, other, onPick }: { id: string; label: string; value: number; other: number; onPick: (prime: number) => void }) {
  return (
    <div className="field">
      <span className="label" id={id}>{label}</span>
      <div className="rc-prime-grid" role="group" aria-labelledby={id}>
        {PRIME_CHOICES.map(prime => {
          const active = prime === value
          const taken = prime === other
          return (
            <button
              key={prime}
              type="button"
              className={`chip rc-prime${active ? ' chip--active' : ''}${taken ? ' rc-prime--taken' : ''}`}
              disabled={taken}
              aria-pressed={active}
              title={taken ? 'Already used for the other prime' : `Use ${prime}`}
              onClick={() => onPick(prime)}
            >
              {prime}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ============================================================
 * Stage 1 graphics — the lock as a rectangle of N squares
 * ============================================================ */

const LOCK_W = 520
const LOCK_H = 340
const LOCK_PAD = 46

function LockRectangle({ p, q }: { p: number; q: number }) {
  const cols = Math.max(p, q)
  const rows = Math.min(p, q)
  const cell = Math.min((LOCK_W - LOCK_PAD * 2) / cols, (LOCK_H - LOCK_PAD * 2) / rows)
  const gridW = cell * cols
  const gridH = cell * rows
  const x0 = (LOCK_W - gridW) / 2
  const y0 = (LOCK_H - gridH) / 2
  const gap = cell > 6 ? 1 : 0.5

  const cells: ReactNode[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push(
        <rect
          key={`${r}-${c}`}
          x={x0 + c * cell + gap}
          y={y0 + r * cell + gap}
          width={cell - gap * 2}
          height={cell - gap * 2}
          className="rc-cell rc-cell--owner"
        />,
      )
    }
  }

  return (
    <svg viewBox={`0 0 ${LOCK_W} ${LOCK_H}`} className="rc-graph" role="img" aria-label={`${p} times ${q} rectangle of ${p * q} squares`}>
      <rect x={x0 - 4} y={y0 - 4} width={gridW + 8} height={gridH + 8} className="rc-lock-frame" />
      {cells}
      <text x={x0 + gridW / 2} y={y0 - 14} textAnchor="middle" className="rc-svg__dim">{cols} across</text>
      <text x={x0 - 12} y={y0 + gridH / 2 + 4} textAnchor="end" className="rc-svg__dim">{rows}</text>
      <text x={x0 - 12} y={y0 + gridH / 2 + 18} textAnchor="end" className="rc-svg__dim rc-svg__dim--sub">down</text>
      <text x={LOCK_W / 2} y={LOCK_H - 12} textAnchor="middle" className="rc-svg__label">
        {rows} × {cols} = {p * q} squares, folded neatly
      </text>
    </svg>
  )
}

function FoldAttempt({ N, width, p, q }: { N: number; width: number; p: number; q: number }) {
  const cols = clamp(width, 1, N)
  const rows = Math.ceil(N / cols)
  const remainder = N % cols
  const divides = remainder === 0
  const foundPrime = divides && (cols === p || cols === q || rows === p || rows === q)
  const cell = Math.min((LOCK_W - LOCK_PAD * 2) / cols, (LOCK_H - LOCK_PAD * 2) / rows)
  const gridW = cell * cols
  const gridH = cell * rows
  const x0 = (LOCK_W - gridW) / 2
  const y0 = (LOCK_H - gridH) / 2
  const gap = cell > 6 ? 1 : 0.5

  const cells: ReactNode[] = []
  for (let i = 0; i < N; i++) {
    const c = i % cols
    const r = Math.floor(i / cols)
    const ragged = !divides && r === rows - 1
    cells.push(
      <rect
        key={i}
        x={x0 + c * cell + gap}
        y={y0 + r * cell + gap}
        width={cell - gap * 2}
        height={cell - gap * 2}
        className={`rc-cell ${foundPrime ? 'rc-cell--found' : divides ? 'rc-cell--fits' : ragged ? 'rc-cell--ragged' : 'rc-cell--attacker'}`}
      />,
    )
  }

  let caption: string
  if (foundPrime) caption = `${cols} × ${rows} = ${N}. Both sides are prime — you just found the secret key!`
  else if (divides) caption = `${cols} × ${rows} = ${N}. It fits, but ${cols} is not prime — keep looking.`
  else caption = `${N} ÷ ${cols} = ${Math.floor(N / cols)} remainder ${remainder}. The last row does not fill.`

  return (
    <svg viewBox={`0 0 ${LOCK_W} ${LOCK_H}`} className="rc-graph" role="img" aria-label={caption}>
      {cells}
      <text x={x0 + gridW / 2} y={y0 - 14} textAnchor="middle" className="rc-svg__dim">{cols} across</text>
      <text x={x0 - 12} y={y0 + gridH / 2 + 4} textAnchor="end" className="rc-svg__dim">{rows}</text>
      <text x={x0 - 12} y={y0 + gridH / 2 + 18} textAnchor="end" className="rc-svg__dim rc-svg__dim--sub">down</text>
      <text x={LOCK_W / 2} y={LOCK_H - 12} textAnchor="middle" className={`rc-svg__label${foundPrime ? ' rc-svg__label--found' : ''}`}>
        {caption}
      </text>
    </svg>
  )
}

/* ============================================================
 * Stage 2 graphics — the remainder clock and the remainder signal
 * ============================================================ */

const CLOCK_SIZE = 360
const CLOCK_R = 138

function RemainderClock({ N, base, values, step, period, loopClosed }: { N: number; base: number; values: number[]; step: number; period: number | null; loopClosed: boolean }) {
  const cx = CLOCK_SIZE / 2
  const cy = CLOCK_SIZE / 2
  const shown = Math.min(step, values.length - 1)
  const points = values.slice(0, shown + 1).map(v => polar(cx, cy, CLOCK_R, v / N))
  const orbitPath = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ')
  const current = points[points.length - 1]
  const previous = points.length > 1 ? points[points.length - 2] : null
  const start = polar(cx, cy, CLOCK_R, 1 / N)
  const tickCount = N <= 96 ? N : 48
  const currentValue = values[shown]
  const labelOffset = polar(cx, cy, CLOCK_R + 22, currentValue / N)

  return (
    <svg viewBox={`0 0 ${CLOCK_SIZE} ${CLOCK_SIZE}`} className="rc-graph" role="img" aria-label={`Remainder clock. Step ${shown}: ${base} to the ${shown} leaves remainder ${currentValue} when divided by ${N}.`}>
      <circle cx={cx} cy={cy} r={CLOCK_R} className="rc-clock__ring" />
      {Array.from({ length: tickCount }, (_, i) => {
        const outer = polar(cx, cy, CLOCK_R, i / tickCount)
        const inner = polar(cx, cy, CLOCK_R - 6, i / tickCount)
        return <line key={i} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} className="rc-clock__tick" />
      })}
      {[0, 0.25, 0.5, 0.75].map(fraction => {
        const pos = polar(cx, cy, CLOCK_R + 16, fraction)
        const label = fraction === 0 ? '0' : Math.round(N * fraction)
        return (
          <text key={fraction} x={pos.x} y={pos.y + 4} textAnchor="middle" className="rc-svg__tick">{label}</text>
        )
      })}

      {points.length > 1 && <path d={orbitPath} className="rc-clock__orbit" />}
      {points.slice(0, -1).map((pt, i) => (
        <circle key={i} cx={pt.x} cy={pt.y} r={N > 400 ? 2.4 : 3.2} className="rc-clock__visited" />
      ))}

      <circle cx={start.x} cy={start.y} r="9" className="rc-clock__start" />
      <text x={start.x} y={start.y - 16} textAnchor="middle" className="rc-svg__note rc-svg__note--gold">1 · start</text>

      {previous && loopClosed && <line x1={previous.x} y1={previous.y} x2={current.x} y2={current.y} className="rc-clock__closing" />}

      <g style={{ transform: `translate(${current.x}px, ${current.y}px)`, transition: 'transform .18s ease-out' }}>
        <circle r="7.5" className="rc-clock__current" />
      </g>
      {shown > 0 && !loopClosed && (
        <text x={labelOffset.x} y={labelOffset.y + 4} textAnchor="middle" className="rc-svg__note rc-svg__note--red">{currentValue}</text>
      )}

      <text x={cx} y={cy - 10} textAnchor="middle" className="rc-clock__center-label">
        {loopClosed ? 'Loop closed!' : `step ${shown}`}
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" className={`rc-clock__center-value${loopClosed ? ' rc-clock__center-value--done' : ''}`}>
        {loopClosed && period !== null ? `period r = ${period}` : `remainder ${currentValue}`}
      </text>
    </svg>
  )
}

const SIGNAL_W = 760
const SIGNAL_H = 250
const SIGNAL_MARGIN = { top: 26, right: 22, bottom: 44, left: 50 }

function RemainderSignal({ N, values, step, period, loopClosed }: { N: number; values: number[]; step: number; period: number | null; loopClosed: boolean }) {
  const shown = Math.min(step, values.length - 1)
  const xMax = loopClosed && period !== null ? period * 2 : Math.max(24, Math.ceil(shown * 1.25) + 4)
  const plotW = SIGNAL_W - SIGNAL_MARGIN.left - SIGNAL_MARGIN.right
  const plotH = SIGNAL_H - SIGNAL_MARGIN.top - SIGNAL_MARGIN.bottom
  const mapX = (k: number) => SIGNAL_MARGIN.left + (k / xMax) * plotW
  const mapY = (v: number) => SIGNAL_MARGIN.top + plotH - (v / N) * plotH
  const baseY = mapY(0)

  const solid = values.slice(0, shown + 1)
  const ghost = loopClosed ? values.slice(shown, Math.min(values.length, xMax + 1)) : []
  const solidPath = solid.map((v, k) => `${k === 0 ? 'M' : 'L'} ${mapX(k).toFixed(1)} ${mapY(v).toFixed(1)}`).join(' ')
  const ghostPath = ghost.map((v, i) => `${i === 0 ? 'M' : 'L'} ${mapX(shown + i).toFixed(1)} ${mapY(v).toFixed(1)}`).join(' ')
  const showDots = xMax <= 160
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(N * f))
  const xTickStep = xMax <= 30 ? 5 : xMax <= 120 ? 20 : xMax <= 400 ? 50 : 200
  const xTicks = Array.from({ length: Math.floor(xMax / xTickStep) + 1 }, (_, i) => i * xTickStep)

  return (
    <svg viewBox={`0 0 ${SIGNAL_W} ${SIGNAL_H}`} className="rc-graph" role="img" aria-label="Remainders plotted against the step number">
      <rect x={SIGNAL_MARGIN.left} y={SIGNAL_MARGIN.top} width={plotW} height={plotH} className="rc-plot__backdrop" />
      {yTicks.map(v => (
        <g key={v}>
          <line x1={SIGNAL_MARGIN.left} y1={mapY(v)} x2={SIGNAL_MARGIN.left + plotW} y2={mapY(v)} className="rc-plot__grid" />
          <text x={SIGNAL_MARGIN.left - 8} y={mapY(v) + 4} textAnchor="end" className="rc-svg__tick">{v}</text>
        </g>
      ))}
      {xTicks.map(k => (
        <text key={k} x={mapX(k)} y={SIGNAL_H - 22} textAnchor="middle" className="rc-svg__tick">{k}</text>
      ))}
      <line x1={SIGNAL_MARGIN.left} y1={baseY} x2={SIGNAL_MARGIN.left + plotW} y2={baseY} className="rc-plot__axis" />
      <line x1={SIGNAL_MARGIN.left} y1={mapY(1)} x2={SIGNAL_MARGIN.left + plotW} y2={mapY(1)} className="rc-plot__one" />
      <text x={SIGNAL_MARGIN.left + plotW - 6} y={mapY(1) - 6} textAnchor="end" className="rc-svg__note rc-svg__note--gold">remainder 1</text>

      {ghost.length > 1 && <path d={ghostPath} className="rc-plot__ghost" />}
      {solid.length > 1 && <path d={solidPath} className="rc-plot__signal" />}
      {showDots && solid.map((v, k) => (
        <circle key={k} cx={mapX(k)} cy={mapY(v)} r={k === shown ? 5 : 3} className={k === shown ? 'rc-plot__dot rc-plot__dot--current' : 'rc-plot__dot'} />
      ))}
      {!showDots && <circle cx={mapX(shown)} cy={mapY(values[shown])} r="5" className="rc-plot__dot rc-plot__dot--current" />}

      {loopClosed && period !== null && (
        <g>
          <line x1={mapX(period)} y1={SIGNAL_MARGIN.top} x2={mapX(period)} y2={baseY} className="rc-plot__period-line" />
          <line x1={mapX(period * 2)} y1={SIGNAL_MARGIN.top} x2={mapX(period * 2)} y2={baseY} className="rc-plot__period-line" />
          <line x1={mapX(0)} y1={baseY + 14} x2={mapX(period)} y2={baseY + 14} className="rc-plot__bracket" />
          <line x1={mapX(0)} y1={baseY + 9} x2={mapX(0)} y2={baseY + 19} className="rc-plot__bracket" />
          <line x1={mapX(period)} y1={baseY + 9} x2={mapX(period)} y2={baseY + 19} className="rc-plot__bracket" />
          <text x={mapX(period / 2)} y={baseY + 32} textAnchor="middle" className="rc-svg__note rc-svg__note--red">one period · r = {period}</text>
          <text x={mapX(period * 1.5)} y={baseY + 32} textAnchor="middle" className="rc-svg__note">…and it repeats</text>
        </g>
      )}
      {!loopClosed && (
        <text x={SIGNAL_MARGIN.left + plotW / 2} y={SIGNAL_H - 4} textAnchor="middle" className="rc-svg__axis-label">step k</text>
      )}
    </svg>
  )
}

/* ============================================================
 * Stage 3 graphics — diffraction grating and the QFT screen
 * ============================================================ */

const GRATING_W = 760
const GRATING_H = 330
const GRATING_X0 = 40
const GRATING_X1 = 720

function GratingDiagram({ Q, spacing, k0, slits }: { Q: number; spacing: number; k0: number; slits: number }) {
  const span = GRATING_X1 - GRATING_X0
  const mapK = (k: number) => GRATING_X0 + (k / Math.max(1, Q - 1)) * span
  const mapTheta = (theta: number) => GRATING_X0 + theta * span
  const slitPositions = Array.from({ length: slits }, (_, j) => k0 + j * spacing)
  const slitWidth = Math.max(2, span / Q)

  const curveTop = 132
  const curveBase = 214
  const samples = 681
  const curve = Array.from({ length: samples }, (_, i) => {
    const theta = i / (samples - 1)
    const intensity = combIntensity(theta, slits, spacing)
    return `${i === 0 ? 'M' : 'L'} ${mapTheta(theta).toFixed(1)} ${(curveBase - intensity * (curveBase - curveTop)).toFixed(1)}`
  }).join(' ')
  const area = `${curve} L ${GRATING_X1} ${curveBase} L ${GRATING_X0} ${curveBase} Z`

  const screenTop = 228
  const screenH = 30
  const pixels = 340
  const fringeSpacingPx = span / spacing
  const showBracket = fringeSpacingPx >= 34
  const showWaves = slits <= 10

  return (
    <svg viewBox={`0 0 ${GRATING_W} ${GRATING_H}`} className="rc-graph" role="img" aria-label={`Grating with ${slits} slits spaced ${spacing} apart producing fringes spaced one over ${spacing} apart`}>
      {/* register ruler */}
      <text x={GRATING_X0} y={22} className="rc-svg__note">k = 0</text>
      <text x={GRATING_X1} y={22} textAnchor="end" className="rc-svg__note">k = Q − 1 = {Q - 1}</text>
      <rect x={GRATING_X0} y={30} width={span} height={16} className="rc-grating__bar" />
      {slitPositions.map(k => (
        <rect key={k} x={mapK(k) - slitWidth / 2} y={28} width={slitWidth} height={20} className="rc-grating__slit" />
      ))}
      <text x={GRATING_W / 2} y={64} textAnchor="middle" className="rc-svg__label">
        {slits} open slits · one every r = {spacing} steps (k = {k0}, {k0 + spacing}, {k0 + spacing * 2}, …)
      </text>

      {/* wavefronts */}
      {showWaves && slitPositions.map(k => (
        <g key={`w-${k}`}>
          {[14, 28, 42].map(radius => (
            <path
              key={radius}
              d={`M ${(mapK(k) - radius).toFixed(1)} 48 A ${radius} ${radius} 0 0 0 ${(mapK(k) + radius).toFixed(1)} 48`}
              className="rc-grating__wave"
            />
          ))}
        </g>
      ))}
      {!showWaves && (
        <text x={GRATING_W / 2} y={96} textAnchor="middle" className="rc-svg__note">
          waves from all {slits} slits overlap on the screen below — more slits, sharper fringes
        </text>
      )}

      {/* intensity curve */}
      <line x1={GRATING_X0} y1={curveBase} x2={GRATING_X1} y2={curveBase} className="rc-plot__axis" />
      <path d={area} className="rc-grating__area" />
      <path d={curve} className="rc-grating__curve" />
      <text x={GRATING_X0 - 6} y={curveTop + 4} textAnchor="end" className="rc-svg__tick">bright</text>
      <text x={GRATING_X0 - 6} y={curveBase + 4} textAnchor="end" className="rc-svg__tick">dark</text>

      {/* screen */}
      <rect x={GRATING_X0} y={screenTop} width={span} height={screenH} className="rc-grating__screen" />
      {Array.from({ length: pixels }, (_, i) => {
        const theta = (i + 0.5) / pixels
        const intensity = combIntensity(theta, slits, spacing)
        if (intensity < 0.02) return null
        return (
          <rect
            key={i}
            x={mapTheta(i / pixels)}
            y={screenTop}
            width={span / pixels + 0.6}
            height={screenH}
            className="rc-grating__pixel"
            style={{ opacity: Math.min(1, intensity) }}
          />
        )
      })}
      {Array.from({ length: spacing }, (_, m) => (
        <line key={m} x1={mapTheta(m / spacing)} y1={screenTop + screenH} x2={mapTheta(m / spacing)} y2={screenTop + screenH + 6} className="rc-grating__fringe-tick" />
      ))}
      {showBracket && (
        <g>
          <line x1={mapTheta(0)} y1={screenTop + screenH + 14} x2={mapTheta(1 / spacing)} y2={screenTop + screenH + 14} className="rc-plot__bracket" />
          <line x1={mapTheta(0)} y1={screenTop + screenH + 9} x2={mapTheta(0)} y2={screenTop + screenH + 19} className="rc-plot__bracket" />
          <line x1={mapTheta(1 / spacing)} y1={screenTop + screenH + 9} x2={mapTheta(1 / spacing)} y2={screenTop + screenH + 19} className="rc-plot__bracket" />
          <text x={mapTheta(0.5 / spacing) + 6} y={screenTop + screenH + 34} className="rc-svg__note rc-svg__note--red">1/r</text>
        </g>
      )}
      <text x={GRATING_X1} y={screenTop + screenH + 34} textAnchor="end" className="rc-svg__note rc-svg__note--red">
        bright fringes every 1/r = 1/{spacing} of the screen
      </text>
      <text x={GRATING_X0} y={screenTop + screenH + 34} className="rc-svg__note">screen</text>
    </svg>
  )
}

const QFT_W = 760
const QFT_H = 240
const QFT_MARGIN = { top: 22, right: 22, bottom: 44, left: 50 }

function QftSpectrum({ probs, Q, spacing, measurements }: { probs: number[]; Q: number; spacing: number; measurements: number[] }) {
  const plotW = QFT_W - QFT_MARGIN.left - QFT_MARGIN.right
  const plotH = QFT_H - QFT_MARGIN.top - QFT_MARGIN.bottom
  const maxProb = Math.max(...probs, 1e-9)
  const mapX = (c: number) => QFT_MARGIN.left + (c / Math.max(1, Q - 1)) * plotW
  const mapY = (p: number) => QFT_MARGIN.top + plotH - (p / maxProb) * plotH
  const baseY = mapY(0)
  const path = probs.map((p, c) => `${c === 0 ? 'M' : 'L'} ${mapX(c).toFixed(1)} ${mapY(p).toFixed(1)}`).join(' ')
  const area = `${path} L ${mapX(Q - 1).toFixed(1)} ${baseY} L ${mapX(0).toFixed(1)} ${baseY} Z`
  const expectedPeaks = Array.from({ length: spacing }, (_, m) => (m * Q) / spacing)
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round((Q - 1) * f))

  const counts = new Map<number, number>()
  const stacked = measurements.map(c => {
    const n = counts.get(c) ?? 0
    counts.set(c, n + 1)
    return { c, level: n }
  })

  return (
    <svg viewBox={`0 0 ${QFT_W} ${QFT_H}`} className="rc-graph" role="img" aria-label="Probability of each measurement outcome after the quantum Fourier transform">
      <rect x={QFT_MARGIN.left} y={QFT_MARGIN.top} width={plotW} height={plotH} className="rc-plot__backdrop" />
      {expectedPeaks.map((c, m) => (
        <line key={m} x1={mapX(c)} y1={QFT_MARGIN.top} x2={mapX(c)} y2={baseY} className="rc-qft__expected" />
      ))}
      <path d={area} className="rc-qft__area" />
      <path d={path} className="rc-qft__curve" />
      <line x1={QFT_MARGIN.left} y1={baseY} x2={QFT_MARGIN.left + plotW} y2={baseY} className="rc-plot__axis" />
      {xTicks.map(c => (
        <text key={c} x={mapX(c)} y={QFT_H - 22} textAnchor="middle" className="rc-svg__tick">{c}</text>
      ))}
      <text x={QFT_MARGIN.left - 8} y={QFT_MARGIN.top + 6} textAnchor="end" className="rc-svg__tick">likely</text>
      <text x={QFT_MARGIN.left - 8} y={baseY + 4} textAnchor="end" className="rc-svg__tick">0</text>
      <text x={QFT_MARGIN.left + plotW / 2} y={QFT_H - 4} textAnchor="middle" className="rc-svg__axis-label">measured value c (0 … Q − 1)</text>
      <text x={QFT_MARGIN.left + plotW} y={QFT_MARGIN.top - 8} textAnchor="end" className="rc-svg__note rc-svg__note--gold">
        expected bright spots: every Q/r ≈ {(Q / spacing).toFixed(1)} pixels
      </text>
      {stacked.map(({ c, level }, i) => (
        <circle key={i} cx={mapX(c)} cy={baseY - 6 - level * 11} r="5" className="rc-qft__measurement" />
      ))}
    </svg>
  )
}

/* ============================================================
 * Page
 * ============================================================ */

export default function RsaCrackerExplorer() {
  const [stage, setStage] = useState<Stage>(1)

  // Stage 1 — the lock
  const [mode, setMode] = useState<LockMode>('primes')
  const [p, setP] = useState(19)
  const [q, setQ] = useState(23)
  const [typedN, setTypedN] = useState('437')
  const [message, setMessage] = useState(42)
  const [view, setView] = useState<LockView>('owner')
  const [foldWidth, setFoldWidth] = useState(20)

  // Stage 2 — period finding
  const [base, setBase] = useState(7)
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(8)
  const [halfGuess, setHalfGuess] = useState('')
  const [halfChecked, setHalfChecked] = useState(false)
  const [cracked, setCracked] = useState(false)

  // Stage 3 — quantum readout
  const [qubits, setQubits] = useState(DEFAULT_QUBITS)
  const [k0, setK0] = useState(0)
  const [measurements, setMeasurements] = useState<number[]>([])

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Cracking RSA — Period Finding · Class Resources'
    return () => {
      document.title = previousTitle
    }
  }, [])

  /* ----- derived: the key ----- */
  const N = p * q
  const phi = (p - 1) * (q - 1)
  const e = pickPublicExponent(phi)
  const d = modInverse(e, phi) ?? 0
  const m = clamp(message, 2, N - 1)
  const cipher = modPow(m, e, N)
  const decrypted = modPow(cipher, d, N)
  const sqrtN = Math.sqrt(N)
  const foldMax = Math.min(80, N - 1)
  const typedCheck = useMemo(() => checkLockNumber(Number(typedN)), [typedN])

  /* ----- derived: the period ----- */
  const baseValid = Number.isInteger(base) && base >= 2 && base < N
  const baseGcd = baseValid ? gcd(base, N) : 0
  const period = useMemo(() => (baseValid && baseGcd === 1 ? multiplicativeOrder(base, N) : null), [base, N, baseValid, baseGcd])
  const orbitLength = period !== null ? period * 2 + 1 : Math.min(N, 240)
  const values = useMemo(() => orbitValues(base, N, orbitLength), [base, N, orbitLength])
  const shownStep = Math.min(step, values.length - 1)
  const currentValue = values[shownStep]
  const loopClosed = period !== null && step >= period
  const half = period !== null && period % 2 === 0 ? period / 2 : null
  const halfPower = half !== null ? modPow(base, half, N) : null
  const trivialSplit = halfPower !== null && halfPower === N - 1
  const factorA = halfPower !== null ? gcd(halfPower - 1, N) : null
  const factorB = halfPower !== null ? gcd(halfPower + 1, N) : null
  const bigPower = useMemo(() => (period !== null ? bigPowerString(base, period) : ''), [base, period])
  const halfCorrect = half !== null && Number(halfGuess) === half

  /* ----- derived: the quantum readout ----- */
  const Q = 2 ** qubits
  const k0Safe = period !== null ? Math.min(k0, period - 1) : 0
  const spectrum = useMemo(() => (period !== null ? qftDistribution(Q, period, k0Safe) : null), [Q, period, k0Safe])
  const realQubits = Math.ceil(Math.log2(N * N))

  const readings = useMemo(() => {
    if (period === null) return []
    return measurements.map(c => {
      const fraction = nearestFraction(c, Q, N)
      const candidate = fraction.den
      const uninformative = candidate <= 1
      const verified = !uninformative && modPow(base, candidate, N) === 1
      const partial = !verified && !uninformative && period % candidate === 0
      return { c, fraction, candidate, verified, partial, uninformative }
    })
  }, [measurements, period, Q, N, base])

  const combined = useMemo(() => {
    const useful = readings.filter(r => r.verified || r.partial).map(r => r.candidate)
    if (useful.length === 0) return null
    const value = useful.reduce((acc, v) => lcm(acc, v), 1)
    return { value, verified: modPow(base, value, N) === 1 }
  }, [readings, base, N])

  /* ----- playback ----- */
  useEffect(() => {
    if (!playing || period === null) return
    const id = window.setInterval(() => {
      setStep(current => (current >= period ? current : current + 1))
    }, Math.max(25, 1000 / speed))
    return () => window.clearInterval(id)
  }, [playing, speed, period])

  useEffect(() => {
    if (playing && (period === null || step >= period)) setPlaying(false)
  }, [playing, period, step])

  /* ----- handlers ----- */
  const resetWalk = () => {
    setStep(0)
    setPlaying(false)
    setHalfGuess('')
    setHalfChecked(false)
    setCracked(false)
  }

  const resetCracking = () => {
    resetWalk()
    setMeasurements([])
    setK0(0)
  }

  const applyLock = (nextP: number, nextQ: number) => {
    const lo = Math.min(nextP, nextQ)
    const hi = Math.max(nextP, nextQ)
    setP(lo)
    setQ(hi)
    if (base >= lo * hi) setBase(2)
    if (foldWidth >= lo * hi) setFoldWidth(2)
    resetCracking()
  }

  const pickPrime = (slot: 'p' | 'q', prime: number) => {
    if (slot === 'p') {
      if (prime === q) return
      applyLock(prime, q)
    } else {
      if (prime === p) return
      applyLock(p, prime)
    }
  }

  const handleTypedN = (text: string) => {
    setTypedN(text)
    const check = checkLockNumber(Number(text))
    if (check.ok && check.p * check.q !== N) applyLock(check.p, check.q)
  }

  const switchMode = (next: LockMode) => {
    setMode(next)
    if (next === 'number') setTypedN(String(N))
  }

  const handleBase = (value: number) => {
    setBase(value)
    resetCracking()
  }

  const randomBase = () => {
    for (let tries = 0; tries < 60; tries++) {
      const candidate = 2 + Math.floor(Math.random() * (N - 2))
      if (candidate !== base && gcd(candidate, N) === 1) {
        handleBase(candidate)
        return
      }
    }
  }

  const stepOnce = () => {
    setPlaying(false)
    if (period !== null && step < period) setStep(step + 1)
  }

  const fastForward = () => {
    if (period === null) return
    setPlaying(false)
    setStep(period)
  }

  const measure = (count: number) => {
    if (!spectrum) return
    const next: number[] = []
    for (let i = 0; i < count; i++) next.push(sampleIndex(spectrum.probs))
    setMeasurements(prev => [...prev, ...next].slice(-MAX_MEASUREMENTS))
  }

  const stageDone: Record<Stage, boolean> = { 1: true, 2: cracked, 3: combined?.verified ?? false }

  /* ============================================================ */

  return (
    <main className="page rc-page">
      <div className="container container--wide">
        <section className="panel rc-hero">
          <div className="eyebrow">Computer Science Explorer</div>
          <div className="rc-hero__row">
            <div className="rc-hero__copy">
              <h1 className="h2 rc-hero__title">Cracking RSA — Period Finding &amp; Quantum Interference</h1>
              <p className="lead rc-hero__lead">
                Build a miniature RSA lock, watch the powers of a random number loop back to 1, and see how that loop
                exposes the hidden primes. Then watch a quantum computer find the same loop as an interference pattern.
              </p>
            </div>
          </div>
        </section>

        <nav className="rc-stepper" aria-label="Stages">
          {STAGES.map(s => (
            <button
              key={s.id}
              type="button"
              className={`rc-stage${stage === s.id ? ' rc-stage--active' : ''}${stageDone[s.id] && stage !== s.id ? ' rc-stage--done' : ''}`}
              aria-current={stage === s.id ? 'step' : undefined}
              onClick={() => setStage(s.id)}
            >
              <span className="rc-stage__num">{s.id}</span>
              <span className="rc-stage__text">
                <span className="rc-stage__label">{s.label}</span>
                <span className="rc-stage__hint">{s.hint}</span>
              </span>
            </button>
          ))}
        </nav>

        <div className="rc-state-strip" aria-live="polite">
          <span className="chip chip--gold">N = {N}</span>
          <span className="chip">a = {baseValid ? base : '?'}</span>
          <span className={`chip${loopClosed ? ' chip--active' : ''}`}>r = {loopClosed && period !== null ? period : '?'}</span>
          <span className={`chip${cracked ? ' chip--active' : ''}`}>p × q = {cracked && factorA !== null && factorB !== null ? `${Math.min(factorA, factorB)} × ${Math.max(factorA, factorB)}` : '? × ?'}</span>
        </div>

        {/* ============================================================
         * STAGE 1 — BUILD THE LOCK
         * ============================================================ */}
        {stage === 1 && (
          <WidgetShell
            className="rc-shell"
            controls={
              <>
                <div className="panel rc-side-panel">
                  <PanelHead>Build the lock</PanelHead>
                  <div className="segment-group rc-segments" role="group" aria-label="How to choose N">
                    <button type="button" className={`segment${mode === 'primes' ? ' active' : ''}`} onClick={() => switchMode('primes')}>Pick two primes</button>
                    <button type="button" className={`segment${mode === 'number' ? ' active' : ''}`} onClick={() => switchMode('number')}>Type N</button>
                  </div>

                  {mode === 'primes' ? (
                    <>
                      <PrimePicker id="rc-pick-p" label="First secret prime p" value={p} other={q} onPick={prime => pickPrime('p', prime)} />
                      <PrimePicker id="rc-pick-q" label="Second secret prime q" value={q} other={p} onPick={prime => pickPrime('q', prime)} />
                    </>
                  ) : (
                    <div className="field">
                      <label className="label" htmlFor="rc-typed-n">Public number N</label>
                      <input
                        id="rc-typed-n"
                        className={`input${typedCheck.ok ? '' : ' is-invalid'}`}
                        type="number"
                        inputMode="numeric"
                        min={MIN_N}
                        max={MAX_N}
                        value={typedN}
                        onChange={ev => handleTypedN(ev.target.value)}
                      />
                      {typedCheck.ok
                        ? <p className="valid-text">{typedCheck.p * typedCheck.q} = {typedCheck.p} × {typedCheck.q}. A proper miniature RSA key.</p>
                        : <p className="error-text">{typedCheck.reason}</p>}
                    </div>
                  )}

                  <div className="field">
                    <label className="label" htmlFor="rc-message">Message m (a number below N)</label>
                    <input
                      id="rc-message"
                      className="input"
                      type="number"
                      inputMode="numeric"
                      min={2}
                      max={N - 1}
                      value={m}
                      onChange={ev => setMessage(Number(ev.target.value))}
                    />
                    <p className="helper-text">Real messages get turned into numbers first, then encrypted a block at a time.</p>
                  </div>
                </div>
              </>
            }
            info={
              <>
                <div className="panel rc-side-panel">
                  <PanelHead>Key snapshot</PanelHead>
                  <MetricsDisplay
                    className="rc-metrics"
                    metrics={[
                      { label: 'N · public', value: N, note: 'p × q' },
                      { label: 'e · public', value: e, note: 'encrypt exponent' },
                      { label: 'p · secret', value: p },
                      { label: 'q · secret', value: q },
                      { label: 'φ(N) · secret', value: phi, note: '(p−1)(q−1)' },
                      { label: 'd · secret', value: d, note: 'decrypt exponent' },
                    ]}
                  />
                </div>
                <div className="panel rc-side-panel">
                  <PanelHead>Public vs secret</PanelHead>
                  <div className="legend-key rc-legend rc-legend--stack">
                    <div className="legend-key__item"><span className="legend-key__dot" style={{ background: 'var(--hw-gold)' }} />Public: N and e. Printed on every website certificate.</div>
                    <div className="legend-key__item"><span className="legend-key__dot" style={{ background: 'var(--hw-red)' }} />Secret: p, q, φ(N), d. Never leave the key-holder.</div>
                  </div>
                  <p className="rc-side-text">
                    The attacker knows N. If they could split it into p and q they could compute d themselves and read
                    every message. Cracking RSA is factoring N.
                  </p>
                </div>
                <button type="button" className="btn btn--block btn--caps" onClick={() => setStage(2)}>Next: find the period →</button>
              </>
            }
          >
            <section className="panel rc-viz-panel">
              <div className="rc-viz-head">
                <div className="eyebrow">
                  {view === 'owner' ? 'Owner’s view · N is a p × q rectangle' : 'Attacker’s view · fold N back into a rectangle'}
                </div>
                <div className="segment-group" role="group" aria-label="Choose a view">
                  <button type="button" className={`segment${view === 'owner' ? ' active' : ''}`} onClick={() => setView('owner')}>Owner</button>
                  <button type="button" className={`segment${view === 'attacker' ? ' active' : ''}`} onClick={() => setView('attacker')}>Attacker</button>
                </div>
              </div>

              <div className="rc-graph-shell">
                {view === 'owner' ? <LockRectangle p={p} q={q} /> : <FoldAttempt N={N} width={foldWidth} p={p} q={q} />}
              </div>

              {view === 'attacker' ? (
                <div className="rc-fold-controls">
                  <div className="rc-control__row">
                    <label className="label" htmlFor="rc-fold">Try a row width</label>
                    <code className="rc-control__value">{foldWidth}</code>
                  </div>
                  <input id="rc-fold" type="range" className="range" min={2} max={foldMax} value={clamp(foldWidth, 2, foldMax)} onChange={ev => setFoldWidth(Number(ev.target.value))} />
                  <p className="helper-text">
                    This is trial division: try every width up to √N ≈ {sqrtN.toFixed(1)} and see which one folds the pile with no leftovers.
                    A real RSA number has about 617 digits, so there are more widths to try than atoms in the universe.
                  </p>
                </div>
              ) : (
                <div className="callout callout--info rc-callout">
                  You built the lock, so you know the rectangle is {Math.min(p, q)} × {Math.max(p, q)}. Everyone else is handed
                  a pile of {N} squares and told nothing about its shape. Switch to the attacker’s view to feel the difference.
                </div>
              )}
            </section>

            <section className="panel rc-viz-panel">
              <PanelHead>Where N sits in RSA</PanelHead>
              <div className="rc-equations">
                <EquationRow label="Secret primes" tag="secret">
                  p = {p}, q = {q}
                </EquationRow>
                <EquationRow label="Public modulus" tag="public" note="This is the number an attacker has to factor.">
                  N = p × q = {p} × {q} = <strong>{N}</strong>
                </EquationRow>
                <EquationRow label="Public exponent" tag="public" note={<>Any number that shares no factor with φ(N) = (p − 1)(q − 1) = {phi}. Picking it needs the secret primes.</>}>
                  e = {e}
                </EquationRow>
                <EquationRow label="Private exponent" tag="secret" note="Undoes e. Only computable from φ(N), so only from p and q.">
                  d = e<sup>−1</sup> mod φ(N) = {d}
                </EquationRow>
                <EquationRow label="Encrypt" tag="anyone" note="Uses only the public key.">
                  c = <Pow base="m" exp="e" /> mod N = <Pow base={m} exp={e} /> mod {N} = <strong>{cipher}</strong>
                </EquationRow>
                <EquationRow label="Decrypt" tag="secret" note={decrypted === m ? 'Round trip works: the original message comes back.' : 'Round trip failed — check the key.'}>
                  m = <Pow base="c" exp="d" /> mod N = <Pow base={cipher} exp={d} /> mod {N} = <strong>{decrypted}</strong>
                </EquationRow>
              </div>
            </section>
          </WidgetShell>
        )}

        {/* ============================================================
         * STAGE 2 — FIND THE PERIOD
         * ============================================================ */}
        {stage === 2 && (
          <WidgetShell
            className="rc-shell"
            controls={
              <>
                <div className="panel rc-side-panel">
                  <PanelHead>Random starting number</PanelHead>
                  <div className="field">
                    <label className="label" htmlFor="rc-base">Starting number a</label>
                    <div className="op-field__row">
                      <input
                        id="rc-base"
                        className={`input${baseValid ? '' : ' is-invalid'}`}
                        type="number"
                        inputMode="numeric"
                        min={2}
                        max={N - 1}
                        value={base}
                        onChange={ev => handleBase(Number(ev.target.value))}
                      />
                      <button type="button" className="btn op-field__btn" onClick={randomBase}>Random</button>
                    </div>
                    <p className="helper-text">Any number from 2 to {N - 1}. We will multiply by it again and again, keeping only the remainder mod {N}.</p>
                  </div>
                  {!baseValid && <div className="callout callout--error">Pick a whole number from 2 to {N - 1}.</div>}
                  {baseValid && baseGcd !== 1 && (
                    <div className="callout">
                      <div className="callout__title">Lucky guess!</div>
                      gcd({base}, {N}) = {baseGcd}, so {baseGcd} is already one of the secret primes. That almost never happens with real keys.
                      Pick another a to see the trick that always works.
                    </div>
                  )}
                </div>

                <div className="panel rc-side-panel">
                  <PanelHead>Walk the powers</PanelHead>
                  <div className="rc-btn-row">
                    <button type="button" className="btn" disabled={period === null || loopClosed} onClick={stepOnce}>Step</button>
                    <button type="button" className="btn btn--outline" disabled={period === null || loopClosed} onClick={() => setPlaying(v => !v)}>
                      {playing ? 'Pause' : 'Play'}
                    </button>
                  </div>
                  <button type="button" className="btn btn--block btn--caps" disabled={period === null || loopClosed} onClick={fastForward}>
                    Fast-forward to the loop ⏩
                  </button>
                  <button type="button" className="btn btn--ghost btn--block" onClick={resetWalk}>Reset walk</button>
                  <div className="field">
                    <div className="rc-control__row">
                      <label className="label" htmlFor="rc-speed">Play speed</label>
                      <code className="rc-control__value">{speed} steps/s</code>
                    </div>
                    <input id="rc-speed" type="range" className="range" min={1} max={30} value={speed} onChange={ev => setSpeed(Number(ev.target.value))} />
                  </div>
                </div>
              </>
            }
            info={
              <>
                <div className="panel rc-side-panel">
                  <PanelHead>Snapshot</PanelHead>
                  <MetricsDisplay
                    className="rc-metrics"
                    metrics={[
                      { label: 'N', value: N },
                      { label: 'base a', value: baseValid ? base : '—' },
                      { label: 'step k', value: shownStep },
                      { label: 'remainder', value: baseValid ? currentValue : '—', note: `${base}^${shownStep} mod ${N}` },
                      { label: 'period r', value: loopClosed && period !== null ? period : '?', note: loopClosed ? 'loop closed' : 'keep walking' },
                    ]}
                  />
                </div>
                <div className="panel rc-side-panel">
                  <PanelHead>Why the loop must exist</PanelHead>
                  <p className="rc-side-text">
                    A remainder mod {N} can only be one of {N} values, so the dot on the clock can only land in {N} places.
                    Sooner or later it must revisit one, and because multiplying by a can be undone, the first revisit is
                    always the starting point 1. The number of steps that takes is the <strong>period</strong>.
                  </p>
                  <p className="rc-side-text">
                    For a real key the period has hundreds of digits. A classical computer has to take the steps one at a time.
                    Stage 3 is the shortcut.
                  </p>
                </div>
                <button type="button" className="btn btn--block btn--caps" onClick={() => setStage(3)}>Next: quantum shortcut →</button>
              </>
            }
          >
            <section className="panel rc-viz-panel">
              <div className="rc-viz-head">
                <div className="eyebrow">Powers of {baseValid ? base : 'a'} · remainders mod {N}</div>
                <span className={`badge ${loopClosed ? 'badge--accent' : 'badge--neutral'}`}>
                  {loopClosed && period !== null ? `Loop closed · period r = ${period}` : `Step k = ${shownStep}`}
                </span>
              </div>

              <div className="rc-viz-grid">
                <div className="rc-graph-shell rc-graph-shell--clock">
                  <RemainderClock N={N} base={base} values={values} step={step} period={period} loopClosed={loopClosed} />
                </div>
                <div className="rc-viz-side">
                  <div className="rc-current">
                    <span className="rc-current__eq">
                      <Pow base={baseValid ? base : 'a'} exp={shownStep} /> mod {N} = <strong>{baseValid ? currentValue : '—'}</strong>
                    </span>
                    {period !== null && (
                      <span className="helper-text">
                        {loopClosed
                          ? `The remainder is back to 1 after ${period} steps, so the whole pattern now repeats every ${period} steps.`
                          : shownStep === 0
                            ? 'Every power starts at 1. Press Step to multiply by a.'
                            : shownStep < 8
                              ? 'Watch for the moment the remainder is exactly 1 — that is when the pattern loops back to the beginning.'
                              : `Doing ${N} divisions by hand would take a while, so feel free to fast-forward ⏩.`}
                      </span>
                    )}
                  </div>
                  <div className="legend-key rc-legend rc-legend--stack">
                    <div className="legend-key__item"><span className="legend-key__dot rc-dot--gold" />1 · the start</div>
                    <div className="legend-key__item"><span className="legend-key__dot rc-dot--red" />current remainder</div>
                    <div className="legend-key__item"><span className="legend-key__dot rc-dot--visited" />earlier remainders</div>
                    <div className="legend-key__item"><span className="rc-legend__line rc-legend__line--ghost" />the pattern repeating</div>
                  </div>
                </div>
              </div>

              <div className="rc-graph-shell">
                <RemainderSignal N={N} values={values} step={step} period={period} loopClosed={loopClosed} />
              </div>
            </section>

            {loopClosed && period !== null && (
              <section className="panel rc-viz-panel rc-trick">
                <PanelHead badge={<span className="badge badge--accent">The trick that breaks the lock</span>}>Turn the period into the primes</PanelHead>

                <div className="step-cards rc-steps">
                  <div className="step-card">
                    <span className="step-card__num">1</span>
                    <div>
                      <p className="step-card__title">The period is {period}, so <Pow base={base} exp={period} /> leaves remainder 1.</p>
                      <p className="step-card__body">
                        <Pow base={base} exp={period} /> = {bigPower}. Subtract 1 and the result must be an exact, clean multiple of {N}:
                        {' '}<Pow base={base} exp={period} /> − 1 = (a multiple of {N}).
                      </p>
                    </div>
                  </div>

                  <div className="step-card">
                    <span className="step-card__num">2</span>
                    <div>
                      <p className="step-card__title">Split it with the difference of squares: x² − 1 = (x − 1)(x + 1).</p>
                      {half === null ? (
                        <>
                          <p className="step-card__body">
                            To use the rule we need <Pow base={base} exp={period} /> written as something squared, so the period has to be even.
                            {' '}{period} is odd, so this a is a dud. Shor’s algorithm just picks a fresh starting number and tries again.
                          </p>
                          <button type="button" className="btn btn--sm rc-inline-btn" onClick={randomBase}>Try a different a</button>
                        </>
                      ) : (
                        <>
                          <p className="step-card__body">
                            First rewrite <Pow base={base} exp={period} /> as “something squared”. What exponent goes in the blank?
                          </p>
                          <div className="rc-blank">
                            <span className="rc-blank__math">
                              <Pow base={base} exp={period} /> = ( {base}
                              <input
                                className={`rc-blank__input${halfChecked ? (halfCorrect ? ' is-valid' : ' is-invalid') : ''}`}
                                type="number"
                                inputMode="numeric"
                                placeholder="?"
                                aria-label="Exponent that goes in the blank"
                                value={halfGuess}
                                onChange={ev => { setHalfGuess(ev.target.value); setHalfChecked(false) }}
                                onKeyDown={ev => { if (ev.key === 'Enter') setHalfChecked(true) }}
                              />
                              {' '})<sup>2</sup>
                            </span>
                            <button type="button" className="btn btn--sm" onClick={() => setHalfChecked(true)}>Check</button>
                            <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setHalfGuess(String(half)); setHalfChecked(true) }}>Show me</button>
                          </div>
                          {halfChecked && (
                            halfCorrect ? (
                              <p className="valid-text">
                                Yes: squaring doubles an exponent, so ({base}<sup>{half}</sup>)² = {base}<sup>{period}</sup>. Now the rule gives
                                {' '}<Pow base={base} exp={period} /> − 1 = (<Pow base={base} exp={half} /> − 1)(<Pow base={base} exp={half} /> + 1).
                              </p>
                            ) : (
                              <p className="error-text">Not quite. Squaring doubles the exponent, so you want half of {period}.</p>
                            )
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {half !== null && halfCorrect && halfPower !== null && factorA !== null && factorB !== null && (
                    <>
                      <div className="step-card">
                        <span className="step-card__num">3</span>
                        <div>
                          <p className="step-card__title">Shrink the two pieces back onto the clock.</p>
                          <p className="step-card__body">
                            <Pow base={base} exp={half} /> mod {N} = <strong>{halfPower}</strong>, so the two pieces sit at
                            {' '}{halfPower} − 1 = <strong>{halfPower - 1}</strong> and {halfPower} + 1 = <strong>{halfPower + 1}</strong> on the clock.
                            Their product is a multiple of {N}, yet neither piece is a multiple of {N} on its own.
                          </p>
                        </div>
                      </div>

                      <div className="step-card step-card--gold">
                        <span className="step-card__num">4</span>
                        <div>
                          <p className="step-card__title">So {N}’s primes must be split between the two pieces. Ask gcd which went where.</p>
                          {trivialSplit ? (
                            <>
                              <p className="step-card__body">
                                Unlucky: <Pow base={base} exp={half} /> ≡ −1 (mod {N}), so the “+1” piece is itself a multiple of {N} and the split tells us
                                nothing. This happens to fewer than half of all starting numbers. Shor’s algorithm simply picks another a.
                              </p>
                              <button type="button" className="btn btn--sm rc-inline-btn" onClick={randomBase}>Try a different a</button>
                            </>
                          ) : (
                            <>
                              {!cracked ? (
                                <button type="button" className="btn btn--caps rc-inline-btn" onClick={() => setCracked(true)}>Crack the lock 🔓</button>
                              ) : (
                                <div className="rc-crack">
                                  <div className="rc-crack__row">
                                    <code>gcd({halfPower - 1}, {N})</code><span className="rc-crack__eq">=</span><strong className="rc-crack__factor">{factorA}</strong>
                                  </div>
                                  <div className="rc-crack__row">
                                    <code>gcd({halfPower + 1}, {N})</code><span className="rc-crack__eq">=</span><strong className="rc-crack__factor">{factorB}</strong>
                                  </div>
                                  <p className="valid-text rc-crack__note">
                                    {N} = {Math.min(factorA, factorB)} × {Math.max(factorA, factorB)}. These are the secret primes from stage 1, recovered
                                    from nothing but the public N and the period of a random number. With p and q an attacker computes d and reads every message.
                                  </p>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="callout callout--info rc-callout">
                  <div className="callout__title">What just happened</div>
                  Factoring {N} was turned into a different problem: finding the period of the sequence {base}, {base}², {base}³, … mod {N}.
                  For a toy key we can walk the whole loop. For a real key the loop is astronomically long — which is exactly the job a quantum computer is good at.
                </div>
              </section>
            )}
          </WidgetShell>
        )}

        {/* ============================================================
         * STAGE 3 — QUANTUM INTERFEROMETER
         * ============================================================ */}
        {stage === 3 && (
          period === null || spectrum === null ? (
            <div className="panel rc-viz-panel">
              <div className="callout callout--error">
                Stage 3 needs a starting number a that shares no factor with N. Go back to stage 2 and pick one.
              </div>
              <button type="button" className="btn rc-inline-btn" onClick={() => setStage(2)}>← Back to stage 2</button>
            </div>
          ) : (
            <WidgetShell
              className="rc-shell"
              controls={
                <>
                  <div className="panel rc-side-panel">
                    <PanelHead>Quantum register</PanelHead>
                    <div className="field">
                      <div className="rc-control__row">
                        <label className="label" htmlFor="rc-qubits">Exponent register</label>
                        <code className="rc-control__value">n = {qubits} qubits</code>
                      </div>
                      <input id="rc-qubits" type="range" className="range" min={MIN_QUBITS} max={MAX_QUBITS} value={qubits} onChange={ev => { setQubits(Number(ev.target.value)); setMeasurements([]) }} />
                      <p className="helper-text">
                        Holds Q = 2<sup>{qubits}</sup> = {Q} exponents at the same time, so the grating has {spectrum.slits} slits.
                        A real attack on N = {N} would use about {realQubits} qubits here (Q ≥ N²).
                      </p>
                    </div>
                    <div className="field">
                      <div className="rc-control__row">
                        <label className="label" htmlFor="rc-k0">Which remainder did we see?</label>
                        <code className="rc-control__value">{modPow(base, k0Safe, N)}</code>
                      </div>
                      <input id="rc-k0" type="range" className="range" min={0} max={period - 1} value={k0Safe} onChange={ev => { setK0(Number(ev.target.value)); setMeasurements([]) }} />
                      <p className="helper-text">
                        Measuring the output register picks one remainder at random. Only the exponents that produce it survive:
                        {' '}k = {k0Safe}, {k0Safe + period}, {k0Safe + period * 2}, … — a comb with spacing r. Slide to see that the fringes never move.
                      </p>
                    </div>
                  </div>

                  <div className="panel rc-side-panel">
                    <PanelHead>Read the screen</PanelHead>
                    <div className="rc-btn-row">
                      <button type="button" className="btn" onClick={() => measure(1)}>Measure once</button>
                      <button type="button" className="btn btn--outline" onClick={() => measure(10)}>Measure ×10</button>
                    </div>
                    <button type="button" className="btn btn--ghost btn--block" onClick={() => setMeasurements([])} disabled={measurements.length === 0}>Clear</button>
                    <p className="helper-text">
                      Each run of the quantum computer lights up exactly one pixel c, chosen at random — but almost always a bright one.
                    </p>
                  </div>
                </>
              }
              info={
                <>
                  <div className="panel rc-side-panel">
                    <PanelHead>Snapshot</PanelHead>
                    <MetricsDisplay
                      className="rc-metrics"
                      metrics={[
                        { label: 'period r', value: period, note: 'what we want' },
                        { label: 'Q', value: Q, note: `2^${qubits} exponents` },
                        { label: 'slits', value: spectrum.slits, note: 'exponents that survive' },
                        { label: 'fringe gap', value: (Q / period).toFixed(1), note: 'Q ÷ r pixels' },
                      ]}
                    />
                  </div>
                  <div className="panel rc-side-panel">
                    <PanelHead>Glossary</PanelHead>
                    <dl className="rc-glossary">
                      <dt>Superposition</dt>
                      <dd>A quantum register holding every value from 0 to Q − 1 at once, each with a wave-like phase.</dd>
                      <dt>Interferometer</dt>
                      <dd>Any device that splits a wave into many paths, lets them recombine, and reads the answer from where they reinforce (bright) or cancel (dark).</dd>
                      <dt>Computational interferometer</dt>
                      <dd>An interferometer whose “paths” are the possible answers to a calculation. The quantum computer runs a<sup>k</sup> mod N on every k at once, and the periodic pattern of results acts as the grating.</dd>
                      <dt>Quantum Fourier Transform</dt>
                      <dd>The circuit that plays the role of the screen: it turns a comb with spacing r into bright spots spaced Q/r apart.</dd>
                    </dl>
                  </div>
                  <div className="panel rc-side-panel">
                    <PanelHead>Classical vs quantum</PanelHead>
                    <p className="rc-side-text">
                      <strong>Classical:</strong> walk the {period} steps one at a time. For a real key that is more steps than the age of the universe allows.
                    </p>
                    <p className="rc-side-text">
                      <strong>Quantum:</strong> all Q steps at once, one interference readout, one glance at the fringe spacing. That is why a large quantum
                      computer would break RSA, and why post-quantum cryptography exists.
                    </p>
                  </div>
                </>
              }
            >
              <section className="panel rc-viz-panel">
                <div className="rc-viz-head">
                  <div className="eyebrow">Diffraction grating · a slit every r = {period} steps</div>
                  <span className="badge badge--neutral">{spectrum.slits} slits</span>
                </div>
                <div className="rc-graph-shell">
                  <GratingDiagram Q={Q} spacing={period} k0={k0Safe} slits={spectrum.slits} />
                </div>
                <div className="rc-define">
                  <p>
                    Shine light through a row of slits and the screen behind them shows bright fringes. The closer the slits, the wider the fringes:
                    slits every <strong>r</strong> steps make fringes every <strong>1/r</strong> of the screen. Measure the fringe spacing and you know r
                    without ever counting the slits.
                  </p>
                  <p>
                    A quantum computer running Shor’s algorithm is a <strong>computational interferometer</strong>. It computes {base}<sup>k</sup> mod {N} for
                    all Q values of k in superposition. Reading the output register keeps only the k’s that gave one particular remainder, and those form the
                    comb of slits above. The Quantum Fourier Transform is the screen.
                  </p>
                </div>
              </section>

              <section className="panel rc-viz-panel">
                <div className="rc-viz-head">
                  <div className="eyebrow">Quantum Fourier Transform · the screen has Q = {Q} pixels</div>
                  <span className={`badge ${combined?.verified ? 'badge--accent' : 'badge--neutral'}`}>
                    {measurements.length === 0 ? 'No measurements yet' : `${measurements.length} measurement${measurements.length === 1 ? '' : 's'}`}
                  </span>
                </div>
                <div className="rc-graph-shell">
                  <QftSpectrum probs={spectrum.probs} Q={Q} spacing={period} measurements={measurements} />
                </div>

                {readings.length === 0 ? (
                  <div className="callout callout--info rc-callout">
                    The curve is the probability of each pixel lighting up. Press <strong>Measure once</strong> to run the quantum computer.
                    The lit pixel c will sit near a multiple of Q/r ≈ {(Q / period).toFixed(1)}, so c/Q is close to a simple fraction j/r.
                  </div>
                ) : (
                  <>
                    <div className="rc-table-wrap">
                      <table className="table table--sm rc-readings">
                        <thead>
                          <tr>
                            <th>pixel c</th>
                            <th>c / Q</th>
                            <th>nearest simple fraction</th>
                            <th>guess for r</th>
                            <th>check a<sup>r</sup> mod N</th>
                          </tr>
                        </thead>
                        <tbody>
                          {readings.map((reading, i) => (
                            <tr key={i}>
                              <td>{reading.c}</td>
                              <td>{(reading.c / Q).toFixed(4)}</td>
                              <td>{reading.fraction.num} / {reading.fraction.den}</td>
                              <td><strong>{reading.candidate}</strong></td>
                              <td>
                                {reading.verified
                                  ? <span className="valid-text">= 1 ✓ period found</span>
                                  : reading.uninformative
                                    ? <span className="rc-partial">the j = 0 spot · says nothing, measure again</span>
                                    : reading.partial
                                      ? <span className="rc-partial">≠ 1 · a divisor of r, combine it</span>
                                      : <span className="rc-blurry">≠ 1 · blurry: Q is too small to tell j/r from its neighbours. Add qubits.</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className={`callout rc-callout${combined?.verified ? '' : ' callout--info'}`}>
                      <div className="callout__title">Reading the period off the screen</div>
                      c/Q is a fraction with a huge denominator; the continued-fraction trick finds the simplest fraction j/r′ close to it with r′ &lt; N,
                      and r′ is r or a divisor of r.{' '}
                      {combined === null
                        ? 'No useful reading yet — measure again.'
                        : combined.verified
                          ? <>Combining the readings gives <strong>r = {combined.value}</strong>, and {base}<sup>{combined.value}</sup> mod {N} = 1 confirms it. Same period as stage 2, found without walking a single step.</>
                          : <>So far the readings combine to {combined.value}, which is only part of the period. Measure again and the pieces will lock together.</>}
                    </div>
                  </>
                )}
              </section>
            </WidgetShell>
          )
        )}
      </div>
    </main>
  )
}
