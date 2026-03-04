import { EventEmitter } from 'events'
import { performance } from 'perf_hooks'

// ====================================================================
// helpers
// ====================================================================

class FakeStream extends EventEmitter {
  constructor(cols = 80, rows = 24) {
    super()
    this.columns = cols
    this.rows = rows
    this.isTTY = false
    this.bytes = 0
  }
  write(data) {
    this.bytes += Buffer.byteLength(data)
    return true
  }
  setRawMode() {}
}

class FakeInput extends EventEmitter {
  constructor() {
    super()
    this.isTTY = false
  }
  setRawMode() {}
  pause() {}
  resume() {}
}

function median(arr) {
  const sorted = arr.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function p99(arr) {
  const sorted = arr.slice().sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length * 0.99)]
}

// ====================================================================
// trend benchmark
// ====================================================================

async function benchTrend(iterations) {
  const { createBuffer, clearBuffer, writeText, fillRect } = await import('../src/buffer.js')
  const { diff } = await import('../src/diff.js')
  const { computeLayout } = await import('../src/layout.js')
  const { createSignal } = await import('../src/signal.js')
  const { wordWrap } = await import('../src/wrap.js')
  const { jsx, jsxs } = await import('../jsx-runtime.js')

  function flattenChildren(children) {
    if (children == null || children === true || children === false) return []
    if (!Array.isArray(children)) return [children]
    const result = []
    for (const child of children) {
      if (child == null || child === true || child === false) continue
      if (Array.isArray(child)) result.push(...flattenChildren(child))
      else result.push(child)
    }
    return result
  }

  function resolve(element) {
    if (element == null || typeof element === 'boolean') return null
    if (typeof element === 'string' || typeof element === 'number') {
      return { type: 'text', props: { children: String(element) }, key: null, _parent: null, _layout: null, _resolved: null, _resolvedChildren: null }
    }
    const node = { type: element.type, props: element.props ?? {}, key: element.key, _parent: null, _layout: null, _resolved: null, _resolvedChildren: null }
    if (typeof element.type === 'function') {
      node._resolved = resolve(element.type(element.props ?? {}))
      return node
    }
    const children = flattenChildren(element.props?.children)
    if (children.length > 0) node._resolvedChildren = children.map(c => resolve(c)).filter(Boolean)
    return node
  }

  function extractText(node) {
    if (node == null || node === true || node === false) return ''
    if (typeof node === 'string') return node
    if (typeof node === 'number') return String(node)
    const children = node.props?.children
    if (children == null || children === true || children === false) return ''
    if (typeof children === 'string') return children
    if (typeof children === 'number') return String(children)
    if (Array.isArray(children)) return children.map(c => extractText(c)).join('')
    return ''
  }

  function paintTree(node, buf) {
    if (!node) return
    if (node._resolved) { paintTree(node._resolved, buf); return }
    const layout = node._layout
    if (!layout) return
    if (node.type === 'text') {
      const text = extractText(node)
      if (text) {
        const lines = wordWrap(text, layout.width)
        for (let i = 0; i < lines.length && i < layout.height; i++) writeText(buf, layout.x, layout.y + i, lines[i], null, null, 0, layout.width)
      }
      return
    }
    if (node._resolvedChildren) for (const c of node._resolvedChildren) paintTree(c, buf)
  }

  const W = 80, H = 24
  const [count, setCount] = createSignal(0)

  function ProgressBar({ value, width = 20, color = 'green' }) {
    const filled = Math.round(value / 100 * width)
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled)
    return jsxs('text', { style: { color }, children: [bar, ' ', value, '%'] })
  }

  function Gauge({ label, value, color }) {
    return jsxs('box', {
      style: { flexDirection: 'row', gap: 1 },
      children: [
        jsx('text', { style: { width: 6 }, children: label }),
        jsx(ProgressBar, { value, width: 30, color }),
      ],
    })
  }

  function App() {
    return jsxs('box', {
      style: { flexDirection: 'column', padding: 1, gap: 1 },
      children: [
        jsxs('text', { children: ['Frame: ', count()] }),
        jsxs('box', { style: { flexDirection: 'column' }, children: [
          jsx(Gauge, { label: 'CPU', value: count() % 100, color: 'green' }),
          jsx(Gauge, { label: 'MEM', value: (count() * 3) % 100, color: 'yellow' }),
          jsx(Gauge, { label: 'DISK', value: (count() * 7) % 100, color: 'blue' }),
          jsx(Gauge, { label: 'NET', value: (count() * 13) % 100, color: 'magenta' }),
        ]}),
        jsx('text', { children: 'press q to quit' }),
      ],
    })
  }

  let prev = createBuffer(W, H)
  let curr = createBuffer(W, H)
  const stream = new FakeStream(W, H)

  const times = []

  for (let i = 0; i < iterations; i++) {
    setCount(i)

    const start = performance.now()

    clearBuffer(curr)
    const tree = resolve(jsx(App, {}))
    computeLayout(tree, { x: 0, y: 0, width: W, height: H })
    paintTree(tree, curr)
    const { output } = diff(prev, curr)
    if (output) stream.write(output)
    const tmp = prev; prev = curr; curr = tmp

    times.push(performance.now() - start)
  }

  return { times, bytes: stream.bytes }
}

// ====================================================================
// ink benchmark
// ====================================================================

async function benchInk(iterations) {
  const React = await import('react')
  const { render, Box, Text } = await import('ink')

  const { createElement: h } = React

  const stream = new FakeStream(80, 24)

  function ProgressBar({ value, width = 20, color = 'green' }) {
    const filled = Math.round(value / 100 * width)
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled)
    return h(Text, { color }, bar, ' ', value, '%')
  }

  function Gauge({ label, value, color }) {
    return h(Box, { flexDirection: 'row', gap: 1 },
      h(Text, { bold: true }, label.padEnd(6)),
      h(ProgressBar, { value, width: 30, color }),
    )
  }

  let rerender

  function App({ frame }) {
    return h(Box, { flexDirection: 'column', padding: 1, gap: 1 },
      h(Text, null, 'Frame: ', frame),
      h(Box, { flexDirection: 'column' },
        h(Gauge, { label: 'CPU', value: frame % 100, color: 'green' }),
        h(Gauge, { label: 'MEM', value: (frame * 3) % 100, color: 'yellow' }),
        h(Gauge, { label: 'DISK', value: (frame * 7) % 100, color: 'blue' }),
        h(Gauge, { label: 'NET', value: (frame * 13) % 100, color: 'magenta' }),
      ),
      h(Text, null, 'press q to quit'),
    )
  }

  const times = []

  const instance = render(h(App, { frame: 0 }), { stdout: stream, stdin: new FakeInput(), exitOnCtrlC: false })
  rerender = instance.rerender

  for (let i = 1; i < iterations; i++) {
    const start = performance.now()
    rerender(h(App, { frame: i }))
    times.push(performance.now() - start)
  }

  instance.unmount()

  // ink defers writes via microtasks, wait for flush
  await new Promise(r => setTimeout(r, 200))

  return { times, bytes: stream.bytes }
}

// ====================================================================
// blessed benchmark
// ====================================================================

async function benchBlessed(iterations) {
  const { default: blessed } = await import('neo-blessed')

  const stream = new FakeStream(80, 24)
  const inp = new FakeInput()

  const screen = blessed.screen({
    output: stream,
    input: inp,
    smartCSR: true,
    terminal: 'xterm-256color',
    fullUnicode: true,
  })

  const layout = blessed.box({
    parent: screen,
    top: 1,
    left: 1,
    width: '100%-2',
    height: '100%-2',
  })

  const frameLabel = blessed.text({
    parent: layout,
    top: 0,
    left: 0,
    content: 'Frame: 0',
  })

  const gauges = []
  const labels = ['CPU', 'MEM', 'DISK', 'NET']
  for (let i = 0; i < 4; i++) {
    const label = blessed.text({
      parent: layout,
      top: 2 + i,
      left: 0,
      width: 6,
      content: labels[i],
    })
    const bar = blessed.text({
      parent: layout,
      top: 2 + i,
      left: 7,
      width: 40,
      content: '',
    })
    gauges.push({ label, bar })
  }

  const footer = blessed.text({
    parent: layout,
    top: 7,
    left: 0,
    content: 'press q to quit',
  })

  const times = []

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()

    frameLabel.setContent(`Frame: ${i}`)

    const multipliers = [1, 3, 7, 13]
    for (let g = 0; g < 4; g++) {
      const val = (i * multipliers[g]) % 100
      const filled = Math.round(val / 100 * 30)
      const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(30 - filled)
      gauges[g].bar.setContent(`${bar} ${val}%`)
    }

    screen.render()

    times.push(performance.now() - start)
  }

  screen.destroy()

  return { times, bytes: stream.bytes }
}

// ====================================================================
// run
// ====================================================================

const ITERATIONS = 10000
const WARMUP = 100

console.log(`benchmark: ${ITERATIONS} frames, ${WARMUP} warmup\n`)

async function run(name, fn) {
  // warmup
  await fn(WARMUP)
  // actual
  const { times } = await fn(ITERATIONS)

  return {
    name,
    median: median(times),
    p99: p99(times),
    mean: times.reduce((a, b) => a + b, 0) / times.length,
    min: Math.min(...times),
    max: Math.max(...times),
    fps: 1000 / median(times),
  }
}

const results = []
results.push(await run('trend', benchTrend))
results.push(await run('ink', benchInk))
results.push(await run('neo-blessed', benchBlessed))

const pad = (s, n) => String(s).padStart(n)
const fmt = (n) => n < 1 ? n.toFixed(3) : n < 10 ? n.toFixed(2) : n.toFixed(1)

console.log('library      median(ms)  p99(ms)  mean(ms)  min(ms)  max(ms)      fps')
console.log('-'.repeat(78))
for (const r of results) {
  console.log(
    r.name.padEnd(13) +
    pad(fmt(r.median), 9) +
    pad(fmt(r.p99), 9) +
    pad(fmt(r.mean), 9) +
    pad(fmt(r.min), 9) +
    pad(fmt(r.max), 9) +
    pad(Math.floor(r.fps), 9)
  )
}

const fastest = results.reduce((a, b) => a.median < b.median ? a : b)
console.log(`\nfastest: ${fastest.name}`)
for (const r of results) {
  if (r !== fastest) {
    console.log(`  ${r.name} is ${(r.median / fastest.median).toFixed(1)}x slower`)
  }
}
