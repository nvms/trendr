import { EventEmitter } from 'events'
import { mount, createSignal, useInput, useResize } from '../index.js'
import { jsx, jsxs } from '../jsx-runtime.js'

let passed = 0
let failed = 0

function assert(cond, msg) {
  if (cond) passed++
  else { failed++; console.log(`  FAIL: ${msg}`) }
}

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
  sendKey(str) {
    this.emit('data', Buffer.from(str))
  }
}

console.log('MOUNT: basic counter')
{
  const out = new FakeStream(40, 10)
  const inp = new FakeInput()

  function Counter() {
    const [count, setCount] = createSignal(0)

    useInput(({ key }) => {
      if (key === 'up') setCount(c => c + 1)
      if (key === 'down') setCount(c => c - 1)
    })

    return jsxs('box', {
      style: { flexDirection: 'column', padding: 1 },
      children: [
        jsxs('text', { style: { color: 'cyan' }, children: ['Count: ', count()] }),
        jsx('text', { children: 'press up/down' }),
      ],
    })
  }

  const { unmount } = mount(Counter, { stream: out, stdin: inp })

  const strip = s => s.replace(/\x1b\[[?]?[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\[[0-9;]*m/g, '')
  const plain = strip(out.output)
  assert(plain.includes('Count: 0'), 'initial render contains Count: 0')
  assert(plain.includes('press'), 'initial render contains instructions')

  // simulate up arrow
  out.output = ''
  inp.sendKey('\x1b[A')

  // need to wait for scheduler
  await new Promise(r => setTimeout(r, 50))

  assert(out.output.includes('1'), 'after up arrow, output contains 1')

  out.output = ''
  inp.sendKey('\x1b[A')
  await new Promise(r => setTimeout(r, 50))

  assert(out.output.includes('2'), 'after second up arrow, output contains 2')

  out.output = ''
  inp.sendKey('\x1b[B')
  await new Promise(r => setTimeout(r, 50))

  assert(out.output.includes('1'), 'after down arrow, output contains 1')

  unmount()

  assert(out.output.includes('\x1b[?1049l'), 'unmount exits alt screen')
  assert(out.output.includes('\x1b[?25h'), 'unmount shows cursor')
}

console.log('MOUNT: concurrent mounts')
{
  const outA = new FakeStream(30, 8)
  const outB = new FakeStream(30, 8)
  const inpA = new FakeInput()
  const inpB = new FakeInput()
  let setA
  let setB

  function AppA() {
    const [value, setValue] = createSignal(0)
    setA = setValue
    useInput(({ key }) => {
      if (key === 'up') setValue(v => v + 1)
    })
    return jsx('text', { children: `A:${value()}` })
  }

  function AppB() {
    const [value, setValue] = createSignal(0)
    setB = setValue
    useInput(({ key }) => {
      if (key === 'down') setValue(v => v + 1)
    })
    return jsx('text', { children: `B:${value()}` })
  }

  const mountA = mount(AppA, { stream: outA, stdin: inpA })
  const mountB = mount(AppB, { stream: outB, stdin: inpB })
  outA.output = ''
  outB.output = ''

  inpA.sendKey('\x1b[A')
  await new Promise(r => setTimeout(r, 30))
  assert(outA.output.includes('1'), 'first mount renders its own input update after second mount starts')
  assert(outB.output === '', 'first mount input does not render to second mount')

  outA.output = ''
  inpB.sendKey('\x1b[B')
  await new Promise(r => setTimeout(r, 30))
  assert(outB.output.includes('1'), 'second mount renders its own input update')
  assert(outA.output === '', 'second mount input does not render to first mount')

  outA.output = ''
  outB.output = ''
  setA(2)
  setB(2)
  await new Promise(r => setTimeout(r, 30))
  assert(outA.output.includes('2'), 'first mount schedules direct signal updates independently')
  assert(outB.output.includes('2'), 'second mount schedules direct signal updates independently')

  outA.output = ''
  outB.output = ''
  mountB.unmount()
  outB.output = ''
  setA(3)
  await new Promise(r => setTimeout(r, 30))
  assert(outA.output.includes('3'), 'unmounting second mount leaves first scheduler active')
  assert(outB.output === '', 'unmounted second mount receives no rendering')

  outA.output = ''
  outA.columns = 34
  outA.rows = 9
  outA.emit('resize')
  assert(outA.output.includes('\x1b[2J'), 'first mount still handles resize independently')

  mountA.unmount()
}

console.log('MOUNT: shared signal across concurrent mounts')
{
  const outA = new FakeStream(30, 8)
  const outB = new FakeStream(30, 8)
  const inpA = new FakeInput()
  const inpB = new FakeInput()
  const [value, setValue] = createSignal(0)

  function Shared() {
    return jsx('text', { children: `shared:${value()}` })
  }

  const mountA = mount(Shared, { stream: outA, stdin: inpA })
  const mountB = mount(Shared, { stream: outB, stdin: inpB })
  outA.output = ''
  outB.output = ''
  setValue(1)
  await new Promise(r => setTimeout(r, 30))
  assert(outA.output.includes('1'), 'shared signal schedules first subscriber mount')
  assert(outB.output.includes('1'), 'shared signal schedules second subscriber mount')

  mountA.unmount()
  outA.output = ''
  outB.output = ''
  setValue(2)
  await new Promise(r => setTimeout(r, 30))
  assert(outA.output === '', 'shared signal drops an unmounted subscriber')
  assert(outB.output.includes('2'), 'shared signal keeps remaining subscriber')
  mountB.unmount()
}

console.log('MOUNT: max size')
{
  const out = new FakeStream(300, 40)
  const inp = new FakeInput()
  const sizes = []

  function App() {
    useResize(size => sizes.push(size))
    return jsx('text', { children: 'capped' })
  }

  const mounted = mount(App, {
    stream: out,
    stdin: inp,
    maxSize: { columns: 240, rows: 80 },
  })

  assert(mounted.getBuffer().width === 240, 'maxSize caps columns independently')
  assert(mounted.getBuffer().height === 40, 'maxSize leaves smaller row count unchanged')

  out.columns = 120
  out.rows = 100
  out.emit('resize')
  assert(mounted.getBuffer().width === 120, 'resize leaves columns below maxSize unchanged')
  assert(mounted.getBuffer().height === 80, 'resize caps rows at maxSize')
  assert(sizes.at(-1).width === 120 && sizes.at(-1).height === 80, 'useResize receives the capped viewport')

  out.columns = 10000
  out.rows = 10000
  out.emit('resize')
  assert(mounted.getBuffer().width === 240 && mounted.getBuffer().height === 80, 'absurd resize remains capped')
  mounted.unmount()
}

console.log('MOUNT: max size validation')
{
  const out = new FakeStream(30, 8)
  const inp = new FakeInput()
  const App = () => jsx('text', { children: 'validation' })
  let invalidObject = false
  let invalidDimension = false

  try { mount(App, { stream: out, stdin: inp, maxSize: 80 }) } catch (error) { invalidObject = error instanceof TypeError }
  try { mount(App, { stream: out, stdin: inp, maxSize: { columns: 0 } }) } catch (error) { invalidDimension = error instanceof RangeError }
  assert(invalidObject, 'maxSize rejects non-object values')
  assert(invalidDimension, 'maxSize rejects invalid dimensions')
}

console.log('MOUNT: main screen mode')
{
  const out = new FakeStream(30, 8)
  const inp = new FakeInput()

  function App() {
    return jsx('text', { children: 'inline mode' })
  }

  const { unmount } = mount(App, { stream: out, stdin: inp, altScreen: false })
  const strip = s => s.replace(/\x1b\[[?]?[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\[[0-9;]*m/g, '')

  assert(!out.output.includes('\x1b[?1049h'), 'mount does not enter alt screen in main screen mode')
  assert(strip(out.output).includes('inlinemode'), 'main screen mode still renders content')

  out.output = ''
  unmount()

  assert(!out.output.includes('\x1b[?1049l'), 'unmount does not exit alt screen in main screen mode')
  assert(out.output.includes('\x1b[8;1H\n'), 'unmount moves cursor below the ui in main screen mode')
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
