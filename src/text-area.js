import { jsx, jsxs } from '../jsx-runtime.js'
import { createSignal } from './signal.js'
import { useInput, useLayout } from './hooks.js'
import { registerHook } from './renderer.js'

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

      if (remaining.length <= width) {
        lines.push({ start: pos + segStart, end: pos + segStart + remaining.length, hard: true })
        segStart += remaining.length
        break
      }

      const chunk = remaining.slice(0, width)
      const lastSpace = chunk.lastIndexOf(' ')

      if (lastSpace > 0) {
        lines.push({ start: pos + segStart, end: pos + segStart + lastSpace, hard: false })
        segStart += lastSpace + 1
      } else {
        lines.push({ start: pos + segStart, end: pos + segStart + width, hard: false })
        segStart += width
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

export function cursorToDisplay(cursor, lineMap) {
  for (let row = 0; row < lineMap.length; row++) {
    const line = lineMap[row]
    if (cursor >= line.start && cursor <= line.end) {
      if (cursor === line.end && !line.hard && row + 1 < lineMap.length) {
        return { row: row + 1, col: 0 }
      }
      return { row, col: cursor - line.start }
    }
  }
  const last = lineMap[lineMap.length - 1]
  return { row: lineMap.length - 1, col: last.end - last.start }
}

export function displayToCursor(row, col, lineMap) {
  const r = Math.max(0, Math.min(row, lineMap.length - 1))
  const line = lineMap[r]
  const maxCol = line.end - line.start
  const c = Math.max(0, Math.min(col, maxCol))
  return line.start + c
}

function ensureVisible(cursorRow, scroll, height, totalLines) {
  const maxScroll = Math.max(0, totalLines - height)
  if (scroll > maxScroll) scroll = maxScroll
  if (cursorRow < scroll) return cursorRow
  if (cursorRow >= scroll + height) return cursorRow - height + 1
  return scroll
}

export function TextArea({ onSubmit, onCancel, onChange, placeholder, focused = true, maxHeight = 10 }) {
  const [value, setValue] = createSignal('')
  const [cursor, setCursor] = createSignal(0)
  const ref = registerHook(() => ({ scroll: 0, goalCol: null }))
  const layout = useLayout()

  function update(v, c) {
    setValue(v)
    setCursor(c)
    ref.goalCol = null
    if (onChange) onChange(v)
  }

  useInput((event) => {
    if (!focused) return

    const { key, raw, ctrl, meta } = event
    const v = value()
    const c = cursor()

    if (meta && key === '\r') {
      if (onSubmit) onSubmit(v)
      update('', 0)
      ref.scroll = 0
      event.stopPropagation()
      return
    }

    if (key === 'return') {
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
      if (c > 0) update(v.slice(0, c - 1) + v.slice(c), c - 1)
      event.stopPropagation()
      return
    }

    if (key === 'delete') {
      if (c < v.length) update(v.slice(0, c) + v.slice(c + 1), c)
      event.stopPropagation()
      return
    }

    if (key === 'left') {
      setCursor(Math.max(0, c - 1))
      ref.goalCol = null
      event.stopPropagation()
      return
    }

    if (key === 'right') {
      setCursor(Math.min(v.length, c + 1))
      ref.goalCol = null
      event.stopPropagation()
      return
    }

    if (key === 'up' || key === 'down') {
      const w = layout.width || 80
      const lineMap = wrapForEditor(v, w)
      const pos = cursorToDisplay(c, lineMap)
      const goal = ref.goalCol !== null ? ref.goalCol : pos.col
      ref.goalCol = goal

      const newRow = key === 'up' ? pos.row - 1 : pos.row + 1
      if (newRow >= 0 && newRow < lineMap.length) {
        setCursor(displayToCursor(newRow, goal, lineMap))
      }
      event.stopPropagation()
      return
    }

    if (key === 'home' || (ctrl && raw === '\x01')) {
      const w = layout.width || 80
      const lineMap = wrapForEditor(v, w)
      const pos = cursorToDisplay(c, lineMap)
      setCursor(lineMap[pos.row].start)
      ref.goalCol = null
      event.stopPropagation()
      return
    }

    if (key === 'end' || (ctrl && raw === '\x05')) {
      const w = layout.width || 80
      const lineMap = wrapForEditor(v, w)
      const pos = cursorToDisplay(c, lineMap)
      setCursor(lineMap[pos.row].end)
      ref.goalCol = null
      event.stopPropagation()
      return
    }

    if (ctrl && raw === '\x15') {
      const before = v.slice(0, c)
      const nlIdx = before.lastIndexOf('\n')
      const lineStart = nlIdx + 1
      update(v.slice(0, lineStart) + v.slice(c), lineStart)
      event.stopPropagation()
      return
    }

    if (ctrl && raw === '\x0b') {
      const after = v.slice(c)
      const nlIdx = after.indexOf('\n')
      const deleteEnd = nlIdx === -1 ? v.length : c + nlIdx
      update(v.slice(0, c) + v.slice(deleteEnd), c)
      event.stopPropagation()
      return
    }

    if (ctrl && raw === '\x17') {
      const before = v.slice(0, c)
      const after = v.slice(c)
      const trimmed = before.replace(/\S+\s*$/, '')
      update(trimmed + after, trimmed.length)
      event.stopPropagation()
      return
    }

    if (!ctrl && !meta && raw.length === 1 && raw >= ' ') {
      update(v.slice(0, c) + raw + v.slice(c), c + raw.length)
      event.stopPropagation()
    }
  })

  const v = value()
  const c = cursor()
  const w = layout.width || 0

  if (!v && placeholder && !focused) {
    return jsx('text', { style: { color: 'gray', flexGrow: 1 }, children: placeholder })
  }

  const effectiveWidth = w || 80
  const lineMap = wrapForEditor(v, effectiveWidth)
  const displayPos = cursorToDisplay(c, lineMap)

  const displayHeight = Math.max(1, Math.min(lineMap.length, maxHeight))
  ref.scroll = ensureVisible(displayPos.row, ref.scroll, displayHeight, lineMap.length)
  const scroll = ref.scroll

  const visibleLines = lineMap.slice(scroll, scroll + displayHeight)

  if (!v && placeholder && focused) {
    return jsx('box', {
      style: { flexDirection: 'column', height: 1, minHeight: 1, flexGrow: 1 },
      children: jsxs('box', {
        style: { flexDirection: 'row', height: 1 },
        children: [
          jsx('text', { style: { inverse: true, color: 'gray' }, children: placeholder[0] }),
          placeholder.length > 1 && jsx('text', { style: { color: 'gray' }, children: placeholder.slice(1) }),
        ],
      }),
    })
  }

  const rows = visibleLines.map((line, i) => {
    const row = scroll + i
    const content = v.slice(line.start, line.end)
    const hasCursor = focused && row === displayPos.row

    if (!hasCursor) {
      return jsx('text', { key: row, children: content || ' ' })
    }

    const cursorCol = displayPos.col
    const before = content.slice(0, cursorCol)
    const cursorChar = content[cursorCol] || ' '
    const after = content.slice(cursorCol + 1)

    return jsxs('box', {
      key: row,
      style: { flexDirection: 'row', height: 1 },
      children: [
        before && jsx('text', { children: before }),
        jsx('text', { style: { inverse: true }, children: cursorChar }),
        after && jsx('text', { children: after }),
      ],
    })
  })

  return jsx('box', {
    style: { flexDirection: 'column', height: displayHeight, minHeight: 1, flexGrow: 1 },
    children: rows,
  })
}
