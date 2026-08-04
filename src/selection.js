import { useMouse } from './hooks.js'
import { getContext, registerHook } from './renderer.js'
import { osc52Copy, COPY_IGNORE } from './ansi.js'

function clampPoint(point, rect) {
  return {
    x: Math.max(rect.x, Math.min(rect.x + rect.width - 1, point.x)),
    y: Math.max(rect.y, Math.min(rect.y + rect.height - 1, point.y)),
  }
}

function normalize(a, b, bounds = null) {
  if (bounds) {
    a = clampPoint(a, bounds)
    b = clampPoint(b, bounds)
  }
  const forward = a.y < b.y || (a.y === b.y && a.x <= b.x)
  return forward
    ? { sx: a.x, sy: a.y, ex: b.x, ey: b.y, bounds }
    : { sx: b.x, sy: b.y, ex: a.x, ey: a.y, bounds }
}

function selectionRowRange(buf, sel, y) {
  let from = y === sel.sy ? Math.max(0, sel.sx) : 0
  let to = y === sel.ey ? Math.min(sel.ex, buf.width - 1) : buf.width - 1
  if (sel.bounds) {
    from = Math.max(from, sel.bounds.x)
    to = Math.min(to, sel.bounds.x + sel.bounds.width - 1)
  }
  return { from, to }
}

function selectionIncludes(buf, index, sel) {
  if (buf.selectionModes?.[index] === 2) return false
  if (buf.selectionModes?.[index] !== 1 || !sel.scope) return true
  const scope = buf.selectionScopes?.[index]
  return scope !== sel.scope || sel.includeOuter
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
    const { from, to } = selectionRowRange(buf, sel, y)
    let text = ''
    let screenIndent = 0
    let measuringIndent = true
    for (let x = 0; x <= to; x++) {
      const index = y * buf.width + x
      const cell = buf.cells[index]
      if (cell.ch === '') continue
      const ignored = cell.attrs & COPY_IGNORE || !selectionIncludes(buf, index, sel)
      const ch = ignored ? ' ' : cell.ch
      if (measuringIndent) {
        if (ch === ' ') screenIndent++
        else measuringIndent = false
      }
      if (x >= from) text += ch
    }
    rows.push({ text: text.replace(/\s+$/, ''), from, screenIndent, soft: !!buf.softWrap[y] })
  }

  let indent = Infinity
  for (const row of rows) {
    if (row.soft || row.text === '') continue
    indent = Math.min(indent, row.screenIndent)
  }
  if (indent === Infinity) indent = 0

  let out = ''
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const dedent = Math.max(0, indent - row.from)
    if (i === 0) out = row.text.slice(dedent)
    else if (row.soft) out += (out === '' || out.endsWith('\n') ? '' : ' ') + row.text.trim()
    else out += '\n' + (row.text === '' ? '' : row.text.slice(dedent))
  }

  return out.replace(/^\n+/, '').replace(/\s+$/, '')
}

// terminal-style click-drag text selection over the painted buffer. while
// dragging, the covered cells render inverse; on release the text is
// extracted, written to the system clipboard via OSC 52 (unless copy is
// false), and passed to onCopy. registered handlers never stop propagation
// on press, so clicks still reach interactive components underneath
export function useSelection({ onCopy, copy = true } = {}) {
  const state = registerHook(() => ({ anchor: null, scope: null, scopeId: 0, includeOuter: false, dragging: false }))
  const ctx = getContext()
  if (!ctx) throw new Error('useSelection must be called within a mounted component')

  useMouse((event) => {
    if (event.action === 'press' && event.button === 'left') {
      const buf = ctx.getPaintBuffer()
      const index = event.y * buf.width + event.x
      state.anchor = { x: event.x, y: event.y }
      const scope = event.x >= 0 && event.y >= 0 && event.x < buf.width && event.y < buf.height
        ? buf.selectionScopes[index]
        : null
      state.scopeId = scope
      state.scope = scope ? buf.selectionRects.get(scope) : null
      state.includeOuter = !!scope && buf.selectionModes[index] === 1
      state.dragging = false
      if (ctx.selection) {
        ctx.selection = null
        ctx.requestFrame()
      }
      return
    }

    if (event.action === 'drag' && state.anchor) {
      state.dragging = true
      ctx.selection = normalize(state.anchor, { x: event.x, y: event.y }, state.scope)
      ctx.selection.scope = state.scopeId
      ctx.selection.includeOuter = state.includeOuter
      ctx.requestFrame()
      return
    }

    if (event.action === 'release') {
      if (state.dragging && ctx.selection) {
        const text = extractSelectionText(ctx.getPaintBuffer(), ctx.selection)
        ctx.selection = null
        ctx.requestFrame()
        if (text) {
          if (copy) ctx.stream.write(osc52Copy(text))
          if (onCopy) onCopy(text)
        }
      }
      state.anchor = null
      state.scope = null
      state.scopeId = 0
      state.includeOuter = false
      state.dragging = false
    }
  })
}
