import {
  mount, createSignal, useInput, useTheme, useStdout, useResize,
  useAnimated, spring, ease,
  linear, easeOutCubic, easeOutElastic, easeOutBounce, easeInOutCubic, easeOutQuad,
} from '../index.js'

const MODES = ['ease', 'spring']

const CURVES = [
  { name: 'easeInOutCubic', make: () => easeInOutCubic },
  { name: 'easeOutCubic', make: () => easeOutCubic },
  { name: 'easeOutQuad', make: () => easeOutQuad },
  { name: 'linear', make: () => linear },
  { name: 'elastic', make: (p) => easeOutElastic({ amplitude: p.amplitude, period: p.period }) },
  { name: 'bounce', make: (p) => easeOutBounce({ bounciness: p.bounciness }) },
]

function hsl(hue, s, l) {
  const k = (n) => (n + hue / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => Math.round((l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))) * 255)
  return `${f(0)};${f(8)};${f(4)}`
}

function App() {
  const { accent } = useTheme()
  const stream = useStdout()
  const [cols, setCols] = createSignal(stream.columns || 80)
  const [rows, setRows] = createSignal(stream.rows || 24)

  const [mode, setMode] = createSignal(0)

  // spring params
  const [frequency, setFrequency] = createSignal(1.0)
  const [damping, setDamping] = createSignal(1)

  // ease params
  const [duration, setDuration] = createSignal(1000)
  const [curveIdx, setCurveIdx] = createSignal(0)

  // elastic params
  const [amplitude, setAmplitude] = createSignal(1.0)
  const [period, setPeriod] = createSignal(0.2)

  // bounce params
  const [bounciness, setBounciness] = createSignal(7.5)

  const [trail, setTrail] = createSignal([])
  const [atEnd, setAtEnd] = createSignal(false)

  const pos = useAnimated(0, ease(1000, easeInOutCubic))

  pos.onTick((value) => {
    setTrail(t => {
      const next = [...t, value]
      if (next.length > 500) next.shift()
      return next
    })
  })

  function fire() {
    const trackWidth = cols() - 6
    const goingRight = !atEnd()
    const target = goingRight ? trackWidth - 1 : 0
    setAtEnd(goingRight)

    const m = MODES[mode()]
    if (m === 'spring') {
      pos.setInterpolator(spring({ frequency: frequency(), damping: damping() }))
    } else {
      const curve = CURVES[curveIdx()]
      const curveParams = { amplitude: amplitude(), period: period(), bounciness: bounciness() }
      pos.setInterpolator(ease(duration(), curve.make(curveParams)))
    }

    setTrail([])
    pos.set(target)
  }

  useResize(({ width, height }) => {
    setCols(width)
    setRows(height)
  })

  useInput(({ key, ctrl }) => {
    if (key === 'q' || (ctrl && key === 'c')) process.exit(0)
    if (key === 'space' || key === 'return') fire()
    if (key === 'tab') setMode(i => (i + 1) % MODES.length)

    const m = MODES[mode()]
    if (m === 'spring') {
      if (key === 'up') setFrequency(f => Math.min(20, +(f + 0.5).toFixed(1)))
      if (key === 'down') setFrequency(f => Math.max(0.5, +(f - 0.5).toFixed(1)))
      if (key === 'right') setDamping(d => Math.min(2, +(d + 0.05).toFixed(2)))
      if (key === 'left') setDamping(d => Math.max(0.01, +(d - 0.05).toFixed(2)))
    }
    if (m === 'ease') {
      if (key === 'left') setCurveIdx(i => (i - 1 + CURVES.length) % CURVES.length)
      if (key === 'right') setCurveIdx(i => (i + 1) % CURVES.length)
      if (key === 'up') setDuration(d => Math.min(5000, d + 100))
      if (key === 'down') setDuration(d => Math.max(100, d - 100))

      const curveName = CURVES[curveIdx()].name
      if (curveName === 'elastic') {
        if (key === 'j') setAmplitude(a => Math.max(1.0, +(a - 0.1).toFixed(1)))
        if (key === 'k') setAmplitude(a => Math.min(5, +(a + 0.1).toFixed(1)))
        if (key === 'h') setPeriod(p => Math.max(0.05, +(p - 0.05).toFixed(2)))
        if (key === 'l') setPeriod(p => Math.min(2, +(p + 0.05).toFixed(2)))
      } else if (curveName === 'bounce') {
        if (key === 'j') setBounciness(b => Math.max(1, +(b - 0.5).toFixed(1)))
        if (key === 'k') setBounciness(b => Math.min(20, +(b + 0.5).toFixed(1)))
      }
    }
  })

  const w = cols()
  const h = rows()
  const trackWidth = w - 6
  const m = MODES[mode()]
  const trailData = trail()
  const currentPos = pos()

  const modeLabel = MODES.map((name, i) =>
    i === mode() ? `\x1b[1m[${name}]\x1b[22m` : ` ${name} `
  ).join('  ')

  const curveName = CURVES[curveIdx()].name
  let paramsLine = ''
  let paramsLine2 = ''
  if (m === 'spring') {
    paramsLine = `frequency: \x1b[1m${frequency().toFixed(1)}\x1b[22m (up/down)    damping: \x1b[1m${damping().toFixed(2)}\x1b[22m (left/right)`
  } else {
    paramsLine = `curve: \x1b[1m${curveName}\x1b[22m (left/right)    duration: \x1b[1m${duration()}ms\x1b[22m (up/down)`
    if (curveName === 'elastic') {
      paramsLine2 = `amplitude: \x1b[1m${amplitude().toFixed(1)}\x1b[22m (j/k)    period: \x1b[1m${period().toFixed(2)}\x1b[22m (h/l)`
    } else if (curveName === 'bounce') {
      paramsLine2 = `bounciness: \x1b[1m${bounciness().toFixed(1)}\x1b[22m (j/k)`
    }
  }

  const ballIdx = Math.round(Math.max(0, Math.min(trackWidth - 1, currentPos)))
  let trackLine = ''
  for (let x = 0; x < trackWidth; x++) {
    if (x === ballIdx) {
      const color = m === 'spring' ? '213' : '117'
      trackLine += `\x1b[38;5;${color}m\u25cf\x1b[0m`
    } else {
      trackLine += `\x1b[38;5;238m\u2500\x1b[0m`
    }
  }

  const graphWidth = trackWidth
  const graphHeight = Math.max(4, h - 12)
  const graphLines = []

  if (trailData.length > 1) {
    const target = trailData[trailData.length - 1]
    const start = trailData[0]
    let lo = Math.min(start, target)
    let hi = Math.max(start, target)

    for (const v of trailData) { if (v < lo) lo = v; if (v > hi) hi = v }

    const range = hi - lo || 1

    const sampleRows = new Array(graphWidth)
    for (let col = 0; col < graphWidth; col++) {
      const t = col / (graphWidth - 1)
      const idx = Math.min(Math.floor(t * (trailData.length - 1)), trailData.length - 1)
      const normalized = Math.max(0, Math.min(1, (trailData[idx] - lo) / range))
      sampleRows[col] = Math.round((1 - normalized) * (graphHeight - 1))
    }

    for (let row = 0; row < graphHeight; row++) {
      let line = '\x1b[38;5;236m\u2502\x1b[0m'
      for (let col = 0; col < graphWidth; col++) {
        if (sampleRows[col] === row) {
          const progress = col / graphWidth
          const baseHue = m === 'spring' ? 300 : 210
          const hue = baseHue + progress * 60
          line += `\x1b[38;2;${hsl(hue, 0.8, 0.6)}m\u2022\x1b[0m`
        } else {
          line += ' '
        }
      }
      graphLines.push(line)
    }

    let axisLine = '\x1b[38;5;236m\u2514'
    for (let i = 0; i < graphWidth; i++) axisLine += '\u2500'
    axisLine += '\x1b[0m'
    graphLines.push(axisLine)
  }

  return (
    <box style={{ flexDirection: 'column', padding: 1 }}>
      <text style={{ bold: true, color: accent }}>animation playground</text>
      <box style={{ height: 1 }} />
      <text>  mode:  {modeLabel}   (tab)</text>
      <text>  {paramsLine}</text>
      {paramsLine2 ? <text>  {paramsLine2}</text> : null}
      <box style={{ height: 1 }} />
      <text>  {trackLine}</text>
      <box style={{ height: 1 }} />
      <text style={{ color: 'gray', dim: true }}>  position over time:</text>
      {graphLines.map((line, i) => (
        <text key={i}>  {line}</text>
      ))}
      <box style={{ flexGrow: 1 }} />
      <text style={{ color: 'gray' }}>  space: fire   tab: mode   arrows: adjust params   q: quit</text>
    </box>
  )
}

mount(App, { title: 'animation playground', theme: { accent: 'magenta' } })
