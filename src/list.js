import { jsx, jsxs } from '../jsx-runtime.js'
import { createSignal } from './signal.js'
import { useInput, useLayout, useTheme } from './hooks.js'

export function List({ items, selected: selectedProp, onSelect, renderItem, header, headerHeight = 1, focused = true, itemHeight = 1, scrollbar = false, stickyHeader = false, gap = 0 }) {
  const { accent = 'cyan' } = useTheme()
  const [selectedInternal, setSelectedInternal] = createSignal(0)
  const layout = useLayout()

  const selected = selectedProp ?? selectedInternal()
  const setSelected = onSelect ?? setSelectedInternal

  const viewH = layout.height
  const contentH = layout.contentHeight ?? 0
  const headerH = header ? headerHeight : 0
  const sticky = header && stickyHeader

  const innerHeaderH = sticky ? 0 : headerH

  // when sticky, layout measures the outer wrapper so we can't derive item height from it
  // use itemHeight directly and compute content from item count
  const avgH = !sticky && contentH > 0 && items.length > 0
    ? (contentH - headerH) / items.length
    : itemHeight

  const scrollViewH = sticky ? viewH - headerH : viewH
  const scrollContentH = sticky ? items.length * avgH : contentH

  const maxOffset = Math.max(0, scrollContentH - scrollViewH)

  useInput(({ key, ctrl }) => {
    if (!focused) return

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

  const itemTop = selected * avgH + innerHeaderH
  const itemBottom = itemTop + avgH

  let scrollOffset = 0
  if (scrollViewH > 0 && scrollContentH > scrollViewH) {
    const centered = itemTop - Math.floor((scrollViewH - avgH) / 2)
    scrollOffset = Math.max(0, Math.min(maxOffset, centered))
    if (itemTop < scrollOffset) scrollOffset = itemTop
    if (itemBottom > scrollOffset + scrollViewH) scrollOffset = itemBottom - scrollViewH
    scrollOffset = Math.max(0, Math.min(maxOffset, Math.round(scrollOffset)))
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
