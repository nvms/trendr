import { jsx, jsxs } from '../jsx-runtime.js'
import { createSignal } from './signal.js'
import { useInput, useLayout, useTheme, useCursor } from './hooks.js'
import { List } from './list.js'

export function PickList({ items, onSelect, onCancel, onChange, focused = true, placeholder = 'search...', filter: filterFn, renderItem, maxVisible = 10, scrollbar = false, scrolloff = 0, itemHeight = 1, itemGap = 0, gap = 0, clearOnSelect = false, style: userStyle, cursor: cursorProp }) {
  const { accent = 'cyan' } = useTheme()
  const defaults = {
    borderColor: accent,
    cursorBg: accent,
    cursorTextColor: 'black',
    color: null,
  }
  const s = { ...defaults, ...userStyle }

  const [query, setQuery] = createSignal('')
  const [textCursor, setTextCursor] = createSignal(0)
  const [listCursor, setListCursor] = createSignal(0)
  const layout = useLayout()
  const { cursorStyle, reset: resetBlink } = useCursor(cursorProp, focused)

  const defaultFilter = (q, item) => {
    const label = typeof item === 'string' ? item : (item.label ?? item.name ?? '')
    return label.toLowerCase().includes(q.toLowerCase())
  }

  const match = filterFn ?? defaultFilter

  const q = query()
  const filtered = q ? items.filter(item => match(q, item)) : items

  let cursor = listCursor()
  if (cursor >= filtered.length) cursor = Math.max(0, filtered.length - 1)
  if (cursor !== listCursor()) setListCursor(cursor)

  function updateText(v, c) {
    setQuery(v)
    setTextCursor(c)
    setListCursor(0)
    if (onChange) onChange(v)
  }

  useInput((event) => {
    if (!focused) return

    const { key, raw, ctrl } = event
    const len = filtered.length

    if (key === 'up' || (ctrl && raw === '\x10')) {
      if (len > 0) setListCursor(c => Math.max(0, c - 1))
      event.stopPropagation()
      return
    }
    if (key === 'down' || (ctrl && raw === '\x0e')) {
      if (len > 0) setListCursor(c => Math.min(len - 1, c + 1))
      event.stopPropagation()
      return
    }
    if (ctrl && key === 'u') { if (len > 0) setListCursor(c => Math.max(0, c - 5)); event.stopPropagation(); return }
    if (ctrl && key === 'd') { if (len > 0) setListCursor(c => Math.min(len - 1, c + 5)); event.stopPropagation(); return }
    if (ctrl && key === 'b') { if (len > 0) setListCursor(c => Math.max(0, c - 10)); event.stopPropagation(); return }
    if (ctrl && key === 'f') { if (len > 0) setListCursor(c => Math.min(len - 1, c + 10)); event.stopPropagation(); return }
    if (key === 'pageup') { if (len > 0) setListCursor(c => Math.max(0, c - 10)); event.stopPropagation(); return }
    if (key === 'pagedown') { if (len > 0) setListCursor(c => Math.min(len - 1, c + 10)); event.stopPropagation(); return }

    if (key === 'return') {
      if (filtered.length > 0 && onSelect) {
        onSelect(filtered[cursor])
        if (clearOnSelect) updateText('', 0)
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

    resetBlink()
    const v = query()
    const c = textCursor()

    if (key === 'backspace') {
      if (c > 0) updateText(v.slice(0, c - 1) + v.slice(c), c - 1)
      event.stopPropagation()
      return
    }

    if (key === 'delete') {
      if (c < v.length) updateText(v.slice(0, c) + v.slice(c + 1), c)
      event.stopPropagation()
      return
    }

    if (key === 'left') { setTextCursor(Math.max(0, c - 1)); event.stopPropagation(); return }
    if (key === 'right') { setTextCursor(Math.min(v.length, c + 1)); event.stopPropagation(); return }

    if (key === 'home' || (ctrl && raw === '\x01')) { setTextCursor(0); event.stopPropagation(); return }
    if (key === 'end' || (ctrl && raw === '\x05')) { setTextCursor(v.length); event.stopPropagation(); return }

    if (ctrl && raw === '\x15') { updateText(v.slice(c), 0); event.stopPropagation(); return }
    if (ctrl && raw === '\x0b') { updateText(v.slice(0, c), c); event.stopPropagation(); return }

    if (ctrl && raw === '\x17') {
      const before = v.slice(0, c)
      const after = v.slice(c)
      const trimmed = before.replace(/\S+\s*$/, '')
      updateText(trimmed + after, trimmed.length)
      event.stopPropagation()
      return
    }

    if (!ctrl && raw.length === 1 && raw >= ' ') {
      updateText(v.slice(0, c) + raw + v.slice(c), c + raw.length)
      event.stopPropagation()
    }
  })

  // text input rendering
  const v = query()
  const tc = textCursor()
  const w = layout.width || 0
  const cs = cursorStyle()

  let inputEl
  if (!v && placeholder && !focused) {
    inputEl = jsx('text', { style: { color: 'gray' }, children: placeholder })
  } else if (!v && placeholder && focused) {
    inputEl = jsxs('box', {
      style: { flexDirection: 'row', height: 1, minHeight: 1 },
      children: [
        jsx('text', { style: cs ? { ...cs, color: cs.color ?? 'gray' } : { inverse: true, color: 'gray' }, children: placeholder[0] }),
        placeholder.length > 1 && jsx('text', { style: { color: 'gray' }, children: placeholder.slice(1) }),
      ],
    })
  } else {
    const contentWidth = v.length + 1
    const needsScroll = w > 0 && contentWidth > w

    if (!needsScroll) {
      const cursorChar = v[tc] || ' '
      inputEl = jsxs('box', {
        style: { flexDirection: 'row', height: 1, minHeight: 1 },
        children: [
          v.slice(0, tc) && jsx('text', { children: v.slice(0, tc) }),
          jsx('text', { style: cs ?? {}, children: cursorChar }),
          v.slice(tc + 1) && jsx('text', { children: v.slice(tc + 1) }),
        ],
      })
    } else {
      let scrollStart = 0
      if (tc >= w) scrollStart = tc - w + 1
      const visible = v.slice(scrollStart, scrollStart + w)
      const cursorInView = tc - scrollStart
      const before = visible.slice(0, cursorInView)
      const cursorChar = visible[cursorInView] || ' '
      const after = visible.slice(cursorInView + 1)

      inputEl = jsxs('box', {
        style: { flexDirection: 'row', height: 1, minHeight: 1 },
        children: [
          before && jsx('text', { children: before }),
          jsx('text', { style: cs ?? {}, children: cursorChar }),
          after && jsx('text', { children: after }),
        ],
      })
    }
  }

  const defaultRenderItem = (item, { selected: isCursor, focused: isFocused }) => {
    const label = typeof item === 'string' ? item : (item.label ?? item.name ?? String(item))
    return jsx('box', {
      style: { bg: isCursor ? (isFocused ? s.cursorBg : 'gray') : null },
      children: jsx('text', {
        style: { color: isCursor ? s.cursorTextColor : s.color },
        children: ` ${label}`,
      }),
    })
  }

  const listRenderItem = renderItem ?? defaultRenderItem

  const list = jsx(List, {
    items: filtered,
    selected: cursor,
    onSelect: setListCursor,
    focused,
    interactive: false,
    itemHeight,
    gap: itemGap,
    scrollbar,
    scrolloff,
    renderItem: listRenderItem,
  })

  return jsxs('box', {
    style: { flexDirection: 'column', flexGrow: 1, gap },
    children: [inputEl, list],
  })
}
