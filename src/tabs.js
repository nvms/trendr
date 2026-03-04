import { jsx, jsxs } from '../jsx-runtime.js'
import { useInput } from './hooks.js'

export function Tabs({ items, selected, onSelect, focused = true }) {
  useInput(({ key }) => {
    if (!focused) return

    const idx = items.indexOf(selected)
    if (idx === -1) return

    if (key === 'left' || key === 'shift-tab') {
      onSelect(items[(idx - 1 + items.length) % items.length])
    } else if (key === 'right' || key === 'tab') {
      onSelect(items[(idx + 1) % items.length])
    }
  })

  const children = items.map(item => {
    const isSelected = item === selected
    return jsx('text', {
      style: isSelected ? { inverse: true, bold: true } : { color: 'gray' },
      children: ` ${item} `,
    })
  })

  return jsxs('box', {
    style: { flexDirection: 'row', gap: 1 },
    children,
  })
}
