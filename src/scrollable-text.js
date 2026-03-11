import { jsx } from '../jsx-runtime.js'
import { createSignal } from './signal.js'
import { useInput, useMouse, useLayout, useTheme, useScrollDrag } from './hooks.js'
import { wordWrap } from './wrap.js'

export function ScrollableText({ content = '', focused = true, scrollOffset: offsetProp, onScroll, width: widthProp, scrollbar = false, wrap = true, thumbChar = '\u2588', trackChar = '\u2502' }) {
  const { accent = 'cyan' } = useTheme()
  const [offsetInternal, setOffsetInternal] = createSignal(0)
  const layout = useLayout()

  const offset = offsetProp ?? offsetInternal()
  const setOffset = onScroll ?? setOffsetInternal

  const rawW = widthProp ?? layout.width
  const h = layout.height
  const w = scrollbar ? Math.max(0, rawW - 2) : rawW

  const lines = (wrap && w > 0) ? wordWrap(content, w) : content.split('\n')
  const maxOffset = Math.max(0, lines.length - (h || 1))

  const clamp = (v) => Math.max(0, Math.min(maxOffset, v))
  const clamped = clamp(offset)

  useInput(({ key, ctrl }) => {
    if (!focused) return
    if (lines.length === 0) return

    const pageH = h || 10
    const half = Math.max(1, Math.floor(pageH / 2))

    if (key === 'up' || key === 'k') setOffset(clamp(clamped - 1))
    else if (key === 'down' || key === 'j') setOffset(clamp(clamped + 1))
    else if (key === 'pageup' || (ctrl && key === 'b')) setOffset(clamp(clamped - pageH))
    else if (key === 'pagedown' || (ctrl && key === 'f')) setOffset(clamp(clamped + pageH))
    else if (ctrl && key === 'u') setOffset(clamp(clamped - half))
    else if (ctrl && key === 'd') setOffset(clamp(clamped + half))
    else if (key === 'home' || key === 'g') setOffset(0)
    else if (key === 'end' || key === 'G') setOffset(maxOffset)
  })

  useMouse((event) => {
    if (event.action !== 'scroll') return
    if (lines.length <= (h || 1)) return
    const { x, y } = event
    if (x < layout.x || x >= layout.x + layout.width || y < layout.y || y >= layout.y + layout.height) return
    if (event.direction === 'up') setOffset(clamp(clamped - 3))
    else setOffset(clamp(clamped + 3))
    event.stopPropagation()
  })

  const hasBar = scrollbar && h > 0 && lines.length > h
  const barThumbH = hasBar ? Math.max(1, Math.round((h / lines.length) * h)) : 0
  const barThumbStart = hasBar && maxOffset > 0 ? Math.round((clamped / maxOffset) * (h - barThumbH)) : 0

  useScrollDrag({
    barX: hasBar ? layout.x + layout.width - 1 : null,
    barY: layout.y + barThumbStart,
    thumbHeight: barThumbH,
    trackHeight: h,
    maxOffset,
    scrollOffset: clamped,
    onScroll: (v) => setOffset(clamp(v)),
  })

  const visible = lines.slice(clamped, h > 0 ? clamped + h : undefined)

  const textStyle = wrap ? undefined : { overflow: 'truncate' }

  if (!scrollbar || h <= 0 || lines.length <= h) {
    const children = visible.map((line, i) =>
      jsx('text', { key: i, style: textStyle, children: line || ' ' })
    )
    return jsx('box', { style: { flexDirection: 'column', flexGrow: 1 }, children })
  }

  const thumbH = Math.max(1, Math.round((h / lines.length) * h))
  const thumbStart = maxOffset > 0
    ? Math.round((clamped / maxOffset) * (h - thumbH))
    : 0

  const children = visible.map((line, i) => {
    const isThumb = i >= thumbStart && i < thumbStart + thumbH
    const barChar = isThumb ? thumbChar : trackChar
    const barColor = isThumb ? (focused ? accent : 'gray') : 'gray'

    return jsx('box', {
      key: i,
      style: { flexDirection: 'row', height: 1 },
      children: [
        jsx('text', { style: { flexGrow: 1, ...textStyle }, children: line || ' ' }),
        jsx('text', { style: { color: barColor, dim: !isThumb }, children: ' ' + barChar }),
      ],
    })
  })

  return jsx('box', { style: { flexDirection: 'column', flexGrow: 1 }, children })
}
