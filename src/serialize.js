import { sgr } from './ansi.js'

const RESET = '\x1b[0m'

function isBlank(cell) {
  return cell.ch === ' ' && cell.fg == null && cell.bg == null && cell.attrs === 0
}

// turn a cell buffer into one ANSI string per row, trimming trailing blank
// cells so short lines don't carry filler. used by inline mode to emit both
// committed scrollback items and the live region
export function bufferToLines(buf) {
  const { width, height, cells } = buf
  const lines = new Array(height)

  for (let y = 0; y < height; y++) {
    const row = y * width

    let last = -1
    for (let x = 0; x < width; x++) {
      const c = cells[row + x]
      if (c.ch !== '' && !isBlank(c)) last = x
    }

    let line = ''
    let curFg, curBg, curAttrs
    let open = false

    for (let x = 0; x <= last; x++) {
      const c = cells[row + x]
      if (c.ch === '') continue
      if (!open || c.fg !== curFg || c.bg !== curBg || c.attrs !== curAttrs) {
        line += sgr(c.fg, c.bg, c.attrs)
        curFg = c.fg
        curBg = c.bg
        curAttrs = c.attrs
        open = true
      }
      line += c.ch
    }

    lines[y] = open ? line + RESET : line
  }

  return lines
}
