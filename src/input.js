const SPECIAL_KEYS = {
  '\x1b[A': 'up',
  '\x1b[B': 'down',
  '\x1b[C': 'right',
  '\x1b[D': 'left',
  '\x1b[H': 'home',
  '\x1b[F': 'end',
  '\x1b[2~': 'insert',
  '\x1b[3~': 'delete',
  '\x1b[5~': 'pageup',
  '\x1b[6~': 'pagedown',
  '\x1bOP': 'f1',
  '\x1bOQ': 'f2',
  '\x1bOR': 'f3',
  '\x1bOS': 'f4',
  '\x1b[15~': 'f5',
  '\x1b[17~': 'f6',
  '\x1b[18~': 'f7',
  '\x1b[19~': 'f8',
  '\x1b[20~': 'f9',
  '\x1b[21~': 'f10',
  '\x1b[23~': 'f11',
  '\x1b[24~': 'f12',
  '\r': 'return',
  '\n': 'return',
  '\t': 'tab',
  '\x1b[Z': 'shift-tab',
  '\x7f': 'backspace',
  '\x1b': 'escape',
  ' ': 'space',
}

const MOUSE_RE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/

export function parseMouse(raw) {
  const m = MOUSE_RE.exec(raw)
  if (!m) return null
  const cb = parseInt(m[1], 10)
  const x = parseInt(m[2], 10) - 1
  const y = parseInt(m[3], 10) - 1
  const release = m[4] === 'm'
  const button = cb & 3
  const scroll = (cb & 64) !== 0
  const motion = (cb & 32) !== 0

  if (scroll) {
    return { type: 'mouse', action: 'scroll', direction: button === 0 ? 'up' : 'down', x, y }
  }

  const buttonName = button === 0 ? 'left' : button === 1 ? 'middle' : 'right'
  const action = release ? 'release' : motion ? 'drag' : 'press'
  return { type: 'mouse', action, button: buttonName, x, y }
}

export function parseKey(data) {
  const raw = typeof data === 'string' ? data : data.toString()

  if (SPECIAL_KEYS[raw]) {
    return { key: SPECIAL_KEYS[raw], ctrl: false, meta: false, shift: false, raw }
  }

  if (raw.length === 1) {
    const code = raw.charCodeAt(0)

    if (code >= 1 && code <= 26) {
      return {
        key: String.fromCharCode(code + 96),
        ctrl: true,
        meta: false,
        shift: false,
        raw,
      }
    }

    return { key: raw, ctrl: false, meta: false, shift: false, raw }
  }

  if (raw.startsWith('\x1b') && raw.length === 2) {
    return { key: raw[1], ctrl: false, meta: true, shift: false, raw }
  }

  return { key: raw, ctrl: false, meta: false, shift: false, raw }
}

export function splitKeys(data) {
  const raw = typeof data === 'string' ? data : data.toString()
  const keys = []
  let i = 0

  while (i < raw.length) {
    if (raw[i] === '\x1b') {
      if (i + 1 < raw.length && raw[i + 1] === '[') {
        let j = i + 2
        // sgr mouse: \x1b[<Cb;Cx;CyM or m
        if (j < raw.length && raw[j] === '<') {
          j++
          while (j < raw.length && ((raw[j] >= '0' && raw[j] <= '9') || raw[j] === ';')) j++
          if (j < raw.length) j++
          keys.push(raw.slice(i, j))
          i = j
          continue
        }
        while (j < raw.length && raw[j] >= '0' && raw[j] <= '9') j++
        if (j < raw.length && raw[j] === ';') {
          j++
          while (j < raw.length && raw[j] >= '0' && raw[j] <= '9') j++
        }
        if (j < raw.length) j++
        keys.push(raw.slice(i, j))
        i = j
      } else if (i + 1 < raw.length && raw[i + 1] === 'O') {
        const end = Math.min(i + 3, raw.length)
        keys.push(raw.slice(i, end))
        i = end
      } else if (i + 1 < raw.length) {
        keys.push(raw.slice(i, i + 2))
        i += 2
      } else {
        keys.push(raw[i])
        i++
      }
    } else {
      keys.push(raw[i])
      i++
    }
  }

  return keys
}

export function createInputHandler(stream) {
  const keyListeners = new Set()
  const mouseListeners = new Set()

  function dispatch(keyStr) {
    const mouse = parseMouse(keyStr)
    if (mouse) {
      mouse.stopPropagation = () => { mouse._stopped = true }
      const snapshot = [...mouseListeners].reverse()
      for (const fn of snapshot) {
        fn(mouse)
        if (mouse._stopped) break
      }
      return
    }

    const event = parseKey(keyStr)
    event.stopPropagation = () => { event._stopped = true }
    const snapshot = [...keyListeners].reverse()
    for (const fn of snapshot) {
      fn(event)
      if (event._stopped) break
    }
  }

  function isPaste(data) {
    const s = typeof data === 'string' ? data : data.toString()
    return s.length > 1 && !s.startsWith('\x1b') && (s.includes('\n') || s.includes('\r'))
  }

  function onData(data) {
    if (isPaste(data)) {
      const text = (typeof data === 'string' ? data : data.toString()).replace(/\r\n?/g, '\n')
      const event = { key: 'paste', text, ctrl: false, meta: false, shift: false, raw: text }
      event.stopPropagation = () => { event._stopped = true }
      const snapshot = [...keyListeners].reverse()
      for (const fn of snapshot) {
        fn(event)
        if (event._stopped) break
      }
      return
    }
    for (const key of splitKeys(data)) {
      dispatch(key)
    }
  }

  let attached = false

  function attach() {
    if (attached) return
    attached = true
    stream.on('data', onData)
  }

  function detach() {
    if (!attached) return
    attached = false
    stream.off('data', onData)
  }

  function onKey(fn) {
    keyListeners.add(fn)
    if (keyListeners.size + mouseListeners.size === 1) attach()
    return () => {
      keyListeners.delete(fn)
      if (keyListeners.size + mouseListeners.size === 0) detach()
    }
  }

  function onMouse(fn) {
    mouseListeners.add(fn)
    if (keyListeners.size + mouseListeners.size === 1) attach()
    return () => {
      mouseListeners.delete(fn)
      if (keyListeners.size + mouseListeners.size === 0) detach()
    }
  }

  return { onKey, onMouse, attach, detach }
}
