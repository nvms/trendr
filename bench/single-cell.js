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

const W = 200
const H = 50
const CELLS = W * H
const STATIC_ROW = 'x'.repeat(W)
const FRAMES = 100

// each frame changes only a counter in the top-right corner.
// on a 200x50 terminal that's ~4 characters out of 10,000 cells.

// ====================================================================
// trend
// ====================================================================

async function measureTrend() {
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

  function App({ frame }) {
    const kids = [
      jsxs('box', {
        style: { flexDirection: 'row' },
        children: [
          jsx('text', { style: { bold: true }, children: 'dashboard' }),
          jsx('box', { style: { flexGrow: 1 } }),
          jsx('text', { children: String(frame) }),
        ],
      }),
    ]
    for (let i = 0; i < H - 2; i++) kids.push(jsx('text', { key: i, children: STATIC_ROW }))
    kids.push(jsx('text', { style: { color: 'gray' }, children: 'status: ok' }))
    return jsxs('box', { style: { flexDirection: 'column' }, children: kids })
  }

  let prev = createBuffer(W, H)
  let curr = createBuffer(W, H)
  const stream = new FakeStream(W, H)

  clearBuffer(prev)
  const initTree = resolve(jsx(App, { frame: -1 }))
  computeLayout(initTree, { x: 0, y: 0, width: W, height: H })
  paintTree(initTree, prev)
  stream.bytes = 0

  const perFrame = []

  for (let i = 0; i < FRAMES; i++) {
    const before = stream.bytes

    clearBuffer(curr)
    const tree = resolve(jsx(App, { frame: i }))
    computeLayout(tree, { x: 0, y: 0, width: W, height: H })
    paintTree(tree, curr)
    const { output } = diff(prev, curr)
    if (output) stream.write(output)
    const tmp = prev; prev = curr; curr = tmp

    perFrame.push(stream.bytes - before)
  }

  return { perFrame, median: median(perFrame) }
}

// ====================================================================
// ink - each rerender gets a full flush so writes aren't coalesced
// ====================================================================

async function measureInk() {
  const React = await import('react')
  const { render, Box, Text } = await import('ink')
  const { createElement: h } = React

  const stream = new FakeStream(W, H)

  function App({ frame }) {
    const kids = [
      h(Box, { key: 'hdr', flexDirection: 'row' },
        h(Text, { bold: true }, 'dashboard'),
        h(Box, { flexGrow: 1 }),
        h(Text, null, String(frame)),
      ),
    ]
    for (let i = 0; i < H - 2; i++) kids.push(h(Text, { key: i }, STATIC_ROW))
    kids.push(h(Text, { key: 'ftr', color: 'gray' }, 'status: ok'))
    return h(Box, { flexDirection: 'column' }, ...kids)
  }

  const instance = render(h(App, { frame: 0 }), { stdout: stream, stdin: new FakeInput(), exitOnCtrlC: false })
  await new Promise(r => setTimeout(r, 100))
  stream.bytes = 0

  const perFrame = []

  for (let i = 1; i <= FRAMES; i++) {
    const before = stream.bytes
    instance.rerender(h(App, { frame: i }))
    await new Promise(r => setTimeout(r, 50))
    perFrame.push(stream.bytes - before)
  }

  instance.unmount()
  await new Promise(r => setTimeout(r, 100))

  return { perFrame, median: median(perFrame) }
}

// ====================================================================
// blessed
// ====================================================================

async function measureBlessed() {
  const { default: blessed } = await import('neo-blessed')

  const stream = new FakeStream(W, H)
  const inp = new FakeInput()

  const screen = blessed.screen({
    output: stream,
    input: inp,
    smartCSR: true,
    terminal: 'xterm-256color',
    fullUnicode: true,
  })

  const header = blessed.box({ parent: screen, top: 0, left: 0, width: W, height: 1 })
  blessed.text({ parent: header, left: 0, content: 'dashboard', bold: true })
  const counterWidget = blessed.text({ parent: header, right: 0, content: '0' })

  for (let y = 0; y < H - 2; y++) {
    blessed.text({ parent: screen, top: y + 1, left: 0, width: W, content: STATIC_ROW })
  }

  blessed.text({ parent: screen, bottom: 0, left: 0, content: 'status: ok' })

  screen.render()
  stream.bytes = 0

  const perFrame = []

  for (let i = 0; i < FRAMES; i++) {
    const before = stream.bytes
    counterWidget.setContent(String(i))
    screen.render()
    perFrame.push(stream.bytes - before)
  }

  screen.destroy()

  return { perFrame, median: median(perFrame) }
}

// ====================================================================
// run
// ====================================================================

const print = s => process.stderr.write(s + '\n')

print(`single-cell benchmark: ${W}x${H} terminal (${CELLS.toLocaleString()} cells), ${FRAMES} frames`)
print(`each frame changes only a counter in the corner. everything else is static.`)
print(`this measures bytes written to stdout per frame - the I/O cost of a render.\n`)

const trend = await measureTrend()
const ink = await measureInk()
const blessed = await measureBlessed()

const pad = (s, n) => String(s).padStart(n)

print('library          bytes/frame')
print('-'.repeat(35))
print('trend          ' + pad(trend.median, 12))
print('ink            ' + pad(ink.median, 12))
print('neo-blessed    ' + pad(blessed.median, 12))

print('')
if (trend.median > 0 && ink.median > 0) {
  const ratio = Math.round(ink.median / trend.median)
  print(`ink writes ${ratio}x more bytes per frame than trend.`)
  print(`on a ${CELLS.toLocaleString()}-cell screen where ~4 cells change, per-cell diffing`)
  print(`skips ${((1 - trend.median / ink.median) * 100).toFixed(1)}% of the stdout output.`)
}

if (blessed.median > 0 && trend.median > 0) {
  print(`neo-blessed writes ${Math.round(blessed.median / trend.median)}x more bytes per frame than trend.`)
} else if (blessed.median === 0) {
  print(`neo-blessed bytes aren't captured (it buffers internally through a path`)
  print(`our fake stream can't intercept). timing benchmarks in run.js cover it.`)
}

setTimeout(() => process.exit(), 100)
