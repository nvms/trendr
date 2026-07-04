import { jsx, jsxs } from '../jsx-runtime.js'
import { createSignal } from './signal.js'
import { useInput, useLayout, useCursor, useTheme } from './hooks.js'
import { charWidth, measureText } from './wrap.js'

const BOX = { flexDirection: 'row', height: 1, minHeight: 1, flexGrow: 1 }

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

function sliceByColumns(s, startCol, endCol) {
  let col = 0
  let i = 0
  let out = ''
  while (i < s.length) {
    const cp = s.codePointAt(i)
    const len = cp > 0xffff ? 2 : 1
    const w = charWidth(cp)
    if (col + w > endCol) break
    if (col >= startCol) out += s.slice(i, i + len)
    col += w
    i += len
  }
  return out
}

function firstCodePoint(s) {
  return s.slice(0, nextBoundary(s, 0))
}

export function TextInput({ onSubmit, onCancel, onChange, placeholder, focused = true, initialValue, clearOnSubmit = false, cursor: cursorProp }) {
  const init = initialValue ?? ''
  const [value, setValue] = createSignal(init)
  const [cursor, setCursor] = createSignal(init.length)
  const { muted = 'gray' } = useTheme()
  const layout = useLayout()
  const { cursorStyle, reset: resetBlink } = useCursor(cursorProp, focused)

  function update(v, c) {
    setValue(v)
    setCursor(c)
    if (onChange) onChange(v)
  }

  useInput((event) => {
    if (!focused) return
    resetBlink()

    const { key, raw, ctrl, meta } = event
    const v = value()
    const c = cursor()

    if (key === 'paste') {
      const pasted = (event.text || '').replace(/^\n+|\n+$/g, '').replace(/\n+/g, ' ')
      if (pasted) update(v.slice(0, c) + pasted + v.slice(c), c + pasted.length)
      event.stopPropagation()
      return
    }

    if (key === 'return') {
      if (onSubmit) {
        onSubmit(v)
        if (clearOnSubmit) update('', 0)
        event.stopPropagation()
      }
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

    if (key === 'left') { setCursor(prevBoundary(v, c)); event.stopPropagation(); return }
    if (key === 'right') { setCursor(nextBoundary(v, c)); event.stopPropagation(); return }

    if (key === 'home' || (ctrl && key === 'a')) { setCursor(0); event.stopPropagation(); return }
    if (key === 'end' || (ctrl && key === 'e')) { setCursor(v.length); event.stopPropagation(); return }

    if (ctrl && key === 'u') { update(v.slice(c), 0); event.stopPropagation(); return }
    if (ctrl && key === 'k') { update(v.slice(0, c), c); event.stopPropagation(); return }

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

  if (!v && placeholder && focused) {
    const first = firstCodePoint(placeholder)
    return jsxs('box', {
      style: BOX,
      children: [
        jsx('text', { style: cs ? { ...cs, color: cs.color ?? muted } : { inverse: true, color: muted }, children: first }),
        placeholder.length > first.length && jsx('text', { style: { color: muted }, children: placeholder.slice(first.length) }),
      ],
    })
  }

  const cursorCol = measureText(v.slice(0, c))
  const contentWidth = measureText(v) + 1
  const needsScroll = w > 0 && contentWidth > w

  const cpAtCursor = c < v.length ? v.slice(c, nextBoundary(v, c)) : ''
  const cursorChar = cpAtCursor || ' '
  const cursorWidth = cpAtCursor ? measureText(cpAtCursor) : 1

  if (!needsScroll) {
    return jsxs('box', {
      style: BOX,
      children: [
        v.slice(0, c) && jsx('text', { children: v.slice(0, c) }),
        jsx('text', { style: cs ?? {}, children: cursorChar }),
        v.slice(nextBoundary(v, c)) && jsx('text', { children: v.slice(nextBoundary(v, c)) }),
      ],
    })
  }

  const scrollStart = Math.max(0, cursorCol + cursorWidth - w)
  const before = sliceByColumns(v, scrollStart, cursorCol)
  const after = sliceByColumns(v, cursorCol + cursorWidth, scrollStart + w)

  return jsxs('box', {
    style: BOX,
    children: [
      before && jsx('text', { children: before }),
      jsx('text', { style: cs ?? {}, children: cursorChar }),
      after && jsx('text', { children: after }),
    ],
  })
}
