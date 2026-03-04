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
  const listeners = new Set()

  function dispatch(keyStr) {
    const event = parseKey(keyStr)
    event.stopPropagation = () => { event._stopped = true }
    const snapshot = [...listeners].reverse()
    for (const fn of snapshot) {
      fn(event)
      if (event._stopped) break
    }
  }

  function onData(data) {
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
    listeners.add(fn)
    if (listeners.size === 1) attach()
    return () => {
      listeners.delete(fn)
      if (listeners.size === 0) detach()
    }
  }

  return { onKey, attach, detach }
}
