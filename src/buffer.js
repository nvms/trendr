import { parseSgr } from './ansi.js'
import { charWidth } from './wrap.js'

const EMPTY = { ch: ' ', fg: null, bg: null, attrs: 0 }

export function createBuffer(width, height) {
  const size = width * height
  const cells = new Array(size)
  for (let i = 0; i < size; i++) cells[i] = EMPTY
  return { width, height, cells }
}

export function clearBuffer(buf) {
  const len = buf.cells.length
  for (let i = 0; i < len; i++) buf.cells[i] = EMPTY
}

export function resizeBuffer(buf, width, height) {
  buf.width = width
  buf.height = height
  buf.cells = new Array(width * height)
  for (let i = 0; i < buf.cells.length; i++) buf.cells[i] = EMPTY
}

export function setCell(buf, x, y, ch, fg, bg, attrs) {
  if (x < 0 || y < 0 || x >= buf.width || y >= buf.height) return
  buf.cells[y * buf.width + x] = { ch, fg: fg ?? null, bg: bg ?? null, attrs: attrs ?? 0 }
}

export function writeText(buf, x, y, text, fg, bg, attrs, maxWidth) {
  if (y < 0 || y >= buf.height) return
  const max = maxWidth ?? (buf.width - x)

  if (text.indexOf('\x1b') === -1) {
    let col = 0
    let i = 0
    while (i < text.length && col < max) {
      const code = text.codePointAt(i)
      const len = code > 0xffff ? 2 : 1
      const w = charWidth(code)
      const cx = x + col
      if (cx >= 0 && cx < buf.width) {
        const ch = len === 1 ? text[i] : text.slice(i, i + len)
        const prev = buf.cells[y * buf.width + cx]
        const transparent = ch === ' ' && !bg && prev.ch !== ' '
        buf.cells[y * buf.width + cx] = {
          ch: transparent ? prev.ch : ch,
          fg: transparent ? prev.fg : (fg ?? prev.fg),
          bg: bg ?? prev.bg,
          attrs: transparent ? prev.attrs : (attrs || prev.attrs),
        }
        if (w === 2 && cx + 1 < buf.width) {
          buf.cells[y * buf.width + cx + 1] = { ch: '', fg: fg ?? null, bg: bg ?? null, attrs: attrs ?? 0 }
        }
      }
      col += w
      i += len
    }
    return
  }

  let col = 0
  const ansi = { fg: null, bg: null, attrs: 0 }
  let i = 0

  while (i < text.length && col < max) {
    if (text[i] === '\x1b' && text[i + 1] === '[') {
      const end = text.indexOf('m', i + 2)
      if (end !== -1) {
        parseSgr(text.slice(i + 2, end), ansi)
        i = end + 1
        continue
      }
    }

    const code = text.codePointAt(i)
    const len = code > 0xffff ? 2 : 1
    const w = charWidth(code)
    const cx = x + col
    if (cx >= 0 && cx < buf.width) {
      const ch = len === 1 ? text[i] : text.slice(i, i + len)
      const prev = buf.cells[y * buf.width + cx]
      const transparent = ch === ' ' && !bg && prev.ch !== ' '
      buf.cells[y * buf.width + cx] = {
        ch: transparent ? prev.ch : ch,
        fg: transparent ? prev.fg : (ansi.fg ?? fg ?? prev.fg),
        bg: ansi.bg ?? bg ?? prev.bg,
        attrs: transparent ? prev.attrs : (ansi.attrs || attrs || prev.attrs),
      }
      if (w === 2 && cx + 1 < buf.width) {
        buf.cells[y * buf.width + cx + 1] = { ch: '', fg: ansi.fg ?? fg ?? null, bg: ansi.bg ?? bg ?? null, attrs: ansi.attrs || attrs || 0 }
      }
    }
    col += w
    i += len
  }
}

export function fillRect(buf, x, y, w, h, ch, fg, bg, attrs) {
  const x2 = Math.min(x + w, buf.width)
  const y2 = Math.min(y + h, buf.height)
  const x1 = Math.max(x, 0)
  const y1 = Math.max(y, 0)
  for (let row = y1; row < y2; row++) {
    for (let col = x1; col < x2; col++) {
      buf.cells[row * buf.width + col] = { ch: ch ?? ' ', fg: fg ?? null, bg: bg ?? null, attrs: attrs ?? 0 }
    }
  }
}

export function dimBuffer(buf) {
  for (let i = 0; i < buf.cells.length; i++) {
    const cell = buf.cells[i]
    if (cell.attrs & 2) continue
    buf.cells[i] = { ch: cell.ch, fg: cell.fg, bg: cell.bg, attrs: cell.attrs | 2 }
  }
}

export function copyBuffer(src, dst) {
  const len = Math.min(src.cells.length, dst.cells.length)
  for (let i = 0; i < len; i++) dst.cells[i] = src.cells[i]
}

export function blitRect(src, dst, x, y, w, h) {
  const x1 = Math.max(x, 0)
  const y1 = Math.max(y, 0)
  const x2 = Math.min(x + w, src.width, dst.width)
  const y2 = Math.min(y + h, src.height, dst.height)
  for (let row = y1; row < y2; row++) {
    const base = row * dst.width
    for (let col = x1; col < x2; col++) {
      dst.cells[base + col] = src.cells[base + col]
    }
  }
}
