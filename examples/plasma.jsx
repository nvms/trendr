import { mount, createSignal, useInput, useInterval, useResize, useStdout } from '../index.js'

const SIN_TABLE_SIZE = 1024
const SIN = new Float64Array(SIN_TABLE_SIZE)
for (let i = 0; i < SIN_TABLE_SIZE; i++) SIN[i] = Math.sin(i * Math.PI * 2 / SIN_TABLE_SIZE)

function fastSin(v) {
  const i = ((v / (Math.PI * 2) * SIN_TABLE_SIZE) % SIN_TABLE_SIZE + SIN_TABLE_SIZE) % SIN_TABLE_SIZE
  return SIN[i | 0]
}

function hueToRgb(hue) {
  const h = ((hue % 360) + 360) % 360
  const s = 0.8, l = 0.5
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - c / 2
  let r, g, b
  if (h < 60)       { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else               { r = c; g = 0; b = x }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

const HUE_CACHE_SIZE = 720
const HUE_CACHE = new Array(HUE_CACHE_SIZE)
for (let i = 0; i < HUE_CACHE_SIZE; i++) {
  const [r, g, b] = hueToRgb(i * 360 / HUE_CACHE_SIZE)
  HUE_CACHE[i] = `\x1b[38;2;${r};${g};${b}m\u2588`
}

function plasmaCell(x, y, t) {
  const v1 = fastSin(x * 0.06 + t)
  const v2 = fastSin(y * 0.07 + t * 0.7)
  const v3 = fastSin((x + y) * 0.05 + t * 0.5)
  const v4 = fastSin(Math.sqrt(x * x + y * y) * 0.04 - t * 0.8)
  const hue = (v1 + v2 + v3 + v4 + 4) / 8
  return HUE_CACHE[(hue * HUE_CACHE_SIZE) | 0]
}

function Plasma() {
  const stream = useStdout()
  const [cols, setCols] = createSignal(stream.columns || 80)
  const [rows, setRows] = createSignal(stream.rows || 24)
  const [t, setT] = createSignal(0)

  useResize(({ width, height }) => {
    setCols(width)
    setRows(height)
  })

  useInterval(() => setT(v => v + 0.12), 16)

  useInput(({ key, ctrl }) => {
    if (key === 'q' || (ctrl && key === 'c')) process.exit(0)
  })

  const w = cols()
  const h = rows()
  const time = t()
  const rowElements = []

  for (let y = 0; y < h; y++) {
    let row = ''
    for (let x = 0; x < w; x++) {
      row += plasmaCell(x, y, time)
    }
    row += '\x1b[0m'
    rowElements.push(<text>{row}</text>)
  }

  return (
    <box style={{ flexDirection: 'column' }}>
      {rowElements}
    </box>
  )
}

mount(Plasma, { title: 'plasma' })
