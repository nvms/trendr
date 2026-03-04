import { jsx, jsxs } from '../jsx-runtime.js'
import { createSignal } from './signal.js'
import { useInput, useLayout } from './hooks.js'

const BOX = { flexDirection: 'row', height: 1, minHeight: 1, flexGrow: 1 }

export function TextInput({ onSubmit, onCancel, onChange, placeholder, focused = true, initialValue }) {
  const init = initialValue ?? ''
  const [value, setValue] = createSignal(init)
  const [cursor, setCursor] = createSignal(init.length)
  const layout = useLayout()

  function update(v, c) {
    setValue(v)
    setCursor(c)
    if (onChange) onChange(v)
  }

  useInput((event) => {
    if (!focused) return

    const { key, raw, ctrl } = event
    const v = value()
    const c = cursor()

    if (key === 'return') {
      if (onSubmit) {
        onSubmit(v)
        update('', 0)
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
      if (c > 0) update(v.slice(0, c - 1) + v.slice(c), c - 1)
      event.stopPropagation()
      return
    }

    if (key === 'delete') {
      if (c < v.length) update(v.slice(0, c) + v.slice(c + 1), c)
      event.stopPropagation()
      return
    }

    if (key === 'left') { setCursor(Math.max(0, c - 1)); event.stopPropagation(); return }
    if (key === 'right') { setCursor(Math.min(v.length, c + 1)); event.stopPropagation(); return }

    if (key === 'home' || (ctrl && raw === '\x01')) { setCursor(0); event.stopPropagation(); return }
    if (key === 'end' || (ctrl && raw === '\x05')) { setCursor(v.length); event.stopPropagation(); return }

    if (ctrl && raw === '\x15') { update(v.slice(c), 0); event.stopPropagation(); return }
    if (ctrl && raw === '\x0b') { update(v.slice(0, c), c); event.stopPropagation(); return }

    if (ctrl && raw === '\x17') {
      const before = v.slice(0, c)
      const after = v.slice(c)
      const trimmed = before.replace(/\S+\s*$/, '')
      update(trimmed + after, trimmed.length)
      event.stopPropagation()
      return
    }

    if (!ctrl && raw.length === 1 && raw >= ' ') {
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

  if (!v && placeholder && focused) {
    return jsxs('box', {
      style: BOX,
      children: [
        jsx('text', { style: { inverse: true, color: 'gray' }, children: placeholder[0] }),
        placeholder.length > 1 && jsx('text', { style: { color: 'gray' }, children: placeholder.slice(1) }),
      ],
    })
  }

  const contentWidth = v.length + 1
  const needsScroll = w > 0 && contentWidth > w

  if (!needsScroll) {
    const cursorChar = v[c] || ' '
    return jsxs('box', {
      style: BOX,
      children: [
        v.slice(0, c) && jsx('text', { children: v.slice(0, c) }),
        jsx('text', { style: { inverse: focused }, children: cursorChar }),
        v.slice(c + 1) && jsx('text', { children: v.slice(c + 1) }),
      ],
    })
  }

  let scrollStart = 0
  if (c >= w) {
    scrollStart = c - w + 1
  }

  const visible = v.slice(scrollStart, scrollStart + w)
  const cursorInView = c - scrollStart
  const before = visible.slice(0, cursorInView)
  const cursorChar = visible[cursorInView] || ' '
  const after = visible.slice(cursorInView + 1)

  return jsxs('box', {
    style: BOX,
    children: [
      before && jsx('text', { children: before }),
      jsx('text', { style: { inverse: focused }, children: cursorChar }),
      after && jsx('text', { children: after }),
    ],
  })
}
