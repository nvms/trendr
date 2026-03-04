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

const ITEMS = 10000
const SCROLL_FRAMES = 1000
const WARMUP = 100
const W = 80
const H = 24

const DATA = Array.from({ length: ITEMS }, (_, i) => ({
  id: i,
  name: `item-${String(i).padStart(5, '0')}`,
  value: ((i * 7) % 100).toFixed(1),
  status: i % 3 === 0 ? 'active' : i % 3 === 1 ? 'pending' : 'done',
}))

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

  const [selected, setSelected] = createSignal(0)

  const visibleH = H - 2

  function App() {
    const sel = selected()
    const scrollOffset = Math.max(0, Math.min(sel - Math.floor(visibleH / 2), ITEMS - visibleH))

    const rows = []
    for (let i = scrollOffset; i < scrollOffset + visibleH && i < ITEMS; i++) {
      const item = DATA[i]
      const isSel = i === sel
      rows.push(jsxs('box', {
        key: i,
        style: { flexDirection: 'row', bg: isSel ? 'cyan' : null },
        children: [
          jsx('text', { style: { width: 8, color: isSel ? 'black' : null }, children: String(item.id) }),
          jsx('text', { style: { width: 20, color: isSel ? 'black' : 'cyan' }, children: item.name }),
          jsx('text', { style: { width: 8, color: isSel ? 'black' : 'yellow' }, children: item.value }),
          jsx('text', { style: { color: isSel ? 'black' : 'green' }, children: item.status }),
        ],
      }))
    }

    return jsxs('box', {
      style: { flexDirection: 'column' },
      children: [
        jsxs('box', {
          style: { flexDirection: 'row' },
          children: [
            jsx('text', { style: { width: 8, bold: true }, children: 'ID' }),
            jsx('text', { style: { width: 20, bold: true }, children: 'NAME' }),
            jsx('text', { style: { width: 8, bold: true }, children: 'VALUE' }),
            jsx('text', { style: { bold: true }, children: 'STATUS' }),
          ],
        }),
        ...rows,
      ],
    })
  }

  let prev = createBuffer(W, H)
  let curr = createBuffer(W, H)
  const stream = new FakeStream(W, H)
  const times = []

  for (let i = 0; i < iterations; i++) {
    setSelected(i)

    const start = performance.now()

    clearBuffer(curr)
    const tree = resolve(jsx(App, {}))
    computeLayout(tree, { x: 0, y: 0, width: W, height: H })
    paintTree(tree, curr)
    const output = diff(prev, curr)
    if (output) stream.write(output)
    const tmp = prev; prev = curr; curr = tmp

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

  const stream = new FakeStream(W, H)
  const visibleH = H - 2

  function App({ selected }) {
    const scrollOffset = Math.max(0, Math.min(selected - Math.floor(visibleH / 2), ITEMS - visibleH))

    const rows = []
    for (let i = scrollOffset; i < scrollOffset + visibleH && i < ITEMS; i++) {
      const item = DATA[i]
      const isSel = i === selected
      rows.push(
        h(Box, { key: i, flexDirection: 'row' },
          h(Text, { color: isSel ? 'black' : undefined, backgroundColor: isSel ? 'cyan' : undefined }, String(item.id).padEnd(8)),
          h(Text, { color: isSel ? 'black' : 'cyan', backgroundColor: isSel ? 'cyan' : undefined }, item.name.padEnd(20)),
          h(Text, { color: isSel ? 'black' : 'yellow', backgroundColor: isSel ? 'cyan' : undefined }, item.value.padEnd(8)),
          h(Text, { color: isSel ? 'black' : 'green', backgroundColor: isSel ? 'cyan' : undefined }, item.status),
        )
      )
    }

    return h(Box, { flexDirection: 'column' },
      h(Box, { flexDirection: 'row' },
        h(Text, { bold: true }, 'ID'.padEnd(8)),
        h(Text, { bold: true }, 'NAME'.padEnd(20)),
        h(Text, { bold: true }, 'VALUE'.padEnd(8)),
        h(Text, { bold: true }, 'STATUS'),
      ),
      ...rows,
    )
  }

  const times = []
  const instance = render(h(App, { selected: 0 }), { stdout: stream, stdin: new FakeInput(), exitOnCtrlC: false })

  for (let i = 1; i < iterations; i++) {
    const start = performance.now()
    instance.rerender(h(App, { selected: i }))
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

  const stream = new FakeStream(W, H)
  const inp = new FakeInput()
  const visibleH = H - 2

  const screen = blessed.screen({
    output: stream,
    input: inp,
    smartCSR: true,
    terminal: 'xterm-256color',
    fullUnicode: true,
  })

  const headerRow = blessed.text({
    parent: screen,
    top: 0,
    left: 0,
    width: W,
    content: 'ID'.padEnd(8) + 'NAME'.padEnd(20) + 'VALUE'.padEnd(8) + 'STATUS',
    bold: true,
  })

  const rowWidgets = []
  for (let r = 0; r < visibleH; r++) {
    const widget = blessed.text({
      parent: screen,
      top: r + 1,
      left: 0,
      width: W,
      content: '',
    })
    rowWidgets.push(widget)
  }

  const times = []

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()

    const scrollOffset = Math.max(0, Math.min(i - Math.floor(visibleH / 2), ITEMS - visibleH))

    for (let r = 0; r < visibleH; r++) {
      const idx = scrollOffset + r
      if (idx >= ITEMS) {
        rowWidgets[r].setContent('')
        rowWidgets[r].style.bg = undefined
        continue
      }
      const item = DATA[idx]
      const isSel = idx === i
      rowWidgets[r].setContent(
        String(item.id).padEnd(8) + item.name.padEnd(20) + item.value.padEnd(8) + item.status
      )
      rowWidgets[r].style.bg = isSel ? 'cyan' : undefined
      rowWidgets[r].style.fg = isSel ? 'black' : undefined
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

console.log(`list benchmark: ${ITEMS} items, ${SCROLL_FRAMES} scroll frames, ${WARMUP} warmup\n`)

async function run(name, fn) {
  await fn(WARMUP)
  const { times, bytes } = await fn(SCROLL_FRAMES)

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
