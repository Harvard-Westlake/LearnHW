/**
 * Number / coordinate formatting shared by the math explorer widgets.
 * Values are shown to one decimal by default; `~` marks a rounded value.
 */

export function roundTo(value: number, decimals = 1) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function nearlyZero(value: number) {
  return Math.abs(value) < 0.0001
}

export function isApproximate(value: number, decimals = 1) {
  return Math.abs(value - roundTo(value, decimals)) > 0.00001
}

export function formatNumber(value: number, decimals = 1) {
  const rounded = nearlyZero(value) ? 0 : roundTo(value, decimals)
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(decimals).replace(/\.?0+$/, '')
}

export function formatAbs(value: number, decimals = 1) {
  return formatNumber(Math.abs(value), decimals)
}

export function formatPoint(x: number, y: number, decimals = 1) {
  const approx = isApproximate(x, decimals) || isApproximate(y, decimals)
  return `${approx ? '~' : ''}(${formatNumber(x, decimals)}, ${formatNumber(y, decimals)})`
}

/** " + 2", " - 2", or "" — for appending a constant to an expression. */
export function formatAddend(value: number, decimals = 1) {
  if (nearlyZero(value)) return ''
  return value > 0 ? ` + ${formatNumber(value, decimals)}` : ` - ${formatAbs(value, decimals)}`
}

/** Two-line "2 units / right" description of a shift, or "No / shift". */
export function formatMovementLines(value: number, positiveDirection: string, negativeDirection: string) {
  if (nearlyZero(value)) return { firstLine: 'No', secondLine: 'shift' }
  return {
    firstLine: `${formatAbs(value)} ${Math.abs(roundTo(value)) === 1 ? 'unit' : 'units'}`,
    secondLine: value > 0 ? positiveDirection : negativeDirection,
  }
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
