import { jsx, jsxs } from '../jsx-runtime.js'
import { createSignal } from './signal.js'
import { useInput, useLayout, useTheme } from './hooks.js'

export function List({ items, selected: selectedProp, onSelect, renderItem, header, headerHeight = 1, focused = true, itemHeight = 1, scrollbar = false }) {
  const { accent = 'cyan' } = useTheme()
  const [selectedInternal, setSelectedInternal] = createSignal(0)
  const layout = useLayout()

  const selected = selectedProp ?? selectedInternal()
  const setSelected = onSelect ?? setSelectedInternal

  const viewH = layout.height
  const contentH = layout.contentHeight ?? 0
  const headerH = header ? headerHeight : 0

  // use real average item height from layout when available
  const avgH = contentH > 0 && items.length > 0
    ? (contentH - headerH) / items.length
    : itemHeight

  const maxOffset = Math.max(0, contentH - viewH)

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

  const itemTop = selected * avgH + headerH
  const itemBottom = itemTop + avgH

  let scrollOffset = 0
  if (viewH > 0 && contentH > viewH) {
    const centered = itemTop - Math.floor((viewH - avgH) / 2)
    scrollOffset = Math.max(0, Math.min(maxOffset, centered))
    if (itemTop < scrollOffset) scrollOffset = itemTop
    if (itemBottom > scrollOffset + viewH) scrollOffset = itemBottom - viewH
    scrollOffset = Math.max(0, Math.min(maxOffset, Math.round(scrollOffset)))
  }

  const children = []
  if (header) children.push(header)
  for (let i = 0; i < items.length; i++) {
    children.push(renderItem(items[i], { selected: i === selected, index: i, focused }))
  }

  const list = jsx('box', {
    style: {
      flexDirection: 'column',
      flexGrow: 1,
      overflow: 'scroll',
      scrollOffset,
    },
    children,
  })

  if (!scrollbar || viewH <= 0 || contentH <= viewH) return list

  const thumbH = Math.max(1, Math.round((viewH / contentH) * viewH))
  const thumbStart = maxOffset > 0
    ? Math.round((scrollOffset / maxOffset) * (viewH - thumbH))
    : 0

  const barChildren = []
  for (let i = 0; i < viewH; i++) {
    const isThumb = i >= thumbStart && i < thumbStart + thumbH
    barChildren.push(
      jsx('text', {
        key: i,
        style: { color: isThumb ? (focused ? accent : 'gray') : 'gray', dim: !isThumb },
        children: isThumb ? '\u2588' : '\u2502',
      })
    )
  }

  return jsxs('box', {
    style: { flexDirection: 'row', flexGrow: 1, gap: 1 },
    children: [
      list,
      jsx('box', {
        style: { width: 1, flexDirection: 'column' },
        children: barChildren,
      }),
    ],
  })
}
