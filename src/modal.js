import { jsx } from '../jsx-runtime.js'
import { useInput, useMouse, useTheme } from './hooks.js'
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

  // the backdrop captures mouse events so scroll/clicks don't leak to whatever
  // is behind the modal. the modal's own content registers later, so it still
  // handles its own mouse first
  useMouse((event) => {
    if (open) event.stopPropagation()
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
