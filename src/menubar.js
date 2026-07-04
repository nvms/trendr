import { jsx, jsxs } from '../jsx-runtime.js'
import { createSignal } from './signal.js'
import { useInput, useLayout, useTheme } from './hooks.js'
import { getInstanceLayout, getContext } from './renderer.js'
import { Dropdown, followCursor, placeDropdown, overlayDropdown } from './dropdown.js'

function renderHotkeyLabel(label, hotkey, { hotkeyColor, textColor, bold, hotkeyBold, hotkeyUnderline }) {
  if (!hotkey) {
    return jsx('text', { style: { color: textColor, bold }, children: label })
  }

  const idx = label.toLowerCase().indexOf(hotkey.toLowerCase())
  if (idx === -1) {
    return jsxs('box', {
      style: { flexDirection: 'row' },
      children: [
        jsx('text', { style: { color: textColor, bold }, children: label }),
        jsx('text', { style: { color: hotkeyColor, bold: hotkeyBold }, children: ' [' }),
        jsx('text', { style: { color: hotkeyColor, bold: hotkeyBold, underline: hotkeyUnderline }, children: hotkey }),
        jsx('text', { style: { color: hotkeyColor, bold: hotkeyBold }, children: ']' }),
      ],
    })
  }

  const parts = []
  if (idx > 0) {
    parts.push(jsx('text', { key: 'pre', style: { color: textColor, bold }, children: label.slice(0, idx) }))
  }
  parts.push(jsx('text', { key: 'hk', style: { color: hotkeyColor, bold: hotkeyBold, underline: hotkeyUnderline }, children: label[idx] }))
  if (idx < label.length - 1) {
    parts.push(jsx('text', { key: 'post', style: { color: textColor, bold }, children: label.slice(idx + 1) }))
  }
  return jsxs('box', { style: { flexDirection: 'row' }, children: parts })
}

export function MenuBar({ items, focused = false, maxVisible = 10, onSelect, hotkeyColor: hotkeyColorProp, style: userStyle }) {
  const { accent = 'cyan' } = useTheme()
  const hotkeyColor = hotkeyColorProp ?? accent

  const [openIndex, setOpenIndex] = createSignal(-1)
  const [activeIndex, setActiveIndex] = createSignal(0)
  const [cursor, setCursor] = createSignal(0)
  const [scroll, setScroll] = createSignal(0)

  const layout = useLayout()

  useInput((event) => {
    if (!focused) return
    const { key } = event
    const isOpen = openIndex() >= 0

    // explicit hotkeys win over nav keys, so a menu bound to h/l/space/etc is still reachable
    if (!isOpen) {
      const match = items.findIndex(m => m.hotkey && m.hotkey.toLowerCase() === key.toLowerCase())
      if (match >= 0) {
        setActiveIndex(match)
        setOpenIndex(match)
        setCursor(0)
        setScroll(0)
        event.stopPropagation()
        return
      }
    }

    if (isOpen) {
      const menu = items[openIndex()]
      const children = menu.children ?? []
      const len = children.length

      if (key === 'j' || key === 'down') {
        setCursor(c => Math.min(len - 1, c + 1))
        event.stopPropagation()
        return
      }

      if (key === 'k' || key === 'up') {
        setCursor(c => Math.max(0, c - 1))
        event.stopPropagation()
        return
      }

      if (key === 'return' || key === 'space') {
        if (len > 0) {
          const child = children[cursor()]
          if (child) {
            onSelect?.({ menu: menu.label, item: child.label ?? child, value: child.value ?? child.label ?? child })
          }
        }
        setOpenIndex(-1)
        event.stopPropagation()
        return
      }

      if (key === 'escape') {
        setOpenIndex(-1)
        event.stopPropagation()
        return
      }

      const childMatch = children.findIndex(c => c.hotkey && c.hotkey.toLowerCase() === key.toLowerCase())
      if (childMatch >= 0) {
        const child = children[childMatch]
        onSelect?.({ menu: menu.label, item: child.label ?? child, value: child.value ?? child.label ?? child })
        setOpenIndex(-1)
        event.stopPropagation()
        return
      }
    }

    if (key === 'h' || key === 'left') {
      const next = (activeIndex() - 1 + items.length) % items.length
      setActiveIndex(next)
      if (isOpen) {
        setOpenIndex(next)
        setCursor(0)
        setScroll(0)
      }
      event.stopPropagation()
      return
    }

    if (key === 'l' || key === 'right') {
      const next = (activeIndex() + 1) % items.length
      setActiveIndex(next)
      if (isOpen) {
        setOpenIndex(next)
        setCursor(0)
        setScroll(0)
      }
      event.stopPropagation()
      return
    }

    if (key === 'return' || key === 'space') {
      setOpenIndex(activeIndex())
      setCursor(0)
      setScroll(0)
      event.stopPropagation()
      return
    }
  })

  const isOpen = openIndex() >= 0
  const openMenu = isOpen ? items[openIndex()] : null
  const openChildren = openMenu?.children ?? []

  if (isOpen && openChildren.length > 0) {
    const instLayout = getInstanceLayout()
    const ctx = getContext()
    const termH = ctx?.stream?.rows ?? 24
    const termW = ctx?.stream?.columns ?? 80

    let itemX = 0
    for (let i = 0; i < openIndex(); i++) {
      const label = items[i].label ?? items[i]
      itemX += label.length + 2
    }

    const { direction, visibleCount } = placeDropdown({
      anchorTop: instLayout.y,
      itemCount: openChildren.length,
      maxVisible,
      termH,
    })

    const cur = cursor()
    const newScroll = followCursor(cur, scroll(), visibleCount, openChildren.length)
    if (newScroll !== scroll()) setScroll(newScroll)

    const maxLen = openChildren.reduce((m, v) => Math.max(m, (v.label ?? v).length), 0)
    const scrollable = openChildren.length > visibleCount
    const dropWidth = maxLen + 4 + (scrollable ? 2 : 0)

    const commit = (item) => {
      onSelect?.({ menu: openMenu.label, item: item.label ?? item, value: item.value ?? item.label ?? item })
      setOpenIndex(-1)
    }

    const renderRow = (item, { isCursor }) => jsx('box', {
      style: { bg: isCursor ? accent : null, paddingX: 1, flexGrow: 1 },
      children: renderHotkeyLabel(item.label ?? item, item.hotkey, {
        hotkeyColor: isCursor ? 'black' : hotkeyColor,
        textColor: isCursor ? 'black' : null,
        bold: isCursor,
        hotkeyBold: true,
        hotkeyUnderline: true,
      }),
    })

    const dropdown = jsx(Dropdown, {
      items: openChildren,
      cursor: cur,
      scroll: newScroll,
      visibleCount,
      width: dropWidth,
      onSubmit: commit,
      onClose: () => setOpenIndex(-1),
      onCursorChange: (idx) => setCursor(idx),
      renderRow,
      style: { border: 'single', borderColor: accent, bg: null, accent },
    })

    const dropdownH = visibleCount + 2
    const absX = instLayout.x + itemX
    const absY = direction === 'up' ? instLayout.y - dropdownH : instLayout.y + 1
    overlayDropdown({ x: absX, y: absY, termW, termH, dropdown })
  }

  const barChildren = items.map((menu, i) => {
    const isActive = i === activeIndex()
    const isItemOpen = i === openIndex()
    const label = menu.label ?? menu
    const hotkey = menu.hotkey

    let bg = null
    let color = null
    let bold = false

    if (isItemOpen && focused) {
      bg = accent
      color = 'black'
      bold = true
    } else if (isActive && focused) {
      bg = accent
      color = 'black'
      bold = true
    }

    return jsx('box', {
      key: i,
      style: { bg, paddingX: 1 },
      children: renderHotkeyLabel(label, hotkey, {
        hotkeyColor: (bg === accent) ? color : hotkeyColor,
        textColor: color,
        bold,
        hotkeyBold: true,
        hotkeyUnderline: true,
      }),
    })
  })

  return jsxs('box', {
    style: { flexDirection: 'row', ...userStyle },
    children: barChildren,
  })
}
