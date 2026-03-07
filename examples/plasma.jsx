import { mount, createSignal, useInput, useInterval, useResize, useStdout, useFrameStats } from '../index.js'

const SIN_TABLE_SIZE = 1024
const SIN = new Float64Array(SIN_TABLE_SIZE)
for (let i = 0; i < SIN_TABLE_SIZE; i++) SIN[i] = Math.sin(i * Math.PI * 2 / SIN_TABLE_SIZE)

function fastSin(v) {
  const i = ((v / (Math.PI * 2) * SIN_TABLE_SIZE) % SIN_TABLE_SIZE + SIN_TABLE_SIZE) % SIN_TABLE_SIZE
  return SIN[i | 0]
}

function hueToRgb(hue) {
  const h = ((hue % 360) + 360) % 360
  const c = 0.8
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = 0.1
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

function PlasmaPanel({ width, height, t }) {
  const rows = []
  for (let y = 0; y < height; y++) {
    let row = ''
    for (let x = 0; x < width; x++) {
      row += plasmaCell(x, y, t)
    }
    row += '\x1b[0m'
    rows.push(<text>{row}</text>)
  }
  return <box style={{ flexDirection: 'column' }}>{rows}</box>
}

function InfoPanel({ t, stats }) {
  const elapsed = Math.floor(t / 0.12 * 16 / 1000)
  const min = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const sec = String(elapsed % 60).padStart(2, '0')
  const pct = stats.total > 0 ? ((stats.changed / stats.total) * 100).toFixed(1) : '0.0'

  return (
    <box style={{ flexDirection: 'column', padding: 1 }}>
      <text style={{ bold: true, color: 'white' }}>per-cell diffing</text>
      <text />
      <text style={{ color: 'gray' }}>the right half is a plasma animation</text>
      <text style={{ color: 'gray' }}>that changes every cell every frame.</text>
      <text />
      <text style={{ color: 'gray' }}>this left half is mostly static.</text>
      <text />
      <text />
      <text style={{ color: 'white' }}>elapsed   <text style={{ color: 'cyan' }}>{min}:{sec}</text></text>
      <text />
      <text style={{ color: 'white' }}>fps       <text style={{ color: 'cyan' }}>{stats.fps}</text></text>
      <text style={{ color: 'white' }}>cells     <text style={{ color: 'cyan' }}>{stats.changed.toLocaleString()} / {stats.total.toLocaleString()}</text></text>
      <text style={{ color: 'white' }}>changed   <text style={{ color: 'cyan' }}>{pct}%</text></text>
      <text style={{ color: 'white' }}>bytes     <text style={{ color: 'cyan' }}>{stats.bytes.toLocaleString()}</text></text>
    </box>
  )
}

function App() {
  const stream = useStdout()
  const [cols, setCols] = createSignal(stream.columns || 80)
  const [rows, setRows] = createSignal(stream.rows || 24)
  const [t, setT] = createSignal(0)
  const stats = useFrameStats()

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
  const plasmaWidth = Math.floor(w / 2)

  return (
    <box style={{ flexDirection: 'row', height: '100%' }}>
      <box style={{ width: w - plasmaWidth, flexDirection: 'column' }}>
        <InfoPanel t={t()} stats={stats} />
      </box>
      <PlasmaPanel width={plasmaWidth} height={h} t={t()} />
    </box>
  )
}

mount(App, { title: 'plasma' })
