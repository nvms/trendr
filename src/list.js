import { jsx, jsxs } from '../jsx-runtime.js'
import { createSignal } from './signal.js'
import { useInput, useMouse, useLayout, useTheme, useScrollDrag } from './hooks.js'

export function List({ items, selected: selectedProp, onSelect, renderItem, header, headerHeight = 1, focused = true, interactive = focused, itemHeight = 1, scrollbar = false, stickyHeader = false, gap = 0, scrolloff = 2 }) {
  const { accent = 'cyan' } = useTheme()
  const [selectedInternal, setSelectedInternal] = createSignal(0)
  const [scrollState, setScrollState] = createSignal(0)
  const layout = useLayout()

  const selected = selectedProp ?? selectedInternal()
  const setSelected = onSelect ?? setSelectedInternal

  const viewH = layout.height
  const contentH = layout.contentHeight ?? 0
  const headerH = header ? headerHeight : 0
  const sticky = header && stickyHeader

  const innerHeaderH = sticky ? 0 : headerH

  const avgH = !sticky && contentH > 0 && items.length > 0
    ? (contentH - headerH) / items.length
    : itemHeight

  const scrollViewH = sticky ? viewH - headerH : viewH
  const scrollContentH = sticky
    ? (contentH > 0 ? contentH : items.length * itemHeight)
    : contentH

  const maxOffset = Math.max(0, scrollContentH - scrollViewH)

  const childHeights = layout.childHeights
  const chOffset = (!sticky && header) ? 1 : 0

  let itemTop = 0, itemH = avgH
  if (childHeights && childHeights.length > chOffset) {
    for (let i = 0; i < selected + chOffset; i++) {
      itemTop += (childHeights[i] ?? avgH) + gap
    }
    itemH = childHeights[selected + chOffset] ?? avgH
  } else {
    itemTop = selected * avgH + innerHeaderH
    itemH = avgH
  }
  const itemBottom = itemTop + itemH

  const offsetToIndex = (offset) => {
    if (!childHeights || childHeights.length <= chOffset) {
      return Math.round((offset - innerHeaderH) / Math.max(1, avgH))
    }
    let cum = 0
    for (let j = 0; j < chOffset; j++) cum += (childHeights[j] ?? 0) + gap
    for (let j = 0; j < items.length; j++) {
      const h = childHeights[j + chOffset] ?? avgH
      if (offset < cum + h) return j
      cum += h + gap
    }
    return items.length - 1
  }

  useInput(({ key, ctrl }) => {
    if (!interactive) return

    const len = items.length
    if (len === 0) return

    const pageItems = viewH > 0 ? Math.max(1, Math.floor(viewH / avgH)) : 10
    const half = Math.max(1, Math.floor(pageItems / 2))

    if (key === 'up' || key === 'k') setSelected(Math.max(0, selected - 1))
    else if (key === 'down' || key === 'j') setSelected(Math.min(len - 1, selected + 1))
    else if (key === 'pageup' || (ctrl && key === 'b')) setSelected(Math.max(0, selected - pageItems))
    else if (key === 'pagedown' || (ctrl && key === 'f')) setSelected(Math.min(len - 1, selected + pageItems))
    else if (ctrl && key === 'u') setSelected(Math.max(0, selected - half))
    else if (ctrl && key === 'd') setSelected(Math.min(len - 1, selected + half))
    else if (key === 'home' || key === 'g') setSelected(0)
    else if (key === 'end' || key === 'G') setSelected(len - 1)
  })

  useMouse((event) => {
    if (!focused) return
    const len = items.length
    if (len === 0) return
    const { x, y } = event
    if (x < layout.x || x >= layout.x + layout.width || y < layout.y || y >= layout.y + layout.height) return

    if (event.action === 'scroll') {
      if (event.direction === 'up') setSelected(Math.max(0, selected - 1))
      else setSelected(Math.min(len - 1, selected + 1))
      event.stopPropagation()
      return
    }

    if (event.action === 'press' && event.button === 'left') {
      const headerOffset = sticky ? headerH : (header ? headerH : 0)
      const relY = y - layout.y - headerOffset
      const idx = offsetToIndex(relY + scrollOffset)
      if (idx >= 0 && idx < len) {
        setSelected(idx)
        event.stopPropagation()
      }
    }
  })

  const hasBar = scrollbar && scrollViewH > 0 && scrollContentH > scrollViewH
  const barThumbH = hasBar ? Math.max(1, Math.round((scrollViewH / scrollContentH) * scrollViewH)) : 0

  useScrollDrag({
    barX: hasBar ? layout.x + layout.width - 1 : null,
    barY: layout.y + (sticky ? headerH : 0),
    thumbHeight: barThumbH,
    trackHeight: scrollViewH,
    maxOffset,
    scrollOffset: itemTop,
    onScroll: (offset) => {
      const idx = offsetToIndex(offset)
      setSelected(Math.max(0, Math.min(items.length - 1, idx)))
    },
  })

  let scrollOffset = 0
  if (scrollViewH > 0 && scrollContentH > scrollViewH) {
    const margin = scrolloff * avgH
    scrollOffset = scrollState()
    if (itemTop - margin < scrollOffset) scrollOffset = itemTop - margin
    if (itemBottom + margin > scrollOffset + scrollViewH) scrollOffset = itemBottom + margin - scrollViewH
    scrollOffset = Math.max(0, Math.min(maxOffset, Math.round(scrollOffset)))
    if (scrollOffset !== scrollState()) setScrollState(scrollOffset)
  }

  const scrollChildren = []
  if (header && !sticky) scrollChildren.push(header)
  for (let i = 0; i < items.length; i++) {
    scrollChildren.push(renderItem(items[i], { selected: i === selected, index: i, focused }))
  }

  const scrollBox = jsx('box', {
    style: {
      flexDirection: 'column',
      flexGrow: 1,
      overflow: 'scroll',
      scrollOffset,
      gap,
    },
    children: scrollChildren,
  })

  const list = sticky
    ? jsxs('box', {
        style: { flexDirection: 'column', flexGrow: 1 },
        children: [header, scrollBox],
      })
    : scrollBox

  if (!scrollbar || scrollViewH <= 0 || scrollContentH <= scrollViewH) return list

  const thumbH = Math.max(1, Math.round((scrollViewH / scrollContentH) * scrollViewH))
  const thumbStart = maxOffset > 0
    ? Math.round((scrollOffset / maxOffset) * (scrollViewH - thumbH))
    : 0

  const barH = sticky ? scrollViewH : viewH
  const barChildren = []
  for (let i = 0; i < barH; i++) {
    const isThumb = i >= thumbStart && i < thumbStart + thumbH
    barChildren.push(
      jsx('text', {
        key: i,
        style: { color: isThumb ? (focused ? accent : 'gray') : 'gray', dim: !isThumb },
        children: isThumb ? '\u2588' : '\u2502',
      })
    )
  }

  const scrollBarCol = jsx('box', {
    style: { width: 1, flexDirection: 'column' },
    children: barChildren,
  })

  if (sticky) {
    return jsxs('box', {
      style: { flexDirection: 'column', flexGrow: 1 },
      children: [
        header,
        jsxs('box', {
          style: { flexDirection: 'row', flexGrow: 1, gap: 1 },
          children: [scrollBox, scrollBarCol],
        }),
      ],
    })
  }

  return jsxs('box', {
    style: { flexDirection: 'row', flexGrow: 1, gap: 1 },
    children: [list, scrollBarCol],
  })
}
