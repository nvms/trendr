import { jsx, jsxs } from '../jsx-runtime.js'
import { useTheme } from './hooks.js'
import { useLayout } from './hooks.js'

const BARS = {
  thin: { filled: '\u2501', empty: '\u2501' },
  block: { filled: '\u2588', empty: '\u2591' },
  ascii: { filled: '#', empty: '-', bracket: true },
  braille: {
    filled: '\u28ff', empty: '\u28ff',
    tips: ['\u2801', '\u2803', '\u2807', '\u280f', '\u281f', '\u283f', '\u287f'],
  },
}

function renderBar(variant, value, width) {
  const style = BARS[variant] ?? BARS.thin

  if (style.bracket) {
    const inner = Math.max(0, width - 2)
    const filled = Math.round(value * inner)
    return { open: '[', filled: style.filled.repeat(filled), empty: style.empty.repeat(inner - filled), close: ']' }
  }

  if (style.tips) {
    const exact = value * width
    const full = Math.floor(exact)
    const frac = exact - full
    const tipIdx = Math.min(style.tips.length - 1, Math.round(frac * (style.tips.length - 1)))
    const tip = full < width && frac > 0 ? style.tips[tipIdx] : ''
    const emptyCount = Math.max(0, width - full - (tip ? 1 : 0))
    return { filled: style.filled.repeat(full) + tip, empty: style.empty.repeat(emptyCount) }
  }

  const filled = Math.round(value * width)
  return { filled: style.filled.repeat(filled), empty: style.empty.repeat(width - filled) }
}

export function ProgressBar({ value = 0, variant = 'thin', width, color, label, count, percentage = true }) {
  const { accent = 'cyan' } = useTheme()
  const c = color ?? accent
  const clamped = Math.max(0, Math.min(1, value))
  const layout = useLayout()

  const labelPart = label ? `${label}  ` : ''
  const pctPart = percentage ? ` ${Math.round(clamped * 100)}%` : ''
  const countPart = count ? ` (${count})` : ''
  const rightText = pctPart + countPart
  const reservedWidth = labelPart.length + rightText.length
  const barWidth = width ?? Math.max(5, (layout.width || 20) - reservedWidth)

  const bar = renderBar(variant, clamped, barWidth)

  const children = []

  if (label) {
    children.push(jsx('text', { style: { bold: true }, children: labelPart }))
  }

  if (bar.open) children.push(jsx('text', { children: bar.open }))
  children.push(jsx('text', { style: { color: c }, children: bar.filled }))
  children.push(jsx('text', { style: { color: c, dim: true }, children: bar.empty }))
  if (bar.close) children.push(jsx('text', { children: bar.close }))

  if (rightText) {
    children.push(jsx('text', { style: { color: 'gray' }, children: rightText }))
  }

  return jsxs('box', { style: { flexDirection: 'row' }, children })
}
