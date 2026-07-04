const SPECIAL_KEYS = {
  '\x1b[A': 'up',
  '\x1b[B': 'down',
  '\x1b[C': 'right',
  '\x1b[D': 'left',
  '\x1b[H': 'home',
  '\x1b[F': 'end',
  '\x1b[1~': 'home',
  '\x1b[2~': 'insert',
  '\x1b[3~': 'delete',
  '\x1b[4~': 'end',
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
  const extended = (cb & 128) !== 0
  const scroll = !extended && (cb & 64) !== 0
  const motion = (cb & 32) !== 0

  if (scroll) {
    // wheel codes: 0 up, 1 down, 2 left, 3 right (trackpads emit left/right
    // during a vertical scroll - don't fold those into 'down')
    const direction = button === 0 ? 'up' : button === 1 ? 'down' : button === 2 ? 'left' : 'right'
    return { type: 'mouse', action: 'scroll', direction, x, y }
  }

  const buttonName = extended
    ? (button === 0 ? 'back' : button === 1 ? 'forward' : button === 2 ? 'button10' : 'button11')
    : (button === 0 ? 'left' : button === 1 ? 'middle' : 'right')
  const action = release ? 'release' : motion ? 'drag' : 'press'
  return { type: 'mouse', action, button: buttonName, x, y }
}

const MODIFY_OTHER_RE = /^\x1b\[27;(\d+);(\d+)~$/
const CSI_U_RE = /^\x1b\[(\d+)(?:;(\d+))?u$/
const CSI_MOD_LETTER_RE = /^\x1b\[1;(\d+)([ABCDHF])$/
const CSI_MOD_TILDE_RE = /^\x1b\[(\d+);(\d+)~$/

const CSI_LETTER_KEYS = { A: 'up', B: 'down', C: 'right', D: 'left', H: 'home', F: 'end' }
const CSI_TILDE_KEYS = {
  1: 'home', 2: 'insert', 3: 'delete', 4: 'end', 5: 'pageup', 6: 'pagedown',
  15: 'f5', 17: 'f6', 18: 'f7', 19: 'f8', 20: 'f9', 21: 'f10', 23: 'f11', 24: 'f12',
}

function codeToKey(code) {
  if (code === 13 || code === 10) return 'return'
  if (code === 9) return 'tab'
  if (code === 27) return 'escape'
  if (code === 32) return 'space'
  if (code === 127 || code === 8) return 'backspace'
  return String.fromCodePoint(code)
}

// modifier param is 1-based with a bitmask in the low bits: shift=1, alt=2,
// ctrl=4 (so plain=1, shift=2, ctrl=5, etc)
function withMods(key, mod, raw) {
  const bits = Math.max(0, mod - 1)
  return {
    key,
    ctrl: (bits & 4) !== 0,
    meta: (bits & 2) !== 0,
    shift: (bits & 1) !== 0,
    raw,
  }
}

function isSingleCodePoint(s) {
  if (s.length === 1) return true
  return s.length === 2 && s.codePointAt(0) > 0xffff
}

export function parseKey(data) {
  const raw = typeof data === 'string' ? data : data.toString()

  if (SPECIAL_KEYS[raw]) {
    return { key: SPECIAL_KEYS[raw], ctrl: false, meta: false, shift: false, raw }
  }

  if (raw === '\x1b\x1b') {
    return { key: 'escape', ctrl: false, meta: false, shift: false, raw }
  }

  if (raw.length > 2 && raw.startsWith('\x1b\x1b')) {
    const inner = parseKey(raw.slice(1))
    return { key: inner.key, ctrl: inner.ctrl, meta: true, shift: inner.shift, raw }
  }

  let m = MODIFY_OTHER_RE.exec(raw)
  if (m) return withMods(codeToKey(parseInt(m[2], 10)), parseInt(m[1], 10), raw)

  m = CSI_U_RE.exec(raw)
  if (m) return withMods(codeToKey(parseInt(m[1], 10)), m[2] ? parseInt(m[2], 10) : 1, raw)

  m = CSI_MOD_LETTER_RE.exec(raw)
  if (m) return withMods(CSI_LETTER_KEYS[m[2]], parseInt(m[1], 10), raw)

  m = CSI_MOD_TILDE_RE.exec(raw)
  if (m && CSI_TILDE_KEYS[m[1]]) return withMods(CSI_TILDE_KEYS[m[1]], parseInt(m[2], 10), raw)

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

  if (isSingleCodePoint(raw)) {
    return { key: raw, ctrl: false, meta: false, shift: false, raw }
  }

  if (raw[0] === '\x1b' && isSingleCodePoint(raw.slice(1))) {
    const inner = parseKey(raw.slice(1))
    return { key: inner.key, ctrl: inner.ctrl, meta: true, shift: inner.shift, raw }
  }

  return { key: raw, ctrl: false, meta: false, shift: false, raw }
}

// reads one token off the head of s. returns null when the head is an
// incomplete escape sequence (or a split surrogate pair) that needs more bytes
function nextToken(s) {
  if (s[0] !== '\x1b') {
    const c0 = s.charCodeAt(0)
    if (c0 >= 0xd800 && c0 <= 0xdbff && s.length === 1) return null
    const cp = s.codePointAt(0)
    return s.slice(0, cp > 0xffff ? 2 : 1)
  }

  if (s.length === 1) return null

  let i = 1
  if (s[1] === '\x1b') {
    // could be double-esc (two escape events) or an alt-prefixed sequence
    // like \x1b\x1b[A - wait for a third byte to disambiguate
    if (s.length === 2) return null
    if (s[2] === '[' || s[2] === 'O') i = 2
    else return '\x1b'
  }

  const c = s[i]

  if (c === '[') {
    let j = i + 1
    if (j < s.length && (s[j] === '<' || s[j] === '?')) j++
    while (j < s.length && ((s[j] >= '0' && s[j] <= '9') || s[j] === ';' || s[j] === ':')) j++
    if (j >= s.length) return null
    return s.slice(0, j + 1)
  }

  if (c === 'O') {
    if (i + 1 >= s.length) return null
    return s.slice(0, i + 2)
  }

  const cc = s.charCodeAt(i)
  if (cc >= 0xd800 && cc <= 0xdbff && i + 1 >= s.length) return null
  const cp = s.codePointAt(i)
  return s.slice(0, i + (cp > 0xffff ? 2 : 1))
}

export function splitKeys(data) {
  const raw = typeof data === 'string' ? data : data.toString()
  const keys = []
  let s = raw

  while (s.length > 0) {
    const token = nextToken(s)
    if (token !== null) {
      keys.push(token)
      s = s.slice(token.length)
      continue
    }
    // incomplete tail - split leading escapes apart, keep the rest whole
    if (s === '\x1b') {
      keys.push(s)
      break
    }
    if (s.startsWith('\x1b\x1b')) {
      keys.push('\x1b')
      s = s.slice(1)
      continue
    }
    keys.push(s)
    break
  }

  return keys
}

const PASTE_START = '\x1b[200~'
const PASTE_END = '\x1b[201~'

// longest suffix of s that is a proper prefix of marker
function partialSuffixLen(s, marker) {
  const max = Math.min(marker.length - 1, s.length)
  for (let len = max; len > 0; len--) {
    if (s.endsWith(marker.slice(0, len))) return len
  }
  return 0
}

export function createInputHandler(stream, options = {}) {
  const {
    escDelay = 25,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (id) => clearTimeout(id),
    isEligible = () => true,
  } = options

  const keyListeners = new Map()
  const mouseListeners = new Map()

  let pending = ''
  let inPaste = false
  let pasteData = ''
  let escTimer = null

  function fire(event, listeners) {
    event.stopPropagation = () => { event._stopped = true }
    const snapshot = [...listeners].reverse()
    for (const [fn, owner] of snapshot) {
      if (!isEligible(owner)) continue
      fn(event)
      if (event._stopped) break
    }
  }

  function dispatch(keyStr) {
    const mouse = parseMouse(keyStr)
    if (mouse) {
      fire(mouse, mouseListeners)
      return
    }
    fire(parseKey(keyStr), keyListeners)
  }

  function dispatchPaste(text) {
    const normalized = text.replace(/\r\n?/g, '\n')
    fire({ key: 'paste', text: normalized, ctrl: false, meta: false, shift: false, raw: normalized }, keyListeners)
  }

  function processPending() {
    while (pending.length > 0) {
      if (inPaste) {
        const idx = pending.indexOf(PASTE_END)
        if (idx === -1) {
          const keep = partialSuffixLen(pending, PASTE_END)
          pasteData += pending.slice(0, pending.length - keep)
          pending = pending.slice(pending.length - keep)
          return
        }
        pasteData += pending.slice(0, idx)
        pending = pending.slice(idx + PASTE_END.length)
        inPaste = false
        const text = pasteData
        pasteData = ''
        dispatchPaste(text)
        continue
      }

      const token = nextToken(pending)
      if (token === null) return
      pending = pending.slice(token.length)
      if (token === PASTE_START) {
        inPaste = true
        continue
      }
      if (token === PASTE_END) continue
      dispatch(token)
    }
  }

  function clearEscTimer() {
    if (escTimer !== null) {
      clearTimer(escTimer)
      escTimer = null
    }
  }

  function flushPending() {
    escTimer = null
    if (pending.length === 0 || inPaste) return
    const flush = pending
    pending = ''
    for (const key of splitKeys(flush)) dispatch(key)
  }

  function onData(data) {
    clearEscTimer()
    pending += typeof data === 'string' ? data : data.toString('utf8')
    processPending()
    if (pending.length > 0 && !inPaste) {
      escTimer = setTimer(flushPending, escDelay)
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
    clearEscTimer()
    pending = ''
    inPaste = false
    pasteData = ''
  }

  function onKey(fn, owner = null) {
    keyListeners.set(fn, owner)
    if (keyListeners.size + mouseListeners.size === 1) attach()
    return () => {
      keyListeners.delete(fn)
      if (keyListeners.size + mouseListeners.size === 0) detach()
    }
  }

  function onMouse(fn, owner = null) {
    mouseListeners.set(fn, owner)
    if (keyListeners.size + mouseListeners.size === 1) attach()
    return () => {
      mouseListeners.delete(fn)
      if (keyListeners.size + mouseListeners.size === 0) detach()
    }
  }

  return { onKey, onMouse, attach, detach }
}
