import { jsx, jsxs } from '../jsx-runtime.js'
import { useInput, useMouse, useLayout, useTheme } from './hooks.js'

export function Checkbox({ checked = false, label, onChange, focused = false, checkedIcon = '[x]', uncheckedIcon = '[ ]' }) {
  const { accent = 'cyan' } = useTheme()
  const layout = useLayout()

  useInput((event) => {
    if (!focused) return
    if (event.key === 'space' || event.key === 'return') {
      onChange?.(!checked)
      event.stopPropagation()
    }
  })

  useMouse((event) => {
    if (event.action !== 'press' || event.button !== 'left') return
    const { x, y } = event
    if (x < layout.x || x >= layout.x + layout.width || y < layout.y || y >= layout.y + layout.height) return
    onChange?.(!checked)
    event.stopPropagation()
  })

  const icon = checked ? checkedIcon : uncheckedIcon
  const bg = focused ? accent : null
  const color = focused ? 'black' : null

  const children = [
    jsx('text', { style: { color, bold: focused }, children: icon }),
  ]

  if (label != null) {
    children.push(jsx('text', { style: { color }, children: ` ${label}` }))
  }

  return jsxs('box', { style: { flexDirection: 'row', bg }, children })
}
