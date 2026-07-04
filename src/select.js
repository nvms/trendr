import { jsx } from '../jsx-runtime.js'
import { createSignal } from './signal.js'
import { useInput, useMouse, useLayout, useTheme } from './hooks.js'
import { getInstanceLayout, getContext } from './renderer.js'
import { Dropdown, followCursor, placeDropdown, overlayDropdown } from './dropdown.js'

const itemLabel = (item) => String(item?.label ?? item)

export function Select({ items = [], selected, onChange, onFocus, focused = false, overlay = false, maxVisible = 10, placeholder = 'select...', renderItem, style: userStyle, openIcon = '▲', closedIcon = '▼' }) {
  const { accent = 'cyan', accentText = 'black', muted = 'gray' } = useTheme()
  const defaults = {
    border: 'single',
    borderColor: accent,
    bg: null,
    cursorBg: accent,
    cursorTextColor: accentText,
    color: null,
    focusedBg: accent,
    focusedColor: accentText,
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
    else if (key === 'return' || key === 'space') {
      if (len > 0) onChange?.(items[Math.min(cursor(), len - 1)])
      setOpen(false)
      event.stopPropagation()
    }
    else if (key === 'escape') { setOpen(false); event.stopPropagation() }
  })

  const layout = useLayout()

  useMouse((event) => {
    if (event.action === 'scroll') {
      if (!focused || !open()) return
      if (event.direction !== 'up' && event.direction !== 'down') return
      const len = items.length
      if (event.direction === 'up') setCursor(c => Math.max(0, c - 1))
      else setCursor(c => Math.min(len - 1, c + 1))
      event.stopPropagation()
      return
    }

    if (event.action !== 'press' || event.button !== 'left') return
    const { x, y } = event
    const onCollapsed = x >= layout.x && x < layout.x + layout.width && y === layout.y

    if (onCollapsed) {
      // an unfocused select would open a keyboard-dead dropdown - only allow
      // click-to-open when focused, or when the app can move focus here
      if (!focused) {
        if (!onFocus) return
        onFocus()
      }
      if (open()) {
        setOpen(false)
      } else {
        const idx = items.indexOf(selected)
        setCursor(idx >= 0 ? idx : 0)
        setOpen(true)
      }
      event.stopPropagation()
    }
  })

  const display = selected != null ? itemLabel(selected) : placeholder
  const collapsed = jsx('text', {
    style: {
      bg: focused ? s.focusedBg : null,
      color: focused ? s.focusedColor : (selected != null ? s.color : muted),
      bold: focused,
    },
    children: `${open() ? openIcon : closedIcon} ${display}`,
  })

  if (!open() || items.length === 0) return collapsed

  let visibleCount = Math.min(items.length, maxVisible)
  let direction = 'down'
  let instLayout = null
  let termW = 80
  let termH = 24

  if (overlay) {
    instLayout = getInstanceLayout()
    const ctx = getContext()
    termH = ctx?.stream?.rows ?? 24
    termW = ctx?.stream?.columns ?? 80
    const placed = placeDropdown({ anchorTop: instLayout.y, itemCount: items.length, maxVisible, termH })
    direction = placed.direction
    visibleCount = placed.visibleCount
  }

  const cur = Math.min(cursor(), items.length - 1)
  const newScroll = followCursor(cur, scroll(), visibleCount, items.length)
  if (newScroll !== scroll()) setScroll(newScroll)

  const maxLen = items.reduce((m, v) => Math.max(m, itemLabel(v).length), 0)
  const scrollable = items.length > visibleCount
  const dropWidth = maxLen + 4 + (scrollable ? 2 : 0)

  const renderRow = (item, { index, isCursor }) => {
    if (renderItem) {
      return jsx('box', {
        style: { bg: isCursor ? s.cursorBg : s.bg, flexGrow: 1 },
        children: renderItem(item, { selected: isCursor, index }),
      })
    }
    return jsx('box', {
      style: { bg: isCursor ? s.cursorBg : s.bg, paddingX: 1, flexGrow: 1 },
      children: jsx('text', {
        style: { color: isCursor ? s.cursorTextColor : s.color },
        children: itemLabel(item),
      }),
    })
  }

  const dropdown = jsx(Dropdown, {
    items,
    cursor: cur,
    scroll: newScroll,
    visibleCount,
    width: dropWidth,
    onSubmit: (item) => {
      onChange?.(item)
      setOpen(false)
    },
    onClose: () => setOpen(false),
    onCursorChange: (idx) => setCursor(idx),
    renderRow,
    style: { border: s.border, borderColor: s.borderColor, bg: s.bg, accent },
  })

  if (overlay) {
    const dropdownH = visibleCount + 2
    const absY = direction === 'up' ? instLayout.y - dropdownH : instLayout.y + 1
    overlayDropdown({ x: instLayout.x, y: absY, termW, termH, dropdown })
    return collapsed
  }

  return jsx('box', { style: { flexDirection: 'column' }, children: [collapsed, dropdown] })
}
