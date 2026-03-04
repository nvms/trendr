import { jsx, jsxs } from '../jsx-runtime.js'
import { createSignal } from './signal.js'
import { useInput, useTheme } from './hooks.js'

export function Radio({ options, selected, onSelect, focused = false }) {
  const { accent = 'cyan' } = useTheme()
  const [cursor, setCursor] = createSignal(Math.max(0, options.indexOf(selected)))

  useInput((event) => {
    if (!focused) return

    const len = options.length
    if (len === 0) return
    const { key } = event

    if (key === 'up' || key === 'k') {
      if (cursor() > 0) {
        setCursor(c => c - 1)
        event.stopPropagation()
      }
    } else if (key === 'down' || key === 'j') {
      if (cursor() < len - 1) {
        setCursor(c => c + 1)
        event.stopPropagation()
      }
    } else if (key === 'return' || key === 'space') {
      onSelect?.(options[cursor()])
      event.stopPropagation()
    }
  })

  const c = cursor()

  const children = options.map((option, i) => {
    const isSelected = option === selected
    const isCursor = focused && i === c
    const icon = isSelected ? '\u25c9' : '\u25cb'
    const bg = isCursor ? accent : null
    const color = isCursor ? 'black' : null

    return jsxs('box', {
      key: option,
      style: { flexDirection: 'row', bg },
      children: [
        jsx('text', { style: { color, bold: isCursor }, children: icon }),
        jsx('text', { style: { color }, children: ` ${option}` }),
      ],
    })
  })

  return jsx('box', { style: { flexDirection: 'column' }, children })
}
