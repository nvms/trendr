import { jsx, jsxs } from '../jsx-runtime.js'
import { createSignal } from './signal.js'
import { useInput, useMouse, useLayout, useScrollDrag } from './hooks.js'
import { sliceVisibleRange } from './wrap.js'
import { computeDiff } from './diff-engine.js'

const PALETTE = {
  addBg: '#10301a', addGutterBg: '#0a2412', addIntraBg: '#1f6e34', addMarker: '#7ee787',
  delBg: '#3a1417', delGutterBg: '#2c0e11', delIntraBg: '#86262c', delMarker: '#f47067',
  lineNo: '#5c6370',
  hunk: '#7aa2f7',
  meta: '#5c6370',
  fold: '#5c6370', foldBg: '#14161c',
}

const cpLength = (s) => {
  let n = 0
  for (const _ of s) n++
  return n
}

function digits(rows, field) {
  let max = 0
  for (const r of rows) if (r[field] != null && r[field] > max) max = r[field]
  return Math.max(1, String(max).length)
}

// splits a highlighted line into normal/hot segments around the changed ranges
function intraSegments(ansiLine, plainLen, ranges) {
  const segs = []
  let pos = 0
  for (const [start, end] of ranges) {
    if (start > pos) segs.push({ text: sliceVisibleRange(ansiLine, pos, start), hot: false })
    segs.push({ text: sliceVisibleRange(ansiLine, start, end), hot: true })
    pos = end
  }
  if (pos < plainLen) segs.push({ text: sliceVisibleRange(ansiLine, pos, plainLen), hot: false })
  return segs
}

export function Diff({
  before,
  after,
  patch,
  hunks,
  language = 'text',
  filename,
  highlight,
  wordDiff = true,
  context = Infinity,
  lineNumbers = true,
  focused = true,
  scrollOffset: offsetProp,
  onScroll,
  scrollbar = true,
  colors,
}) {
  const palette = colors ? { ...PALETTE, ...colors } : PALETTE
  const [offsetInternal, setOffsetInternal] = createSignal(0)
  const layout = useLayout()

  const offset = offsetProp ?? offsetInternal()
  const setOffset = onScroll ?? setOffsetInternal

  const { rows, stats } = computeDiff({ before, after, patch, hunks, wordDiff, context })

  const wholeMode = hunks == null && patch == null
  const hiCache = new Map()
  const hiLines = (text) => {
    if (hiCache.has(text)) return hiCache.get(text)
    const lines = (highlight ? highlight(text, language) : text).split('\n')
    hiCache.set(text, lines)
    return lines
  }
  const beforeHi = wholeMode && highlight ? hiLines(before ?? '') : null
  const afterHi = wholeMode && highlight ? hiLines(after ?? '') : null

  const lineAnsi = (row) => {
    if (!highlight) return row.text
    if (wholeMode) {
      if (row.type === 'del') return beforeHi[row.oldNo - 1] ?? row.text
      if (row.newNo != null) return afterHi[row.newNo - 1] ?? row.text
      return row.text
    }
    return hiLines(row.text)[0] ?? row.text
  }

  const oldW = digits(rows, 'oldNo')
  const newW = digits(rows, 'newNo')

  const headerH = filename ? 1 : 0
  const h = Math.max(0, layout.height - headerH)
  const maxOffset = Math.max(0, rows.length - h)
  const clamp = (v) => Math.max(0, Math.min(maxOffset, v))
  const clamped = clamp(offset)

  useInput(({ key, ctrl }) => {
    if (!focused || rows.length === 0) return
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
    if (event.action !== 'scroll' || rows.length <= h) return
    const { x, y } = event
    if (x < layout.x || x >= layout.x + layout.width || y < layout.y || y >= layout.y + layout.height) return
    if (event.direction !== 'up' && event.direction !== 'down') return
    setOffset(clamp(clamped + (event.direction === 'up' ? -3 : 3)))
    event.stopPropagation()
  })

  const hasBar = scrollbar && h > 0 && rows.length > h
  const barW = hasBar ? 1 : 0
  const thumbH = hasBar ? Math.max(1, Math.round((h / rows.length) * h)) : 0
  const thumbStart = hasBar && maxOffset > 0 ? Math.round((clamped / maxOffset) * (h - thumbH)) : 0

  useScrollDrag({
    barX: hasBar ? layout.x + layout.width - 1 : null,
    barY: layout.y + headerH + thumbStart,
    thumbHeight: thumbH,
    trackHeight: h,
    maxOffset,
    scrollOffset: clamped,
    onScroll: (v) => setOffset(clamp(v)),
  })

  const renderGutter = (row) => {
    const gutterBg = row.type === 'add' ? palette.addGutterBg : row.type === 'del' ? palette.delGutterBg : null
    const markerColor = row.type === 'add' ? palette.addMarker : row.type === 'del' ? palette.delMarker : palette.lineNo
    const marker = row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' '
    const children = []

    if (lineNumbers) {
      const oldStr = row.oldNo != null ? String(row.oldNo) : ''
      const newStr = row.newNo != null ? String(row.newNo) : ''
      children.push(jsx('text', {
        style: { color: palette.lineNo, bg: gutterBg, overflow: 'nowrap' },
        children: ` ${oldStr.padStart(oldW)} ${newStr.padStart(newW)} `,
      }))
    }
    children.push(jsx('text', {
      style: { color: markerColor, bg: gutterBg, bold: true, overflow: 'nowrap' },
      children: `${marker} `,
    }))
    return children
  }

  const renderContent = (row) => {
    const ansi = lineAnsi(row)
    if (!row.intra || row.intra.length === 0) {
      return [jsx('text', { style: { overflow: 'nowrap' }, children: ansi || ' ' })]
    }
    const intraBg = row.type === 'add' ? palette.addIntraBg : palette.delIntraBg
    const plainLen = cpLength(row.text)
    return intraSegments(ansi, plainLen, row.intra).map((seg, i) =>
      jsx('text', {
        key: i,
        style: { overflow: 'nowrap', bg: seg.hot ? intraBg : null },
        children: seg.text,
      })
    )
  }

  const renderRow = (row, key) => {
    if (row.type === 'hunk' || row.type === 'meta' || row.type === 'fold') {
      const color = row.type === 'hunk' ? palette.hunk : palette.meta
      const text = row.type === 'fold' ? `··· ${row.text} ···` : row.text
      return jsx('box', {
        key,
        style: { height: 1, paddingX: 1, bg: row.type === 'fold' ? palette.foldBg : null },
        children: jsx('text', { style: { color, dim: row.type !== 'hunk', overflow: 'nowrap' }, children: text }),
      })
    }

    const rowBg = row.type === 'add' ? palette.addBg : row.type === 'del' ? palette.delBg : null
    return jsxs('box', {
      key,
      style: { flexDirection: 'row', height: 1, bg: rowBg },
      children: [...renderGutter(row), ...renderContent(row)],
    })
  }

  const visible = h > 0 ? rows.slice(clamped, clamped + h) : []
  const bodyRows = visible.map((row, i) => renderRow(row, clamped + i))

  let body
  if (rows.length === 0) {
    body = jsx('box', {
      style: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
      children: jsx('text', { style: { color: palette.meta, dim: true }, children: 'No changes' }),
    })
  } else if (hasBar) {
    const bar = []
    for (let i = 0; i < h; i++) {
      const isThumb = i >= thumbStart && i < thumbStart + thumbH
      bar.push(jsx('text', {
        key: i,
        style: { color: isThumb ? palette.lineNo : palette.lineNo, dim: !isThumb },
        children: isThumb ? '█' : '│',
      }))
    }
    body = jsxs('box', {
      style: { flexDirection: 'row', flexGrow: 1 },
      children: [
        jsx('box', { style: { flexDirection: 'column', flexGrow: 1 }, children: bodyRows }),
        jsx('box', { style: { flexDirection: 'column', width: barW }, children: bar }),
      ],
    })
  } else {
    body = jsx('box', { style: { flexDirection: 'column', flexGrow: 1 }, children: bodyRows })
  }

  if (!filename) return body

  return jsxs('box', {
    style: { flexDirection: 'column', flexGrow: 1 },
    children: [
      jsxs('box', {
        style: { flexDirection: 'row', paddingX: 1, height: 1 },
        children: [
          jsx('text', { style: { bold: true, overflow: 'nowrap' }, children: filename }),
          jsx('box', { style: { flexGrow: 1 } }),
          jsx('text', { style: { color: palette.addMarker, overflow: 'nowrap' }, children: `+${stats.additions}` }),
          jsx('text', { style: { color: palette.delMarker, overflow: 'nowrap' }, children: ` -${stats.deletions}` }),
        ],
      }),
      body,
    ],
  })
}
