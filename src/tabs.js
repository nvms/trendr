import { jsx, jsxs } from '../jsx-runtime.js'
import { useInput, useTheme } from './hooks.js'

export function Tabs({ items, selected, onSelect, focused = true }) {
  const { accent = 'cyan' } = useTheme()

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
    let style
    if (isSelected && focused) {
      style = { bg: accent, color: 'black', bold: true }
    } else if (isSelected) {
      style = { inverse: true, bold: true }
    } else {
      style = { color: 'gray' }
    }
    return jsx('text', { style, children: ` ${item} ` })
  })

  return jsxs('box', {
    style: { flexDirection: 'row', gap: 1 },
    children,
  })
}
