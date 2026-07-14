import { EventEmitter } from 'events'
import { CodeBlock, HorizontalScrollBox, mount, createSignal, useInput, useHitTest } from '../index.js'
import { List } from '../src/list.js'
import { Table } from '../src/table.js'
import { Select } from '../src/select.js'
import { Radio } from '../src/radio.js'
import { Tabs } from '../src/tabs.js'
import { Menu } from '../src/menu.js'
import { MenuBar } from '../src/menubar.js'
import { MillerNav } from '../src/miller-nav.js'
import { ProgressBar } from '../src/progress.js'
import { ease, linear, animated } from '../src/animation.js'
import { Markdown, parseBlocks } from '../src/markdown.js'
import { useSelection } from '../src/selection.js'
import { ScrollBox } from '../src/scroll-box.js'
import { jsx, jsxs } from '../jsx-runtime.js'

let passed = 0
let failed = 0
let currentSuite = ''

function suite(name) {
  currentSuite = name
  console.log(`COMPONENTS: ${name}`)
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
      up: '\x1b[A', down: '\x1b[B', right: '\x1b[C', left: '\x1b[D',
      enter: '\r', escape: '\x1b', tab: '\t', shiftTab: '\x1b[Z',
    }
    this.send(KEYS[name] || name)
  }
  click(x, y) { this.send(`\x1b[<0;${x + 1};${y + 1}M`) }
}

function screenOf(getBuffer) {
  const b = getBuffer()
  const rows = []
  for (let y = 0; y < b.height; y++) {
    let line = ''
    for (let x = 0; x < b.width; x++) line += b.cells[y * b.width + x].ch || ' '
    rows.push(line)
  }
  return rows.join('\n')
}

function rowOf(getBuffer, text) {
  const rows = screenOf(getBuffer).split('\n')
  for (let r = 0; r < rows.length; r++) {
    if (rows[r].includes(text)) return r
  }
  return -1
}

async function tick(ms = 50) {
  await new Promise(r => setTimeout(r, ms))
}

const plainItem = (item) => jsx('text', { children: String(item) })
const markedItem = (item, { selected }) => jsx('text', { children: `${selected ? '>' : ' '}${item}` })

// ---- tests ----

suite('MillerNav settles without scheduling frames forever')
{
  const out = new FakeStream(60, 10)
  const inp = new FakeInput()

  const childMap = { a: ['a1', 'a2'], b: ['b1'] }
  let getChildrenCalls = 0
  let selectionChanges = 0
  let lastSelection = null

  function App() {
    return jsx(MillerNav, {
      rootItems: ['a', 'b'],
      getChildren: (item) => { getChildrenCalls++; return childMap[item] ?? [] },
      onSelectionChange: (sel) => { selectionChanges++; lastSelection = sel },
      focused: true,
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick(200)

  const callsAfterSettle = getChildrenCalls
  assertEq(selectionChanges, 1, 'onSelectionChange fired once after mount')
  assertEq(lastSelection?.item, 'a', 'initial selection is the first root item')

  await tick(400)
  assertEq(getChildrenCalls, callsAfterSettle, 'no frames scheduled while idle (frame count settles)')
  assertEq(selectionChanges, 1, 'onSelectionChange not re-fired while idle')

  inp.key('j')
  await tick()
  assertEq(selectionChanges, 2, 'onSelectionChange fired once for a navigation')
  assertEq(lastSelection?.item, 'b', 'selection moved to second root item')

  unmount()
}

suite('Table non-sticky header scrolls with content')
{
  const out = new FakeStream(30, 5)
  const inp = new FakeInput()

  const columns = [{ key: 'name', header: 'NAME', flexGrow: 1 }]
  const data = Array.from({ length: 20 }, (_, i) => ({ name: `row-${i}` }))

  function App() {
    const [sel, setSel] = createSignal(0)
    return jsx('box', {
      style: { flexDirection: 'column', height: 5 },
      children: jsx(Table, { columns, data, selected: sel(), onSelect: setSel, focused: true, stickyHeader: false }),
    })
  }

  const { unmount, getBuffer } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()

  let s = screenOf(getBuffer)
  assert(s.includes('NAME'), 'header visible at the top before scrolling')
  assert(s.includes('row-0'), 'first row visible before scrolling')

  for (let i = 0; i < 12; i++) { inp.key('down'); await tick(20) }
  await tick(100)

  s = screenOf(getBuffer)
  assert(!s.includes('NAME'), 'non-sticky header scrolled out of view')
  assert(s.includes('row-12'), 'selected row visible after scrolling')

  unmount()
}

suite('Table sticky header stays pinned')
{
  const out = new FakeStream(30, 5)
  const inp = new FakeInput()

  const columns = [{ key: 'name', header: 'NAME', flexGrow: 1 }]
  const data = Array.from({ length: 20 }, (_, i) => ({ name: `row-${i}` }))

  function App() {
    const [sel, setSel] = createSignal(0)
    return jsx('box', {
      style: { flexDirection: 'column', height: 5 },
      children: jsx(Table, { columns, data, selected: sel(), onSelect: setSel, focused: true, stickyHeader: true }),
    })
  }

  const { unmount, getBuffer } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()

  for (let i = 0; i < 12; i++) { inp.key('down'); await tick(20) }
  await tick(100)

  const s = screenOf(getBuffer)
  assert(s.includes('NAME'), 'sticky header still visible after scrolling')
  assert(s.includes('row-12'), 'selected row visible after scrolling')
  assertEq(rowOf(getBuffer, 'NAME'), 0, 'sticky header pinned to the top row')

  unmount()
}

suite('List click with non-sticky header selects the clicked item')
{
  const out = new FakeStream(30, 8)
  const inp = new FakeInput()

  const items = ['item-0', 'item-1', 'item-2', 'item-3', 'item-4']
  let clicked = null

  function App() {
    const [sel, setSel] = createSignal(0)
    return jsx('box', {
      style: { flexDirection: 'column', height: 8 },
      children: jsx(List, {
        items,
        selected: sel(),
        onSelect: (i) => { clicked = i; setSel(i) },
        focused: true,
        header: jsx('text', { children: 'HDR' }),
        stickyHeader: false,
        renderItem: plainItem,
      }),
    })
  }

  const { unmount, getBuffer } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick(100)

  assertEq(rowOf(getBuffer, 'item-1'), 2, 'item-1 painted on row 2 (below header and item-0)')

  inp.click(2, 2)
  await tick()
  assertEq(clicked, 1, 'clicking row 2 selects item index 1, not the item above')

  inp.click(2, 4)
  await tick()
  assertEq(clicked, 3, 'clicking row 4 selects item index 3')

  unmount()
}

suite('List onSelect without selected still moves the highlight')
{
  const out = new FakeStream(30, 8)
  const inp = new FakeInput()

  const reported = []

  function App() {
    return jsx(List, {
      items: ['a', 'b', 'c'],
      onSelect: (i) => reported.push(i),
      focused: true,
      renderItem: markedItem,
    })
  }

  const { unmount, getBuffer } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()

  inp.key('down')
  await tick()
  assertEq(reported[reported.length - 1], 1, 'onSelect reported index 1')
  assert(screenOf(getBuffer).includes('>b'), 'highlight moved to b')

  inp.key('down')
  await tick()
  assertEq(reported[reported.length - 1], 2, 'onSelect reported index 2 (highlight was not frozen at 0)')
  assert(screenOf(getBuffer).includes('>c'), 'highlight moved to c')

  unmount()
}

suite('Menu onSelect without selected still moves the highlight')
{
  const out = new FakeStream(30, 8)
  const inp = new FakeInput()

  const reported = []

  function App() {
    return jsx(Menu, {
      items: ['one', 'two', 'three'],
      onSelect: (i) => reported.push(i),
      focused: true,
    })
  }

  const { unmount, getBuffer } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()

  inp.key('down')
  await tick()
  inp.key('down')
  await tick()
  assertEq(reported[reported.length - 1], 2, 'onSelect reported index 2')
  const rows = screenOf(getBuffer).split('\n')
  assert(rows.some(r => r.includes('›') && r.includes('three')), 'arrow sits on the third item')

  unmount()
}

suite('List clamps out-of-range selected')
{
  const out = new FakeStream(30, 8)
  const inp = new FakeInput()

  const cursorCalls = []

  function App() {
    return jsx(List, {
      items: ['a', 'b', 'c'],
      selected: 5,
      onCursorChange: (item, i) => cursorCalls.push([item, i]),
      focused: true,
      renderItem: markedItem,
    })
  }

  const { unmount, getBuffer } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()

  assert(cursorCalls.length > 0, 'onCursorChange fired')
  assertEq(cursorCalls[0][0], 'c', 'onCursorChange receives the clamped item, not undefined')
  assertEq(cursorCalls[0][1], 2, 'onCursorChange receives the clamped index, not 5')
  assert(screenOf(getBuffer).includes('>c'), 'highlight rendered on the last item')

  unmount()
}

suite('List uncontrolled stale index clamps when items shrink')
{
  const out = new FakeStream(30, 8)
  const inp = new FakeInput()

  let shrink
  const reported = []

  function App() {
    const [items, setItems] = createSignal(['a', 'b', 'c', 'd', 'e'])
    shrink = () => setItems(['a', 'b'])
    return jsx(List, {
      items: items(),
      onSelect: (i) => reported.push(i),
      focused: true,
      renderItem: markedItem,
    })
  }

  const { unmount, getBuffer } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()

  for (let i = 0; i < 4; i++) { inp.key('down'); await tick(20) }
  await tick()
  assertEq(reported[reported.length - 1], 4, 'cursor at the last item before the shrink')

  shrink()
  await tick()
  assert(screenOf(getBuffer).includes('>b'), 'highlight clamped to the new last item')

  inp.key('up')
  await tick()
  assert(screenOf(getBuffer).includes('>a'), 'one keypress moves up immediately (no invisible navigation)')

  unmount()
}

suite('unfocused Select ignores clicks')
{
  const out = new FakeStream(30, 10)
  const inp = new FakeInput()

  function App() {
    return jsx(Select, { items: ['one', 'two'], selected: 'one', focused: false })
  }

  const { unmount, getBuffer } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()

  inp.click(1, 0)
  await tick()
  assert(!screenOf(getBuffer).includes('two'), 'dropdown did not open from a click while unfocused')

  unmount()
}

suite('Select onFocus enables click-to-open while unfocused')
{
  const out = new FakeStream(30, 10)
  const inp = new FakeInput()

  let focusCalls = 0

  function App() {
    return jsx(Select, { items: ['one', 'two'], selected: 'one', focused: false, onFocus: () => { focusCalls++ } })
  }

  const { unmount, getBuffer } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()

  inp.click(1, 0)
  await tick()
  assertEq(focusCalls, 1, 'onFocus called so the app can move focus here')
  assert(screenOf(getBuffer).includes('two'), 'dropdown opened after onFocus')

  unmount()
}

suite('Select renders object items via label')
{
  const out = new FakeStream(40, 10)
  const inp = new FakeInput()

  const items = [{ label: 'Alpha' }, { label: 'Beta' }]
  let picked = null

  function App() {
    const [sel, setSel] = createSignal(items[0])
    return jsx(Select, { items, selected: sel(), onChange: (v) => { picked = v; setSel(v) }, focused: true })
  }

  const { unmount, getBuffer } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()

  let s = screenOf(getBuffer)
  assert(s.includes('Alpha'), 'collapsed text shows the item label')
  assert(!s.includes('[object Object]'), 'no [object Object] while collapsed')

  inp.key('enter')
  await tick()
  s = screenOf(getBuffer)
  assert(s.includes('Beta'), 'dropdown lists object items by label')
  assert(!s.includes('[object Object]'), 'no [object Object] in the dropdown')

  inp.key('down')
  await tick()
  inp.key('enter')
  await tick()
  assertEq(picked, items[1], 'onChange receives the original object item')

  unmount()
}

suite('Select return on empty items does not call onChange(undefined)')
{
  const out = new FakeStream(30, 10)
  const inp = new FakeInput()

  const picks = []

  function App() {
    return jsx(Select, { items: [], onChange: (v) => picks.push(v), focused: true })
  }

  const { unmount, getBuffer } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()

  inp.key('enter')
  await tick()
  const rows = screenOf(getBuffer)
  assert(!rows.includes('┌'), 'no empty dropdown shell rendered')

  inp.key('enter')
  await tick()
  assertEq(picks.length, 0, 'onChange never called with undefined')

  unmount()
}

suite('Select dropdown flips up near the screen bottom')
{
  const out = new FakeStream(40, 12)
  const inp = new FakeInput()

  const items = ['aa', 'bb', 'cc', 'dd', 'ee']

  function App() {
    return jsxs('box', {
      style: { flexDirection: 'column', height: 12 },
      children: [
        jsx('box', { style: { flexGrow: 1 } }),
        jsx(Select, { items, selected: 'aa', focused: true, overlay: true }),
      ],
    })
  }

  const { unmount, getBuffer } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick(100)

  const collapsedRow = rowOf(getBuffer, 'aa')
  assertEq(collapsedRow, 11, 'collapsed select sits on the bottom row')

  inp.key('enter')
  await tick(100)

  const itemRow = rowOf(getBuffer, 'ee')
  assert(itemRow >= 0, 'dropdown items rendered')
  assert(itemRow < 11, 'dropdown opened upward instead of clipping below the screen')

  unmount()
}

suite('Tabs stops propagation of handled keys')
{
  const out = new FakeStream(40, 5)
  const inp = new FakeInput()

  const appKeys = []
  let current = 'one'

  function App() {
    const [tab, setTab] = createSignal('one')
    useInput(({ key }) => appKeys.push(key))
    return jsx(Tabs, {
      items: ['one', 'two', 'three'],
      selected: tab(),
      onChange: (t) => { current = t; setTab(t) },
      focused: true,
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()

  inp.key('tab')
  await tick()
  assertEq(current, 'two', 'tab advances the selected tab')
  assert(!appKeys.includes('tab'), 'tab did not leak past Tabs')

  inp.key('right')
  await tick()
  assertEq(current, 'three', 'right arrow advances the selected tab')

  inp.key('left')
  await tick()
  assertEq(current, 'two', 'left arrow goes back')

  inp.key('shiftTab')
  await tick()
  assertEq(current, 'one', 'shift-tab goes back')
  assert(!appKeys.includes('shift-tab'), 'shift-tab did not leak past Tabs')

  inp.send('x')
  await tick()
  assert(appKeys.includes('x'), 'unhandled keys still propagate')

  unmount()
}

suite('List stops propagation of handled keys')
{
  const out = new FakeStream(40, 8)
  const inp = new FakeInput()

  const appKeys = []
  const calls1 = []
  const calls2 = []

  function App() {
    useInput(({ key }) => appKeys.push(key))
    const [sel1, setSel1] = createSignal(0)
    const [sel2, setSel2] = createSignal(0)
    return jsxs('box', {
      style: { flexDirection: 'row', height: 6 },
      children: [
        jsx('box', {
          style: { width: 15 },
          children: jsx(List, { items: ['a1', 'a2', 'a3'], selected: sel1(), onSelect: (i) => { calls1.push(i); setSel1(i) }, renderItem: plainItem }),
        }),
        jsx('box', {
          style: { width: 15 },
          children: jsx(List, { items: ['b1', 'b2', 'b3'], selected: sel2(), onSelect: (i) => { calls2.push(i); setSel2(i) }, renderItem: plainItem }),
        }),
      ],
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()

  inp.send('j')
  await tick()
  assertEq(calls2.length, 1, 'innermost list handled the key')
  assertEq(calls1.length, 0, 'sibling list did not double-handle the key')
  assert(!appKeys.includes('j'), 'handled key did not reach app-level bindings')

  inp.send('q')
  await tick()
  assert(appKeys.includes('q'), 'unhandled keys still propagate')

  unmount()
}

suite('Radio clamps cursor when options shrink')
{
  const out = new FakeStream(30, 8)
  const inp = new FakeInput()

  let shrink
  const picks = []

  function App() {
    const [opts, setOpts] = createSignal(['a', 'b', 'c', 'd'])
    shrink = () => setOpts(['a', 'b'])
    return jsx(Radio, { options: opts(), selected: 'a', onChange: (o) => picks.push(o), focused: true })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()

  inp.key('down'); await tick(20)
  inp.key('down'); await tick(20)
  inp.key('down'); await tick(20)

  shrink()
  await tick()

  inp.key('enter')
  await tick()
  assertEq(picks.length, 1, 'return fired onChange')
  assertEq(picks[0], 'b', 'onChange got the clamped option, not undefined')

  unmount()
}

suite('Radio cursor follows external selected changes')
{
  const out = new FakeStream(30, 8)
  const inp = new FakeInput()

  let setExternal
  const picks = []

  function App() {
    const [sel, setSel] = createSignal('a')
    setExternal = setSel
    return jsx(Radio, { options: ['a', 'b', 'c'], selected: sel(), onChange: (o) => { picks.push(o); setSel(o) }, focused: true })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()

  setExternal('c')
  await tick()

  inp.key('enter')
  await tick()
  assertEq(picks[0], 'c', 'cursor synced to the externally selected option')

  inp.key('up')
  await tick()
  inp.key('enter')
  await tick()
  assertEq(picks[1], 'b', 'navigation continues from the synced position')

  unmount()
}

suite('ProgressBar renders a count of 0')
{
  const out = new FakeStream(40, 3)
  const inp = new FakeInput()

  function App() {
    return jsx(ProgressBar, { value: 0.5, count: 0, width: 10 })
  }

  const { unmount, getBuffer } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()

  assert(screenOf(getBuffer).includes('(0)'), 'count of 0 is shown, not hidden')

  unmount()
}

suite('MenuBar hotkey that collides with a nav key still opens its menu')
{
  const out = new FakeStream(40, 10)
  const inp = new FakeInput()

  function App() {
    return jsx(MenuBar, {
      items: [
        { label: 'Help', hotkey: 'h', children: [{ label: 'About' }] },
        { label: 'File', hotkey: 'f', children: [{ label: 'Open' }] },
      ],
      focused: true,
    })
  }

  const { unmount, getBuffer } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()

  inp.send('h')
  await tick()
  assert(screenOf(getBuffer).includes('About'), 'h opened the Help menu instead of navigating left')

  unmount()
}

suite('components tolerate missing collection props')
{
  const cases = [
    ['List', () => jsx(List, { renderItem: plainItem })],
    ['Table', () => jsx(Table, {})],
    ['Select', () => jsx(Select, {})],
    ['Radio', () => jsx(Radio, {})],
    ['Tabs', () => jsx(Tabs, {})],
    ['Menu', () => jsx(Menu, {})],
  ]

  for (const [name, App] of cases) {
    const out = new FakeStream(30, 5)
    const inp = new FakeInput()
    try {
      const { unmount } = mount(App, { stream: out, stdin: inp, altScreen: false })
      await tick(20)
      unmount()
      assert(true, `${name} mounts`)
    } catch (err) {
      assert(false, `${name} with empty props throws: ${err.message}`)
    }
  }
}

suite('ease() keeps interpolator state per animation')
{
  const dt = 1 / 60
  const shared = ease(1000, linear)
  const a1 = { generation: 0 }
  const a2 = { generation: 0 }

  const r1 = shared(0, 100, 0, dt, a1)
  const r2 = shared(0, 100, 0, dt, a2)
  assert(Math.abs(r1.value - r2.value) < 1e-9, 'two animations sharing one ease() advance independently')

  const r1b = shared(r1.value, 100, 0, dt, a1)
  assert(r1b.value > r1.value, 'first animation keeps its own elapsed time')
}

suite('ease() resets on retarget instead of lurching')
{
  const dt = 1 / 60
  const e = ease(1000, linear)
  const a = { generation: 0 }

  let cur = 0
  for (let i = 0; i < 30; i++) cur = e(cur, 100, 0, dt, a).value
  assert(cur > 40 && cur < 60, 'halfway through the first animation')

  a.generation++
  const r = e(cur, 0, 0, dt, a)
  assert(r.value < cur, 'retargeted animation moves toward the new target')
  assert(r.value > cur - 5, 'retarget starts a fresh curve from the current value (no lurch)')
}

suite('animated() with ease reaches its target')
{
  const v = animated(0, ease(80))
  v.set(10)
  await tick(300)
  assertEq(v(), 10, 'animation completed at the target value')
}

suite('Markdown block parsing')
{
  const blocks = parseBlocks([
    '# Title',
    '',
    'intro text',
    'same paragraph',
    '',
    '- one',
    '- two',
    '',
    '```js',
    'const a = 1',
    '```',
    '',
    '> quoted',
    '',
    '---',
    '',
    'tail',
  ].join('\n'))

  assertEq(blocks.length, 7, 'seven blocks parsed')
  assertEq(blocks[0].type, 'heading', 'first block is a heading')
  assertEq(blocks[0].level, 1, 'heading level 1')
  assertEq(blocks[1].type, 'para', 'second block is a paragraph')
  assertEq(blocks[1].text, 'intro text same paragraph', 'adjacent lines join into one paragraph')
  assertEq(blocks[2].type, 'list', 'third block is a list')
  assertEq(blocks[2].items.length, 2, 'list has two items')
  assertEq(blocks[3].type, 'code', 'fourth block is code')
  assertEq(blocks[3].lang, 'js', 'fence language captured')
  assertEq(blocks[3].lines.join('\n'), 'const a = 1', 'code content captured')
  assertEq(blocks[4].type, 'quote', 'fifth block is a quote')
  assertEq(blocks[5].type, 'hr', 'sixth block is a rule')
  assertEq(blocks[6].type, 'para', 'seventh block is the tail paragraph')
}

suite('Markdown tolerates an unclosed fence while streaming')
{
  const blocks = parseBlocks('before\n\n```js\nconst a = 1')
  assertEq(blocks.length, 2, 'two blocks parsed')
  assertEq(blocks[1].type, 'code', 'unclosed fence still becomes a code block')
  assertEq(blocks[1].lines.join('\n'), 'const a = 1', 'partial code content kept')
}

suite('Markdown accepts a code block component')
{
  const out = new FakeStream(40, 6)
  const inp = new FakeInput()
  let received

  function CustomCodeBlock(props) {
    received = props
    return jsx('text', { children: `${props.language}:${props.value}` })
  }

  function App() {
    return jsx(Markdown, {
      text: '```md\nlong markdown text\n```',
      codeBlock: CustomCodeBlock,
      highlight: () => 'highlighted',
      codeBg: 'blue',
    })
  }

  const { getBuffer, unmount } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()
  assert(screenOf(getBuffer).includes('md:long markdown text'), 'custom component rendered the code block')
  assertEq(received.language, 'md', 'custom component receives language')
  assertEq(received.value, 'long markdown text', 'custom component receives raw value')
  assertEq(received.codeBg, 'blue', 'custom component receives code background')
  assert(typeof received.highlight === 'function', 'custom component receives highlighter')
  unmount()
}

suite('CodeBlock is exported')
{
  assert(typeof CodeBlock === 'function', 'default code block component is available for reuse')
}

suite('HorizontalScrollBox scrolls horizontally under the pointer')
{
  const out = new FakeStream(12, 3)
  const inp = new FakeInput()

  function App() {
    return jsx(HorizontalScrollBox, {
      contentWidth: 20,
      children: jsx('text', { style: { overflow: 'nowrap' }, children: 'abcdefghijklmnopqrst' }),
    })
  }

  const { getBuffer, unmount } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()
  assert(screenOf(getBuffer).includes('abcdefghijk›'), 'initial view shows the start and right indicator')
  inp.send('\x1b[<67;5;1M')
  await tick()
  assert(screenOf(getBuffer).includes('‹efghijklmn›'), 'wheel right reveals later content')
  inp.send('\x1b[<66;5;1M')
  await tick()
  assert(screenOf(getBuffer).includes('abcdefghijk›'), 'wheel left returns toward the start')
  unmount()
}

suite('Markdown renders headings, lists, and inline styles')
{
  const out = new FakeStream(40, 12)
  const inp = new FakeInput()

  function App() {
    return jsx(Markdown, { text: '# Head\n\nsome **bold** and `code`\n\n- item one' })
  }

  const { unmount, getBuffer } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()

  const screen = screenOf(getBuffer)
  assert(screen.includes('Head'), 'heading text rendered')
  assert(screen.includes('• item one'), 'list item rendered with a bullet')
  assert(screen.includes('some bold and code'), 'inline markers stripped from the paragraph')

  const b = getBuffer()
  const paraRow = rowOf(getBuffer, 'some bold')
  const rowText = screenOf(getBuffer).split('\n')[paraRow]
  const boldCell = b.cells[paraRow * b.width + rowText.indexOf('bold')]
  assertEq(boldCell.attrs & 1, 1, 'bold span carries the bold attribute')
  const codeCell = b.cells[paraRow * b.width + rowText.indexOf('code')]
  assertEq(codeCell.fg, 'cyan', 'inline code takes the accent color')

  unmount()
}

suite('Markdown code block paints its own background')
{
  const out = new FakeStream(40, 8)
  const inp = new FakeInput()

  function App() {
    return jsx(Markdown, { text: '```\nconst a = 1\n```' })
  }

  const { unmount, getBuffer } = mount(App, { stream: out, stdin: inp, altScreen: false })
  await tick()

  const b = getBuffer()
  const row = rowOf(getBuffer, 'const a = 1')
  assert(row >= 0, 'code line rendered')
  const cell = b.cells[row * b.width + screenOf(getBuffer).split('\n')[row].indexOf('const')]
  assertEq(cell.bg, '#1e1e22', 'code block background applied')

  unmount()
}

suite('useSelection copies wrapped prose as one paragraph and code with newlines')
{
  const out = new FakeStream(24, 10)
  out.written = ''
  out.write = function (data) { this.written += data; return true }
  const inp = new FakeInput()

  let copied = null

  function App() {
    useSelection({ onCopy: (t) => { copied = t } })
    return jsxs('box', {
      style: { flexDirection: 'column', paddingX: 2 },
      children: [
        jsx('text', { children: 'alpha beta gamma delta epsilon' }),
        jsx('text', { children: 'fn f() {\n  return 1\n}' }),
      ],
    })
  }

  const { unmount, getBuffer } = mount(App, { stream: out, stdin: inp })
  await tick()

  const drag = (x, y) => inp.send(`\x1b[<32;${x + 1};${y + 1}M`)
  const press = (x, y) => inp.send(`\x1b[<0;${x + 1};${y + 1}M`)
  const release = (x, y) => inp.send(`\x1b[<0;${x + 1};${y + 1}m`)

  press(0, 0)
  drag(23, 4)
  await tick()

  const b = getBuffer()
  assertEq(b.cells[0].attrs & 16, 16, 'dragged region renders inverse')
  assert(b.softWrap[1] === 1, 'wrapped continuation row flagged as soft')
  assert(b.softWrap[2] === 0, 'hard code row not flagged')

  release(23, 4)
  await tick()

  assertEq(copied, 'alpha beta gamma delta epsilon\nfn f() {\n  return 1\n}', 'prose rejoined, code newlines and indent kept, padding dedented')
  assert(out.written.includes(']52;c;'), 'release writes an OSC 52 clipboard sequence')
  const b2 = getBuffer()
  assertEq(b2.cells[0].attrs & 16, 0, 'highlight cleared after release')

  unmount()
}

suite('useSelection ignores plain clicks')
{
  const out = new FakeStream(20, 4)
  const inp = new FakeInput()

  let copied = null

  function App() {
    useSelection({ onCopy: (t) => { copied = t }, copy: false })
    return jsx('text', { children: 'hello' })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()

  inp.send('\x1b[<0;2;1M')
  inp.send('\x1b[<0;2;1m')
  await tick()

  assertEq(copied, null, 'click without drag copies nothing')

  unmount()
}

// ----


suite('useSelection skips chrome cells marked copyIgnore')
{
  const out = new FakeStream(24, 6)
  const inp = new FakeInput()

  let copied = null

  function App() {
    useSelection({ onCopy: (t) => { copied = t } })
    return jsxs('box', {
      style: { flexDirection: 'row' },
      children: [
        jsx('box', { style: { flexGrow: 1, flexDirection: 'column' }, children: [
          jsx('text', { children: 'first line' }),
          jsx('text', { children: 'second line' }),
        ] }),
        jsx('box', { style: { width: 1, flexDirection: 'column' }, children: [
          jsx('text', { style: { copyIgnore: true }, children: '│' }),
          jsx('text', { style: { copyIgnore: true }, children: '█' }),
        ] }),
      ],
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()

  inp.send('\x1b[<0;1;1M')
  inp.send('\x1b[<32;24;2M')
  await tick()
  inp.send('\x1b[<0;24;2m')
  await tick()

  assertEq(copied, 'first line\nsecond line', 'scrollbar chars and padding excluded from copy')

  unmount()
}

suite('useHitTest uses painted, scrolled, clipped geometry')
{
  const out = new FakeStream(40, 3)
  const inp = new FakeInput()

  let hitProbe = null
  const [offset, setOffset] = createSignal(0)
  const [tick2, setTick2] = createSignal(0)

  function Target() {
    const hitTest = useHitTest()
    hitProbe = hitTest
    return jsx('text', { children: 'target line' })
  }

  function App() {
    tick2()
    return jsx(ScrollBox, {
      style: { flexGrow: 1 },
      focused: false,
      scrollOffset: offset(),
      onScroll: () => {},
      children: [
        jsx('text', { key: 'a', children: 'row zero' }),
        jsx('text', { key: 'b', children: 'row one' }),
        jsx('text', { key: 'c', children: 'row two' }),
        jsx('text', { key: 'd', children: 'row three' }),
        jsx(Target, { key: 't' }),
      ],
    })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()

  assert(hitProbe(0, 4) === false, 'below the fold: logical position does not hit')
  assert(hitProbe(0, 0) === false, 'below the fold: viewport top does not hit')

  setOffset(2)
  await tick()

  assertEq(hitProbe(0, 2), true, 'scrolled into view: painted row hits')
  assertEq(hitProbe(0, 4), false, 'old logical position no longer hits')
  assertEq(hitProbe(39, 2), true, 'component hit area spans its allocated row')
  assertEq(hitProbe(40, 2), false, 'half-open right edge does not hit')

  setTick2(1)
  await tick()
  assertEq(hitProbe(0, 2), true, 'rect survives an unrelated re-render (blit path)')

  unmount()
  assertEq(hitProbe(0, 2), false, 'retained hitTest returns false after unmount')
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
