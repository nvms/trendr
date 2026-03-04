import { jsx } from '../jsx-runtime.js'
import { useInput, useTheme } from './hooks.js'

export function Button({ label, onPress, focused = false, variant }) {
  const { accent = 'cyan' } = useTheme()

  useInput((event) => {
    if (!focused) return
    if (event.key === 'return' || event.key === 'space') {
      onPress?.()
      event.stopPropagation()
    }
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
