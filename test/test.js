import { createBuffer, clearBuffer, writeText, fillRect, setCell, copyBuffer, resizeBuffer } from '../src/buffer.js'
import { diff } from '../src/diff.js'
import { createSignal, createEffect, createMemo, batch, untrack, onCleanup, createScope, disposeScope, setSchedulerHook } from '../src/signal.js'
import { resolveTree, Fragment, flattenChildren, walkTree } from '../src/element.js'
import { computeLayout } from '../src/layout.js'
import { wordWrap, measureText, stripAnsi, sliceVisible } from '../src/wrap.js'
import { createScheduler } from '../src/scheduler.js'
import { parseKey, splitKeys } from '../src/input.js'
import { jsx, jsxs } from '../jsx-runtime.js'
import * as ansi from '../src/ansi.js'
import { wrapForEditor, cursorToDisplay, displayToCursor } from '../src/text-area.js'

let passed = 0
let failed = 0
let currentSuite = ''

function suite(name) {
  currentSuite = name
}

function assert(cond, msg) {
  if (cond) {
    passed++
  } else {
    failed++
    console.log(`  FAIL [${currentSuite}]: ${msg}`)
  }
}

function assertEq(a, b, msg) {
  assert(a === b, `${msg} (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`)
}

// =========================================================================
// BUFFER
// =========================================================================
suite('buffer - createBuffer')
{
  const buf = createBuffer(10, 5)
  assertEq(buf.cells.length, 50, 'correct cell count')
  assertEq(buf.width, 10, 'width stored')
  assertEq(buf.height, 5, 'height stored')
  assertEq(buf.cells[0].ch, ' ', 'default char is space')
  assertEq(buf.cells[0].fg, null, 'default fg is null')
  assertEq(buf.cells[0].bg, null, 'default bg is null')
  assertEq(buf.cells[0].attrs, 0, 'default attrs is 0')
}

suite('buffer - setCell')
{
  const buf = createBuffer(5, 5)
  setCell(buf, 0, 0, 'X', 'red', 'blue', 1)
  assertEq(buf.cells[0].ch, 'X', 'sets char')
  assertEq(buf.cells[0].fg, 'red', 'sets fg')
  assertEq(buf.cells[0].bg, 'blue', 'sets bg')
  assertEq(buf.cells[0].attrs, 1, 'sets attrs')

  setCell(buf, -1, 0, 'Y', null, null, 0)
  setCell(buf, 0, -1, 'Y', null, null, 0)
  setCell(buf, 5, 0, 'Y', null, null, 0)
  setCell(buf, 0, 5, 'Y', null, null, 0)
  assert(buf.cells.every(c => c.ch !== 'Y' || c === buf.cells[0]), 'out of bounds writes are ignored')
}

suite('buffer - writeText')
{
  const buf = createBuffer(10, 3)
  writeText(buf, 0, 0, 'hello', 'red', null, 0)
  assertEq(buf.cells[0].ch, 'h', 'first char')
  assertEq(buf.cells[4].ch, 'o', 'last char')
  assertEq(buf.cells[0].fg, 'red', 'fg applied')
  assertEq(buf.cells[5].ch, ' ', 'no overflow')

  writeText(buf, 8, 0, 'long text', null, null, 0)
  assertEq(buf.cells[8].ch, 'l', 'clips to buffer width')
  assertEq(buf.cells[9].ch, 'o', 'clips to buffer width')

  writeText(buf, 0, 1, 'AB', null, null, 0, 1)
  assertEq(buf.cells[10].ch, 'A', 'maxWidth limits first char')
  assertEq(buf.cells[11].ch, ' ', 'maxWidth prevents second char')
}

suite('buffer - writeText with ANSI')
{
  const buf = createBuffer(20, 3)
  writeText(buf, 0, 0, '\x1b[31mhello\x1b[0m world', null, null, 0)
  assertEq(buf.cells[0].ch, 'h', 'ansi: first visible char')
  assertEq(buf.cells[0].fg, 'red', 'ansi: red fg from \\e[31m')
  assertEq(buf.cells[4].ch, 'o', 'ansi: last red char')
  assertEq(buf.cells[4].fg, 'red', 'ansi: red persists')
  assertEq(buf.cells[5].ch, ' ', 'ansi: space after reset')
  assertEq(buf.cells[5].fg, null, 'ansi: fg cleared by reset')
  assertEq(buf.cells[6].ch, 'w', 'ansi: w after space')
  assertEq(buf.cells[6].fg, null, 'ansi: no fg after reset')

  const buf2 = createBuffer(20, 3)
  writeText(buf2, 0, 0, '\x1b[1;31mhi\x1b[0m', null, null, 0)
  assertEq(buf2.cells[0].fg, 'red', 'ansi: combined bold+red fg')
  assertEq(buf2.cells[0].attrs & 1, 1, 'ansi: combined bold attr')

  const buf3 = createBuffer(20, 3)
  writeText(buf3, 0, 0, '\x1b[31m', null, null, 0)
  assertEq(buf3.cells[0].ch, ' ', 'ansi: escape-only writes nothing')

  const buf4 = createBuffer(10, 3)
  writeText(buf4, 0, 0, '\x1b[32mabcdefghij\x1b[0m', null, null, 0, 5)
  assertEq(buf4.cells[4].ch, 'e', 'ansi: maxWidth clips visible chars')
  assertEq(buf4.cells[4].fg, 'green', 'ansi: clipped chars still colored')
  assertEq(buf4.cells[5].ch, ' ', 'ansi: beyond maxWidth untouched')
}

suite('buffer - writeText ANSI cumulative')
{
  const buf = createBuffer(20, 3)
  writeText(buf, 0, 0, '\x1b[31mR\x1b[1mB\x1b[0mN', null, null, 0)
  assertEq(buf.cells[0].fg, 'red', 'cumulative: first char red')
  assertEq(buf.cells[0].attrs, 0, 'cumulative: first char no bold')
  assertEq(buf.cells[1].fg, 'red', 'cumulative: second keeps red')
  assertEq(buf.cells[1].attrs & 1, 1, 'cumulative: second adds bold')
  assertEq(buf.cells[2].fg, null, 'cumulative: third reset')
  assertEq(buf.cells[2].attrs, 0, 'cumulative: third no attrs')
}

suite('buffer - fillRect')
{
  const buf = createBuffer(6, 4)
  fillRect(buf, 1, 1, 3, 2, '#', 'green', null, 0)
  assertEq(buf.cells[0].ch, ' ', 'outside rect unchanged')
  assertEq(buf.cells[7].ch, '#', 'inside rect filled')
  assertEq(buf.cells[7].fg, 'green', 'fg applied to fill')
  assertEq(buf.cells[9].ch, '#', 'fill extends to width')
  assertEq(buf.cells[13].ch, '#', 'fill extends to height')
  assertEq(buf.cells[10].ch, ' ', 'fill does not exceed width')

  fillRect(buf, -1, -1, 3, 3, 'X', null, null, 0)
  assertEq(buf.cells[0].ch, 'X', 'clamps negative coords')
}

suite('buffer - clearBuffer')
{
  const buf = createBuffer(3, 3)
  writeText(buf, 0, 0, 'abc', null, null, 0)
  clearBuffer(buf)
  assertEq(buf.cells[0].ch, ' ', 'clear resets cells')
  assertEq(buf.cells[2].ch, ' ', 'clear resets all cells')
}

suite('buffer - resizeBuffer')
{
  const buf = createBuffer(3, 3)
  writeText(buf, 0, 0, 'abc', null, null, 0)
  resizeBuffer(buf, 5, 5)
  assertEq(buf.width, 5, 'new width')
  assertEq(buf.height, 5, 'new height')
  assertEq(buf.cells.length, 25, 'new cell count')
  assertEq(buf.cells[0].ch, ' ', 'cells reset after resize')
}

// =========================================================================
// DIFF
// =========================================================================
suite('diff - identical buffers')
{
  const prev = createBuffer(5, 3)
  const curr = createBuffer(5, 3)
  assertEq(diff(prev, curr).output, '', 'no output for identical buffers')
}

suite('diff - changed text')
{
  const prev = createBuffer(10, 2)
  const curr = createBuffer(10, 2)
  writeText(curr, 0, 0, 'hello', null, null, 0)
  const { output } = diff(prev, curr)
  assert(output.length > 0, 'produces output')
  assert(output.includes('hello'), 'includes changed text')
}

suite('diff - partial change')
{
  const prev = createBuffer(10, 2)
  const curr = createBuffer(10, 2)
  writeText(prev, 0, 0, 'hello', null, null, 0)
  writeText(curr, 0, 0, 'hallo', null, null, 0)
  const { output } = diff(prev, curr)
  assert(output.includes('a'), 'includes changed char')
  assert(!output.includes('hello'), 'does not include unchanged text as whole')
}

suite('diff - color change only')
{
  const prev = createBuffer(3, 1)
  const curr = createBuffer(3, 1)
  writeText(prev, 0, 0, 'abc', null, null, 0)
  writeText(curr, 0, 0, 'abc', 'red', null, 0)
  const { output } = diff(prev, curr)
  assert(output.length > 0, 'detects color-only change')
}

// =========================================================================
// ANSI
// =========================================================================
suite('ansi - moveTo')
{
  assertEq(ansi.moveTo(1, 1), '\x1b[1;1H', 'top-left')
  assertEq(ansi.moveTo(5, 10), '\x1b[5;10H', 'arbitrary position')
}

suite('ansi - sgr')
{
  const reset = ansi.sgr(null, null, 0)
  assertEq(reset, '\x1b[0m', 'null/null/0 produces reset')

  const bold = ansi.sgr(null, null, ansi.BOLD)
  assert(bold.includes('1'), 'bold attr code')

  const red = ansi.sgr('red', null, 0)
  assert(red.includes('38;5;1'), 'named color')

  const hex = ansi.sgr('#ff0000', null, 0)
  assert(hex.includes('38;2;255;0;0'), 'hex color')

  const idx = ansi.sgr(42, null, 0)
  assert(idx.includes('38;5;42'), '256 color index')

  const bg = ansi.sgr(null, 'blue', 0)
  assert(bg.includes('48;5;4'), 'bg color')
}

suite('ansi - parseSgr basic colors')
{
  const s = ansi.parseSgr('31')
  assertEq(s.fg, 'red', 'basic fg 31 = red')
  assertEq(s.bg, null, 'no bg')
  assertEq(s.attrs, 0, 'no attrs')

  const s2 = ansi.parseSgr('42')
  assertEq(s2.bg, 'green', 'basic bg 42 = green')

  const s3 = ansi.parseSgr('90')
  assertEq(s3.fg, 'gray', 'bright black (90) = gray')

  const s4 = ansi.parseSgr('97')
  assertEq(s4.fg, 'brightWhite', 'bright white (97)')
}

suite('ansi - parseSgr 256 color')
{
  const s = ansi.parseSgr('38;5;196')
  assertEq(s.fg, 196, '256-color fg stays numeric')

  const s2 = ansi.parseSgr('48;5;21')
  assertEq(s2.bg, 21, '256-color bg stays numeric')

  const s3 = ansi.parseSgr('38;5;1')
  assertEq(s3.fg, 'red', '256-color index 1 maps to red')
}

suite('ansi - parseSgr truecolor')
{
  const s = ansi.parseSgr('38;2;255;128;0')
  assertEq(s.fg, '#ff8000', 'truecolor fg to hex')

  const s2 = ansi.parseSgr('48;2;0;0;0')
  assertEq(s2.bg, '#000000', 'truecolor bg to hex')
}

suite('ansi - parseSgr attrs')
{
  const s = ansi.parseSgr('1')
  assertEq(s.attrs & ansi.BOLD, ansi.BOLD, 'bold')

  const s2 = ansi.parseSgr('1;3;4')
  assertEq(s2.attrs & ansi.BOLD, ansi.BOLD, 'combined bold')
  assertEq(s2.attrs & ansi.ITALIC, ansi.ITALIC, 'combined italic')
  assertEq(s2.attrs & ansi.UNDERLINE, ansi.UNDERLINE, 'combined underline')
}

suite('ansi - parseSgr reset')
{
  const s = { fg: 'red', bg: 'blue', attrs: ansi.BOLD }
  ansi.parseSgr('0', s)
  assertEq(s.fg, null, 'reset clears fg')
  assertEq(s.bg, null, 'reset clears bg')
  assertEq(s.attrs, 0, 'reset clears attrs')
}

suite('ansi - parseSgr cumulative')
{
  const s = { fg: null, bg: null, attrs: 0 }
  ansi.parseSgr('31', s)
  assertEq(s.fg, 'red', 'first sets red')
  ansi.parseSgr('1', s)
  assertEq(s.fg, 'red', 'second keeps red')
  assertEq(s.attrs & ansi.BOLD, ansi.BOLD, 'second adds bold')
}

suite('ansi - parseSgr combined')
{
  const s = ansi.parseSgr('1;31;42')
  assertEq(s.fg, 'red', 'combined fg')
  assertEq(s.bg, 'green', 'combined bg')
  assertEq(s.attrs & ansi.BOLD, ansi.BOLD, 'combined bold')
}

// =========================================================================
// SIGNALS
// =========================================================================
suite('signal - basic get/set')
{
  const [get, set] = createSignal(10)
  assertEq(get(), 10, 'initial value')
  set(20)
  assertEq(get(), 20, 'set value')
  set(v => v + 5)
  assertEq(get(), 25, 'updater function')
}

suite('signal - no-op set')
{
  const [get, set] = createSignal(5)
  let runs = 0
  createEffect(() => { get(); runs++ })
  assertEq(runs, 1, 'effect runs once initially')
  set(5)
  assertEq(runs, 1, 'same value does not trigger')
}

suite('signal - effect tracking')
{
  const [a, setA] = createSignal(1)
  const [b, setB] = createSignal(2)
  let result = 0
  createEffect(() => { result = a() + b() })
  assertEq(result, 3, 'initial effect computation')
  setA(10)
  assertEq(result, 12, 'reacts to first signal')
  setB(20)
  assertEq(result, 30, 'reacts to second signal')
}

suite('signal - effect cleanup')
{
  let cleaned = false
  const [get, set] = createSignal(0)
  createEffect(() => {
    get()
    return () => { cleaned = true }
  })
  assert(!cleaned, 'not cleaned yet')
  set(1)
  assert(cleaned, 'cleanup runs on re-execution')
}

suite('signal - createMemo')
{
  const [a, setA] = createSignal(3)
  const [b, setB] = createSignal(4)
  const sum = createMemo(() => a() + b())
  assertEq(sum(), 7, 'initial memo value')
  setA(10)
  assertEq(sum(), 14, 'memo recomputes')
  setB(0)
  assertEq(sum(), 10, 'memo recomputes again')
}

suite('signal - batch')
{
  const [x, setX] = createSignal(0)
  let runs = 0
  createEffect(() => { x(); runs++ })
  runs = 0

  batch(() => {
    setX(1)
    setX(2)
    setX(3)
  })
  assertEq(runs, 1, 'batch coalesces to one run')
  assertEq(x(), 3, 'final value applied')
}

suite('signal - nested batch')
{
  const [x, setX] = createSignal(0)
  let runs = 0
  createEffect(() => { x(); runs++ })
  runs = 0

  batch(() => {
    setX(1)
    batch(() => {
      setX(2)
    })
    setX(3)
  })
  assertEq(runs, 1, 'nested batch coalesces')
  assertEq(x(), 3, 'final value from nested batch')
}

suite('signal - untrack')
{
  const [a, setA] = createSignal(1)
  const [b, setB] = createSignal(2)
  let runs = 0
  createEffect(() => {
    a()
    untrack(() => b())
    runs++
  })
  assertEq(runs, 1, 'initial run')
  setA(10)
  assertEq(runs, 2, 'tracked signal triggers')
  setB(20)
  assertEq(runs, 2, 'untracked signal does not trigger')
}

suite('signal - scope disposal')
{
  let cleaned = false
  const scope = createScope(() => {
    onCleanup(() => { cleaned = true })
  })
  assert(!cleaned, 'not cleaned before dispose')
  disposeScope(scope)
  assert(cleaned, 'cleanup runs on dispose')
}

suite('signal - nested scope disposal')
{
  let order = []
  const outer = createScope(() => {
    onCleanup(() => order.push('outer'))
    createScope(() => {
      onCleanup(() => order.push('inner'))
    })
  })
  disposeScope(outer)
  assertEq(order[0], 'inner', 'inner disposes first')
  assertEq(order[1], 'outer', 'outer disposes second')
}

suite('signal - scheduler hook')
{
  let hookCalled = 0
  setSchedulerHook(() => hookCalled++)
  const [get, set] = createSignal(0)
  set(1)
  assert(hookCalled > 0, 'scheduler hook called on set')

  hookCalled = 0
  batch(() => {
    set(2)
    set(3)
  })
  assertEq(hookCalled, 1, 'scheduler hook called once after batch')

  setSchedulerHook(null)
}

// =========================================================================
// JSX RUNTIME
// =========================================================================
suite('jsx - element creation')
{
  const el = jsx('box', { style: { padding: 1 } })
  assertEq(el.type, 'box', 'type set')
  assertEq(el.props.style.padding, 1, 'props preserved')
  assertEq(el.key, null, 'default key is null')
}

suite('jsx - key from props')
{
  const el = jsx('box', { key: 'a' })
  assertEq(el.key, 'a', 'key from props')
}

suite('jsx - key from third arg')
{
  const el = jsx('box', {}, 'b')
  assertEq(el.key, 'b', 'key from third arg')
}

suite('jsx - Fragment')
{
  assertEq(typeof Fragment, 'symbol', 'Fragment is a symbol')
}

// =========================================================================
// ELEMENT
// =========================================================================
suite('element - flattenChildren')
{
  assertEq(flattenChildren(null).length, 0, 'null')
  assertEq(flattenChildren(undefined).length, 0, 'undefined')
  assertEq(flattenChildren(true).length, 0, 'boolean true')
  assertEq(flattenChildren(false).length, 0, 'boolean false')
  assertEq(flattenChildren('hello').length, 1, 'string')
  assertEq(flattenChildren([1, 2, 3]).length, 3, 'array')
  assertEq(flattenChildren([1, [2, [3]]]).length, 3, 'nested array')
  assertEq(flattenChildren([null, 1, false, 2]).length, 2, 'filters nullish')
}

suite('element - resolveTree intrinsic')
{
  const el = jsx('box', { style: { padding: 1 }, children: 'hello' })
  const tree = resolveTree(el, null)
  assertEq(tree.type, 'box', 'preserves type')
  assert(tree._resolvedChildren.length === 1, 'resolves children')
  assertEq(tree._resolvedChildren[0].type, 'text', 'string child becomes text node')
}

suite('element - resolveTree component')
{
  function Comp({ name }) {
    return jsx('text', { children: name })
  }
  const el = jsx(Comp, { name: 'world' })
  const tree = resolveTree(el, null)
  assertEq(tree.type, Comp, 'component type preserved')
  assert(tree._resolved !== null, 'resolved exists')
  assertEq(tree._resolved.type, 'text', 'resolved to text')
  assert(tree._scope !== null, 'scope created')
}

suite('element - resolveTree nested components')
{
  function Inner() {
    return jsx('text', { children: 'inner' })
  }
  function Outer() {
    return jsx('box', { children: jsx(Inner, {}) })
  }
  const tree = resolveTree(jsx(Outer, {}), null)
  const box = tree._resolved
  assertEq(box.type, 'box', 'outer resolves to box')
  const inner = box._resolvedChildren[0]
  assertEq(inner.type, Inner, 'inner component in children')
  assert(inner._resolved.type === 'text', 'inner resolves to text')
}

suite('element - resolveTree fragment')
{
  const el = jsx(Fragment, { children: [jsx('text', { children: 'a' }), jsx('text', { children: 'b' })] })
  const tree = resolveTree(el, null)
  assertEq(tree.type, Fragment, 'fragment type')
  assertEq(tree._resolvedChildren.length, 2, 'fragment children resolved')
}

suite('element - walkTree')
{
  const tree = resolveTree(
    jsxs('box', {
      children: [
        jsx('text', { children: 'a' }),
        jsx('text', { children: 'b' }),
      ]
    }),
    null
  )
  let count = 0
  walkTree(tree, () => count++)
  assertEq(count, 5, 'walks all nodes (box + 2 text + 2 text-leaf children)')
}

// =========================================================================
// WORD WRAP
// =========================================================================
suite('wrap - basic wrapping')
{
  const lines = wordWrap('hello world', 8)
  assertEq(lines.length, 2, 'wraps at boundary')
  assertEq(lines[0], 'hello', 'first line')
  assertEq(lines[1], 'world', 'second line')
}

suite('wrap - no wrap needed')
{
  const lines = wordWrap('hi', 20)
  assertEq(lines.length, 1, 'single line')
  assertEq(lines[0], 'hi', 'content preserved')
}

suite('wrap - newlines')
{
  const lines = wordWrap('a\nb\nc', 10)
  assertEq(lines.length, 3, 'respects newlines')
  assertEq(lines[0], 'a', 'first line')
  assertEq(lines[2], 'c', 'third line')
}

suite('wrap - empty string')
{
  const lines = wordWrap('', 10)
  assertEq(lines.length, 1, 'empty produces one empty line')
}

suite('wrap - long word')
{
  const lines = wordWrap('abcdefghij', 4)
  assert(lines.length >= 2, 'breaks long word')
  assertEq(lines[0].length, 4, 'first chunk is maxWidth')
}

suite('wrap - zero width')
{
  const lines = wordWrap('hello', 0)
  assertEq(lines.length, 0, 'zero width produces no lines')
}

suite('wrap - exact fit')
{
  const lines = wordWrap('abcd', 4)
  assertEq(lines.length, 1, 'exact fit is one line')
  assertEq(lines[0], 'abcd', 'content preserved')
}

suite('wrap - multiple spaces')
{
  const lines = wordWrap('a  b', 10)
  assertEq(lines.length, 1, 'multiple spaces handled')
}

// =========================================================================
// MEASURE TEXT
// =========================================================================
suite('measureText')
{
  assertEq(measureText('hello'), 5, 'ascii width')
  assertEq(measureText(''), 0, 'empty string')
  assertEq(measureText('ab'), 2, 'two chars')
}

suite('measureText - ANSI')
{
  assertEq(measureText('\x1b[31mhello\x1b[0m'), 5, 'ansi codes not counted')
  assertEq(measureText('\x1b[1;31;42mhi\x1b[0m'), 2, 'complex sgr not counted')
  assertEq(measureText('\x1b[38;2;255;0;0mrgb\x1b[0m'), 3, 'truecolor sgr not counted')
  assertEq(measureText('\x1b[0m'), 0, 'only ansi = zero width')
}

suite('stripAnsi')
{
  assertEq(stripAnsi('hello'), 'hello', 'no-op on plain text')
  assertEq(stripAnsi('\x1b[31mred\x1b[0m'), 'red', 'strips sgr')
  assertEq(stripAnsi('\x1b[1;31mhi\x1b[0m there'), 'hi there', 'strips inline sgr')
}

suite('sliceVisible')
{
  assertEq(sliceVisible('hello', 3), 'hel', 'plain text slice')
  assertEq(sliceVisible('\x1b[31mhello\x1b[0m', 3), '\x1b[31mhel', 'preserves leading ansi')
  assertEq(sliceVisible('\x1b[31mhi\x1b[0m world', 5), '\x1b[31mhi\x1b[0m wo', 'slices across reset')
  assertEq(sliceVisible('hello', 0), '', 'zero width')
}

suite('wordWrap - ANSI')
{
  const lines = wordWrap('\x1b[31mhello world\x1b[0m', 6)
  assertEq(lines.length, 2, 'ansi: wraps into two lines')
  assert(lines[0].includes('hello'), 'ansi: first line has hello')
  assert(lines[1].includes('world'), 'ansi: second line has world')

  const lines2 = wordWrap('\x1b[31mshort\x1b[0m', 80)
  assertEq(lines2.length, 1, 'ansi: no wrap when fits')
  assertEq(lines2[0], '\x1b[31mshort\x1b[0m', 'ansi: preserves escape codes')
}

// =========================================================================
// LAYOUT
// =========================================================================
suite('layout - basic column')
{
  const tree = resolveTree(
    jsxs('box', {
      style: { flexDirection: 'column' },
      children: [
        jsx('text', { children: 'line 1' }),
        jsx('text', { children: 'line 2' }),
        jsx('text', { children: 'line 3' }),
      ],
    }),
    null
  )
  computeLayout(tree, { x: 0, y: 0, width: 20, height: 10 })

  assertEq(tree._layout.width, 20, 'root width')
  assertEq(tree._layout.height, 10, 'root height')
  assertEq(tree._resolvedChildren[0]._layout.y, 0, 'child 0 at y=0')
  assertEq(tree._resolvedChildren[1]._layout.y, 1, 'child 1 at y=1')
  assertEq(tree._resolvedChildren[2]._layout.y, 2, 'child 2 at y=2')
}

suite('layout - basic row')
{
  const tree = resolveTree(
    jsxs('box', {
      style: { flexDirection: 'row' },
      children: [
        jsx('text', { children: 'A', style: { width: 5 } }),
        jsx('text', { children: 'B', style: { width: 5 } }),
      ],
    }),
    null
  )
  computeLayout(tree, { x: 0, y: 0, width: 20, height: 5 })
  assertEq(tree._resolvedChildren[0]._layout.x, 0, 'child 0 at x=0')
  assertEq(tree._resolvedChildren[1]._layout.x, 5, 'child 1 at x=5')
}

suite('layout - flex-grow')
{
  const tree = resolveTree(
    jsxs('box', {
      style: { flexDirection: 'column' },
      children: [
        jsx('text', { children: 'header' }),
        jsx('box', { style: { flexGrow: 1 } }),
        jsx('text', { children: 'footer' }),
      ],
    }),
    null
  )
  computeLayout(tree, { x: 0, y: 0, width: 40, height: 20 })

  assertEq(tree._resolvedChildren[0]._layout.height, 1, 'header height')
  assertEq(tree._resolvedChildren[1]._layout.height, 18, 'spacer fills remaining')
  assertEq(tree._resolvedChildren[2]._layout.y, 19, 'footer at bottom')
}

suite('layout - padding')
{
  const tree = resolveTree(
    jsx('box', {
      style: { padding: 2 },
      children: jsx('text', { children: 'padded' }),
    }),
    null
  )
  computeLayout(tree, { x: 0, y: 0, width: 20, height: 10 })
  assertEq(tree._resolvedChildren[0]._layout.x, 2, 'child offset by padding left')
  assertEq(tree._resolvedChildren[0]._layout.y, 2, 'child offset by padding top')
}

suite('layout - gap')
{
  const tree = resolveTree(
    jsxs('box', {
      style: { flexDirection: 'column', gap: 1 },
      children: [
        jsx('text', { children: 'a' }),
        jsx('text', { children: 'b' }),
        jsx('text', { children: 'c' }),
      ],
    }),
    null
  )
  computeLayout(tree, { x: 0, y: 0, width: 20, height: 20 })
  assertEq(tree._resolvedChildren[0]._layout.y, 0, 'first at y=0')
  assertEq(tree._resolvedChildren[1]._layout.y, 2, 'second at y=2 (1 + gap)')
  assertEq(tree._resolvedChildren[2]._layout.y, 4, 'third at y=4 (3 + gap)')
}

suite('layout - justify-content center')
{
  const tree = resolveTree(
    jsxs('box', {
      style: { flexDirection: 'column', justifyContent: 'center' },
      children: [
        jsx('text', { children: 'centered' }),
      ],
    }),
    null
  )
  computeLayout(tree, { x: 0, y: 0, width: 20, height: 10 })
  assertEq(tree._resolvedChildren[0]._layout.y, 4, 'centered vertically (10-1)/2 = 4')
}

suite('layout - justify-content flex-end')
{
  const tree = resolveTree(
    jsxs('box', {
      style: { flexDirection: 'column', justifyContent: 'flex-end' },
      children: [
        jsx('text', { children: 'bottom' }),
      ],
    }),
    null
  )
  computeLayout(tree, { x: 0, y: 0, width: 20, height: 10 })
  assertEq(tree._resolvedChildren[0]._layout.y, 9, 'at bottom')
}

suite('layout - explicit width/height')
{
  const tree = resolveTree(
    jsxs('box', { children: [
      jsx('box', { style: { width: 10, height: 5 } }),
    ]}),
    null
  )
  computeLayout(tree, { x: 0, y: 0, width: 40, height: 20 })
  const child = tree._resolvedChildren[0]
  assertEq(child._layout.width, 10, 'explicit width')
  assertEq(child._layout.height, 5, 'explicit height')
}

suite('layout - percentage sizing')
{
  const tree = resolveTree(
    jsxs('box', { children: [
      jsx('box', { style: { width: '50%', height: '25%' } }),
    ]}),
    null
  )
  computeLayout(tree, { x: 0, y: 0, width: 40, height: 20 })
  const child = tree._resolvedChildren[0]
  assertEq(child._layout.width, 20, '50% of 40')
  assertEq(child._layout.height, 5, '25% of 20')
}

suite('layout - min/max constraints')
{
  const tree = resolveTree(
    jsxs('box', { children: [
      jsx('box', { style: { width: 5, minWidth: 10 } }),
    ]}),
    null
  )
  computeLayout(tree, { x: 0, y: 0, width: 40, height: 20 })
  assertEq(tree._resolvedChildren[0]._layout.width, 10, 'minWidth enforced')

  const tree2 = resolveTree(
    jsxs('box', { children: [
      jsx('box', { style: { width: 30, maxWidth: 15 } }),
    ]}),
    null
  )
  computeLayout(tree2, { x: 0, y: 0, width: 40, height: 20 })
  assertEq(tree2._resolvedChildren[0]._layout.width, 15, 'maxWidth enforced')
}

suite('layout - text auto-height')
{
  const tree = resolveTree(
    jsx('text', { children: 'hello world this is a longer piece of text' }),
    null
  )
  computeLayout(tree, { x: 0, y: 0, width: 10, height: 20 })
  assert(tree._layout.height > 1, 'text wraps and auto-sizes height')
}

suite('layout - component resolution')
{
  function MyComp() {
    return jsx('text', { children: 'from component' })
  }
  const tree = resolveTree(jsx(MyComp, {}), null)
  computeLayout(tree, { x: 0, y: 0, width: 20, height: 10 })
  assert(tree._layout !== null, 'component gets layout')
}

suite('layout - multiple flex-grow')
{
  const tree = resolveTree(
    jsxs('box', {
      style: { flexDirection: 'column' },
      children: [
        jsx('box', { style: { flexGrow: 1 } }),
        jsx('box', { style: { flexGrow: 2 } }),
      ],
    }),
    null
  )
  computeLayout(tree, { x: 0, y: 0, width: 20, height: 30 })
  const h0 = tree._resolvedChildren[0]._layout.height
  const h1 = tree._resolvedChildren[1]._layout.height
  assertEq(h0, 10, 'flex:1 gets 1/3')
  assertEq(h1, 20, 'flex:2 gets 2/3')
}

suite('layout - margin')
{
  const tree = resolveTree(
    jsx('box', {
      style: { flexDirection: 'column' },
      children: jsx('text', { children: 'hi', style: { marginTop: 2, marginLeft: 3 } }),
    }),
    null
  )
  computeLayout(tree, { x: 0, y: 0, width: 20, height: 10 })
  assertEq(tree._resolvedChildren[0]._layout.y, 2, 'marginTop offset')
  assertEq(tree._resolvedChildren[0]._layout.x, 3, 'marginLeft offset')
}

// =========================================================================
// SCHEDULER
// =========================================================================
suite('scheduler - coalescing')
{
  let frames = 0
  const sched = createScheduler({ fps: 60, onFrame: () => frames++ })
  sched.forceFrame()
  assertEq(frames, 1, 'forceFrame runs immediately')
  sched.destroy()
}

// =========================================================================
// INPUT
// =========================================================================
suite('input - parseKey basic')
{
  const e = parseKey('a')
  assertEq(e.key, 'a', 'simple char')
  assert(!e.ctrl, 'no ctrl')
  assert(!e.meta, 'no meta')
}

suite('input - parseKey ctrl')
{
  const e = parseKey('\x01')
  assertEq(e.key, 'a', 'ctrl+a')
  assert(e.ctrl, 'ctrl flag')
}

suite('input - parseKey arrows')
{
  assertEq(parseKey('\x1b[A').key, 'up', 'up arrow')
  assertEq(parseKey('\x1b[B').key, 'down', 'down arrow')
  assertEq(parseKey('\x1b[C').key, 'right', 'right arrow')
  assertEq(parseKey('\x1b[D').key, 'left', 'left arrow')
}

suite('input - parseKey special')
{
  assertEq(parseKey('\r').key, 'return', 'return key')
  assertEq(parseKey('\t').key, 'tab', 'tab key')
  assertEq(parseKey('\x7f').key, 'backspace', 'backspace')
  assertEq(parseKey('\x1b').key, 'escape', 'escape')
  assertEq(parseKey(' ').key, 'space', 'space')
}

suite('input - parseKey meta')
{
  const e = parseKey('\x1bx')
  assertEq(e.key, 'x', 'meta+x key')
  assert(e.meta, 'meta flag')
}

suite('input - parseKey function keys')
{
  assertEq(parseKey('\x1bOP').key, 'f1', 'F1')
  assertEq(parseKey('\x1bOQ').key, 'f2', 'F2')
  assertEq(parseKey('\x1b[15~').key, 'f5', 'F5')
}

suite('input - splitKeys single char')
{
  const keys = splitKeys('a')
  assertEq(keys.length, 1, 'one key')
  assertEq(keys[0], 'a', 'the char')
}

suite('input - splitKeys multiple chars')
{
  const keys = splitKeys('jk')
  assertEq(keys.length, 2, 'two keys')
  assertEq(keys[0], 'j', 'first')
  assertEq(keys[1], 'k', 'second')
}

suite('input - splitKeys escape sequence intact')
{
  const keys = splitKeys('\x1b[A')
  assertEq(keys.length, 1, 'one sequence')
  assertEq(keys[0], '\x1b[A', 'up arrow preserved')
}

suite('input - splitKeys escape sequence + chars')
{
  const keys = splitKeys('a\x1b[Bb')
  assertEq(keys.length, 3, 'three keys')
  assertEq(keys[0], 'a', 'a')
  assertEq(keys[1], '\x1b[B', 'down arrow')
  assertEq(keys[2], 'b', 'b')
}

suite('input - splitKeys meta key')
{
  const keys = splitKeys('\x1bx')
  assertEq(keys.length, 1, 'one key')
  assertEq(keys[0], '\x1bx', 'meta+x preserved')
}

suite('input - splitKeys function key + chars')
{
  const keys = splitKeys('\x1bOPab')
  assertEq(keys.length, 3, 'three keys')
  assertEq(keys[0], '\x1bOP', 'F1')
  assertEq(keys[1], 'a', 'a')
  assertEq(keys[2], 'b', 'b')
}

suite('input - splitKeys extended escape sequence')
{
  const keys = splitKeys('\x1b[15~')
  assertEq(keys.length, 1, 'one key')
  assertEq(keys[0], '\x1b[15~', 'F5 preserved')
}

// =========================================================================
// INTEGRATION - full pipeline
// =========================================================================
suite('integration - resolve + layout + paint')
{
  function App() {
    return jsxs('box', {
      style: { flexDirection: 'column', padding: 1 },
      children: [
        jsx('text', { style: { color: 'cyan' }, children: 'Hello' }),
        jsx('text', { children: 'World' }),
      ],
    })
  }

  const tree = resolveTree(jsx(App, {}), null)
  computeLayout(tree, { x: 0, y: 0, width: 20, height: 10 })

  const buf = createBuffer(20, 10)
  // manually paint to verify the tree is well-formed
  const box = tree._resolved
  assert(box !== null, 'app resolves')
  assert(box._layout !== null, 'box has layout')
  assert(box._resolvedChildren.length === 2, 'two children')

  const text1 = box._resolvedChildren[0]
  assertEq(text1._layout.x, 1, 'text offset by padding')
  assertEq(text1._layout.y, 1, 'text offset by padding')
}

suite('integration - signal-driven re-render')
{
  const [count, setCount] = createSignal(0)

  function Counter() {
    return jsx('text', { children: `Count: ${count()}` })
  }

  const tree1 = resolveTree(jsx(Counter, {}), null)
  computeLayout(tree1, { x: 0, y: 0, width: 20, height: 5 })
  const buf1 = createBuffer(20, 5)

  const resolved1 = tree1._resolved
  assert(resolved1.props.children === 'Count: 0', 'initial render')

  setCount(42)

  const tree2 = resolveTree(jsx(Counter, {}), null)
  computeLayout(tree2, { x: 0, y: 0, width: 20, height: 5 })
  const resolved2 = tree2._resolved
  assert(resolved2.props.children === 'Count: 42', 'signal update reflected in re-resolve')
}

// =========================================================================
// WRAP FOR EDITOR
// =========================================================================
suite('wrapForEditor - single line fits')
{
  const lines = wrapForEditor('hello', 20)
  assertEq(lines.length, 1, 'one line')
  assertEq(lines[0].start, 0, 'start')
  assertEq(lines[0].end, 5, 'end')
  assertEq(lines[0].hard, true, 'hard break')
}

suite('wrapForEditor - empty string')
{
  const lines = wrapForEditor('', 20)
  assertEq(lines.length, 1, 'one empty line')
  assertEq(lines[0].start, 0, 'start')
  assertEq(lines[0].end, 0, 'end')
  assertEq(lines[0].hard, true, 'hard break')
}

suite('wrapForEditor - newlines')
{
  const lines = wrapForEditor('ab\ncd\nef', 20)
  assertEq(lines.length, 3, 'three lines')
  assertEq(lines[0].start, 0, 'line 0 start')
  assertEq(lines[0].end, 2, 'line 0 end')
  assertEq(lines[1].start, 3, 'line 1 start')
  assertEq(lines[1].end, 5, 'line 1 end')
  assertEq(lines[2].start, 6, 'line 2 start')
  assertEq(lines[2].end, 8, 'line 2 end')
  assert(lines.every(l => l.hard), 'all hard breaks')
}

suite('wrapForEditor - soft wrap at word boundary')
{
  const lines = wrapForEditor('hello world', 8)
  assertEq(lines.length, 2, 'two lines')
  assertEq(lines[0].start, 0, 'line 0 start')
  assertEq(lines[0].end, 5, 'line 0 end at space')
  assertEq(lines[0].hard, false, 'soft break')
  assertEq(lines[1].start, 6, 'line 1 start after space')
  assertEq(lines[1].end, 11, 'line 1 end')
  assertEq(lines[1].hard, true, 'hard break')
}

suite('wrapForEditor - long word no spaces')
{
  const lines = wrapForEditor('abcdefghij', 4)
  assertEq(lines.length, 3, 'three lines')
  assertEq(lines[0].end - lines[0].start, 4, 'first chunk width')
  assertEq(lines[2].end, 10, 'covers full text')
}

suite('wrapForEditor - trailing newline')
{
  const lines = wrapForEditor('hello\n', 20)
  assertEq(lines.length, 2, 'two lines')
  assertEq(lines[1].start, 6, 'empty line after newline')
  assertEq(lines[1].end, 6, 'empty line end')
}

suite('wrapForEditor - slice produces display content')
{
  const text = 'hello world foo'
  const lines = wrapForEditor(text, 8)
  for (const line of lines) {
    const content = text.slice(line.start, line.end)
    assert(content.length <= 8, 'content fits width: ' + JSON.stringify(content))
  }
}

// =========================================================================
// CURSOR TO DISPLAY
// =========================================================================
suite('cursorToDisplay - simple')
{
  const lines = wrapForEditor('hello', 20)
  const pos = cursorToDisplay(3, lines)
  assertEq(pos.row, 0, 'row')
  assertEq(pos.col, 3, 'col')
}

suite('cursorToDisplay - at end')
{
  const lines = wrapForEditor('hello', 20)
  const pos = cursorToDisplay(5, lines)
  assertEq(pos.row, 0, 'row')
  assertEq(pos.col, 5, 'col at end')
}

suite('cursorToDisplay - across newline')
{
  const lines = wrapForEditor('ab\ncd', 20)
  const pos = cursorToDisplay(4, lines)
  assertEq(pos.row, 1, 'second line')
  assertEq(pos.col, 1, 'col 1')
}

suite('cursorToDisplay - at soft wrap maps to next row')
{
  const lines = wrapForEditor('hello world', 8)
  const pos = cursorToDisplay(5, lines)
  assertEq(lines[0].hard, false, 'first line is soft')
  assertEq(pos.row, 1, 'wraps to next row')
  assertEq(pos.col, 0, 'col 0')
}

// =========================================================================
// DISPLAY TO CURSOR
// =========================================================================
suite('displayToCursor - simple')
{
  const lines = wrapForEditor('hello', 20)
  const c = displayToCursor(0, 3, lines)
  assertEq(c, 3, 'cursor at 3')
}

suite('displayToCursor - second line')
{
  const lines = wrapForEditor('ab\ncd', 20)
  const c = displayToCursor(1, 1, lines)
  assertEq(c, 4, 'cursor on second line')
}

suite('displayToCursor - clamps col')
{
  const lines = wrapForEditor('ab\ncd', 20)
  const c = displayToCursor(0, 10, lines)
  assertEq(c, 2, 'clamped to line end')
}

suite('displayToCursor - clamps row')
{
  const lines = wrapForEditor('hello', 20)
  const c = displayToCursor(5, 0, lines)
  assertEq(c, 0, 'clamped to last row start')
}

// =========================================================================
// CURSOR TO DISPLAY / DISPLAY TO CURSOR ROUNDTRIP
// =========================================================================
suite('cursor helpers - roundtrip')
{
  const text = 'hello world this wraps nicely'
  const lines = wrapForEditor(text, 10)
  const consumed = new Set()
  for (const line of lines) {
    if (!line.hard && line.end < text.length && text[line.end] === ' ') {
      consumed.add(line.end)
    }
  }
  for (let cursor = 0; cursor <= text.length; cursor++) {
    if (consumed.has(cursor)) continue
    const pos = cursorToDisplay(cursor, lines)
    const back = displayToCursor(pos.row, pos.col, lines)
    assertEq(back, cursor, `roundtrip cursor=${cursor}`)
  }
}

// =========================================================================
// SUMMARY
// =========================================================================
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
