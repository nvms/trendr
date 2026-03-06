import { BOLD, DIM, ITALIC, UNDERLINE, INVERSE, STRIKETHROUGH } from './ansi.js'

const NAMED_COLORS = {
  black: 0, red: 1, green: 2, yellow: 3,
  blue: 4, magenta: 5, cyan: 6, white: 7,
  gray: 8, grey: 8,
  brightRed: 9, brightGreen: 10, brightYellow: 11,
  brightBlue: 12, brightMagenta: 13, brightCyan: 14, brightWhite: 15,
}

const ATTR_MASKS = [BOLD, DIM, ITALIC, UNDERLINE, INVERSE, STRIKETHROUGH]
const ATTR_SGRCODES = [49, 50, 51, 52, 55, 57] // '1','2','3','4','7','9' as ascii

const bufA = Buffer.allocUnsafe(2 * 1024 * 1024)
const bufB = Buffer.allocUnsafe(2 * 1024 * 1024)
let buf = bufA
let pos = 0

function ensure(n) {
  if (pos + n > buf.length) throw new Error('diff output buffer overflow')
}

function writeByte(b) {
  buf[pos++] = b
}

function writeNum(n) {
  if (n >= 1000) { buf[pos++] = 48 + (n / 1000 | 0); n %= 1000; buf[pos++] = 48 + (n / 100 | 0); n %= 100; buf[pos++] = 48 + (n / 10 | 0); buf[pos++] = 48 + (n % 10) }
  else if (n >= 100) { buf[pos++] = 48 + (n / 100 | 0); n %= 100; buf[pos++] = 48 + (n / 10 | 0); buf[pos++] = 48 + (n % 10) }
  else if (n >= 10) { buf[pos++] = 48 + (n / 10 | 0); buf[pos++] = 48 + (n % 10) }
  else buf[pos++] = 48 + n
}

function writeMoveTo(row, col) {
  ensure(12)
  buf[pos++] = 0x1b
  buf[pos++] = 0x5b
  writeNum(row)
  buf[pos++] = 0x3b
  writeNum(col)
  buf[pos++] = 0x48
}

function writeSgr(fg, bg, attrs) {
  ensure(52)
  buf[pos++] = 0x1b
  buf[pos++] = 0x5b
  buf[pos++] = 48 // '0' - reset

  for (let i = 0; i < 6; i++) {
    if (attrs & ATTR_MASKS[i]) {
      buf[pos++] = 0x3b
      buf[pos++] = ATTR_SGRCODES[i]
    }
  }

  if (fg != null) writeColor(fg, 38)
  if (bg != null) writeColor(bg, 48)

  buf[pos++] = 0x6d
}

function writeColor(color, offset) {
  if (typeof color === 'number' || color in NAMED_COLORS) {
    const idx = typeof color === 'number' ? color : NAMED_COLORS[color]
    buf[pos++] = 0x3b
    writeNum(offset)
    buf[pos++] = 0x3b
    buf[pos++] = 53 // '5'
    buf[pos++] = 0x3b
    writeNum(idx)
  } else if (color.charCodeAt(0) === 35 && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    buf[pos++] = 0x3b
    writeNum(offset)
    buf[pos++] = 0x3b
    buf[pos++] = 50 // '2'
    buf[pos++] = 0x3b
    writeNum(r)
    buf[pos++] = 0x3b
    writeNum(g)
    buf[pos++] = 0x3b
    writeNum(b)
  }
}

function writeReset() {
  ensure(4)
  buf[pos++] = 0x1b
  buf[pos++] = 0x5b
  buf[pos++] = 48
  buf[pos++] = 0x6d
}

function writeChar(ch) {
  ensure(4)
  const code = ch.charCodeAt(0)
  if (code < 0x80) {
    buf[pos++] = code
  } else {
    pos += buf.write(ch, pos)
  }
}

function cellEq(a, b) {
  return a === b || (a.ch === b.ch && a.fg === b.fg && a.bg === b.bg && a.attrs === b.attrs)
}

export function diff(prev, curr) {
  const w = curr.width
  const h = curr.height
  pos = 0
  let changed = 0

  let lastFg = undefined
  let lastBg = undefined
  let lastAttrs = undefined

  for (let y = 0; y < h; y++) {
    let x = 0
    while (x < w) {
      const idx = y * w + x
      if (cellEq(prev.cells[idx], curr.cells[idx])) {
        x++
        continue
      }

      writeMoveTo(y + 1, x + 1)

      while (x < w) {
        const i = y * w + x
        if (cellEq(prev.cells[i], curr.cells[i])) break

        const c = curr.cells[i]
        changed++

        if (c.fg !== lastFg || c.bg !== lastBg || c.attrs !== lastAttrs) {
          writeSgr(c.fg, c.bg, c.attrs)
          lastFg = c.fg
          lastBg = c.bg
          lastAttrs = c.attrs
        }

        writeChar(c.ch)
        x++
      }
    }
  }

  if (pos > 0) writeReset()

  const output = pos > 0 ? buf.subarray(0, pos) : ''
  buf = buf === bufA ? bufB : bufA
  return { output, changed }
}
