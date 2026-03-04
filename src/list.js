import { jsx } from '../jsx-runtime.js'
import { createSignal } from './signal.js'
import { useInput, useLayout } from './hooks.js'

export function List({ items, selected: selectedProp, onSelect, height, renderItem, header, focused = true }) {
  const [selectedInternal, setSelectedInternal] = createSignal(0)
  const layout = useLayout()

  const selected = selectedProp ?? selectedInternal()
  const setSelected = onSelect ?? setSelectedInternal

  const rawH = height ?? layout.height
  const visibleH = header && rawH > 0 ? rawH - 1 : rawH

  useInput(({ key, ctrl }) => {
    if (!focused) return

    const len = items.length
    if (len === 0) return

    const h = visibleH || 10
    const half = Math.max(1, Math.floor(h / 2))

    if (key === 'up' || key === 'k') setSelected(Math.max(0, selected - 1))
    else if (key === 'down' || key === 'j') setSelected(Math.min(len - 1, selected + 1))
    else if (key === 'pageup' || (ctrl && key === 'b')) setSelected(Math.max(0, selected - h))
    else if (key === 'pagedown' || (ctrl && key === 'f')) setSelected(Math.min(len - 1, selected + h))
    else if (ctrl && key === 'u') setSelected(Math.max(0, selected - half))
    else if (ctrl && key === 'd') setSelected(Math.min(len - 1, selected + half))
    else if (key === 'home' || key === 'g') setSelected(0)
    else if (key === 'end' || key === 'G') setSelected(len - 1)
  })

  const scrollOffset = visibleH > 0 && items.length > visibleH
    ? Math.max(0, Math.min(selected - Math.floor(visibleH / 2), items.length - visibleH))
    : 0

  const children = []
  if (header) children.push(header)

  for (let i = scrollOffset; i < items.length; i++) {
    children.push(renderItem(items[i], { selected: i === selected, index: i, focused }))
  }

  return jsx('box', { style: { flexDirection: 'column', flexGrow: 1 }, children })
}
