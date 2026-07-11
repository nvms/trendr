import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { createBuffer, clearBuffer, writeText, fillRect } from '../src/buffer.js'
import { diff } from '../src/diff.js'
import { computeLayout } from '../src/layout.js'
import { Fragment } from '../src/element.js'
import { createSignal, createSignalRaw, createScope, disposeScope, createEffect, createMemo, setHookRegistrar } from '../src/signal.js'
import { createScheduler } from '../src/scheduler.js'
import { wordWrap } from '../src/wrap.js'
import { jsx, jsxs } from '../jsx-runtime.js'
import * as ansi from '../src/ansi.js'
import { startHookTracking, endHookTracking, registerHook, registerOverlay, mount } from '../src/renderer.js'
import { useInput } from '../src/hooks.js'
import { Modal } from '../src/modal.js'
import { bufferToLines } from '../src/serialize.js'

let passed = 0
let failed = 0

function assert(cond, msg) {
  if (cond) passed++
  else { failed++; console.log(`  FAIL: ${msg}`) }
}

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

function resolveForFrame(element, parent, instances) {
  if (element == null || typeof element === 'boolean') return null
  if (typeof element === 'string' || typeof element === 'number') {
    return { type: 'text', props: { children: String(element) }, key: null, _parent: parent, _layout: null, _resolved: null, _resolvedChildren: null }
  }
  const node = { type: element.type, props: element.props ?? {}, key: element.key, _parent: parent, _layout: null, _resolved: null, _resolvedChildren: null }
  if (typeof element.type === 'function') {
    let instance = instances.get(element.type)
    if (!instance) {
      let result
      instance = { scope: null, fn: element.type, hooks: [] }
      instances.set(element.type, instance)
      instance.scope = createScope(() => {
        startHookTracking(instance)
        result = element.type(element.props ?? {})
        endHookTracking()
      })
      node._resolved = resolveForFrame(result, node, instances)
    } else {
      startHookTracking(instance)
      const result = element.type(element.props ?? {})
      endHookTracking()
      node._resolved = resolveForFrame(result, node, instances)
    }
    return node
  }
  if (element.type === Fragment) {
    const children = flattenChildren(element.props?.children)
    node._resolvedChildren = children.map(c => resolveForFrame(c, node, instances)).filter(Boolean)
    return node
  }
  const children = flattenChildren(element.props?.children)
  if (children.length > 0) {
    node._resolvedChildren = children.map(c => resolveForFrame(c, node, instances)).filter(Boolean)
  }
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

function resolveAttrs(style) {
  let attrs = 0
  if (style.bold) attrs |= ansi.BOLD
  return attrs
}

function paintTree(node, buf) {
  if (!node) return
  if (node._resolved) { paintTree(node._resolved, buf); return }
  if (node.type === Fragment) { if (node._resolvedChildren) for (const c of node._resolvedChildren) paintTree(c, buf); return }
  const layout = node._layout
  if (!layout) return
  const style = node.props?.style ?? {}
  const attrs = resolveAttrs(style)
  if (node.type === 'text') {
    const text = extractText(node)
    if (!text) return
    const lines = wordWrap(text, layout.width)
    for (let i = 0; i < lines.length && i < layout.height; i++) writeText(buf, layout.x, layout.y + i, lines[i], style.color, style.bg, attrs, layout.width)
    return
  }
  if (style.bg) fillRect(buf, layout.x, layout.y, layout.width, layout.height, ' ', null, style.bg, 0)
  if (node._resolvedChildren) for (const c of node._resolvedChildren) paintTree(c, buf)
}

function renderToLines(component, width, height) {
  const instances = new Map()
  function frame() {
    const tree = resolveForFrame(jsx(component, {}), null, instances)
    computeLayout(tree, { x: 0, y: 0, width, height })
    const buf = createBuffer(width, height)
    paintTree(tree, buf)
    const lines = []
    for (let y = 0; y < height; y++) {
      let line = ''
      for (let x = 0; x < width; x++) line += buf.cells[y * width + x].ch
      lines.push(line)
    }
    return lines
  }
  return { frame, instances }
}

// ==========================================================
// TEST: counter component with signal persistence across frames
// ==========================================================
console.log('E2E: counter with signal persistence')
{
  let inputHandler = null

  function Counter() {
    const [count, setCount] = createSignal(0)

    registerHook(() => {
      inputHandler = (key) => {
        if (key === 'up') setCount(c => c + 1)
        if (key === 'down') setCount(c => c - 1)
      }
    })

    return jsxs('box', {
      style: { flexDirection: 'column', padding: 1 },
      children: [
        jsxs('text', { style: { color: 'cyan', bold: true }, children: ['Count: ', count()] }),
        jsx('text', { style: { color: 'gray' }, children: 'up/down to change' }),
      ],
    })
  }

  const { frame } = renderToLines(Counter, 40, 6)

  const lines1 = frame()
  assert(lines1[1].includes('Count: 0'), 'initial render shows Count: 0')
  assert(lines1[2].includes('up/down'), 'shows instructions')
  assert(inputHandler !== null, 'input handler registered')

  inputHandler('up')
  const lines2 = frame()
  assert(lines2[1].includes('Count: 1'), 'after up, shows Count: 1')

  inputHandler('up')
  inputHandler('up')
  const lines3 = frame()
  assert(lines3[1].includes('Count: 3'), 'after two more ups, shows Count: 3')

  inputHandler('down')
  const lines4 = frame()
  assert(lines4[1].includes('Count: 2'), 'after down, shows Count: 2')
}

// ==========================================================
// TEST: component with useInterval-like behavior
// ==========================================================
console.log('E2E: signal updates reflect in re-render')
{
  let setValue

  function Display() {
    const [val, setVal] = createSignal('hello')
    setValue = setVal

    return jsx('text', { children: val() })
  }

  const { frame } = renderToLines(Display, 20, 3)

  const lines1 = frame()
  assert(lines1[0].includes('hello'), 'initial value')

  setValue('world')
  const lines2 = frame()
  assert(lines2[0].includes('world'), 'updated value after signal change')

  setValue('test 123')
  const lines3 = frame()
  assert(lines3[0].includes('test 123'), 'second update')
}

// ==========================================================
// TEST: nested components with signals
// ==========================================================
console.log('E2E: nested components')
{
  let setName

  function Child({ name }) {
    return jsx('text', { children: name() })
  }

  function Parent() {
    const [name, _setName] = createSignal('Alice')
    setName = _setName

    return jsxs('box', {
      style: { flexDirection: 'column' },
      children: [
        jsx('text', { children: 'Name:' }),
        jsx(Child, { name }),
      ],
    })
  }

  const { frame } = renderToLines(Parent, 20, 5)

  const lines1 = frame()
  assert(lines1[0].includes('Name:'), 'label renders')
  assert(lines1[1].includes('Alice'), 'child shows initial name')

  setName('Bob')
  const lines2 = frame()
  assert(lines2[1].includes('Bob'), 'child updates after signal change')
}

// ==========================================================
// TEST: hooks only register once
// ==========================================================
console.log('E2E: hook idempotency')
{
  let hookCallCount = 0

  function HookTest() {
    const [val] = createSignal('x')

    registerHook(() => {
      hookCallCount++
    })

    return jsx('text', { children: val() })
  }

  const { frame } = renderToLines(HookTest, 10, 3)

  frame()
  assert(hookCallCount === 1, 'hook called once on first frame')

  frame()
  assert(hookCallCount === 1, 'hook not called again on second frame')

  frame()
  assert(hookCallCount === 1, 'hook not called again on third frame')
}

// ==========================================================
// TEST: diff produces minimal output
// ==========================================================
console.log('E2E: diff minimality')
{
  const prev = createBuffer(20, 3)
  const curr = createBuffer(20, 3)

  writeText(prev, 0, 0, 'Count: 0', null, null, 0)
  writeText(prev, 0, 1, 'hello', null, null, 0)

  writeText(curr, 0, 0, 'Count: 1', null, null, 0)
  writeText(curr, 0, 1, 'hello', null, null, 0)

  const { output } = diff(prev, curr)
  assert(!output.includes('hello'), 'diff does not include unchanged text')
  assert(output.includes('1'), 'diff includes changed char')
}

// ==========================================================
// mount-based regression tests use fake streams and real frames
// ==========================================================

class FakeStream extends EventEmitter {
  constructor(cols, rows) {
    super()
    this.columns = cols
    this.rows = rows
    this.isTTY = false
    this.output = ''
    this.chunks = []
    this.snapshots = []
  }
  write(d) {
    this.output += d
    this.chunks.push(d)
    this.snapshots.push(String(d))
    return true
  }
}

class FakeInput extends EventEmitter {
  constructor() { super(); this.isTTY = false }
  setRawMode() {}
  sendKey(s) { this.emit('data', Buffer.from(s)) }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const grid = (buf) => bufferToLines(buf).map(l => l.replace(/\x1b\[[0-9;]*m/g, ''))

// ==========================================================
// TEST: disposed scopes unsubscribe their effects
// ==========================================================
console.log('E2E: effect stops firing after disposeScope')
{
  const [sig, setSig] = createSignalRaw(0)
  let runs = 0
  const scope = createScope(() => { createEffect(() => { sig(); runs++ }) })
  assert(runs === 1, 'effect runs once on creation')
  setSig(1)
  assert(runs === 2, 'effect fires on write before dispose')
  disposeScope(scope)
  setSig(2)
  setSig(3)
  assert(runs === 2, 'effect does not fire after disposeScope')
}

// ==========================================================
// TEST: createMemo in a component body does not leak effects
// ==========================================================
console.log('E2E: createMemo in component body is a stable hook')
{
  const out = new FakeStream(40, 6)
  const inp = new FakeInput()
  const [dep, setDep] = createSignalRaw(1)
  let memoRuns = 0

  function App() {
    const doubled = createMemo(() => { memoRuns++; return dep() * 2 })
    return jsx('text', { children: 'value ' + doubled() })
  }

  const h = mount(App, { stream: out, stdin: inp })
  await sleep(40)
  for (let i = 2; i <= 5; i++) { setDep(i); await sleep(40) }

  const before = memoRuns
  setDep(100)
  await sleep(5)
  assert(memoRuns - before === 1, `one dep write fires the memo exactly once (fired ${memoRuns - before} times)`)
  await sleep(40)
  assert(grid(h.getBuffer())[0].includes('value 200'), 'screen shows the memo value')
  h.unmount()
}

// ==========================================================
// TEST: instance cache keys use function identity, not fn.name
// ==========================================================
console.log('E2E: different functions with the same name get separate instances')
{
  const out = new FakeStream(30, 4)
  const inp = new FakeInput()

  const A = () => {
    const [label] = createSignal('AAA')
    return jsx('text', { children: label() })
  }
  const B = (() => {
    const A = () => {
      const [count] = createSignal(0)
      return jsx('text', { children: 'B:' + count() })
    }
    return A
  })()

  const [which, setWhich] = createSignalRaw('a')
  function App() {
    return which() === 'a' ? jsx(A, {}) : jsx(B, {})
  }

  const h = mount(App, { stream: out, stdin: inp })
  await sleep(40)
  assert(grid(h.getBuffer())[0].trim() === 'AAA', 'first component renders its own state')
  setWhich('b')
  await sleep(60)
  assert(grid(h.getBuffer())[0].trim() === 'B:0', 'same-name replacement gets fresh hooks, not inherited state')
  h.unmount()
}

// ==========================================================
// TEST: content flowing through props.children dirties the subtree
// ==========================================================
console.log('E2E: children prop changes invalidate the blit cache')
{
  const out = new FakeStream(20, 4)
  const inp = new FakeInput()
  const [n, setN] = createSignalRaw(1)

  function Wrapper(props) {
    return jsx('box', { children: props.children })
  }
  function App() {
    return jsx(Wrapper, { children: jsx('text', { children: 'v' + n() }) })
  }

  const h = mount(App, { stream: out, stdin: inp })
  await sleep(40)
  assert(grid(h.getBuffer())[0].includes('v1'), 'initial children render')
  setN(2)
  await sleep(60)
  assert(grid(h.getBuffer())[0].includes('v2'), 'children change repaints instead of blitting stale pixels')
  setN(3)
  await sleep(60)
  assert(grid(h.getBuffer())[0].includes('v3'), 'subsequent children changes keep repainting')
  h.unmount()
}

// ==========================================================
// TEST: signal writes during a frame are not dropped
// ==========================================================
console.log('E2E: write during render queues a follow-up frame')
{
  const out = new FakeStream(30, 4)
  const inp = new FakeInput()
  const [a, setA] = createSignalRaw(0)
  const [b, setB] = createSignalRaw(0)

  function Writer() {
    if (a() === 1 && b() === 0) setB(1)
    return jsx('text', { children: 'a=' + a() })
  }
  function Reader() {
    return jsx('text', { children: 'b=' + b() })
  }
  function App() {
    return jsxs('box', { style: { flexDirection: 'column' }, children: [jsx(Reader, {}), jsx(Writer, {})] })
  }

  const h = mount(App, { stream: out, stdin: inp })
  await sleep(40)
  setA(1)
  await sleep(120)
  assert(b() === 1, 'writer ran during a frame')
  assert(grid(h.getBuffer())[0].includes('b=1'), 'follow-up frame rendered the mid-frame write')
  h.unmount()
}

// ==========================================================
// TEST: destroyed scheduler never fires another frame
// ==========================================================
console.log('E2E: no frames after unmount')
{
  const out = new FakeStream(30, 4)
  const inp = new FakeInput()
  const [x, setX] = createSignalRaw(0)
  function App() { return jsx('text', { children: 'x' + x() }) }

  const h = mount(App, { stream: out, stdin: inp })
  await sleep(40)
  setX(1)
  h.unmount()
  const lenAtUnmount = out.output.length
  await sleep(80)
  assert(out.output.length === lenAtUnmount, 'no bytes written after unmount despite a queued frame')
}
{
  let frames = 0
  const s = createScheduler({ fps: 60, onFrame: () => { frames++ } })
  s.requestFrame()
  s.destroy()
  await sleep(40)
  assert(frames === 0, 'pending setImmediate tick is a no-op after destroy')
  s.requestFrame()
  s.forceFrame()
  await sleep(40)
  assert(frames === 0, 'requestFrame/forceFrame are no-ops after destroy')
}

// ==========================================================
// TEST: written diff chunks are stable under stream retention
// ==========================================================
console.log('E2E: diff output written to the stream is not mutated later')
{
  const out = new FakeStream(20, 3)
  const inp = new FakeInput()
  const [n, setN] = createSignalRaw(0)
  function App() { return jsx('text', { children: 'frame ' + n() }) }

  const h = mount(App, { stream: out, stdin: inp })
  await sleep(40)
  for (let i = 1; i <= 4; i++) { setN(i); await sleep(40) }
  h.unmount()

  let stable = true
  for (let i = 0; i < out.chunks.length; i++) {
    if (String(out.chunks[i]) !== out.snapshots[i]) { stable = false; break }
  }
  assert(stable, 'retained chunks still hold the bytes they were written with')
}

// ==========================================================
// TEST: left clipping slices by visible characters, not code units
// ==========================================================
console.log('E2E: left-clipped styled text stays ANSI-safe')
{
  const out = new FakeStream(10, 2)
  const inp = new FakeInput()

  function App() {
    return jsx('box', {
      style: { width: 10, height: 1, flexDirection: 'row' },
      children: jsx('text', {
        style: { overflow: 'nowrap', marginLeft: -5 },
        children: [
          jsx('text', { style: { color: 'red' }, children: 'ABCDEFGHIJ' }),
          jsx('text', { style: { color: 'blue' }, children: 'KLMNOPQRST' }),
        ],
      }),
    })
  }

  const h = mount(App, { stream: out, stdin: inp })
  await sleep(40)
  const line = grid(h.getBuffer())[0]
  assert(line.startsWith('FGHIJ'), `left clip drops 5 visible chars, not 5 code units of an escape (got ${JSON.stringify(line)})`)
  h.unmount()
}

// ==========================================================
// TEST: SIGTERM restores the terminal before dying
// ==========================================================
console.log('E2E: SIGTERM restores terminal state')
{
  const root = fileURLToPath(new URL('..', import.meta.url))
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import { mount } from ${JSON.stringify(root + 'index.js')}
    import { jsx } from ${JSON.stringify(root + 'jsx-runtime.js')}
    function App() { return jsx('text', { children: 'alive' }) }
    mount(App, {})
    setInterval(() => {}, 1000)
  `], { stdio: ['pipe', 'pipe', 'pipe'] })

  let stdout = ''
  child.stdout.on('data', (d) => { stdout += d })
  let stderr = ''
  child.stderr.on('data', (d) => { stderr += d })

  await sleep(400)
  child.kill('SIGTERM')
  const result = await Promise.race([
    new Promise(r => child.on('exit', (code, signal) => r({ code, signal }))),
    sleep(3000).then(() => null),
  ])

  assert(result !== null, 'child exited after SIGTERM')
  if (result) {
    assert(result.signal === 'SIGTERM', `default signal exit semantics preserved (got ${result.signal ?? result.code})`)
  }
  assert(stderr === '', `child produced no errors (got ${stderr.slice(0, 200)})`)
  assert(stdout.includes('\x1b[?25h'), 'cursor restored on SIGTERM')
  assert(stdout.includes('\x1b[?1049l'), 'alt screen exited on SIGTERM')
  assert(stdout.includes('\x1b[?1003l'), 'all-motion mouse capture disabled on SIGTERM')
  assert(stdout.includes('\x1b[?1006l'), 'SGR mouse coordinates disabled on SIGTERM')
  assert(stdout.includes('\x1b[?2004l'), 'bracketed paste disabled on SIGTERM')
  child.kill('SIGKILL')
}

// ==========================================================
// TEST: components can intercept ctrl+c
// ==========================================================
console.log('E2E: ctrl+c is interceptable via stopPropagation')
{
  const out = new FakeStream(20, 4)
  const inp = new FakeInput()
  let intercepted = 0
  let exited = false

  function App() {
    useInput((event) => {
      if (event.key === 'c' && event.ctrl) {
        intercepted++
        event.stopPropagation()
      }
    })
    return jsx('text', { children: 'app' })
  }

  const h = mount(App, { stream: out, stdin: inp, onExit: () => { exited = true } })
  await sleep(40)
  inp.sendKey('\x03')
  await sleep(40)
  assert(intercepted === 1, 'component handler saw ctrl+c first')
  assert(!exited, 'stopPropagation prevented the mount exit handler')
  h.unmount()
}

// ==========================================================
// TEST: multibyte utf8 split across stdin chunks
// ==========================================================
console.log('E2E: split utf8 input decodes as one key')
{
  const out = new FakeStream(20, 4)
  const inp = new PassThrough()
  inp.isTTY = false
  inp.setRawMode = () => {}
  const keys = []

  function App() {
    useInput((event) => { keys.push(event.key) })
    return jsx('text', { children: 'app' })
  }

  const h = mount(App, { stream: out, stdin: inp })
  await sleep(40)
  inp.write(Buffer.from([0xc3]))
  await sleep(20)
  inp.write(Buffer.from([0xa9]))
  await sleep(40)
  assert(keys.includes('é'), `split multibyte char arrives whole (got ${JSON.stringify(keys)})`)
  assert(!keys.some(k => k.includes('�')), 'no replacement characters from split chunks')
  h.unmount()
}

// ==========================================================
// TEST: bracketed paste mode lifecycle
// ==========================================================
console.log('E2E: bracketed paste enabled on mount, disabled on unmount')
{
  const out = new FakeStream(20, 4)
  const inp = new FakeInput()
  function App() { return jsx('text', { children: 'app' }) }

  const h = mount(App, { stream: out, stdin: inp })
  await sleep(20)
  assert(out.output.includes('\x1b[?2004h'), 'mount enables bracketed paste')
  assert(!out.output.includes('\x1b[?2004l'), 'not disabled while mounted')
  h.unmount()
  assert(out.output.includes('\x1b[?2004l'), 'unmount disables bracketed paste')

  const out2 = new FakeStream(20, 4)
  const h2 = mount(App, { stream: out2, stdin: new FakeInput(), inline: true })
  await sleep(20)
  assert(out2.output.includes('\x1b[?2004h'), 'inline mount enables bracketed paste')
  h2.unmount()
  assert(out2.output.includes('\x1b[?2004l'), 'inline unmount disables bracketed paste')
}

// ==========================================================
// TEST: bottom-anchored overlay flips above the anchor
// ==========================================================
console.log('E2E: overlay anchored on the bottom row flips above')
{
  const out = new FakeStream(20, 6)
  const inp = new FakeInput()

  function Anchor() {
    registerOverlay(jsx('box', {
      style: { width: 10, height: 3, border: 'single' },
      children: jsx('text', { children: 'MENU' }),
    }))
    return jsx('text', { children: 'anchor' })
  }
  function App() {
    return jsxs('box', {
      style: { flexDirection: 'column', height: '100%' },
      children: [jsx('box', { style: { flexGrow: 1 } }), jsx(Anchor, {})],
    })
  }

  const h = mount(App, { stream: out, stdin: inp })
  await sleep(40)
  const lines = grid(h.getBuffer())
  assert(lines[5].includes('anchor'), 'anchor sits on the bottom row')
  assert(lines.some(l => l.includes('MENU')), 'overlay content is visible instead of vanishing')
  const menuRow = lines.findIndex(l => l.includes('MENU'))
  assert(menuRow >= 0 && menuRow < 5, `overlay flipped above the anchor (row ${menuRow})`)
  h.unmount()
}

// ==========================================================
// TEST: capturing modal blocks input to components mounted after it
// ==========================================================
console.log('E2E: modal capture blocks later-mounted components, allows its own subtree')
{
  const out = new FakeStream(40, 10)
  const inp = new FakeInput()
  const seen = []
  let setOpen

  function DeepContent() {
    useInput((e) => { seen.push('deep:' + e.key) })
    return jsx('text', { children: 'deep' })
  }
  function InnerContent() {
    useInput((e) => {
      seen.push('inner:' + e.key)
      if (!e.ctrl) e.stopPropagation()
    })
    registerOverlay(jsx(DeepContent, {}))
    return jsx('text', { children: 'inner' })
  }
  function Behind() {
    useInput((e) => { seen.push('behind:' + e.key) })
    return jsx('text', { children: 'behind' })
  }
  function App() {
    const [open, set] = createSignal(false)
    setOpen = set
    return jsxs('box', {
      children: [
        jsx(Modal, { open: open(), children: jsx(InnerContent, {}) }),
        jsx(Behind, {}),
      ],
    })
  }

  let exited = false
  const h = mount(App, { stream: out, stdin: inp, onExit: () => { exited = true } })
  await sleep(40)

  inp.sendKey('a')
  assert(seen.includes('behind:a'), 'background component receives keys while modal is closed')

  setOpen(true)
  await sleep(40)
  seen.length = 0

  inp.sendKey('b')
  assert(seen.includes('deep:b'), 'content of an overlay nested inside the modal receives keys (chain hop)')
  assert(seen.includes('inner:b'), 'modal content receives keys while open')
  assert(!seen.includes('behind:b'), 'later-mounted component behind the modal receives nothing while open')

  setOpen(false)
  await sleep(40)
  seen.length = 0

  inp.sendKey('c')
  assert(seen.includes('behind:c'), 'background component receives keys again after the modal closes')

  setOpen(true)
  await sleep(40)
  inp.sendKey('\x03')
  assert(exited, 'ctrl+c exit handler still fires while a modal captures input')
}

// ==========================================================
// TEST: conditionally-called hooks throw instead of silently corrupting
// ==========================================================
console.log('E2E: hook count change between renders throws')
{
  const out = new FakeStream(20, 6)
  const inp = new FakeInput()

  let flip
  function Cond() {
    const [on, setOn] = createSignal(false)
    flip = () => setOn(true)
    if (on()) useInput(() => {})
    return jsx('text', { children: on() ? 'on' : 'off' })
  }

  const h = mount(Cond, { stream: out, stdin: inp })
  await sleep(40)

  let err = null
  flip()
  try {
    h.repaint()
  } catch (e) {
    err = e
  }
  h.unmount()
  assert(err !== null, 'hook count change throws')
  assert(/hook count changed/.test(err?.message ?? ''), `error names the problem (got: ${err?.message})`)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
