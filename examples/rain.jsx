import { mount, createSignal, useInput, useInterval, useResize, useStdout, useFrameStats } from '../index.js'

const BLOCK = '\u2588'
const SHADES = ['\u2591', '\u2592', '\u2593', BLOCK]

function makeDrop(x) {
  return {
    x,
    y: -(Math.random() * 30),
    speed: 0.3 + Math.random() * 0.7,
    length: 4 + (Math.random() * 12 | 0),
    hue: Math.random() * 360 | 0,
  }
}

function initDrops(w) {
  const drops = []
  for (let x = 0; x < w; x++) {
    if (Math.random() < 0.4) drops.push(makeDrop(x))
  }
  return drops
}

function hueToAnsi(hue, brightness) {
  const h = ((hue % 360) + 360) % 360
  const s = 0.8, l = brightness * 0.5
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
  const clamp = v => Math.round(Math.max(0, Math.min(1, v)) * 255)
  return `\x1b[38;2;${clamp(r + m)};${clamp(g + m)};${clamp(b + m)}m`
}

function Rain() {
  const stream = useStdout()
  const [cols, setCols] = createSignal(stream.columns || 80)
  const [rows, setRows] = createSignal(stream.rows || 24)
  const [tick, setTick] = createSignal(0)
  const [drops, setDrops] = createSignal(initDrops(stream.columns || 80))
  const stats = useFrameStats()

  useResize(({ width, height }) => {
    setCols(width)
    setRows(height)
    setDrops(initDrops(width))
  })

  useInterval(() => {
    const h = rows() - 1
    const d = drops()
    for (const drop of d) {
      drop.y += drop.speed
      if (drop.y - drop.length > h) {
        drop.y = -(Math.random() * 20)
        drop.speed = 0.3 + Math.random() * 0.7
        drop.length = 4 + (Math.random() * 12 | 0)
        drop.hue = Math.random() * 360 | 0
      }
    }
    setTick(v => v + 1)
  }, 16)

  useInput(({ key, ctrl }) => {
    if (key === 'q' || (ctrl && key === 'c')) process.exit(0)
  })

  const w = cols()
  const h = rows() - 1
  const currentDrops = drops()
  tick()

  const grid = new Array(h * w).fill(null)

  for (const drop of currentDrops) {
    const headY = drop.y | 0
    for (let i = 0; i < drop.length; i++) {
      const cy = headY - i
      if (cy < 0 || cy >= h) continue
      const brightness = 1 - i / drop.length
      const shade = SHADES[Math.min(3, (brightness * 4) | 0)]
      grid[cy * w + drop.x] = hueToAnsi(drop.hue, brightness) + shade
    }
  }

  const rowElements = []
  for (let y = 0; y < h; y++) {
    let row = ''
    for (let x = 0; x < w; x++) {
      const cell = grid[y * w + x]
      row += cell !== null ? cell : ' '
    }
    rowElements.push(<text>{row + '\x1b[0m'}</text>)
  }

  const pct = stats.total > 0 ? ((stats.changed / stats.total) * 100).toFixed(1) : '0.0'
  const overlay = `\x1b[48;2;0;0;0m\x1b[38;2;120;120;120m ${stats.fps}fps  ${stats.changed.toLocaleString()} / ${stats.total.toLocaleString()} cells (${pct}%)  ${stats.bytes.toLocaleString()}b \x1b[0m`

  return (
    <box style={{ flexDirection: 'column' }}>
      <text>{overlay}</text>
      {rowElements}
    </box>
  )
}

mount(Rain, { title: 'rain' })
