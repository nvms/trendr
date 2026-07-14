import { jsxs, jsx } from '../jsx-runtime.js'
import { createSignal } from './signal.js'
import { useHitTest, useLayout, useMouse, useTheme } from './hooks.js'

export function HorizontalScrollBox({ children, contentWidth, step = 3, indicators = true, style: userStyle }) {
  const { muted = 'gray' } = useTheme()
  const [offset, setOffset] = createSignal(0)
  const layout = useLayout()
  const hitTest = useHitTest()
  const measuredWidth = contentWidth ?? layout.contentWidth ?? 0
  const maxOffset = Math.max(0, measuredWidth - layout.width)
  const clamped = Math.max(0, Math.min(maxOffset, offset()))

  useMouse((event) => {
    if (event.action !== 'scroll' || !hitTest(event.x, event.y)) return
    if (event.direction !== 'left' && event.direction !== 'right') return
    const next = Math.max(0, Math.min(maxOffset, clamped + (event.direction === 'left' ? -step : step)))
    if (next === clamped) return
    setOffset(next)
    event.stopPropagation()
  })

  const overlays = []
  if (indicators && clamped > 0) {
    overlays.push(jsx('text', {
      key: 'left',
      style: { position: 'absolute', left: 0, top: 0, color: muted, dim: true, copyIgnore: true },
      children: '‹',
    }))
  }
  if (indicators && clamped < maxOffset) {
    overlays.push(jsx('text', {
      key: 'right',
      style: { position: 'absolute', right: 0, top: 0, color: muted, dim: true, copyIgnore: true },
      children: '›',
    }))
  }

  return jsxs('box', {
    style: userStyle,
    children: [
      jsx('box', {
        style: { flexDirection: 'row', overflow: 'scroll', scrollOffsetX: clamped },
        children,
      }),
      ...overlays,
    ],
  })
}
