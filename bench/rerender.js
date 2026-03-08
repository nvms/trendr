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

const PARAGRAPH = 'Cupcake ipsum dolor sit amet candy candy. Sesame snaps cookie I love tootsie roll apple pie bonbon wafer. Caramels sesame snaps icing cotton candy I love cookie sweet roll. I love bonbon sweet.'

// ====================================================================
// trend benchmark
// ====================================================================

async function benchTrend(iterations) {
  const { createBuffer, clearBuffer, writeText } = await import('../src/buffer.js')
  const { diff } = await import('../src/diff.js')
  const { computeLayout } = await import('../src/layout.js')
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

  // trend renders the full visible window every frame and diffs.
  // the "static" items scroll up naturally - only the visible slice
  // of the item list is shown, plus the bottom UI with a counter.
  // per-cell diffing means only the new item row and the counter
  // digits actually produce output.

  function App({ items, count }) {
    const visibleItems = items.slice(-8)

    return jsxs('box', {
      style: { flexDirection: 'column' },
      children: [
        jsxs('box', { style: { flexDirection: 'column' }, children:
          visibleItems.map((item, i) =>
            jsxs('box', { key: item.id, style: { flexDirection: 'column', padding: 1 }, children: [
              jsx('text', { style: { color: 'green' }, children: `Item #${item.id}` }),
              jsx('text', { children: 'Item content' }),
            ]}),
          ),
        }),
        jsxs('box', { style: { flexDirection: 'column', padding: 1 }, children: [
          jsx('text', { style: { bold: true, underline: true, color: 'red' }, children: 'Hello World' }),
          jsx('text', { children: `Rendered: ${count}` }),
          jsx('box', { style: { marginTop: 1, width: 60 }, children:
            jsx('text', { children: PARAGRAPH }),
          }),
          jsxs('box', { style: { marginTop: 1, flexDirection: 'column' }, children: [
            jsx('text', { style: { bg: 'white', color: 'black' }, children: 'Colors:' }),
            jsxs('box', { style: { flexDirection: 'column', paddingLeft: 1 }, children: [
              jsx('text', { children: '- Red' }),
              jsx('text', { children: '- Blue' }),
              jsx('text', { children: '- Green' }),
            ]}),
          ]}),
        ]}),
      ],
    })
  }

  let prev = createBuffer(W, H)
  let curr = createBuffer(W, H)
  const stream = new FakeStream(W, H)
  const times = []
  const items = []

  for (let i = 0; i < iterations; i++) {
    items.push({ id: i })

    const start = performance.now()

    clearBuffer(curr)
    const tree = resolve(jsx(App, { items, count: items.length }))
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
// ink benchmark - adapted from ink's own Static benchmark
// ====================================================================

async function benchInk(iterations) {
  const React = await import('react')
  const { render, Box, Text, Static } = await import('ink')
  const { createElement: h } = React

  const stream = new FakeStream(80, 24)

  function App({ items }) {
    return h(Box, { flexDirection: 'column' },
      h(Static, { items },
        (item, index) => h(Box, { key: item.id, padding: 1, flexDirection: 'column' },
          h(Text, { color: 'green' }, `Item #${index}`),
          h(Text, null, 'Item content'),
        ),
      ),
      h(Box, { flexDirection: 'column', padding: 1 },
        h(Text, { underline: true, bold: true, color: 'red' }, 'Hello World'),
        h(Text, null, `Rendered: ${items.length}`),
        h(Box, { marginTop: 1, width: 60 },
          h(Text, null, PARAGRAPH),
        ),
        h(Box, { marginTop: 1, flexDirection: 'column' },
          h(Text, { backgroundColor: 'white', color: 'black' }, 'Colors:'),
          h(Box, { flexDirection: 'column', paddingLeft: 1 },
            h(Text, null, '- ', h(Text, { color: 'red' }, 'Red')),
            h(Text, null, '- ', h(Text, { color: 'blue' }, 'Blue')),
            h(Text, null, '- ', h(Text, { color: 'green' }, 'Green')),
          ),
        ),
      ),
    )
  }

  const times = []
  const items = []

  const instance = render(h(App, { items: [] }), { stdout: stream, stdin: new FakeInput(), exitOnCtrlC: false })

  for (let i = 0; i < iterations; i++) {
    items.push({ id: i })
    const snapshot = items.slice()

    const start = performance.now()
    instance.rerender(h(App, { items: snapshot }))
    times.push(performance.now() - start)
  }

  instance.unmount()
  await new Promise(r => setTimeout(r, 200))

  return { times, bytes: stream.bytes }
}

// ====================================================================
// run
// ====================================================================

const ITERATIONS = 1000
const WARMUP = 100

console.log(`rerender benchmark: ${ITERATIONS} frames, ${WARMUP} warmup`)
console.log(`growing list + live counter (ink's Static benchmark)\n`)

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

const pad = (s, n) => String(s).padStart(n)
const fmt = (n) => n < 1 ? n.toFixed(3) : n < 10 ? n.toFixed(2) : n.toFixed(1)

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
    pad(Math.floor(r.bytes / 1024) + 'KB', 9)
  )
}

const fastest = results.reduce((a, b) => a.median < b.median ? a : b)
console.log(`\nfastest: ${fastest.name}`)
for (const r of results) {
  if (r !== fastest) {
    console.log(`  ${r.name} is ${(r.median / fastest.median).toFixed(1)}x slower`)
  }
}
