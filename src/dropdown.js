import { jsx } from '../jsx-runtime.js'
import { useMouse, useLayout } from './hooks.js'
import { registerOverlay, registerHook } from './renderer.js'

export function followCursor(cursor, scroll, visibleCount, len) {
  let next = scroll
  if (cursor < next) next = cursor
  else if (cursor >= next + visibleCount) next = cursor - visibleCount + 1
  return Math.max(0, Math.min(next, len - visibleCount))
}

export function placeDropdown({ anchorTop, itemCount, maxVisible, termH }) {
  const anchorY = anchorTop + 1
  const spaceBelow = termH - anchorY - 2
  const spaceAbove = anchorTop - 2
  let direction = 'down'
  let maxRows = Math.min(itemCount, maxVisible)
  if (spaceBelow >= maxRows) {
    maxRows = Math.min(maxRows, spaceBelow)
  } else if (spaceAbove > spaceBelow) {
    direction = 'up'
    maxRows = Math.min(maxRows, spaceAbove)
  } else {
    maxRows = Math.min(maxRows, spaceBelow)
  }
  return { direction, visibleCount: Math.max(1, maxRows) }
}

export function overlayDropdown({ x, y, termW, termH, dropdown }) {
  registerOverlay(jsx('box', {
    style: { width: termW, height: termH },
    children: jsx('box', {
      style: { position: 'absolute', top: Math.max(0, y), left: x },
      children: dropdown,
    }),
  }), { fullscreen: true })
}

export function Dropdown({ items, cursor, scroll, visibleCount, width, onSubmit, onClose, onCursorChange, renderRow, style: s }) {
  const layout = useLayout()
  const drag = registerHook(() => ({ active: false, startY: 0, startCursor: 0 }))
  const scrollable = items.length > visibleCount

  useMouse((event) => {
    if (event.action === 'release') {
      if (drag.active) drag.active = false
      return
    }

    if (event.action === 'drag' && drag.active) {
      const thumbH = Math.max(1, Math.round((visibleCount / items.length) * visibleCount))
      const dy = event.y - drag.startY
      const travel = Math.max(1, visibleCount - thumbH)
      const ratio = (items.length - 1) / travel
      const idx = Math.max(0, Math.min(items.length - 1, Math.round(drag.startCursor + dy * ratio)))
      onCursorChange(idx)
      event.stopPropagation()
      return
    }

    // layout not yet computed - consume event but don't act
    if (layout.width === 0 || layout.height === 0) {
      event.stopPropagation()
      return
    }

    const { x, y } = event
    const boxRight = layout.x + width
    const inside = x >= layout.x && x < boxRight && y >= layout.y && y < layout.y + layout.height

    if (event.action === 'scroll') {
      if (!inside) return
      if (event.direction !== 'up' && event.direction !== 'down') return
      if (event.direction === 'up') onCursorChange(Math.max(0, cursor - 1))
      else onCursorChange(Math.min(items.length - 1, cursor + 1))
      event.stopPropagation()
      return
    }

    if (event.action !== 'press' || event.button !== 'left') return

    if (!inside) {
      onClose()
      event.stopPropagation()
      return
    }

    if (scrollable && x >= boxRight - 4) {
      const maxSc = items.length - visibleCount
      const thumbH = Math.max(1, Math.round((visibleCount / items.length) * visibleCount))
      const thumbStart = maxSc > 0 ? Math.round((scroll / maxSc) * (visibleCount - thumbH)) : 0
      const barY = layout.y + 1 + thumbStart
      if (y >= barY && y < barY + thumbH) {
        drag.active = true
        drag.startY = y
        drag.startCursor = cursor
      }
      event.stopPropagation()
      return
    }

    const relY = y - layout.y - 1
    if (relY >= 0 && relY < visibleCount) {
      const clickedIdx = relY + scroll
      if (clickedIdx >= 0 && clickedIdx < items.length) {
        onSubmit(items[clickedIdx], clickedIdx)
        event.stopPropagation()
      }
    }
  })

  const visible = items.slice(scroll, scroll + visibleCount)
  const thumbH = scrollable ? Math.max(1, Math.round((visibleCount / items.length) * visibleCount)) : 0
  const maxSc = items.length - visibleCount
  const thumbStart = scrollable && maxSc > 0 ? Math.round((scroll / maxSc) * (visibleCount - thumbH)) : 0

  const children = visible.map((item, vi) => {
    const i = vi + scroll
    const content = renderRow(item, { index: i, isCursor: i === cursor })
    if (!scrollable) return jsx('box', { key: i, style: { flexDirection: 'row' }, children: content })
    const barIsThumb = vi >= thumbStart && vi < thumbStart + thumbH
    return jsx('box', {
      key: i,
      style: { flexDirection: 'row' },
      children: [
        content,
        jsx('text', {
          style: { color: barIsThumb ? s.accent : 'gray', dim: !barIsThumb },
          children: ' ' + (barIsThumb ? '█' : '│'),
        }),
      ],
    })
  })

  return jsx('box', {
    style: {
      flexDirection: 'column',
      border: s.border,
      borderColor: s.borderColor,
      height: visibleCount + 2,
      width,
      bg: s.bg,
    },
    children,
  })
}
