import { EventEmitter } from 'events'
import { mount, createSignal, createEffect, useInput, useFocus, useTheme } from '../index.js'
import { TextInput } from '../src/text-input.js'
import { TextArea } from '../src/text-area.js'
import { List } from '../src/list.js'
import { ScrollableText } from '../src/scrollable-text.js'
import { Modal } from '../src/modal.js'
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

suite('nested text styles')
{
  const out = new FakeStream(30, 3)
  const inp = new FakeInput()

  function App() {
    return jsxs('text', {
      style: { color: 'white' },
      children: [
        'hello ',
        jsx('text', { style: { color: 'cyan' }, children: 'world' }),
        ' end',
      ],
    })
  }

  const { unmount, getBuffer } = mount(App, { stream: out, stdin: inp })

  const buf = getBuffer()
  const cell = (col) => buf.cells[col]

  assertEq(cell(0).ch, 'h', 'first char')
  assertEq(cell(0).fg, 'white', 'parent color on first char')
  assertEq(cell(5).fg, 'white', 'parent color on space')
  assertEq(cell(6).ch, 'w', 'child first char')
  assertEq(cell(6).fg, 'cyan', 'child color applied')
  assertEq(cell(10).fg, 'cyan', 'child color on last char')
  assertEq(cell(11).ch, ' ', 'after child space')
  assertEq(cell(11).fg, 'white', 'parent color restored after child')
  assertEq(cell(12).fg, 'white', 'parent color on trailing text')

  unmount()
}

suite('nested text with dim attr')
{
  const out = new FakeStream(20, 3)
  const inp = new FakeInput()

  function App() {
    return jsxs('text', {
      children: [
        jsx('text', { style: { color: 'red' }, children: 'key:' }),
        jsx('text', { style: { color: 'gray', dim: true }, children: ' val' }),
      ],
    })
  }

  const { unmount, getBuffer } = mount(App, { stream: out, stdin: inp })

  const buf = getBuffer()
  const cell = (col) => buf.cells[col]

  assertEq(cell(0).fg, 'red', 'first segment red')
  assertEq(cell(3).fg, 'red', 'colon red')
  assertEq(cell(4).fg, 'gray', 'second segment gray')
  assert(cell(4).attrs & 2, 'second segment dim')

  unmount()
}

suite('deeply nested text styles')
{
  const out = new FakeStream(20, 3)
  const inp = new FakeInput()

  function App() {
    return jsxs('text', {
      style: { color: 'white' },
      children: [
        'A',
        jsxs('text', { style: { bold: true }, children: [
          'B',
          jsx('text', { style: { color: 'blue' }, children: 'C' }),
          'D',
        ] }),
        'E',
      ],
    })
  }

  const { unmount, getBuffer } = mount(App, { stream: out, stdin: inp })

  const buf = getBuffer()
  const cell = (col) => buf.cells[col]

  assertEq(cell(0).fg, 'white', 'A is white')
  assert(!(cell(0).attrs & 1), 'A not bold')
  assert(cell(1).attrs & 1, 'B is bold')
  assertEq(cell(2).fg, 'blue', 'C is blue')
  assert(cell(2).attrs & 1, 'C inherits bold')
  assert(cell(3).attrs & 1, 'D is bold')
  assert(!(cell(4).attrs & 1), 'E not bold')
  assertEq(cell(4).fg, 'white', 'E restored to white')

  unmount()
}

suite('list scroll to short item after tall item')
{
  const out = new FakeStream(30, 10)
  const inp = new FakeInput()

  // item 0 is 1 row, item 1 is 15 rows (taller than viewport)
  const items = ['short', 'tall\n'.repeat(14) + 'tall-end']

  function App() {
    const [sel, setSel] = createSignal(0)
    return jsx(List, {
      items,
      selected: sel(),
      onSelect: setSel,
      focused: true,
      renderItem: (item, { selected }) =>
        jsx('text', { children: item }),
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()

  let grid = parseScreen(out.output, 30, 10)
  assert(findInGrid(grid, 'short') != null, 'short item visible initially')

  // select the tall item
  out.clear()
  inp.key('down')
  await tick(100)

  grid = parseScreen(out.output, 30, 10, grid)
  assert(findInGrid(grid, 'tall-end') != null, 'bottom of tall item visible')

  // now go back up to the short item
  out.clear()
  inp.key('up')
  await tick(100)

  grid = parseScreen(out.output, 30, 10, grid)
  assert(findInGrid(grid, 'short') != null, 'short item visible after navigating up from tall item')

  unmount()
}

// a focus trap (used by Modal) must not disable tab for the focus manager
// living inside the modal - it should only stop tab leaking to managers below
suite('tab cycles focus inside a modal focus trap')
{
  const out = new FakeStream(40, 12)
  const inp = new FakeInput()

  let innerCur, bgCur

  function InnerForm() {
    const fm = useFocus({ initial: 'f1' })
    fm.item('f1'); fm.item('f2'); fm.item('f3')
    createEffect(() => { innerCur = fm.current() })
    return jsx('text', { children: 'x' })
  }

  function App() {
    const bg = useFocus({ initial: 'list' })
    bg.item('list'); bg.item('other')
    createEffect(() => { bgCur = bg.current() })
    const [open, setOpen] = createSignal(false)
    if (!open()) setOpen(true)
    return jsxs('box', {
      style: { flexDirection: 'column', height: 10 },
      children: [
        jsx('text', { children: 'bg' }),
        jsx(Modal, { open: open(), width: 20, children: jsx(InnerForm, {}) }),
      ],
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()
  assertEq(innerCur, 'f1', 'modal: inner focus starts at f1')

  inp.send('\t')
  await tick()
  assertEq(innerCur, 'f2', 'modal: tab moves inner focus f1 -> f2')
  assertEq(bgCur, 'list', 'modal: tab does not leak to background focus manager')

  inp.send('\t')
  await tick()
  assertEq(innerCur, 'f3', 'modal: tab continues cycling inner focus f2 -> f3')

  unmount()
}

// inline / scrollback mode

import { Scrollback } from '../index.js'

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '')
}

suite('inline mode commits scrollback items once and keeps a live region')
{
  const out = new FakeStream(40, 12)
  const inp = new FakeInput()

  let push

  function App() {
    const [items, setItems] = createSignal([])
    const [status, setStatus] = createSignal('ready')
    push = (text) => setItems(xs => [...xs, { text }])
    globalThis.__setStatus = setStatus
    return jsxs('box', {
      style: { flexDirection: 'column' },
      children: [
        jsx(Scrollback, { items: items(), render: (m) => jsx('text', { children: m.text }) }),
        jsx('text', { children: `status: ${status()}` }),
      ],
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp, inline: true })
  await tick()

  assert(stripAnsi(out.output).includes('status: ready'), 'inline: live region rendered')
  assert(!out.output.includes('\x1b[?1049h'), 'inline: never enters alt screen')
  assert(!out.output.includes('\x1b[2J'), 'inline: never clears the whole screen')

  out.clear()
  push('hello world')
  await tick()
  const afterFirst = out.output
  assert(stripAnsi(afterFirst).includes('hello world'), 'inline: committed item printed')

  out.clear()
  globalThis.__setStatus('thinking')
  await tick()
  const afterStatus = out.output
  assert(stripAnsi(afterStatus).includes('status: thinking'), 'inline: live region updates')
  assert(!stripAnsi(afterStatus).includes('hello world'), 'inline: committed item not re-emitted')

  unmount()
  delete globalThis.__setStatus
}

suite('inline mode streams a live item then graduates it to scrollback')
{
  const out = new FakeStream(40, 12)
  const inp = new FakeInput()

  let setStreaming, commit

  function App() {
    const [history, setHistory] = createSignal([])
    const [streaming, setStreamingSig] = createSignal(null)
    setStreaming = setStreamingSig
    commit = () => { setHistory(h => [...h, { text: streaming() }]); setStreamingSig(null) }
    return jsxs('box', {
      style: { flexDirection: 'column' },
      children: [
        jsx(Scrollback, { items: history(), render: (m) => jsx('text', { children: m.text }) }),
        streaming() != null ? jsx('text', { children: streaming() }) : null,
      ],
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp, inline: true })
  await tick()

  setStreaming('par')
  await tick()
  out.clear()
  setStreaming('partial reply')
  await tick()
  assert(stripAnsi(out.output).includes('partial reply'), 'inline: streaming text redraws in live region')

  out.clear()
  commit()
  await tick()
  assert(stripAnsi(out.output).includes('partial reply'), 'inline: finalized reply committed to scrollback')

  out.clear()
  setStreaming('next')
  await tick()
  assert(!stripAnsi(out.output).includes('partial reply'), 'inline: graduated reply is frozen, not re-emitted')

  unmount()
}

// Menu component

import { Menu } from '../index.js'

suite('Menu windows to maxVisible and scrolls with the active item')
{
  const out = new FakeStream(40, 12)
  const inp = new FakeInput()

  const items = Array.from({ length: 10 }, (_, i) => `item${i}`)
  let cur = -1
  let chosen = null

  function App() {
    const [sel, setSel] = createSignal(0)
    return jsx(Menu, {
      items,
      selected: sel(),
      onSelect: (i) => { cur = i; setSel(i) },
      onSubmit: (it) => { chosen = it },
      focused: true,
      maxVisible: 5,
      scrolloff: 2,
    })
  }

  const { unmount, getBuffer } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()

  // read the real cell buffer rather than re-parsing minimal ANSI diffs
  const screen = () => {
    const b = getBuffer()
    const rows = []
    for (let y = 0; y < b.height; y++) {
      let line = ''
      for (let x = 0; x < b.width; x++) line += b.cells[y * b.width + x].ch || ' '
      rows.push(line)
    }
    return rows.join('\n')
  }

  let s = screen()
  assert(s.includes('item0'), 'menu: first item visible initially')
  assert(!s.includes('item9'), 'menu: tenth item windowed out initially')
  assert(s.includes('›'), 'menu: active arrow rendered')

  for (let i = 0; i < 6; i++) { inp.send('\x1b[B'); await tick() }
  assertEq(cur, 6, 'menu: down arrows moved active to index 6')

  inp.send('\x10'); await tick() // ctrl+p moves up
  assertEq(cur, 5, 'menu: ctrl+p moves selection up')
  inp.send('\x0e'); await tick() // ctrl+n moves down
  assertEq(cur, 6, 'menu: ctrl+n moves selection down')

  s = screen()
  assert(s.includes('item6'), 'menu: active item6 visible after scrolling')
  assert(!s.includes('item0'), 'menu: item0 scrolled out of the window')

  inp.send('\r')
  await tick()
  assertEq(chosen, 'item6', 'menu: enter submits the active item')

  unmount()
}

suite('Menu ignores navigation when not focused')
{
  const out = new FakeStream(40, 12)
  const inp = new FakeInput()

  let cur = 0
  function App() {
    const [sel, setSel] = createSignal(0)
    return jsx(Menu, {
      items: ['a', 'b', 'c'],
      selected: sel(),
      onSelect: (i) => { cur = i; setSel(i) },
      focused: false,
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()

  inp.send('\x1b[B')
  await tick()
  assertEq(cur, 0, 'menu: unfocused menu does not move on arrow key')

  unmount()
}

// text-area ctrl+u

suite('text-area ctrl+u clears a line then eats the line break upward')
{
  const out = new FakeStream(40, 10)
  const inp = new FakeInput()
  let value = ''

  function App() {
    return jsx(TextArea, { onChange: (v) => { value = v }, focused: true })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()

  for (const ch of 'aaa') { inp.send(ch); await tick() }
  inp.send('\r'); await tick()
  for (const ch of 'bbb') { inp.send(ch); await tick() }
  inp.send('\r'); await tick()
  for (const ch of 'ccc') { inp.send(ch); await tick() }
  await tick()
  assertEq(value, 'aaa\nbbb\nccc', 'typed three lines')

  inp.send('\x15'); await tick()
  assertEq(value, 'aaa\nbbb', 'ctrl+u removes the last line and moves up')
  inp.send('\x15'); await tick()
  assertEq(value, 'aaa', 'ctrl+u again eats the next line up')
  inp.send('\x15'); await tick()
  assertEq(value, '', 'ctrl+u on the first line just clears it')

  unmount()
}

suite('text-area ctrl+u mid-line only deletes back to the line start')
{
  const out = new FakeStream(40, 10)
  const inp = new FakeInput()
  let value = ''

  function App() {
    return jsx(TextArea, { onChange: (v) => { value = v }, focused: true })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()

  for (const ch of 'hello') { inp.send(ch); await tick() }
  // move cursor left twice -> between 'hel' and 'lo'
  inp.send('\x1b[D'); await tick()
  inp.send('\x1b[D'); await tick()
  inp.send('\x15'); await tick()
  assertEq(value, 'lo', 'ctrl+u deletes only before the cursor on the line, keeps the rest')

  unmount()
}

// ScrollBox

import { ScrollBox } from '../index.js'

suite('ScrollBox first scroll-up from an out-of-range (follow) offset moves one row')
{
  const out = new FakeStream(20, 6)
  const inp = new FakeInput()
  let lastScroll = null

  function App() {
    return jsx(ScrollBox, {
      focused: true,
      scrollOffset: 1e9, // a "follow the bottom" sentinel - clamps to maxOffset
      onScroll: (v) => { lastScroll = v },
      children: Array.from({ length: 20 }, (_, i) => jsx('text', { key: i, children: `line ${i}` })),
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()
  await tick()

  // 20 lines of content, 6 rows visible -> maxOffset 14. one up press should
  // land at 13, not 14 (the bug was the first press being absorbed by the sentinel)
  inp.send('\x1b[A')
  await tick()
  assertEq(lastScroll, 13, 'first up from the follow sentinel moves to maxOffset-1')

  unmount()
}

// ----

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
