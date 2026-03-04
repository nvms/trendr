import { createBuffer, clearBuffer, writeText, fillRect } from '../src/buffer.js'
import { diff } from '../src/diff.js'
import { computeLayout } from '../src/layout.js'
import { Fragment } from '../src/element.js'
import { createSignal, createScope, setHookRegistrar } from '../src/signal.js'
import { wordWrap } from '../src/wrap.js'
import { jsx, jsxs } from '../jsx-runtime.js'
import * as ansi from '../src/ansi.js'
import { startHookTracking, endHookTracking, registerHook } from '../src/renderer.js'

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

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
