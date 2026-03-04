import { jsx, jsxs } from '../jsx-runtime.js'
import { useTheme } from './hooks.js'

export function ProgressBar({ value = 0, width = 20, color, label }) {
  const { accent = 'cyan' } = useTheme()
  const c = color ?? accent
  const clamped = Math.max(0, Math.min(1, value))
  const filled = Math.round(clamped * width)
  const empty = width - filled
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty)

  const children = [
    jsx('text', { style: { color: c }, children: bar }),
  ]

  if (label != null) {
    children.push(jsx('text', { style: { color: 'gray', dim: true }, children: ` ${label}` }))
  }

  return jsxs('box', { style: { flexDirection: 'row' }, children })
}
