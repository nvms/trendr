import { jsx } from '../jsx-runtime.js'
import { useInput, useMouse, useLayout, useTheme } from './hooks.js'

export function Button({ label, onPress, focused = false, variant }) {
  const { accent = 'cyan' } = useTheme()
  const layout = useLayout()

  useInput((event) => {
    if (!focused) return
    if (event.key === 'return' || event.key === 'space') {
      onPress?.()
      event.stopPropagation()
    }
  })

  useMouse((event) => {
    if (event.action !== 'press' || event.button !== 'left') return
    const { x, y } = event
    if (x < layout.x || x >= layout.x + layout.width || y < layout.y || y >= layout.y + layout.height) return
    onPress?.()
    event.stopPropagation()
  })

  const dim = variant === 'dim'

  return jsx('text', {
    style: {
      bg: focused ? accent : null,
      color: focused ? 'black' : (dim ? 'gray' : null),
      bold: focused,
      dim: !focused && dim,
    },
    children: focused ? ` ${label} ` : `[${label}]`,
  })
}
