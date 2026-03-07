import { jsx, jsxs } from '../jsx-runtime.js'
import { createSignalRaw } from './signal.js'
import { useInterval, useTheme } from './hooks.js'
import { registerHook } from './renderer.js'

const NAMED_RGB = {
  black: [0, 0, 0], red: [205, 0, 0], green: [0, 205, 0], yellow: [205, 205, 0],
  blue: [0, 0, 238], magenta: [205, 0, 205], cyan: [0, 205, 205], white: [229, 229, 229],
  gray: [127, 127, 127], grey: [127, 127, 127],
  brightRed: [255, 0, 0], brightGreen: [0, 255, 0], brightYellow: [255, 255, 0],
  brightBlue: [92, 92, 255], brightMagenta: [255, 0, 255], brightCyan: [0, 255, 255],
  brightWhite: [255, 255, 255],
}

function toRgb(color) {
  if (NAMED_RGB[color]) return NAMED_RGB[color]
  if (color?.startsWith('#') && color.length === 7) {
    return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)]
  }
  return [127, 127, 127]
}

function lerpColor(a, b, t) {
  const r = Math.round(a[0] + (b[0] - a[0]) * t)
  const g = Math.round(a[1] + (b[1] - a[1]) * t)
  const bl = Math.round(a[2] + (b[2] - a[2]) * t)
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)
}

export function Shimmer({ children, color, highlight, size = 3, gradient = 3, duration = 1000, delay = 500 }) {
  const { accent = 'cyan' } = useTheme()
  const baseColor = color ?? 'gray'
  const hlColor = highlight ?? accent

  const text = typeof children === 'string' ? children : String(children ?? '')
  const len = text.length
  const windowSize = size + gradient * 2
  const totalFrames = len + windowSize
  const msPerFrame = duration / totalFrames
  const delayFrames = Math.ceil(delay / msPerFrame)
  const cycleLength = totalFrames + delayFrames

  const [pos, setPos] = registerHook(() => {
    const [get, set] = createSignalRaw(0)
    return [get, set]
  })

  useInterval(() => setPos(p => (p + 1) % cycleLength), msPerFrame)

  const p = pos()

  if (p >= totalFrames) {
    return jsx('text', { style: { color: baseColor }, children: text })
  }

  const baseRgb = toRgb(baseColor)
  const hlRgb = toRgb(hlColor)
  const center = p - windowSize / 2
  const halfSize = (size - 1) / 2
  const parts = []
  let run = { color: null, bold: false, chars: '' }

  function flushRun() {
    if (run.chars) {
      parts.push(jsx('text', { style: { color: run.color, bold: run.bold }, children: run.chars }))
      run = { color: null, bold: false, chars: '' }
    }
  }

  for (let i = 0; i < len; i++) {
    const dist = Math.abs(i - center)
    let charColor
    let bold = false

    if (dist <= halfSize) {
      charColor = lerpColor(baseRgb, hlRgb, 1)
      bold = true
    } else if (gradient > 0 && dist <= halfSize + gradient) {
      const t = 1 - (dist - halfSize) / gradient
      charColor = lerpColor(baseRgb, hlRgb, t)
    } else {
      charColor = baseColor
    }

    if (charColor !== run.color || bold !== run.bold) {
      flushRun()
      run.color = charColor
      run.bold = bold
    }
    run.chars += text[i]
  }
  flushRun()

  return jsxs('box', { style: { flexDirection: 'row' }, children: parts })
}
