import { parseSgr } from './ansi.js'
import { charWidth, ansiSeqEnd } from './wrap.js'

const EMPTY = { ch: ' ', fg: null, bg: null, attrs: 0 }

export function createBuffer(width, height) {
  const size = width * height
  const cells = new Array(size)
  for (let i = 0; i < size; i++) cells[i] = EMPTY
  return { width, height, cells, softWrap: new Uint8Array(height) }
}

export function clearBuffer(buf) {
  const len = buf.cells.length
  for (let i = 0; i < len; i++) buf.cells[i] = EMPTY
  buf.softWrap.fill(0)
}

export function resizeBuffer(buf, width, height) {
  buf.width = width
  buf.height = height
  buf.cells = new Array(width * height)
  for (let i = 0; i < buf.cells.length; i++) buf.cells[i] = EMPTY
  buf.softWrap = new Uint8Array(height)
}

export function setCell(buf, x, y, ch, fg, bg, attrs) {
  if (x < 0 || y < 0 || x >= buf.width || y >= buf.height) return
  buf.cells[y * buf.width + x] = { ch, fg: fg ?? null, bg: bg ?? null, attrs: attrs ?? 0 }
}

function putCell(buf, idx, ch, fg, bg, attrs) {
  const prev = buf.cells[idx]
  const transparent = ch === ' ' && !bg && prev.ch !== ' '
  buf.cells[idx] = {
    ch: transparent ? prev.ch : ch,
    fg: transparent ? prev.fg : (fg ?? prev.fg),
    bg: bg ?? prev.bg,
    attrs: transparent ? prev.attrs : (attrs ?? prev.attrs),
  }
}

// non-SGR escapes (OSC, cursor CSI, ...) are dropped: cells hold one glyph
// plus style, there is nothing for them to attach to. zero-width chars fold
// into the previous cell's glyph. tabs expand to spaces at 8-column stops
// measured from the start of the write, matching measureText
export function writeText(buf, x, y, text, fg, bg, attrs, maxWidth) {
  if (y < 0 || y >= buf.height) return
  const max = maxWidth ?? (buf.width - x)
  const base = y * buf.width
  let ansi = null
  let col = 0
  let i = 0

  while (i < text.length) {
    if (text.charCodeAt(i) === 27) {
      const end = ansiSeqEnd(text, i)
      if (end !== -1) {
        if (text[i + 1] === '[' && text[end - 1] === 'm') {
          if (ansi === null) ansi = { fg: null, bg: null, attrs: 0 }
          parseSgr(text.slice(i + 2, end - 1), ansi)
        }
        i = end
        continue
      }
    }

    const efg = ansi === null ? fg : (ansi.fg ?? fg)
    const ebg = ansi === null ? bg : (ansi.bg ?? bg)
    const eattrs = ansi === null || ansi.attrs === 0 ? attrs : ansi.attrs

    const code = text.codePointAt(i)
    const len = code > 0xffff ? 2 : 1

    if (code === 9) {
      let stop = col + 8 - (col % 8)
      if (stop > max) stop = max
      while (col < stop) {
        const cx = x + col
        if (cx >= 0 && cx < buf.width) putCell(buf, base + cx, ' ', efg, ebg, eattrs)
        col++
      }
      i++
      continue
    }

    const w = charWidth(code)

    if (w === 0) {
      const px = x + col - 1
      if (col > 0 && px >= 0 && px < buf.width) {
        let pi = base + px
        if (buf.cells[pi].ch === '' && px > 0) pi--
        const pc = buf.cells[pi]
        if (pc.ch !== '') buf.cells[pi] = { ch: pc.ch + text.slice(i, i + len), fg: pc.fg, bg: pc.bg, attrs: pc.attrs }
      }
      i += len
      continue
    }

    if (col + w > max) break
    const cx = x + col
    if (cx >= 0 && cx + w <= buf.width) {
      putCell(buf, base + cx, len === 1 ? text[i] : text.slice(i, i + len), efg, ebg, eattrs)
      if (w === 2) buf.cells[base + cx + 1] = { ch: '', fg: efg ?? null, bg: ebg ?? null, attrs: eattrs ?? 0 }
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

export function dimRect(buf, x, y, w, h) {
  const x1 = Math.max(x, 0)
  const y1 = Math.max(y, 0)
  const x2 = Math.min(x + w, buf.width)
  const y2 = Math.min(y + h, buf.height)
  for (let row = y1; row < y2; row++) {
    const base = row * buf.width
    for (let col = x1; col < x2; col++) {
      const cell = buf.cells[base + col]
      if (cell.attrs & 2) continue
      buf.cells[base + col] = { ch: cell.ch, fg: cell.fg, bg: cell.bg, attrs: cell.attrs | 2 }
    }
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
    // softWrap is per-row metadata set at text paint time; a blitted clean
    // subtree must carry its wrap flags or selection re-joins lines wrongly
    if (src.softWrap[row]) dst.softWrap[row] = 1
  }
}
