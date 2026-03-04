import { moveTo, sgr, sgrReset } from './ansi.js'

function cellEq(a, b) {
  return a === b || (a.ch === b.ch && a.fg === b.fg && a.bg === b.bg && a.attrs === b.attrs)
}

export function diff(prev, curr) {
  const w = curr.width
  const h = curr.height
  const parts = []
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

      parts.push(moveTo(y + 1, x + 1))

      while (x < w) {
        const i = y * w + x
        if (cellEq(prev.cells[i], curr.cells[i])) break

        const c = curr.cells[i]
        changed++

        if (c.fg !== lastFg || c.bg !== lastBg || c.attrs !== lastAttrs) {
          parts.push(sgr(c.fg, c.bg, c.attrs))
          lastFg = c.fg
          lastBg = c.bg
          lastAttrs = c.attrs
        }

        parts.push(c.ch)
        x++
      }
    }
  }

  if (parts.length > 0) {
    parts.push(sgrReset)
  }

  return { output: parts.join(''), changed }
}
