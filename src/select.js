import { jsx } from '../jsx-runtime.js'
import { createSignal } from './signal.js'
import { useInput, useTheme } from './hooks.js'
import { registerOverlay, getInstanceLayout, getContext } from './renderer.js'

export function Select({ items, selected, onSelect, focused = false, overlay = false, maxVisible = 10, placeholder = 'select...', renderItem, style: userStyle, openIcon = '\u25b2', closedIcon = '\u25bc' }) {
  const { accent = 'cyan' } = useTheme()
  const defaults = {
    border: 'single',
    borderColor: accent,
    bg: null,
    cursorBg: accent,
    cursorTextColor: 'black',
    color: null,
    focusedBg: accent,
    focusedColor: 'black',
  }
  const s = { ...defaults, ...userStyle }

  const [open, setOpen] = createSignal(false)
  const [cursor, setCursor] = createSignal(0)
  const [scroll, setScroll] = createSignal(0)

  useInput((event) => {
    if (!focused) return
    const { key } = event

    if (!open()) {
      if (key === 'return' || key === 'space') {
        const idx = items.indexOf(selected)
        setCursor(idx >= 0 ? idx : 0)
        setOpen(true)
        event.stopPropagation()
      }
      return
    }

    const len = items.length
    if (key === 'up' || key === 'k') { setCursor(c => Math.max(0, c - 1)); event.stopPropagation() }
    else if (key === 'down' || key === 'j') { setCursor(c => Math.min(len - 1, c + 1)); event.stopPropagation() }
    else if (key === 'return' || key === 'space') { onSelect?.(items[cursor()]); setOpen(false); event.stopPropagation() }
    else if (key === 'escape') { setOpen(false); event.stopPropagation() }
  })

  const display = selected ?? placeholder
  const collapsed = jsx('text', {
    style: {
      bg: focused ? s.focusedBg : null,
      color: focused ? s.focusedColor : (selected ? s.color : 'gray'),
      bold: focused,
    },
    children: `${open() ? openIcon : closedIcon} ${display}`,
  })

  if (!open()) return collapsed

  const maxLen = items.reduce((m, v) => Math.max(m, v.length), 0)

  let maxRows = Math.min(items.length, maxVisible)

  if (overlay) {
    const layout = getInstanceLayout()
    const ctx = getContext()
    const termH = ctx?.stream?.rows ?? 24
    const anchorY = layout.y + 1
    const available = termH - anchorY - 2
    if (available > 0) maxRows = Math.min(maxRows, available)
  }

  const scrollable = items.length > maxRows
  const visibleCount = maxRows

  const cur = cursor()
  const sc = scroll()
  let newScroll = sc
  if (cur < sc) newScroll = cur
  else if (cur >= sc + visibleCount) newScroll = cur - visibleCount + 1
  newScroll = Math.max(0, Math.min(newScroll, items.length - visibleCount))
  if (newScroll !== sc) setScroll(newScroll)

  const visible = items.slice(newScroll, newScroll + visibleCount)

  const thumbH = scrollable ? Math.max(1, Math.round((visibleCount / items.length) * visibleCount)) : 0
  const maxSc = items.length - visibleCount
  const thumbStart = scrollable && maxSc > 0 ? Math.round((newScroll / maxSc) * (visibleCount - thumbH)) : 0

  const dropdownChildren = visible.map((item, vi) => {
    const i = vi + newScroll
    const isCursor = i === cur

    const barChar = scrollable
      ? (vi >= thumbStart && vi < thumbStart + thumbH ? '\u2588' : '\u2502')
      : null

    const row = (content) => {
      if (!scrollable) return content
      const barIsThumb = vi >= thumbStart && vi < thumbStart + thumbH
      return jsx('box', {
        key: i,
        style: { flexDirection: 'row' },
        children: [
          content,
          jsx('text', {
            style: { color: barIsThumb ? accent : 'gray', dim: !barIsThumb },
            children: ' ' + barChar,
          }),
        ],
      })
    }

    if (renderItem) {
      const content = jsx('box', {
        key: scrollable ? undefined : i,
        style: { bg: isCursor ? s.cursorBg : s.bg, flexGrow: 1 },
        children: renderItem(item, { selected: isCursor, index: i }),
      })
      return row(content)
    }

    const content = jsx('box', {
      key: scrollable ? undefined : i,
      style: { bg: isCursor ? s.cursorBg : s.bg, paddingX: 1, flexGrow: 1 },
      children: jsx('text', {
        style: { color: isCursor ? s.cursorTextColor : s.color },
        children: item,
      }),
    })
    return row(content)
  })

  const dropdownH = visibleCount + 2

  const dropdown = jsx('box', {
    style: {
      flexDirection: 'column',
      border: s.border,
      borderColor: s.borderColor,
      height: dropdownH,
      width: maxLen + 4 + (scrollable ? 2 : 0),
      bg: s.bg,
    },
    children: dropdownChildren,
  })

  if (overlay) {
    registerOverlay(dropdown)
    return collapsed
  }

  return jsx('box', { style: { flexDirection: 'column' }, children: [collapsed, dropdown] })
}
