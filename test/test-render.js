import { EventEmitter } from 'events'
import { mount, createSignal, useInput, useFocus, useTheme } from '../index.js'
import { TextInput } from '../src/text-input.js'
import { List } from '../src/list.js'
import { ScrollableText } from '../src/scrollable-text.js'
import { jsx, jsxs, Fragment } from '../jsx-runtime.js'

let passed = 0
let failed = 0
let currentSuite = ''

function suite(name) {
  currentSuite = name
  console.log(`RENDER: ${name}`)
}

function assert(cond, msg) {
  if (cond) passed++
  else { failed++; console.log(`  FAIL [${currentSuite}]: ${msg}`) }
}

function assertEq(a, b, msg) {
  if (a === b) passed++
  else { failed++; console.log(`  FAIL [${currentSuite}]: ${msg} (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`) }
}

class FakeStream extends EventEmitter {
  constructor(cols, rows) {
    super()
    this.columns = cols
    this.rows = rows
    this.isTTY = false
    this.chunks = []
  }
  write(data) {
    this.chunks.push(data)
    return true
  }
  get output() { return this.chunks.join('') }
  clear() { this.chunks = [] }
}

class FakeInput extends EventEmitter {
  constructor() {
    super()
    this.isTTY = false
  }
  setRawMode() {}
  pause() {}
  resume() {}
  send(str) { this.emit('data', Buffer.from(str)) }
  key(name) {
    const KEYS = {
      up: '\x1b[A', down: '\x1b[B', left: '\x1b[C', right: '\x1b[D',
      enter: '\r', escape: '\x1b', tab: '\t', backspace: '\x7f',
    }
    this.send(KEYS[name] || name)
  }
}

// parse ansi output and apply to a character grid
function parseScreen(output, width, height, grid) {
  if (!grid) grid = Array.from({ length: height }, () => Array(width).fill(' '))
  let row = 0, col = 0
  let i = 0

  while (i < output.length) {
    if (output[i] === '\x1b' && output[i + 1] === '[') {
      i += 2
      let seq = ''
      while (i < output.length && !(/[A-Za-z]/.test(output[i]))) {
        seq += output[i++]
      }
      const cmd = output[i++]

      if (cmd === 'H') {
        const parts = seq.split(';')
        row = (parseInt(parts[0]) || 1) - 1
        col = (parseInt(parts[1]) || 1) - 1
      } else if (cmd === 'J') {
        if (seq === '2') {
          for (let r = 0; r < height; r++)
            for (let c = 0; c < width; c++) grid[r][c] = ' '
        }
      } else if (cmd === 'm' || cmd === 'h' || cmd === 'l') {
        // ignore sgr, cursor show/hide, alt screen
      }
    } else if (output[i] >= ' ') {
      if (row >= 0 && row < height && col >= 0 && col < width) {
        grid[row][col] = output[i]
        col++
      }
      i++
    } else {
      i++
    }
  }

  return grid
}

function gridRow(grid, row) {
  return grid[row].join('')
}

function gridText(grid) {
  return grid.map(row => row.join('')).join('\n')
}

function findInGrid(grid, text) {
  for (let r = 0; r < grid.length; r++) {
    const row = gridRow(grid, r)
    const idx = row.indexOf(text)
    if (idx >= 0) return { row: r, col: idx }
  }
  return null
}

async function tick(ms = 50) {
  await new Promise(r => setTimeout(r, ms))
}

// ---- tests ----

suite('flex row layout')
{
  const out = new FakeStream(40, 5)
  const inp = new FakeInput()

  function App() {
    return jsxs('box', {
      style: { flexDirection: 'row' },
      children: [
        jsx('text', { style: { width: 10 }, children: 'LEFT' }),
        jsx('text', { style: { flexGrow: 1 }, children: 'RIGHT' }),
      ],
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()

  const grid = parseScreen(out.output, 40, 5)
  const left = findInGrid(grid, 'LEFT')
  const right = findInGrid(grid, 'RIGHT')

  assert(left != null, 'LEFT text rendered')
  assert(right != null, 'RIGHT text rendered')
  if (left && right) {
    assertEq(left.col, 0, 'LEFT at column 0')
    assertEq(right.col, 10, 'RIGHT at column 10')
  }

  unmount()
}

suite('flex column layout')
{
  const out = new FakeStream(30, 10)
  const inp = new FakeInput()

  function App() {
    return jsxs('box', {
      style: { flexDirection: 'column' },
      children: [
        jsx('text', { children: 'ROW1' }),
        jsx('text', { children: 'ROW2' }),
        jsx('text', { children: 'ROW3' }),
      ],
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()

  const grid = parseScreen(out.output, 30, 10)
  const r1 = findInGrid(grid, 'ROW1')
  const r2 = findInGrid(grid, 'ROW2')
  const r3 = findInGrid(grid, 'ROW3')

  assert(r1 != null && r2 != null && r3 != null, 'all rows rendered')
  if (r1 && r2 && r3) {
    assertEq(r1.row, 0, 'ROW1 at row 0')
    assertEq(r2.row, 1, 'ROW2 at row 1')
    assertEq(r3.row, 2, 'ROW3 at row 2')
  }

  unmount()
}

suite('border with content')
{
  const out = new FakeStream(20, 5)
  const inp = new FakeInput()

  function App() {
    return jsx('box', {
      style: { border: 'round', flexDirection: 'column' },
      children: jsx('text', { children: 'HI' }),
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()

  const grid = parseScreen(out.output, 20, 5)
  const topRow = gridRow(grid, 0)
  const hi = findInGrid(grid, 'HI')

  assert(topRow.includes('\u256d'), 'round border top-left')
  assert(hi != null, 'HI rendered inside border')
  if (hi) {
    assert(hi.row >= 1, 'HI inside border (not on border row)')
    assert(hi.col >= 1, 'HI inside border (indented from border)')
  }

  unmount()
}

suite('text input captures keystrokes')
{
  const out = new FakeStream(30, 3)
  const inp = new FakeInput()

  function App() {
    return jsx('box', {
      children: jsx(TextInput, { focused: true }),
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()

  inp.key('h')
  inp.key('i')
  await tick()

  const grid = parseScreen(out.output, 30, 3)
  const hi = findInGrid(grid, 'hi')
  assert(hi != null, 'typed "hi" appears on screen')

  unmount()
}

suite('text input does not receive key that mounts it')
{
  const out = new FakeStream(40, 5)
  const inp = new FakeInput()

  function App() {
    const [showInput, setShowInput] = createSignal(false)
    const [captured, setCaptured] = createSignal('')

    useInput(({ key }) => {
      if (key === '/' && !showInput()) setShowInput(true)
    })

    if (!showInput()) {
      return jsx('text', { children: 'press / to search' })
    }

    return jsxs('box', {
      style: { flexDirection: 'row' },
      children: [
        jsx('text', { children: '/ ' }),
        jsx(TextInput, {
          focused: true,
          onChange: v => setCaptured(v),
        }),
      ],
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()

  // press / to show input
  inp.key('/')
  await tick()

  // type "foo"
  inp.key('f')
  inp.key('o')
  inp.key('o')
  await tick()

  const grid = parseScreen(out.output, 40, 5)

  // should show "/ foo" not "/ /foo"
  const slashFoo = findInGrid(grid, '/foo')
  const justFoo = findInGrid(grid, '/ foo')
  assert(justFoo != null, '"/ foo" rendered (no extra slash)')
  assert(slashFoo == null, '"/foo" should NOT appear (slash not typed into input)')

  unmount()
}

suite('text input does not receive key that mounts it - second time')
{
  const out = new FakeStream(40, 5)
  const inp = new FakeInput()

  function App() {
    const [showInput, setShowInput] = createSignal(false)

    useInput(({ key }) => {
      if (key === '/' && !showInput()) setShowInput(true)
      if (key === 'escape') setShowInput(false)
    })

    if (!showInput()) {
      return jsx('text', { children: 'press / to search' })
    }

    return jsxs('box', {
      style: { flexDirection: 'row' },
      children: [
        jsx('text', { children: '/ ' }),
        jsx(TextInput, { focused: true }),
      ],
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()

  // first search: / then foo then escape
  inp.key('/')
  await tick()
  inp.key('f')
  inp.key('o')
  inp.key('o')
  await tick()
  inp.key('escape')
  await tick()

  // second search: / then bar
  inp.key('/')
  await tick()
  inp.key('b')
  inp.key('a')
  inp.key('r')
  await tick()

  const grid = parseScreen(out.output, 40, 5)
  const good = findInGrid(grid, '/ bar')
  const bad = findInGrid(grid, '/bar')

  assert(good != null, 'second search shows "/ bar"')
  assert(bad == null, 'second search should NOT show "/bar"')

  unmount()
}

suite('list scrolling')
{
  const out = new FakeStream(30, 8)
  const inp = new FakeInput()

  const items = Array.from({ length: 20 }, (_, i) => `item-${i}`)

  function App() {
    const [sel, setSel] = createSignal(0)

    return jsx(List, {
      items,
      selected: sel(),
      onSelect: setSel,
      height: 5,
      focused: true,
      renderItem: (item, { selected }) =>
        jsx('text', { children: item }),
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()

  let grid = parseScreen(out.output, 30, 8)
  assert(findInGrid(grid, 'item-0') != null, 'item-0 visible initially')

  out.clear()
  for (let i = 0; i < 10; i++) {
    inp.key('down')
    await tick(20)
  }
  await tick(100)

  grid = parseScreen(out.output, 30, 8, grid)
  assert(findInGrid(grid, 'item-10') != null, 'item-10 visible after scrolling')

  unmount()
}

suite('children clipped to parent')
{
  const out = new FakeStream(40, 5)
  const inp = new FakeInput()

  function App() {
    return jsxs('box', {
      style: { flexDirection: 'column', height: 2 },
      children: [
        jsx('text', { children: 'VISIBLE1' }),
        jsx('text', { children: 'VISIBLE2' }),
        jsx('text', { children: 'CLIPPED3' }),
        jsx('text', { children: 'CLIPPED4' }),
      ],
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()

  const grid = parseScreen(out.output, 40, 5)
  assert(findInGrid(grid, 'VISIBLE1') != null, 'VISIBLE1 rendered')
  assert(findInGrid(grid, 'VISIBLE2') != null, 'VISIBLE2 rendered')
  assert(findInGrid(grid, 'CLIPPED3') == null, 'CLIPPED3 not rendered (clipped)')
  assert(findInGrid(grid, 'CLIPPED4') == null, 'CLIPPED4 not rendered (clipped)')

  unmount()
}

suite('flex grow fills remaining space')
{
  const out = new FakeStream(40, 3)
  const inp = new FakeInput()

  function App() {
    return jsxs('box', {
      style: { flexDirection: 'row' },
      children: [
        jsx('text', { style: { width: 5 }, children: 'AA' }),
        jsx('box', {
          style: { flexGrow: 1 },
          children: jsx('text', { children: 'BB' }),
        }),
      ],
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()

  const grid = parseScreen(out.output, 40, 3)
  const aa = findInGrid(grid, 'AA')
  const bb = findInGrid(grid, 'BB')

  assert(aa != null, 'AA rendered')
  assert(bb != null, 'BB rendered')
  if (bb) {
    assertEq(bb.col, 5, 'BB starts at column 5 (right after AA width)')
  }

  unmount()
}

suite('list auto-height from useLayout')
{
  const out = new FakeStream(30, 8)
  const inp = new FakeInput()

  const items = Array.from({ length: 20 }, (_, i) => `item-${i}`)

  function App() {
    const [sel, setSel] = createSignal(0)

    return jsx('box', {
      style: { flexDirection: 'column', height: 5 },
      children: jsx(List, {
        items,
        selected: sel(),
        onSelect: setSel,
        focused: true,
        renderItem: (item) => jsx('text', { children: item }),
      }),
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()

  let grid = parseScreen(out.output, 30, 8)
  assert(findInGrid(grid, 'item-0') != null, 'item-0 visible initially')

  // first frame renders all items (layout not yet known)
  // second frame should use layout height (5) for virtualization
  // scroll down past 5 visible items
  out.clear()
  for (let i = 0; i < 8; i++) {
    inp.key('down')
    await tick(20)
  }
  await tick(100)

  grid = parseScreen(out.output, 30, 8, grid)
  assert(findInGrid(grid, 'item-8') != null, 'item-8 visible after scrolling (auto height)')
  assert(findInGrid(grid, 'item-0') == null, 'item-0 not visible after scrolling (auto height)')

  unmount()
}

suite('scrollable-text controlled scroll')
{
  const out = new FakeStream(40, 10)
  const inp = new FakeInput()

  const content = Array.from({ length: 30 }, (_, i) => `line-${i}`).join('\n')

  function App() {
    const [scroll, setScroll] = createSignal(0)

    return jsxs('box', {
      style: { flexDirection: 'column', height: 10 },
      children: [
        jsx('text', { children: `offset:${scroll()}` }),
        jsx(ScrollableText, {
          content,
          focused: true,
          scrollOffset: scroll(),
          onScroll: setScroll,
        }),
      ],
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()

  let grid = parseScreen(out.output, 40, 10)
  assert(findInGrid(grid, 'line-0') != null, 'line-0 visible initially')
  assert(findInGrid(grid, 'offset:0') != null, 'offset starts at 0')

  out.clear()
  inp.key('j')
  await tick()

  grid = parseScreen(out.output, 40, 10, grid)
  assert(findInGrid(grid, 'offset:1') != null, 'offset is 1 after first j')

  out.clear()
  inp.key('j')
  await tick()

  grid = parseScreen(out.output, 40, 10, grid)
  assert(findInGrid(grid, 'offset:2') != null, 'offset is 2 after second j')

  out.clear()
  inp.key('j')
  await tick()

  grid = parseScreen(out.output, 40, 10, grid)
  assert(findInGrid(grid, 'offset:3') != null, 'offset is 3 after third j')
  assert(findInGrid(grid, 'line-3') != null, 'line-3 visible after scrolling')

  unmount()
}

suite('scrollable-text controlled scroll with focus manager')
{
  const out = new FakeStream(60, 12)
  const inp = new FakeInput()

  const files = ['a.js', 'b.js', 'c.js']
  const content = Array.from({ length: 30 }, (_, i) => `line-${i}`).join('\n')

  function App() {
    const fm = useFocus({ initial: 'files' })
    fm.item('files')
    fm.item('preview')

    const [fileIdx, setFileIdx] = createSignal(0)
    const [scroll, setScroll] = createSignal(0)

    return jsxs('box', {
      style: { flexDirection: 'row', height: 12 },
      children: [
        jsx('box', {
          style: { width: 15, flexDirection: 'column' },
          children: jsx(List, {
            items: files,
            selected: fileIdx(),
            onSelect: setFileIdx,
            focused: fm.is('files'),
            renderItem: (item) => jsx('text', { children: item }),
          }),
        }),
        jsxs('box', {
          style: { flexGrow: 1, flexDirection: 'column' },
          children: [
            jsx('text', { children: `scroll:${scroll()}` }),
            jsx(ScrollableText, {
              content,
              focused: fm.is('preview'),
              scrollOffset: scroll(),
              onScroll: setScroll,
            }),
          ],
        }),
      ],
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()

  let grid = parseScreen(out.output, 60, 12)
  assert(findInGrid(grid, 'line-0') != null, 'fm: line-0 visible initially')
  assert(findInGrid(grid, 'scroll:0') != null, 'fm: scroll starts at 0')

  // tab to preview
  inp.key('tab')
  await tick()

  // scroll down
  out.clear()
  inp.key('j')
  await tick()

  grid = parseScreen(out.output, 60, 12, grid)
  assert(findInGrid(grid, 'scroll:1') != null, 'fm: scroll is 1 after j in preview')

  out.clear()
  inp.key('j')
  await tick()

  grid = parseScreen(out.output, 60, 12, grid)
  assert(findInGrid(grid, 'scroll:2') != null, 'fm: scroll is 2 after second j')

  unmount()
}


suite('useTheme defaults')
{
  const out = new FakeStream(40, 5)
  const inp = new FakeInput()

  let captured = null

  function App() {
    captured = useTheme()
    return jsx('text', { children: 'theme-test' })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()

  assert(captured != null, 'useTheme returns an object')
  assertEq(captured.accent, 'cyan', 'accent defaults to cyan')

  unmount()
}

suite('useTheme with custom accent')
{
  const out = new FakeStream(40, 5)
  const inp = new FakeInput()

  let captured = null

  function App() {
    captured = useTheme()
    return jsx('text', { children: 'theme-test' })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp, theme: { accent: 'green' } })
  await tick()

  assert(captured != null, 'useTheme returns theme object')
  assertEq(captured.accent, 'green', 'accent is green when set via mount')

  unmount()
}

suite('theme accent flows to components')
{
  const out = new FakeStream(40, 5)
  const inp = new FakeInput()

  function App() {
    const { accent } = useTheme()
    return jsx('text', { children: `accent:${accent}` })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp, theme: { accent: 'magenta' } })
  await tick()

  const grid = parseScreen(out.output, 40, 5)
  assert(findInGrid(grid, 'accent:magenta') != null, 'component reads magenta accent from theme')

  unmount()
}

suite('absolute positioning')
{
  const out = new FakeStream(30, 5)
  const inp = new FakeInput()

  function App() {
    return jsxs('box', {
      style: { flexDirection: 'column', height: 5 },
      children: [
        jsx('text', { children: 'FLOW' }),
        jsx('box', {
          style: { position: 'absolute', top: 0, right: 0 },
          children: jsx('text', { children: 'ABS' }),
        }),
      ],
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()

  const grid = parseScreen(out.output, 30, 5)
  const flow = findInGrid(grid, 'FLOW')
  const abs = findInGrid(grid, 'ABS')

  assert(flow != null, 'flow text rendered')
  assert(abs != null, 'absolute text rendered')
  if (flow) assertEq(flow.col, 0, 'flow at column 0')
  if (abs) assertEq(abs.col, 27, 'absolute at right edge (30 - 3)')
  if (abs) assertEq(abs.row, 0, 'absolute at top')

  unmount()
}

suite('absolute does not affect flow layout')
{
  const out = new FakeStream(30, 5)
  const inp = new FakeInput()

  function App() {
    return jsxs('box', {
      style: { flexDirection: 'column' },
      children: [
        jsx('text', { children: 'LINE1' }),
        jsx('box', {
          style: { position: 'absolute', top: 0, right: 0 },
          children: jsx('text', { children: 'BADGE' }),
        }),
        jsx('text', { children: 'LINE2' }),
      ],
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()

  const grid = parseScreen(out.output, 30, 5)
  const l1 = findInGrid(grid, 'LINE1')
  const l2 = findInGrid(grid, 'LINE2')

  assert(l1 != null && l2 != null, 'both flow lines rendered')
  if (l1 && l2) {
    assertEq(l2.row, l1.row + 1, 'LINE2 immediately after LINE1 (absolute child skipped in flow)')
  }

  unmount()
}

suite('scroll container clips and offsets')
{
  const out = new FakeStream(20, 5)
  const inp = new FakeInput()

  function App() {
    return jsx('box', {
      style: { overflow: 'scroll', scrollOffset: 2, flexDirection: 'column', height: 5 },
      children: [
        jsx('text', { children: 'ROW0' }),
        jsx('text', { children: 'ROW1' }),
        jsx('text', { children: 'ROW2' }),
        jsx('text', { children: 'ROW3' }),
        jsx('text', { children: 'ROW4' }),
        jsx('text', { children: 'ROW5' }),
        jsx('text', { children: 'ROW6' }),
      ],
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()

  const grid = parseScreen(out.output, 20, 5)

  assert(findInGrid(grid, 'ROW0') == null, 'ROW0 scrolled out')
  assert(findInGrid(grid, 'ROW1') == null, 'ROW1 scrolled out')
  assert(findInGrid(grid, 'ROW2') != null, 'ROW2 visible')
  assert(findInGrid(grid, 'ROW3') != null, 'ROW3 visible')
  assert(findInGrid(grid, 'ROW4') != null, 'ROW4 visible')

  unmount()
}

// ----

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
