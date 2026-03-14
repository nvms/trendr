import { jsx, jsxs } from '../jsx-runtime.js'
import { createSignal } from './signal.js'
import { useInput, useMouse, useLayout, useTheme, useScrollDrag } from './hooks.js'

export function ScrollBox({ children, focused = true, scrollOffset: offsetProp, onScroll, scrollbar = false, gap = 0, thumbChar = '\u2588', trackChar = '\u2502', style: userStyle }) {
  const { accent = 'cyan' } = useTheme()
  const [offsetInternal, setOffsetInternal] = createSignal(0)
  const layout = useLayout()

  const offset = offsetProp ?? offsetInternal()
  const setOffset = onScroll ?? setOffsetInternal

  const visibleH = layout.height
  const contentH = layout.contentHeight ?? 0
  const maxOffset = Math.max(0, contentH - visibleH)

  const clamp = (v) => Math.max(0, Math.min(maxOffset, v))
  const clamped = clamp(offset)

  useInput(({ key, ctrl }) => {
    if (!focused) return
    if (contentH <= visibleH) return

    const pageH = visibleH || 10
    const half = Math.max(1, Math.floor(pageH / 2))

    if (key === 'up' || key === 'k') setOffset(clamp(offset - 1))
    else if (key === 'down' || key === 'j') setOffset(clamp(offset + 1))
    else if (key === 'pageup' || (ctrl && key === 'b')) setOffset(clamp(offset - pageH))
    else if (key === 'pagedown' || (ctrl && key === 'f')) setOffset(clamp(offset + pageH))
    else if (ctrl && key === 'u') setOffset(clamp(offset - half))
    else if (ctrl && key === 'd') setOffset(clamp(offset + half))
    else if (key === 'home' || key === 'g') setOffset(0)
    else if (key === 'end' || key === 'G') setOffset(maxOffset)
  })

  useMouse((event) => {
    if (!focused) return
    if (event.action !== 'scroll') return
    if (contentH <= visibleH) return
    const { x, y } = event
    if (x < layout.x || x >= layout.x + layout.width || y < layout.y || y >= layout.y + layout.height) return
    if (event.direction === 'up') setOffset(clamp(offset - 3))
    else setOffset(clamp(offset + 3))
    event.stopPropagation()
  })

  const hasBar = scrollbar && visibleH > 0 && contentH > visibleH
  const barThumbH = hasBar ? Math.max(1, Math.round((visibleH / contentH) * visibleH)) : 0
  const barThumbStart = hasBar && maxOffset > 0 ? Math.round((clamped / maxOffset) * (visibleH - barThumbH)) : 0

  useScrollDrag({
    barX: hasBar ? layout.x + layout.width - 1 : null,
    barY: layout.y + barThumbStart,
    thumbHeight: barThumbH,
    trackHeight: visibleH,
    maxOffset,
    scrollOffset: clamped,
    onScroll: (v) => setOffset(clamp(v)),
  })

  const scrollBox = jsx('box', {
    style: {
      flexDirection: 'column',
      flexGrow: 1,
      ...userStyle,
      overflow: 'scroll',
      scrollOffset: clamped,
      gap,
    },
    children,
  })

  if (!scrollbar) return scrollBox

  const hasOverflow = visibleH > 0 && contentH > visibleH
  const barChildren = []

  if (hasOverflow) {
    const thumbH = Math.max(1, Math.round((visibleH / contentH) * visibleH))
    const thumbStart = maxOffset > 0
      ? Math.round((clamped / maxOffset) * (visibleH - thumbH))
      : 0

    for (let i = 0; i < visibleH; i++) {
      const isThumb = i >= thumbStart && i < thumbStart + thumbH
      barChildren.push(
        jsx('text', {
          key: i,
          style: { color: isThumb ? (focused ? accent : 'gray') : 'gray', dim: !isThumb },
          children: isThumb ? thumbChar : trackChar,
        })
      )
    }
  }

  return jsxs('box', {
    style: { flexDirection: 'row', flexGrow: userStyle?.flexGrow, gap: 1 },
    children: [
      scrollBox,
      jsx('box', {
        style: { width: 1, flexDirection: 'column' },
        children: barChildren,
      }),
    ],
  })
}
