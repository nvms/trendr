import { jsx, jsxs } from '../jsx-runtime.js'
import { useInput, useTheme } from './hooks.js'

export function Tabs({ items = [], selected, onChange, focused = true }) {
  const { accent = 'cyan', accentText = 'black', muted = 'gray' } = useTheme()

  useInput((event) => {
    if (!focused) return

    const { key } = event
    const idx = items.indexOf(selected)
    if (idx === -1) return

    if (key === 'left' || key === 'shift-tab') {
      onChange?.(items[(idx - 1 + items.length) % items.length])
      event.stopPropagation()
    } else if (key === 'right' || key === 'tab') {
      onChange?.(items[(idx + 1) % items.length])
      event.stopPropagation()
    }
  })

  const children = items.map(item => {
    const isSelected = item === selected
    let style
    if (isSelected && focused) {
      style = { bg: accent, color: accentText, bold: true }
    } else if (isSelected) {
      style = { inverse: true, bold: true }
    } else {
      style = { color: muted }
    }
    return jsx('text', { style, children: ` ${item} ` })
  })

  return jsxs('box', {
    style: { flexDirection: 'row', gap: 1 },
    children,
  })
}
