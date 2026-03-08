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

// this benchmark measures the dirty-rect optimization:
// a large screen where only a small counter changes each frame.
// most of the UI is static text that should be skipped by paint.

const W = 200
const H = 50
const FRAMES = 5000
const WARMUP = 200

// ====================================================================
// with dirty-rect (real renderer pipeline)
// ====================================================================

async function benchReal() {
  const { createBuffer, clearBuffer, writeText, blitRect } = await import('../src/buffer.js')
  const { diff } = await import('../src/diff.js')
  const { computeLayout, resolveBorderEdges } = await import('../src/layout.js')
  const { createSignal, startRenderTracking, stopRenderTracking } = await import('../src/signal.js')
  const { wordWrap, measureText, sliceVisible } = await import('../src/wrap.js')
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

  // dirty-rect version: skip painting subtrees that haven't changed
  function paintTreeDirty(node, buf, prevBuf, dirtyRect) {
    if (!node) return
    if (node._resolved) { paintTreeDirty(node._resolved, buf, prevBuf, dirtyRect); return }
    const layout = node._layout
    if (!layout) return

    // if this node's rect doesn't overlap the dirty region, blit from prev
    if (dirtyRect && prevBuf) {
      if (layout.x + layout.width <= dirtyRect.x || layout.x >= dirtyRect.x + dirtyRect.width ||
          layout.y + layout.height <= dirtyRect.y || layout.y >= dirtyRect.y + dirtyRect.height) {
        blitRect(prevBuf, buf, layout.x, layout.y, layout.width, layout.height)
        return
      }
    }

    if (node.type === 'text') {
      const text = extractText(node)
      if (text) {
        const lines = wordWrap(text, layout.width)
        for (let i = 0; i < lines.length && i < layout.height; i++) writeText(buf, layout.x, layout.y + i, lines[i], null, null, 0, layout.width)
      }
      return
    }
    if (node._resolvedChildren) for (const c of node._resolvedChildren) paintTreeDirty(c, buf, prevBuf, dirtyRect)
  }

  const STATIC_ROW = 'x'.repeat(W)
  const [count, setCount] = createSignal(0)

  function App() {
    const kids = [
      jsxs('box', {
        style: { flexDirection: 'row' },
        children: [
          jsx('text', { style: { bold: true }, children: 'dashboard' }),
          jsx('box', { style: { flexGrow: 1 } }),
          jsx('text', { children: String(count()) }),
        ],
      }),
    ]
    for (let i = 0; i < H - 2; i++) kids.push(jsx('text', { key: i, children: STATIC_ROW }))
    kids.push(jsx('text', { style: { color: 'gray' }, children: 'status: ok' }))
    return jsxs('box', { style: { flexDirection: 'column' }, children: kids })
  }

  // baseline: full repaint
  {
    let prev = createBuffer(W, H)
    let curr = createBuffer(W, H)
    const stream = new FakeStream(W, H)
    const times = []

    for (let i = 0; i < WARMUP + FRAMES; i++) {
      setCount(i)
      const start = performance.now()

      clearBuffer(curr)
      const tree = resolve(jsx(App, {}))
      computeLayout(tree, { x: 0, y: 0, width: W, height: H })
      paintTree(tree, curr)
      const { output } = diff(prev, curr)
      if (output) stream.write(output)
      const tmp = prev; prev = curr; curr = tmp

      if (i >= WARMUP) times.push(performance.now() - start)
    }

    console.log('baseline (full repaint)')
    console.log(`  median: ${median(times).toFixed(3)}ms`)
    console.log(`  p99:    ${p99(times).toFixed(3)}ms`)
    console.log(`  bytes:  ${stream.bytes} total, ${Math.round(stream.bytes / (WARMUP + FRAMES))}/frame avg`)
    console.log()
  }

  // optimized: dirty-rect skip
  {
    let prev = createBuffer(W, H)
    let curr = createBuffer(W, H)
    const stream = new FakeStream(W, H)
    const times = []

    // the counter is in the top-right area. row 0, last ~6 chars.
    const dirtyRect = { x: W - 10, y: 0, width: 10, height: 1 }

    for (let i = 0; i < WARMUP + FRAMES; i++) {
      setCount(i)
      const start = performance.now()

      clearBuffer(curr)
      const tree = resolve(jsx(App, {}))
      computeLayout(tree, { x: 0, y: 0, width: W, height: H })
      paintTreeDirty(tree, curr, prev, dirtyRect)
      const { output } = diff(prev, curr)
      if (output) stream.write(output)
      const tmp = prev; prev = curr; curr = tmp

      if (i >= WARMUP) times.push(performance.now() - start)
    }

    console.log('dirty-rect (skip static subtrees)')
    console.log(`  median: ${median(times).toFixed(3)}ms`)
    console.log(`  p99:    ${p99(times).toFixed(3)}ms`)
    console.log(`  bytes:  ${stream.bytes} total, ${Math.round(stream.bytes / (WARMUP + FRAMES))}/frame avg`)
    console.log()
  }

  // optimized v2: dirty-rect + copyBuffer instead of clear
  {
    const { copyBuffer } = await import('../src/buffer.js')
    let prev = createBuffer(W, H)
    let curr = createBuffer(W, H)
    const stream = new FakeStream(W, H)
    const times = []

    const dirtyRect = { x: W - 10, y: 0, width: 10, height: 1 }

    // prime prev with first frame
    clearBuffer(prev)
    setCount(-1)
    const initTree = resolve(jsx(App, {}))
    computeLayout(initTree, { x: 0, y: 0, width: W, height: H })
    paintTree(initTree, prev)
    stream.bytes = 0

    for (let i = 0; i < WARMUP + FRAMES; i++) {
      setCount(i)
      const start = performance.now()

      copyBuffer(prev, curr)
      const tree = resolve(jsx(App, {}))
      computeLayout(tree, { x: 0, y: 0, width: W, height: H })
      // only paint the dirty region
      paintTreeDirty(tree, curr, prev, dirtyRect)
      const { output } = diff(prev, curr)
      if (output) stream.write(output)
      const tmp = prev; prev = curr; curr = tmp

      if (i >= WARMUP) times.push(performance.now() - start)
    }

    console.log('dirty-rect + copyBuffer')
    console.log(`  median: ${median(times).toFixed(3)}ms`)
    console.log(`  p99:    ${p99(times).toFixed(3)}ms`)
    console.log(`  bytes:  ${stream.bytes} total, ${Math.round(stream.bytes / (WARMUP + FRAMES))}/frame avg`)
  }
}

console.log(`dirty-rect benchmark: ${W}x${H} terminal, ${FRAMES} frames (${WARMUP} warmup)`)
console.log(`most of the screen is static. only a counter in the corner changes.\n`)

await benchReal()
