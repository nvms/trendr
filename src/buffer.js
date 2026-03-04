import { parseSgr } from './ansi.js'

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
    const n = Math.min(max, text.length, buf.width - x)
    for (let i = 0; i < n; i++) {
      const cx = x + i
      if (cx < 0 || cx >= buf.width) continue
      const prev = buf.cells[y * buf.width + cx]
      buf.cells[y * buf.width + cx] = {
        ch: text[i],
        fg: fg ?? prev.fg,
        bg: bg ?? prev.bg,
        attrs: attrs || prev.attrs,
      }
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

    const cx = x + col
    if (cx >= 0 && cx < buf.width) {
      const prev = buf.cells[y * buf.width + cx]
      buf.cells[y * buf.width + cx] = {
        ch: text[i],
        fg: ansi.fg ?? fg ?? prev.fg,
        bg: ansi.bg ?? bg ?? prev.bg,
        attrs: ansi.attrs || attrs || prev.attrs,
      }
    }
    col++
    i++
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
