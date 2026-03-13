import { jsx, jsxs } from '../jsx-runtime.js'
import { createSignal } from './signal.js'
import { useInput, useLayout, useTheme } from './hooks.js'
import { registerOverlay, getInstanceLayout, getContext, registerHook } from './renderer.js'

function MenuDropdown({ items, cursor, scroll, visibleCount, onSelect, onCursorChange, accent, hotkeyColor, direction }) {
  const scrollable = items.length > visibleCount
  const visible = items.slice(scroll, scroll + visibleCount)
  const thumbH = scrollable ? Math.max(1, Math.round((visibleCount / items.length) * visibleCount)) : 0
  const maxSc = items.length - visibleCount
  const thumbStart = scrollable && maxSc > 0 ? Math.round((scroll / maxSc) * (visibleCount - thumbH)) : 0
  const maxLen = items.reduce((m, v) => Math.max(m, (v.label ?? v).length), 0)

  const dropdownChildren = visible.map((item, vi) => {
    const i = vi + scroll
    const isCursor = i === cursor
    const label = item.label ?? item
    const hotkey = item.hotkey

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
            children: ' ' + (barIsThumb ? '\u2588' : '\u2502'),
          }),
        ],
      })
    }

    const labelParts = renderHotkeyLabel(label, hotkey, {
      hotkeyColor: isCursor ? 'black' : hotkeyColor,
      textColor: isCursor ? 'black' : null,
      bold: isCursor,
      hotkeyBold: true,
      hotkeyUnderline: true,
    })

    const content = jsx('box', {
      key: scrollable ? undefined : i,
      style: { bg: isCursor ? accent : null, paddingX: 1, flexGrow: 1 },
      children: labelParts,
    })
    return row(content)
  })

  const dropdownH = visibleCount + 2

  return jsx('box', {
    style: {
      flexDirection: 'column',
      border: 'single',
      borderColor: accent,
      height: dropdownH,
      width: maxLen + 4 + (scrollable ? 2 : 0),
      bg: null,
    },
    children: dropdownChildren,
  })
}

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

    const navKeys = ['h', 'l', 'left', 'right', 'return', 'space', 'escape']
    if (!isOpen && !navKeys.includes(key)) {
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

    let itemX = 0
    for (let i = 0; i < openIndex(); i++) {
      const label = items[i].label ?? items[i]
      itemX += label.length + 2
    }

    const anchorY = instLayout.y + 1
    const spaceBelow = termH - anchorY - 2
    const spaceAbove = instLayout.y - 2

    let direction = 'down'
    let maxRows = Math.min(openChildren.length, maxVisible)
    if (spaceBelow >= maxRows) {
      maxRows = Math.min(maxRows, spaceBelow)
    } else if (spaceAbove > spaceBelow) {
      direction = 'up'
      maxRows = Math.min(maxRows, spaceAbove)
    } else {
      maxRows = Math.min(maxRows, spaceBelow)
    }

    const visibleCount = Math.max(1, maxRows)

    const cur = cursor()
    const sc = scroll()
    let newScroll = sc
    if (cur < sc) newScroll = cur
    else if (cur >= sc + visibleCount) newScroll = cur - visibleCount + 1
    newScroll = Math.max(0, Math.min(newScroll, openChildren.length - visibleCount))
    if (newScroll !== sc) setScroll(newScroll)

    const dropdown = jsx(MenuDropdown, {
      items: openChildren,
      cursor: cur,
      scroll: newScroll,
      visibleCount,
      onSelect: (item) => {
        onSelect?.({ menu: openMenu.label, item: item.label ?? item, value: item.value ?? item.label ?? item })
        setOpenIndex(-1)
      },
      onCursorChange: (idx) => setCursor(idx),
      accent,
      hotkeyColor,
      direction,
    })

    const termW = ctx?.stream?.columns ?? 80
    const dropdownH = visibleCount + 2
    const absX = instLayout.x + itemX
    const absY = direction === 'up' ? instLayout.y - dropdownH : instLayout.y + 1

    const overlay = jsx('box', {
      style: { width: termW, height: termH },
      children: jsx('box', {
        style: {
          position: 'absolute',
          top: Math.max(0, absY),
          left: absX,
        },
        children: dropdown,
      }),
    })

    registerOverlay(overlay, { fullscreen: true })
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
