import { jsx, jsxs } from '../jsx-runtime.js'
import { createSignal } from './signal.js'
import { useInterval, useTheme } from './hooks.js'
import { registerHook } from './renderer.js'

const FRAMES = ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F']

export function Spinner({ label, color, interval = 80 }) {
  const { accent = 'cyan' } = useTheme()
  const c = color ?? accent
  const [frame, setFrame] = createSignal(0)
  useInterval(() => setFrame(f => (f + 1) % FRAMES.length), interval)

  const children = [jsx('text', { style: { color: c }, children: FRAMES[frame()] })]

  if (label != null) {
    children.push(jsx('text', { children: ` ${label}` }))
  }

  return jsxs('box', { style: { flexDirection: 'row' }, children })
}
