import { EventEmitter } from 'events'
import { parseKey, splitKeys, parseMouse, createInputHandler } from '../src/input.js'
import { mount, createSignal, useFocus, useHotkey, useAsync, useInterval, TextInput, TextArea } from '../index.js'
import { startHookTracking, endHookTracking } from '../src/renderer.js'
import { createScope, disposeScope } from '../src/signal.js'
import { jsx } from '../jsx-runtime.js'

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
// PARSE HELPERS
// =========================================================================
suite('parseKey - modified arrows and nav keys')
{
  let e = parseKey('\x1b[1;5C')
  assertEq(e.key, 'right', 'ctrl+right key')
  assert(e.ctrl && !e.meta && !e.shift, 'ctrl+right modifiers')

  e = parseKey('\x1b[1;2A')
  assertEq(e.key, 'up', 'shift+up key')
  assert(e.shift && !e.ctrl && !e.meta, 'shift+up modifiers')

  e = parseKey('\x1b[1;3D')
  assertEq(e.key, 'left', 'alt+left key')
  assert(e.meta && !e.ctrl, 'alt+left modifiers')

  assertEq(parseKey('\x1b[1~').key, 'home', 'legacy home')
  assertEq(parseKey('\x1b[4~').key, 'end', 'legacy end')

  e = parseKey('\x1b[3;5~')
  assertEq(e.key, 'delete', 'ctrl+delete key')
  assert(e.ctrl, 'ctrl+delete modifier')

  e = parseKey('\x1b[1;5H')
  assertEq(e.key, 'home', 'ctrl+home key')
  assert(e.ctrl, 'ctrl+home modifier')
}

suite('parseKey - double escape and alt-prefixed sequences')
{
  assertEq(parseKey('\x1b\x1b').key, 'escape', 'double esc parses as escape, not meta+esc')

  const e = parseKey('\x1b\x1b[A')
  assertEq(e.key, 'up', 'alt+up legacy encoding key')
  assert(e.meta, 'alt+up legacy encoding meta flag')
}

suite('parseKey - meta pairs normalize the inner key')
{
  let e = parseKey('\x1b\r')
  assertEq(e.key, 'return', 'meta+enter normalizes to return')
  assert(e.meta, 'meta+enter meta flag')

  e = parseKey('\x1b\x7f')
  assertEq(e.key, 'backspace', 'meta+backspace normalizes')
  assert(e.meta, 'meta+backspace meta flag')

  e = parseKey('\x1b\x01')
  assertEq(e.key, 'a', 'meta+ctrl+a normalizes to letter')
  assert(e.meta && e.ctrl, 'meta+ctrl+a flags')
}

suite('parseKey - astral chars are one key')
{
  const e = parseKey('\u{1f600}')
  assertEq(e.key, '\u{1f600}', 'emoji is a single key')
  assert(!e.ctrl && !e.meta, 'no modifiers')
}

suite('splitKeys - iterates code points')
{
  assertEq(splitKeys('\u{1f600}').length, 1, 'emoji is one token')
  assertEq(splitKeys('\u{1f600}')[0], '\u{1f600}', 'emoji token intact')

  const keys = splitKeys('a\u{1f600}b')
  assertEq(keys.length, 3, 'a + emoji + b')
  assertEq(keys[1], '\u{1f600}', 'middle token is the emoji')
}

suite('splitKeys - double esc is two escapes')
{
  const keys = splitKeys('\x1b\x1b')
  assertEq(keys.length, 2, 'two tokens')
  assertEq(keys[0], '\x1b', 'first escape')
  assertEq(keys[1], '\x1b', 'second escape')
}

suite('splitKeys - alt-prefixed csi stays whole')
{
  const keys = splitKeys('\x1b\x1b[A')
  assertEq(keys.length, 1, 'one token')
  assertEq(keys[0], '\x1b\x1b[A', 'alt+up preserved')
}

suite('parseMouse - extended buttons do not alias onto left/middle')
{
  let m = parseMouse('\x1b[<128;5;3M')
  assertEq(m.button, 'back', 'cb 128 is back button')
  assertEq(m.action, 'press', 'back button press')

  m = parseMouse('\x1b[<129;5;3M')
  assertEq(m.button, 'forward', 'cb 129 is forward button')

  m = parseMouse('\x1b[<0;5;3M')
  assertEq(m.button, 'left', 'cb 0 still left')

  m = parseMouse('\x1b[<64;5;3M')
  assertEq(m.direction, 'up', 'wheel up unaffected')
}

suite('parseMouse - buttonless motion is move')
{
  const m = parseMouse('\x1b[<35;5;3M')
  assertEq(m.action, 'move', 'buttonless motion is move')
  assertEq(m.x, 4, 'move x is zero-based')
  assertEq(m.y, 2, 'move y is zero-based')
  assert(!('button' in m), 'move has no button')

  const drag = parseMouse('\x1b[<32;5;3M')
  assertEq(drag.action, 'drag', 'button motion remains drag')
  assertEq(drag.button, 'left', 'drag preserves button')
}

// =========================================================================
// INPUT HANDLER - cross-chunk buffering, paste, esc timer
// =========================================================================
class RawStream extends EventEmitter {}

function makeHandler() {
  const stream = new RawStream()
  let timers = []
  const handler = createInputHandler(stream, {
    escDelay: 5,
    setTimer: (fn) => {
      const id = { fn }
      timers.push(id)
      return id
    },
    clearTimer: (id) => {
      timers = timers.filter(t => t !== id)
    },
  })
  const keys = []
  const mice = []
  handler.onKey(e => keys.push(e))
  handler.onMouse(e => mice.push(e))
  return {
    stream,
    handler,
    keys,
    mice,
    send: (s) => stream.emit('data', Buffer.from(s, 'utf8')),
    fireTimers: () => {
      const t = timers
      timers = []
      for (const id of t) id.fn()
    },
    timerCount: () => timers.length,
  }
}

suite('handler - escape sequence split across chunks')
{
  const h = makeHandler()
  h.send('\x1b[')
  assertEq(h.keys.length, 0, 'incomplete csi dispatches nothing')
  h.send('A')
  assertEq(h.keys.length, 1, 'one event after completion')
  assertEq(h.keys[0].key, 'up', 'reassembled as up arrow')
}

suite('handler - sgr mouse split across chunks')
{
  const h = makeHandler()
  h.send('\x1b[<0;5;')
  h.send('3M')
  assertEq(h.mice.length, 1, 'one mouse event')
  assertEq(h.mice[0].action, 'press', 'mouse press')
  assertEq(h.mice[0].button, 'left', 'left button')
  assertEq(h.keys.length, 0, 'no literal key events leaked')
}

suite('handler - buttonless mouse motion')
{
  const h = makeHandler()
  h.send('\x1b[<35;9;4M')
  assertEq(h.mice.length, 1, 'one move event')
  assertEq(h.mice[0].action, 'move', 'handler dispatches move')
  assertEq(h.mice[0].x, 8, 'move x dispatched')
  assertEq(h.mice[0].y, 3, 'move y dispatched')
  assertEq(h.keys.length, 0, 'no literal key events leaked')
}

suite('handler - lone esc flushes as escape after timer')
{
  const h = makeHandler()
  h.send('\x1b')
  assertEq(h.keys.length, 0, 'esc held back initially')
  assert(h.timerCount() > 0, 'flush timer armed')
  h.fireTimers()
  assertEq(h.keys.length, 1, 'escape dispatched on flush')
  assertEq(h.keys[0].key, 'escape', 'key is escape')
}

suite('handler - double esc flushes as two escape events')
{
  const h = makeHandler()
  h.send('\x1b\x1b')
  h.fireTimers()
  assertEq(h.keys.length, 2, 'two events')
  assertEq(h.keys[0].key, 'escape', 'first escape')
  assertEq(h.keys[1].key, 'escape', 'second escape')
}

suite('handler - esc then arrow in later chunk is not meta garbage')
{
  const h = makeHandler()
  h.send('\x1b')
  h.send('[B')
  assertEq(h.keys.length, 1, 'one event')
  assertEq(h.keys[0].key, 'down', 'down arrow')
}

suite('handler - alt+arrow legacy encoding in one chunk')
{
  const h = makeHandler()
  h.send('\x1b\x1b[A')
  assertEq(h.keys.length, 1, 'one event')
  assertEq(h.keys[0].key, 'up', 'up')
  assert(h.keys[0].meta, 'meta flag set')
}

suite('handler - coalesced fast typing is not a paste')
{
  const h = makeHandler()
  h.send('a\r')
  assertEq(h.keys.length, 2, 'two key events')
  assertEq(h.keys[0].key, 'a', 'a typed')
  assertEq(h.keys[1].key, 'return', 'return dispatched, submit not lost')
}

suite('handler - bracketed paste in one chunk')
{
  const h = makeHandler()
  h.send('\x1b[200~hello world\x1b[201~')
  assertEq(h.keys.length, 1, 'single paste event')
  assertEq(h.keys[0].key, 'paste', 'paste key')
  assertEq(h.keys[0].text, 'hello world', 'paste text')
}

suite('handler - bracketed paste across chunks')
{
  const h = makeHandler()
  h.send('\x1b[200~hel')
  assertEq(h.keys.length, 0, 'nothing until terminator')
  h.send('lo\x1b[201~')
  assertEq(h.keys.length, 1, 'single paste event')
  assertEq(h.keys[0].text, 'hello', 'paste text reassembled')
}

suite('handler - paste terminator split across chunks')
{
  const h = makeHandler()
  h.send('\x1b[200~x\x1b[20')
  assertEq(h.keys.length, 0, 'partial terminator buffered')
  h.send('1~')
  assertEq(h.keys.length, 1, 'single paste event')
  assertEq(h.keys[0].text, 'x', 'terminator prefix not leaked into text')
}

suite('handler - pasted text does not dispatch per-key events')
{
  const h = makeHandler()
  h.send('\x1b[200~qqq\nquit\x1b[201~')
  assertEq(h.keys.length, 1, 'only the paste event')
  assertEq(h.keys[0].key, 'paste', 'no q keypresses that could fire hotkeys')
  assertEq(h.keys[0].text, 'qqq\nquit', 'text intact with newline')
}

suite('handler - paste normalizes crlf')
{
  const h = makeHandler()
  h.send('\x1b[200~a\r\nb\rc\x1b[201~')
  assertEq(h.keys[0].text, 'a\nb\nc', 'crlf and cr become lf')
}

suite('handler - detach clears buffered state and timer')
{
  const h = makeHandler()
  h.send('\x1b')
  assert(h.timerCount() > 0, 'timer armed')
  h.handler.detach()
  assertEq(h.timerCount(), 0, 'timer cleared on detach')
  h.fireTimers()
  assertEq(h.keys.length, 0, 'no events after detach')
}

// =========================================================================
// MOUNT-BASED COMPONENT TESTS
// =========================================================================
class FakeStream extends EventEmitter {
  constructor(cols, rows) {
    super()
    this.columns = cols
    this.rows = rows
    this.isTTY = false
    this.output = ''
  }
  write(data) {
    this.output += data
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
  send(str) {
    this.emit('data', Buffer.from(str, 'utf8'))
  }
}

async function tick(ms = 50) {
  await new Promise(r => setTimeout(r, ms))
}

suite('TextInput - paste inserts text with newlines joined')
{
  const out = new FakeStream(40, 5)
  const inp = new FakeInput()
  let captured = ''

  function App() {
    return jsx(TextInput, { focused: true, onChange: v => { captured = v } })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()
  inp.send('\x1b[200~hello\nworld\x1b[201~')
  await tick()
  assertEq(captured, 'hello world', 'pasted with newline joined to space')
  unmount()
}

suite('TextInput - surrogate-safe backspace')
{
  const out = new FakeStream(40, 5)
  const inp = new FakeInput()
  let captured = null

  function App() {
    return jsx(TextInput, { focused: true, initialValue: 'a\u{1f600}', onChange: v => { captured = v } })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()
  inp.send('\x7f')
  await tick()
  assertEq(captured, 'a', 'backspace removes the whole emoji, no lone surrogate')
  unmount()
}

suite('TextInput - arrows move by code point')
{
  const out = new FakeStream(40, 5)
  const inp = new FakeInput()
  let captured = null

  function App() {
    return jsx(TextInput, { focused: true, initialValue: 'a\u{1f600}', onChange: v => { captured = v } })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()
  inp.send('\x1b[D')
  await tick()
  inp.send('x')
  await tick()
  assertEq(captured, 'ax\u{1f600}', 'left steps over the full emoji, insert lands before it')
  unmount()
}

suite('TextInput - ctrl shortcuts match normalized keys (csi-u)')
{
  const out = new FakeStream(40, 5)
  const inp = new FakeInput()
  let captured = null

  function App() {
    return jsx(TextInput, { focused: true, initialValue: 'abc', onChange: v => { captured = v } })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()
  // ctrl+a via csi-u moves to start, then type z
  inp.send('\x1b[97;5u')
  await tick()
  inp.send('z')
  await tick()
  assertEq(captured, 'zabc', 'csi-u ctrl+a treated as home')

  // legacy raw ctrl+e still works too
  inp.send('\x05')
  await tick()
  inp.send('!')
  await tick()
  assertEq(captured, 'zabc!', 'raw ctrl+e treated as end')
  unmount()
}

suite('TextArea - meta+enter submit matches normalized return')
{
  const out = new FakeStream(40, 8)
  const inp = new FakeInput()
  let submitted = null

  function App() {
    return jsx(TextArea, { focused: true, onSubmit: v => { submitted = v } })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()
  inp.send('hi')
  await tick()
  inp.send('\x1b\r')
  await tick()
  assertEq(submitted, 'hi', 'legacy alt+enter submits')

  inp.send('again')
  await tick()
  inp.send('\x1b[13;3u')
  await tick()
  assertEq(submitted, 'again', 'csi-u alt+enter submits too')
  unmount()
}

suite('TextArea - surrogate-safe delete and arrows')
{
  const out = new FakeStream(40, 8)
  const inp = new FakeInput()
  let captured = null

  function App() {
    return jsx(TextArea, { focused: true, onChange: v => { captured = v } })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()
  inp.send('\u{1f600}b')
  await tick()
  inp.send('\x1b[D')
  inp.send('\x1b[D')
  await tick()
  inp.send('\x1b[3~')
  await tick()
  assertEq(captured, 'b', 'delete removes the whole emoji after moving left by code point')
  unmount()
}

suite('useFocus - unmounted items leave the tab order')
{
  const out = new FakeStream(40, 5)
  const inp = new FakeInput()
  const [showB, setShowB] = createSignal(true)
  let fm

  function App() {
    fm = useFocus({ initial: 'a' })
    fm.item('a')
    if (showB()) fm.item('b')
    fm.item('c')
    return jsx('text', { children: `focus:${fm.current()}` })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()
  assertEq(fm.current(), 'a', 'initial focus')

  inp.send('\t')
  await tick()
  assertEq(fm.current(), 'b', 'tab reaches b while mounted')

  setShowB(false)
  await tick()

  inp.send('\t')
  await tick()
  assertEq(fm.current(), 'a', 'focus recovers to a registered item after b unmounts')

  inp.send('\t')
  await tick()
  assertEq(fm.current(), 'c', 'b is gone from the cycle')

  inp.send('\t')
  await tick()
  assertEq(fm.current(), 'a', 'cycle wraps a -> c -> a')
  unmount()
}

suite('useFocus - dynamic group items are re-registered')
{
  const out = new FakeStream(40, 5)
  const inp = new FakeInput()
  const [items, setItems] = createSignal(['g1', 'g2', 'g3'])
  let fm

  function App() {
    fm = useFocus({ initial: 'g1' })
    fm.group('grp', { items: items(), navigate: 'jk' })
    return jsx('text', { children: `focus:${fm.current()}` })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()
  inp.send('j')
  await tick()
  inp.send('j')
  await tick()
  assertEq(fm.current(), 'g3', 'navigated to last group item')

  setItems(['g1'])
  await tick()
  inp.send('j')
  await tick()
  assert(fm.current() !== undefined, 'focus never becomes undefined after shrink')
  assertEq(fm.current(), 'g1', 'subIdx clamped to the shrunk list')
  unmount()
}

suite('useFocus - bogus initial falls back instead of killing tab')
{
  const out = new FakeStream(40, 5)
  const inp = new FakeInput()
  let fm

  function App() {
    fm = useFocus({ initial: 'nonexistent' })
    fm.item('a')
    fm.item('b')
    return jsx('text', { children: `focus:${fm.current()}` })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()
  // depending on frame timing, either the per-frame validation has already
  // replaced the bogus name or the first tab falls back - both must recover
  inp.send('\t')
  await tick()
  const c1 = fm.current()
  assert(c1 === 'a' || c1 === 'b', `tab lands on a registered item (got ${c1})`)
  inp.send('\t')
  await tick()
  const c2 = fm.current()
  assert((c2 === 'a' || c2 === 'b') && c2 !== c1, `tab keeps cycling (got ${c2})`)
  unmount()
}

suite('useFocus - sibling managers do not both cycle on one tab')
{
  const out = new FakeStream(40, 5)
  const inp = new FakeInput()
  let fm1, fm2

  function PanelOne() {
    fm1 = useFocus({ initial: 'p1a' })
    fm1.item('p1a')
    fm1.item('p1b')
    return jsx('text', { children: 'one' })
  }

  function PanelTwo() {
    fm2 = useFocus({ initial: 'p2a' })
    fm2.item('p2a')
    fm2.item('p2b')
    return jsx('text', { children: 'two' })
  }

  function App() {
    return jsx('box', { style: { flexDirection: 'column' }, children: [jsx(PanelOne, {}), jsx(PanelTwo, {})] })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()
  inp.send('\t')
  await tick()
  const moved = (fm1.current() !== 'p1a' ? 1 : 0) + (fm2.current() !== 'p2a' ? 1 : 0)
  assertEq(moved, 1, 'exactly one manager handled the tab')
  unmount()
}

suite('useHotkey - shift handling and special chars')
{
  const out = new FakeStream(40, 5)
  const inp = new FakeInput()
  const fired = []

  function App() {
    useHotkey('Q', () => fired.push('Q'))
    useHotkey('ctrl+g', () => fired.push('ctrl+g'))
    useHotkey('+', () => fired.push('plus'))
    return jsx('text', { children: 'hotkeys' })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()

  inp.send('Q')
  await tick()
  assertEq(fired.join(','), 'Q', 'uppercase Q binding fires on Q')

  inp.send('q')
  await tick()
  assertEq(fired.join(','), 'Q', 'lowercase q does not fire the Q binding')

  inp.send('\x07')
  await tick()
  assertEq(fired.join(','), 'Q,ctrl+g', 'ctrl+g fires')

  inp.send('\x1b[103;6u')
  await tick()
  assertEq(fired.join(','), 'Q,ctrl+g', 'ctrl+shift+g does not fire the ctrl+g binding')

  inp.send('+')
  await tick()
  assertEq(fired.join(','), 'Q,ctrl+g,plus', 'bare + is bindable')
  unmount()
}

suite('useHotkey - descriptor changes are picked up')
{
  const out = new FakeStream(40, 5)
  const inp = new FakeInput()
  const [desc, setDesc] = createSignal('x')
  const fired = []

  function App() {
    useHotkey(desc(), () => fired.push(desc()))
    return jsx('text', { children: `hk:${desc()}` })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()

  inp.send('x')
  await tick()
  assertEq(fired.length, 1, 'initial descriptor fires')

  setDesc('y')
  await tick()
  inp.send('x')
  await tick()
  assertEq(fired.length, 1, 'old descriptor no longer fires')

  inp.send('y')
  await tick()
  assertEq(fired.length, 2, 'new descriptor fires')
  unmount()
}

suite('useHotkey - paste does not trigger hotkeys')
{
  const out = new FakeStream(40, 5)
  const inp = new FakeInput()
  const fired = []

  function App() {
    useHotkey('q', () => fired.push('q'))
    return jsx('text', { children: 'hk' })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp })
  await tick()
  inp.send('\x1b[200~quit\x1b[201~')
  await tick()
  assertEq(fired.length, 0, 'pasted q does not quit')
  unmount()
}

// =========================================================================
// HOOK STATE - useAsync fresh fn, useInterval ms change
// =========================================================================
suite('useAsync - run uses the latest fn, not the first-render closure')
{
  const owner = { hooks: [] }

  startHookTracking(owner)
  const first = useAsync(async () => 'first')
  endHookTracking()

  startHookTracking(owner)
  const second = useAsync(async () => 'second')
  endHookTracking()

  assert(first === second, 'same hook state across renders')

  second.run()
  await new Promise(r => setTimeout(r, 10))
  assertEq(second.status(), 'success', 'run resolved')
  assertEq(second.data(), 'second', 'latest fn was invoked')
}

suite('useInterval - restarts when ms changes')
{
  const owner = { hooks: [] }
  let count = 0
  const fn = () => count++

  const scope = createScope(() => {
    startHookTracking(owner)
    useInterval(fn, 100000)
    endHookTracking()
  })

  startHookTracking(owner)
  useInterval(fn, 5)
  endHookTracking()

  await new Promise(r => setTimeout(r, 40))
  disposeScope(scope)
  assert(count >= 1, `interval fired after ms change (count=${count})`)

  const after = count
  await new Promise(r => setTimeout(r, 20))
  assertEq(count, after, 'disposed interval stops firing')
}

// =========================================================================
// SUMMARY
// =========================================================================
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
