import { jsx, jsxs } from '../jsx-runtime.js'
import { useInput, useTheme } from './hooks.js'

export function Checkbox({ checked = false, label, onChange, focused = false }) {
  const { accent = 'cyan' } = useTheme()

  useInput((event) => {
    if (!focused) return
    if (event.key === 'space' || event.key === 'return') {
      onChange?.(!checked)
      event.stopPropagation()
    }
  })

  const icon = checked ? '[x]' : '[ ]'
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
