import { useMouse } from './hooks.js'
import { getContext, registerHook } from './renderer.js'
import { osc52Copy } from './ansi.js'

function normalize(a, b) {
  const forward = a.y < b.y || (a.y === b.y && a.x <= b.x)
  return forward
    ? { sx: a.x, sy: a.y, ex: b.x, ey: b.y }
    : { sx: b.x, sy: b.y, ex: a.x, ey: a.y }
}

// reads the selected region back out of the painted cell buffer. rows flagged
// as soft wraps rejoin the previous row with a space, so copied prose comes
// out as one paragraph regardless of the terminal width; unflagged rows keep
// their newline, so code copies with its line structure intact. all hard rows
// are extracted column-aligned and share one dedent, which strips the screen
// padding common to the block while preserving relative code indentation
export function extractSelectionText(buf, sel) {
  const rows = []
  const lastY = Math.min(sel.ey, buf.height - 1)
  for (let y = Math.max(0, sel.sy); y <= lastY; y++) {
    const to = y === sel.ey ? Math.min(sel.ex, buf.width - 1) : buf.width - 1
    let text = ''
    for (let x = 0; x <= to; x++) {
      const ch = buf.cells[y * buf.width + x].ch
      if (ch === '') continue
      text += y === sel.sy && x < sel.sx ? ' ' : ch
    }
    rows.push({ text: text.replace(/\s+$/, ''), soft: !!buf.softWrap[y] })
  }

  let indent = Infinity
  for (const row of rows) {
    if (row.soft || row.text === '') continue
    indent = Math.min(indent, row.text.match(/^ */)[0].length)
  }
  if (indent === Infinity) indent = 0

  let out = ''
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (i === 0) out = row.text.slice(indent)
    else if (row.soft) out += (out === '' || out.endsWith('\n') ? '' : ' ') + row.text.trim()
    else out += '\n' + (row.text === '' ? '' : row.text.slice(indent))
  }

  return out.replace(/^\n+/, '').replace(/\s+$/, '')
}

// terminal-style click-drag text selection over the painted buffer. while
// dragging, the covered cells render inverse; on release the text is
// extracted, written to the system clipboard via OSC 52 (unless copy is
// false), and passed to onCopy. registered handlers never stop propagation
// on press, so clicks still reach interactive components underneath
export function useSelection({ onCopy, copy = true } = {}) {
  const state = registerHook(() => ({ anchor: null, dragging: false }))
  const ctx = getContext()
  if (!ctx) throw new Error('useSelection must be called within a mounted component')

  useMouse((event) => {
    if (event.action === 'press' && event.button === 'left') {
      state.anchor = { x: event.x, y: event.y }
      state.dragging = false
      if (ctx.selection) {
        ctx.selection = null
        ctx.repaint()
      }
      return
    }

    if (event.action === 'drag' && state.anchor) {
      state.dragging = true
      ctx.selection = normalize(state.anchor, { x: event.x, y: event.y })
      ctx.repaint()
      return
    }

    if (event.action === 'release') {
      if (state.dragging && ctx.selection) {
        const text = extractSelectionText(ctx.getPaintBuffer(), ctx.selection)
        ctx.selection = null
        ctx.repaint()
        if (text) {
          if (copy) ctx.stream.write(osc52Copy(text))
          if (onCopy) onCopy(text)
        }
      }
      state.anchor = null
      state.dragging = false
    }
  })
}
