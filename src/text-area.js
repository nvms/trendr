import { jsx, jsxs } from '../jsx-runtime.js'
import { createSignal } from './signal.js'
import { useInput, useMouse, useLayout, useCursor, useTheme, useScrollDrag } from './hooks.js'
import { registerHook } from './renderer.js'
import { charWidth, measureText } from './wrap.js'

function prevBoundary(s, i) {
  if (i <= 0) return 0
  const c = s.charCodeAt(i - 1)
  return c >= 0xdc00 && c <= 0xdfff && i >= 2 ? i - 2 : i - 1
}

function nextBoundary(s, i) {
  if (i >= s.length) return s.length
  const c = s.charCodeAt(i)
  return c >= 0xd800 && c <= 0xdbff && i + 1 < s.length ? i + 2 : i + 1
}

export function wrapForEditor(text, width) {
  if (width <= 0) return [{ start: 0, end: 0, hard: true }]
  if (text.length === 0) return [{ start: 0, end: 0, hard: true }]

  const lines = []
  let pos = 0

  while (pos < text.length) {
    const nlIdx = text.indexOf('\n', pos)
    const logicalEnd = nlIdx === -1 ? text.length : nlIdx
    const segment = text.slice(pos, logicalEnd)

    if (segment.length === 0) {
      lines.push({ start: pos, end: pos, hard: true })
      pos = logicalEnd + 1
      continue
    }

    let segStart = 0
    while (segStart < segment.length) {
      const remaining = segment.slice(segStart)

      if (measureText(remaining) <= width) {
        lines.push({ start: pos + segStart, end: pos + segStart + remaining.length, hard: true })
        segStart += remaining.length
        break
      }

      let fit = 0
      let col = 0
      while (fit < remaining.length) {
        const cp = remaining.codePointAt(fit)
        const cw = charWidth(cp)
        if (col + cw > width) break
        col += cw
        fit += cp > 0xffff ? 2 : 1
      }
      if (fit === 0) fit = nextBoundary(remaining, 0)

      const chunk = remaining.slice(0, fit)
      const lastSpace = chunk.lastIndexOf(' ')

      if (lastSpace > 0) {
        lines.push({ start: pos + segStart, end: pos + segStart + lastSpace, hard: false })
        segStart += lastSpace + 1
      } else {
        lines.push({ start: pos + segStart, end: pos + segStart + fit, hard: false })
        segStart += fit
      }
    }

    pos = logicalEnd + (nlIdx !== -1 ? 1 : 0)
  }

  if (text.length > 0 && text[text.length - 1] === '\n') {
    lines.push({ start: text.length, end: text.length, hard: true })
  }

  if (lines.length === 0) {
    lines.push({ start: 0, end: 0, hard: true })
  }

  return lines
}

export function cursorToDisplay(cursor, lineMap, text) {
  for (let row = 0; row < lineMap.length; row++) {
    const line = lineMap[row]
    if (cursor >= line.start && cursor <= line.end) {
      if (cursor === line.end && !line.hard && row + 1 < lineMap.length) {
        return { row: row + 1, col: 0 }
      }
      const col = text != null ? measureText(text.slice(line.start, cursor)) : cursor - line.start
      return { row, col }
    }
  }
  const last = lineMap[lineMap.length - 1]
  const col = text != null ? measureText(text.slice(last.start, last.end)) : last.end - last.start
  return { row: lineMap.length - 1, col }
}

export function displayToCursor(row, col, lineMap, text) {
  const r = Math.max(0, Math.min(row, lineMap.length - 1))
  const line = lineMap[r]
  if (text == null) {
    const maxCol = line.end - line.start
    return line.start + Math.max(0, Math.min(col, maxCol))
  }
  let i = line.start
  let c = 0
  while (i < line.end && c < col) {
    const cp = text.codePointAt(i)
    const w = charWidth(cp)
    if (c + w > col) break
    c += w
    i += cp > 0xffff ? 2 : 1
  }
  return i
}

function ensureVisible(cursorRow, scroll, height, totalLines) {
  const maxScroll = Math.max(0, totalLines - height)
  if (scroll > maxScroll) scroll = maxScroll
  if (cursorRow < scroll) return cursorRow
  if (cursorRow >= scroll + height) return cursorRow - height + 1
  return scroll
}

function editorView(text, width, maxHeight, lineCounter, scrollbar) {
  const fullWidth = width || 80
  let lineMap = wrapForEditor(text, fullWidth)
  let counterActive = lineCounter && lineMap.length > maxHeight
  let textHeight = counterActive ? Math.max(1, maxHeight - 1) : maxHeight
  let hasBar = scrollbar && lineMap.length > textHeight

  if (hasBar) {
    lineMap = wrapForEditor(text, Math.max(1, fullWidth - 2))
    counterActive = lineCounter && lineMap.length > maxHeight
    textHeight = counterActive ? Math.max(1, maxHeight - 1) : maxHeight
  }

  return {
    lineMap,
    counterActive,
    displayHeight: Math.max(1, Math.min(lineMap.length, textHeight)),
    hasBar,
  }
}

export function TextArea({ onSubmit, onCancel, onChange, onKeyDown, placeholder, focused = true, maxHeight = 10, clearOnSubmit = true, cursor: cursorProp, value: valueProp, submitOnEnter = false, newlineOnBackslashEnter = false, color, lineCounter = false, scrollbar = false, thumbChar = '\u2588', trackChar = '\u2502' }) {
  const [value, setValue] = createSignal('')
  const [cursor, setCursor] = createSignal(0)
  if (valueProp !== undefined && valueProp !== value()) {
    setValue(valueProp)
    setCursor(valueProp.length)
  }
  const [scroll, setScroll] = createSignal(0)
  const ref = registerHook(() => ({ goalCol: null, manualScroll: false }))
  const { accent = 'cyan', muted = 'gray' } = useTheme()
  const layout = useLayout()
  const { cursorStyle, reset: resetBlink } = useCursor(cursorProp, focused)

  function update(next, c) {
    const prev = value()
    setValue(next)
    setCursor(c)
    ref.goalCol = null
    ref.manualScroll = false
    if (onChange) onChange(next, prev)
  }

  useMouse((event) => {
    if (!focused) return
    if (event.x < layout.x || event.x >= layout.x + layout.width || event.y < layout.y || event.y >= layout.y + layout.height) return

    const v = value()
    const view = editorView(v, layout.width, maxHeight, lineCounter, scrollbar)
    const maxScroll = Math.max(0, view.lineMap.length - view.displayHeight)

    if (event.action === 'scroll' && (event.direction === 'up' || event.direction === 'down') && maxScroll > 0) {
      const delta = event.direction === 'up' ? -3 : 3
      setScroll(Math.max(0, Math.min(maxScroll, scroll() + delta)))
      ref.manualScroll = true
      event.stopPropagation()
      return
    }

    if (event.action !== 'press' || event.button !== 'left') return
    const row = Math.min(event.y - layout.y, view.displayHeight - 1) + scroll()
    const col = event.x - layout.x
    setCursor(displayToCursor(row, col, view.lineMap, v))
    ref.goalCol = null
    resetBlink()
    event.stopPropagation()
  })

  useInput((event) => {
    if (!focused) return

    if (onKeyDown) {
      event.value = value()
      event.cursor = cursor()
      if (onKeyDown(event)) {
        event.stopPropagation()
        return
      }
    }

    resetBlink()
    ref.manualScroll = false

    const { key, raw, ctrl, meta, shift } = event
    const v = value()
    const c = cursor()

    if (key === 'paste') {
      const pasted = event.text || ''
      update(v.slice(0, c) + pasted + v.slice(c), c + pasted.length)
      event.stopPropagation()
      return
    }

    const isBackslashNewlineKey = newlineOnBackslashEnter && key === 'return' && !meta && c > 0 && v[c - 1] === '\\'
    const isSubmitKey = submitOnEnter
      ? (key === 'return' && !meta && !shift)
      : (meta && key === 'return')
    const isNewlineKey = submitOnEnter
      ? ((shift && key === 'return') || (meta && key === 'return'))
      : (key === 'return')

    if (isBackslashNewlineKey) {
      update(v.slice(0, c - 1) + '\n' + v.slice(c), c)
      event.stopPropagation()
      return
    }

    if (isSubmitKey) {
      if (onSubmit) onSubmit(v)
      if (clearOnSubmit) update('', 0)
      setScroll(0)
      ref.manualScroll = false
      event.stopPropagation()
      return
    }

    if (isNewlineKey) {
      update(v.slice(0, c) + '\n' + v.slice(c), c + 1)
      event.stopPropagation()
      return
    }

    if (key === 'escape') {
      if (onCancel) {
        onCancel()
        event.stopPropagation()
      }
      return
    }

    if (key === 'backspace') {
      if (c > 0) {
        const p = prevBoundary(v, c)
        update(v.slice(0, p) + v.slice(c), p)
      }
      event.stopPropagation()
      return
    }

    if (key === 'delete') {
      if (c < v.length) update(v.slice(0, c) + v.slice(nextBoundary(v, c)), c)
      event.stopPropagation()
      return
    }

    if (key === 'left') {
      setCursor(prevBoundary(v, c))
      ref.goalCol = null
      event.stopPropagation()
      return
    }

    if (key === 'right') {
      setCursor(nextBoundary(v, c))
      ref.goalCol = null
      event.stopPropagation()
      return
    }

    if (key === 'up' || key === 'down') {
      const w = layout.width || 80
      const lineMap = wrapForEditor(v, w)
      const pos = cursorToDisplay(c, lineMap, v)
      const goal = ref.goalCol !== null ? ref.goalCol : pos.col
      ref.goalCol = goal

      const newRow = key === 'up' ? pos.row - 1 : pos.row + 1
      if (newRow >= 0 && newRow < lineMap.length) {
        setCursor(displayToCursor(newRow, goal, lineMap, v))
      }
      event.stopPropagation()
      return
    }

    if (key === 'home' || (ctrl && key === 'a')) {
      const w = layout.width || 80
      const lineMap = wrapForEditor(v, w)
      const pos = cursorToDisplay(c, lineMap, v)
      setCursor(lineMap[pos.row].start)
      ref.goalCol = null
      event.stopPropagation()
      return
    }

    if (key === 'end' || (ctrl && key === 'e')) {
      const w = layout.width || 80
      const lineMap = wrapForEditor(v, w)
      const pos = cursorToDisplay(c, lineMap, v)
      setCursor(lineMap[pos.row].end)
      ref.goalCol = null
      event.stopPropagation()
      return
    }

    if (ctrl && key === 'u') {
      const lineStart = v.lastIndexOf('\n', c - 1) + 1
      const rest = v.slice(c)
      const lineEmptyAfter = rest.length === 0 || rest[0] === '\n'
      if (c > lineStart && !(lineEmptyAfter && lineStart > 0)) {
        // delete to start of the current line, staying on it
        update(v.slice(0, lineStart) + rest, lineStart)
      } else if (lineStart > 0) {
        // nothing left to delete on this line (or the line is now empty): remove
        // the line break above and land at the end of the previous line, so
        // repeated ctrl+u keeps eating lines upward
        update(v.slice(0, lineStart - 1) + rest, lineStart - 1)
      } else if (c > lineStart) {
        // first line: just clear it
        update(rest, 0)
      }
      event.stopPropagation()
      return
    }

    if (ctrl && key === 'k') {
      const after = v.slice(c)
      const nlIdx = after.indexOf('\n')
      const deleteEnd = nlIdx === -1 ? v.length : c + nlIdx
      update(v.slice(0, c) + v.slice(deleteEnd), c)
      event.stopPropagation()
      return
    }

    if (ctrl && key === 'w') {
      const before = v.slice(0, c)
      const after = v.slice(c)
      const trimmed = before.replace(/\S+\s*$/, '')
      update(trimmed + after, trimmed.length)
      event.stopPropagation()
      return
    }

    if (!ctrl && !meta && raw.length >= 1 && raw >= ' ' && !raw.startsWith('\x1b')) {
      update(v.slice(0, c) + raw + v.slice(c), c + raw.length)
      event.stopPropagation()
    }
  })

  const v = value()
  const c = cursor()
  const w = layout.width || 0
  const cs = cursorStyle()

  if (!v && placeholder && !focused) {
    return jsx('text', { style: { color: muted, flexGrow: 1 }, children: placeholder })
  }

  const view = editorView(v, w, maxHeight, lineCounter, scrollbar)
  const { lineMap, counterActive, displayHeight, hasBar } = view
  const displayPos = cursorToDisplay(c, lineMap, v)
  const maxScroll = Math.max(0, lineMap.length - displayHeight)
  const currentScroll = ref.manualScroll
    ? Math.max(0, Math.min(maxScroll, scroll()))
    : ensureVisible(displayPos.row, scroll(), displayHeight, lineMap.length)
  if (currentScroll !== scroll()) setScroll(currentScroll)

  const barThumbH = hasBar ? Math.max(1, Math.round((displayHeight / lineMap.length) * displayHeight)) : 0
  const barThumbStart = hasBar && maxScroll > 0 ? Math.round((currentScroll / maxScroll) * (displayHeight - barThumbH)) : 0

  useScrollDrag({
    barX: hasBar ? layout.x + layout.width - 1 : null,
    barY: layout.y + barThumbStart,
    thumbHeight: barThumbH,
    trackHeight: displayHeight,
    maxOffset: maxScroll,
    scrollOffset: currentScroll,
    onScroll: (next) => {
      setScroll(next)
      ref.manualScroll = true
    },
  })

  const visibleLines = lineMap.slice(currentScroll, currentScroll + displayHeight)

  if (!v && placeholder && focused) {
    const first = placeholder.slice(0, nextBoundary(placeholder, 0))
    return jsx('box', {
      style: { flexDirection: 'column', height: 1, minHeight: 1, flexGrow: 1 },
      children: jsxs('box', {
        style: { flexDirection: 'row', height: 1 },
        children: [
          jsx('text', { style: cs ? { ...cs, color: cs.color ?? muted } : { inverse: true, color: muted }, children: first }),
          placeholder.length > first.length && jsx('text', { style: { color: muted }, children: placeholder.slice(first.length) }),
        ],
      }),
    })
  }

  const rows = visibleLines.map((line, i) => {
    const row = currentScroll + i
    const content = v.slice(line.start, line.end)
    const hasCursor = focused && row === displayPos.row
    let textRow

    if (!hasCursor) {
      textRow = jsx('text', { style: color ? { color } : {}, children: content || ' ' })
    } else {
      const cursorIdx = Math.max(line.start, Math.min(c, line.end))
      const nb = cursorIdx < line.end ? nextBoundary(v, cursorIdx) : cursorIdx
      const before = v.slice(line.start, cursorIdx)
      const cursorChar = cursorIdx < line.end ? v.slice(cursorIdx, nb) : ' '
      const after = v.slice(nb, line.end)

      textRow = jsxs('box', {
        style: { flexDirection: 'row', height: 1 },
        children: [
          before && jsx('text', { style: color ? { color } : {}, children: before }),
          jsx('text', { style: cs ?? {}, children: cursorChar }),
          after && jsx('text', { style: color ? { color } : {}, children: after }),
        ],
      })
    }

    if (!hasBar) return jsx('box', { key: row, style: { height: 1 }, children: textRow })
    const isThumb = i >= barThumbStart && i < barThumbStart + barThumbH
    return jsxs('box', {
      key: row,
      style: { flexDirection: 'row', height: 1 },
      children: [
        jsx('box', { style: { flexGrow: 1, height: 1 }, children: textRow }),
        jsx('text', { style: { color: isThumb && focused ? accent : muted, dim: !isThumb, copyIgnore: true }, children: ` ${isThumb ? thumbChar : trackChar}` }),
      ],
    })
  })

  const counter = counterActive
    ? jsx('box', {
        style: { flexDirection: 'row', height: 1 },
        children: jsx('text', { style: { color: muted, dim: true, copyIgnore: true }, children: `${displayPos.row + 1}/${lineMap.length}` }),
      })
    : null

  return jsx('box', {
    style: { flexDirection: 'column', height: displayHeight + (counterActive ? 1 : 0), minHeight: 1, flexGrow: 1 },
    children: counter ? [...rows, counter] : rows,
  })
}
