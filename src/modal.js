import { jsx } from '../jsx-runtime.js'
import { useInput, useTheme } from './hooks.js'
import { registerOverlay } from './renderer.js'
import { useFocusTrap } from './focus.js'

export function Modal({ open, onClose, title, children, width: w = 40, border = 'round' }) {
  const { accent = 'cyan' } = useTheme()

  useFocusTrap(open)

  useInput((event) => {
    if (!open) return
    if (event.key === 'escape') {
      onClose?.()
      event.stopPropagation()
    }
  })

  if (!open) return null

  const content = jsx('box', {
    style: {
      width: w,
      border,
      borderColor: accent,
      flexDirection: 'column',
      paddingX: 1,
    },
    children: [
      title && jsx('text', { style: { bold: true, color: accent }, children: title }),
      ...(Array.isArray(children) ? children : [children]),
    ].filter(Boolean),
  })

  const overlay = jsx('box', {
    style: {
      height: '100%',
      width: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    },
    children: content,
  })

  registerOverlay(overlay, { backdrop: true })
  return null
}
