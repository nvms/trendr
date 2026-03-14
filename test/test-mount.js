import { EventEmitter } from 'events'
import { mount, createSignal, useInput } from '../index.js'
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
