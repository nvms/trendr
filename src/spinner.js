import { jsx, jsxs } from '../jsx-runtime.js'
import { createSignal } from './signal.js'
import { useInterval, useTheme } from './hooks.js'
import { registerHook } from './renderer.js'

const VARIANTS = {
  dots: ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'],
  line: ['|', '/', '-', '\\'],
  circle: ['\u25D0', '\u25D3', '\u25D1', '\u25D2'],
  bounce: ['\u2801', '\u2802', '\u2804', '\u2802'],
  arrow: ['\u2190', '\u2196', '\u2191', '\u2197', '\u2192', '\u2198', '\u2193', '\u2199'],
  square: ['\u25F0', '\u25F3', '\u25F2', '\u25F1'],
  star: ['\u2736', '\u2738', '\u2739', '\u273A', '\u2739', '\u2738'],
}

export function Spinner({ label, color, interval = 80, variant = 'dots', frames }) {
  const { accent = 'cyan' } = useTheme()
  const c = color ?? accent
  const f = frames ?? VARIANTS[variant] ?? VARIANTS.dots
  const [frame, setFrame] = createSignal(0)
  useInterval(() => setFrame(i => (i + 1) % f.length), interval)

  const children = [jsx('text', { style: { color: c }, children: f[frame()] })]

  if (label != null) {
    children.push(jsx('text', { children: ` ${label}` }))
  }

  return jsxs('box', { style: { flexDirection: 'row' }, children })
}
