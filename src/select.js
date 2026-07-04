import { jsx } from '../jsx-runtime.js'
import { createSignal } from './signal.js'
import { useInput, useMouse, useLayout, useTheme } from './hooks.js'
import { registerOverlay, getInstanceLayout, getContext, registerHook } from './renderer.js'

const itemLabel = (item) => String(item?.label ?? item)

function SelectDropdown({ items, cursor, scroll, visibleCount, onSelect, onClose, onCursorChange, renderItem, style: s, accent, dropWidth }) {
  const layout = useLayout()
  const drag = registerHook(() => ({ active: false, startY: 0, startCursor: 0 }))

  useMouse((event) => {
    if (event.action === 'release') {
      if (drag.active) drag.active = false
      return
    }

    if (event.action === 'drag' && drag.active) {
      const thumbH = Math.max(1, Math.round((visibleCount / items.length) * visibleCount))
      const dy = event.y - drag.startY
      const travel = Math.max(1, visibleCount - thumbH)
      const ratio = (items.length - 1) / travel
      const idx = Math.max(0, Math.min(items.length - 1, Math.round(drag.startCursor + dy * ratio)))
      onCursorChange(idx)
      event.stopPropagation()
      return
    }

    // layout not yet computed - consume event but don't act
    if (layout.width === 0 || layout.height === 0) {
      event.stopPropagation()
      return
    }

    const { x, y } = event
    const boxRight = layout.x + dropWidth
    const inside = x >= layout.x && x < boxRight && y >= layout.y && y < layout.y + layout.height

    if (event.action === 'scroll') {
      if (!inside) return
      if (event.direction !== 'up' && event.direction !== 'down') return
      if (event.direction === 'up') onCursorChange(Math.max(0, cursor - 1))
      else onCursorChange(Math.min(items.length - 1, cursor + 1))
      event.stopPropagation()
      return
    }

    if (event.action !== 'press' || event.button !== 'left') return

    if (!inside) {
      onClose()
      event.stopPropagation()
      return
    }

    const scrollable = items.length > visibleCount
    if (scrollable && x >= boxRight - 4) {
      const maxSc = items.length - visibleCount
      const thumbH = Math.max(1, Math.round((visibleCount / items.length) * visibleCount))
      const thumbStart = maxSc > 0 ? Math.round((scroll / maxSc) * (visibleCount - thumbH)) : 0
      const barY = layout.y + 1 + thumbStart
      if (y >= barY && y < barY + thumbH) {
        drag.active = true
        drag.startY = y
        drag.startCursor = cursor
      }
      event.stopPropagation()
      return
    }

    const relY = y - layout.y - 1
    if (relY >= 0 && relY < visibleCount) {
      const clickedIdx = relY + scroll
      if (clickedIdx >= 0 && clickedIdx < items.length) {
        onSelect(items[clickedIdx])
        event.stopPropagation()
      }
    }
  })

  const scrollable = items.length > visibleCount
  const visible = items.slice(scroll, scroll + visibleCount)
  const thumbH = scrollable ? Math.max(1, Math.round((visibleCount / items.length) * visibleCount)) : 0
  const maxSc = items.length - visibleCount
  const thumbStart = scrollable && maxSc > 0 ? Math.round((scroll / maxSc) * (visibleCount - thumbH)) : 0
  const maxLen = items.reduce((m, v) => Math.max(m, itemLabel(v).length), 0)

  const dropdownChildren = visible.map((item, vi) => {
    const i = vi + scroll
    const isCursor = i === cursor

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
            children: ' ' + (barIsThumb ? '█' : '│'),
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
        children: itemLabel(item),
      }),
    })
    return row(content)
  })

  const dropdownH = visibleCount + 2

  return jsx('box', {
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
}

export function Select({ items = [], selected, onSelect, onFocus, focused = false, overlay = false, maxVisible = 10, placeholder = 'select...', renderItem, style: userStyle, openIcon = '▲', closedIcon = '▼' }) {
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
    else if (key === 'return' || key === 'space') {
      if (len > 0) onSelect?.(items[Math.min(cursor(), len - 1)])
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
      color: focused ? s.focusedColor : (selected != null ? s.color : 'gray'),
      bold: focused,
    },
    children: `${open() ? openIcon : closedIcon} ${display}`,
  })

  if (!open() || items.length === 0) return collapsed

  let maxRows = Math.min(items.length, maxVisible)
  let direction = 'down'
  let instLayout = null
  let termW = 80
  let termH = 24

  if (overlay) {
    instLayout = getInstanceLayout()
    const ctx = getContext()
    termH = ctx?.stream?.rows ?? 24
    termW = ctx?.stream?.columns ?? 80
    const anchorY = instLayout.y + 1
    const spaceBelow = termH - anchorY - 2
    const spaceAbove = instLayout.y - 2

    if (spaceBelow >= maxRows) {
      maxRows = Math.min(maxRows, spaceBelow)
    } else if (spaceAbove > spaceBelow) {
      direction = 'up'
      maxRows = Math.min(maxRows, spaceAbove)
    } else {
      maxRows = Math.min(maxRows, spaceBelow)
    }
    maxRows = Math.max(1, maxRows)
  }

  const visibleCount = maxRows

  const cur = Math.min(cursor(), items.length - 1)
  const sc = scroll()
  let newScroll = sc
  if (cur < sc) newScroll = cur
  else if (cur >= sc + visibleCount) newScroll = cur - visibleCount + 1
  newScroll = Math.max(0, Math.min(newScroll, items.length - visibleCount))
  if (newScroll !== sc) setScroll(newScroll)

  const handleSelect = (item) => {
    onSelect?.(item)
    setOpen(false)
  }

  const handleClose = () => setOpen(false)

  const maxLen = items.reduce((m, v) => Math.max(m, itemLabel(v).length), 0)
  const scrollable = items.length > visibleCount
  const dropWidth = maxLen + 4 + (scrollable ? 2 : 0)

  const dropdown = jsx(SelectDropdown, {
    items,
    cursor: cur,
    scroll: newScroll,
    visibleCount,
    onSelect: handleSelect,
    onClose: handleClose,
    onCursorChange: (idx) => setCursor(idx),
    renderItem,
    style: s,
    accent,
    dropWidth,
  })

  if (overlay) {
    const dropdownH = visibleCount + 2
    const absY = direction === 'up' ? instLayout.y - dropdownH : instLayout.y + 1
    registerOverlay(jsx('box', {
      style: { width: termW, height: termH },
      children: jsx('box', {
        style: { position: 'absolute', top: Math.max(0, absY), left: instLayout.x },
        children: dropdown,
      }),
    }), { fullscreen: true })
    return collapsed
  }

  return jsx('box', { style: { flexDirection: 'column' }, children: [collapsed, dropdown] })
}
