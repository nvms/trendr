import { EventEmitter } from 'events'
import { performance } from 'perf_hooks'

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

const ITERATIONS = 10000
const WARMUP = 50

const SIZES = [
  { w: 80, h: 24 },
  { w: 120, h: 40 },
  { w: 60, h: 16 },
  { w: 160, h: 50 },
  { w: 40, h: 12 },
  { w: 100, h: 30 },
]

// ====================================================================
// trend
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
    const style = node.props?.style ?? {}
    if (style.bg) fillRect(buf, layout.x, layout.y, layout.width, layout.height, ' ', null, style.bg, 0)
    if (node._resolvedChildren) for (const c of node._resolvedChildren) paintTree(c, buf)
  }

  function App({ w, h }) {
    return jsxs('box', {
      style: { flexDirection: 'column', height: '100%' },
      children: [
        jsxs('box', {
          style: { flexDirection: 'row' },
          children: [
            jsx('text', { style: { bold: true }, children: 'dashboard' }),
            jsx('box', { style: { flexGrow: 1 } }),
            jsx('text', { style: { color: 'gray' }, children: `${w}x${h}` }),
          ],
        }),
        jsxs('box', {
          style: { flexDirection: 'row', flexGrow: 1 },
          children: [
            jsxs('box', {
              style: { flexDirection: 'column', flexGrow: 1, border: 'single' },
              children: [
                jsx('text', { children: 'main content panel' }),
                jsx('text', { children: 'this area resizes with the terminal' }),
                jsx('text', { style: { color: 'cyan' }, children: 'status: ok' }),
              ],
            }),
            jsxs('box', {
              style: { flexDirection: 'column', width: Math.min(30, Math.floor(w / 3)), border: 'single' },
              children: [
                jsx('text', { style: { bold: true }, children: 'sidebar' }),
                jsx('text', { children: 'item 1' }),
                jsx('text', { children: 'item 2' }),
                jsx('text', { children: 'item 3' }),
              ],
            }),
          ],
        }),
        jsx('text', { style: { color: 'gray', dim: true }, children: 'press q to quit' }),
      ],
    })
  }

  const stream = new FakeStream()
  const times = []

  for (let i = 0; i < iterations; i++) {
    const size = SIZES[i % SIZES.length]
    stream.columns = size.w
    stream.rows = size.h

    const start = performance.now()

    let prev = createBuffer(size.w, size.h)
    let curr = createBuffer(size.w, size.h)

    clearBuffer(curr)
    const tree = resolve(jsx(App, { w: size.w, h: size.h }))
    computeLayout(tree, { x: 0, y: 0, width: size.w, height: size.h })
    paintTree(tree, curr)
    const { output } = diff(prev, curr)
    if (output) stream.write(output)

    times.push(performance.now() - start)
  }

  return { times, bytes: stream.bytes }
}

// ====================================================================
// ink
// ====================================================================

async function benchInk(iterations) {
  const React = await import('react')
  const { render, Box, Text } = await import('ink')
  const { createElement: h } = React

  const stream = new FakeStream()
  const inp = new FakeInput()

  function App({ w, h }) {
    return h(Box, { flexDirection: 'column', height: h },
      h(Box, { flexDirection: 'row' },
        h(Text, { bold: true }, 'dashboard'),
        h(Box, { flexGrow: 1 }),
        h(Text, { color: 'gray' }, `${w}x${h}`),
      ),
      h(Box, { flexDirection: 'row', flexGrow: 1 },
        h(Box, { flexDirection: 'column', flexGrow: 1, borderStyle: 'single' },
          h(Text, null, 'main content panel'),
          h(Text, null, 'this area resizes with the terminal'),
          h(Text, { color: 'cyan' }, 'status: ok'),
        ),
        h(Box, { flexDirection: 'column', width: Math.min(30, Math.floor(w / 3)), borderStyle: 'single' },
          h(Text, { bold: true }, 'sidebar'),
          h(Text, null, 'item 1'),
          h(Text, null, 'item 2'),
          h(Text, null, 'item 3'),
        ),
      ),
      h(Text, { color: 'gray', dimColor: true }, 'press q to quit'),
    )
  }

  const times = []
  const instance = render(h(App, { w: 80, h: 24 }), { stdout: stream, stdin: inp, exitOnCtrlC: false })

  for (let i = 0; i < iterations; i++) {
    const size = SIZES[i % SIZES.length]
    stream.columns = size.w
    stream.rows = size.h

    const start = performance.now()
    stream.emit('resize')
    instance.rerender(h(App, { w: size.w, h: size.h }))
    times.push(performance.now() - start)
  }

  instance.unmount()
  await new Promise(r => setTimeout(r, 200))

  return { times, bytes: stream.bytes }
}

// ====================================================================
// blessed
// ====================================================================

async function benchBlessed(iterations) {
  const { default: blessed } = await import('neo-blessed')

  const stream = new FakeStream()
  const inp = new FakeInput()

  const screen = blessed.screen({
    output: stream,
    input: inp,
    smartCSR: true,
    terminal: 'xterm-256color',
    fullUnicode: true,
  })

  const header = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
  })

  const headerTitle = blessed.text({ parent: header, left: 0, content: 'dashboard', bold: true })
  const headerSize = blessed.text({ parent: header, right: 0, content: '80x24' })

  const main = blessed.box({
    parent: screen,
    top: 1,
    left: 0,
    width: '70%',
    height: '100%-3',
    border: { type: 'line' },
  })

  blessed.text({ parent: main, top: 0, content: 'main content panel' })
  blessed.text({ parent: main, top: 1, content: 'this area resizes with the terminal' })
  blessed.text({ parent: main, top: 2, content: 'status: ok', style: { fg: 'cyan' } })

  const sidebar = blessed.box({
    parent: screen,
    top: 1,
    right: 0,
    width: '30%',
    height: '100%-3',
    border: { type: 'line' },
  })

  blessed.text({ parent: sidebar, top: 0, content: 'sidebar', bold: true })
  blessed.text({ parent: sidebar, top: 1, content: 'item 1' })
  blessed.text({ parent: sidebar, top: 2, content: 'item 2' })
  blessed.text({ parent: sidebar, top: 3, content: 'item 3' })

  const footer = blessed.text({
    parent: screen,
    bottom: 0,
    left: 0,
    content: 'press q to quit',
  })

  const times = []

  for (let i = 0; i < iterations; i++) {
    const size = SIZES[i % SIZES.length]
    stream.columns = size.w
    stream.rows = size.h

    const start = performance.now()

    headerSize.setContent(`${size.w}x${size.h}`)
    screen.program.cols = size.w
    screen.program.rows = size.h
    screen.alloc()
    screen.render()

    times.push(performance.now() - start)
  }

  screen.destroy()

  return { times, bytes: stream.bytes }
}

// ====================================================================
// run
// ====================================================================

console.log(`resize benchmark: ${ITERATIONS} resizes across ${SIZES.length} sizes, ${WARMUP} warmup\n`)

async function run(name, fn) {
  await fn(WARMUP)
  const { times, bytes } = await fn(ITERATIONS)

  return {
    name,
    median: median(times),
    p99: p99(times),
    mean: times.reduce((a, b) => a + b, 0) / times.length,
    min: Math.min(...times),
    max: Math.max(...times),
    fps: 1000 / median(times),
    bytes,
  }
}

const results = []
results.push(await run('trend', benchTrend))
results.push(await run('ink', benchInk))
results.push(await run('neo-blessed', benchBlessed))

const pad = (s, n) => String(s).padStart(n)
const fmt = (n) => n < 1 ? n.toFixed(3) : n < 10 ? n.toFixed(2) : n.toFixed(1)
const fmtKB = (n) => (n / 1024).toFixed(0) + 'KB'

console.log('library      median(ms)  p99(ms)  mean(ms)  min(ms)  max(ms)      fps    bytes')
console.log('-'.repeat(85))
for (const r of results) {
  console.log(
    r.name.padEnd(13) +
    pad(fmt(r.median), 9) +
    pad(fmt(r.p99), 9) +
    pad(fmt(r.mean), 9) +
    pad(fmt(r.min), 9) +
    pad(fmt(r.max), 9) +
    pad(Math.floor(r.fps), 9) +
    pad(fmtKB(r.bytes), 9)
  )
}

const fastest = results.reduce((a, b) => a.median < b.median ? a : b)
console.log(`\nfastest: ${fastest.name}`)
for (const r of results) {
  if (r !== fastest) {
    console.log(`  ${r.name} is ${(r.median / fastest.median).toFixed(1)}x slower`)
  }
}
