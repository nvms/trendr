import { jsx, jsxs } from '../jsx-runtime.js'
import { useTheme } from './hooks.js'
import { List } from './list.js'

const DEFAULT_SEP = { left: '', fill: '\u2500', right: '' }

export function Table({ columns, data, selected, onSelect, focused = true, separator = false, separatorChars, renderItem, scrollbar, stickyHeader = false }) {
  const { accent = 'cyan' } = useTheme()

  const headerRow = jsxs('box', {
    style: { flexDirection: 'row' },
    children: columns.map((col, i) =>
      jsx('text', {
        key: i,
        style: {
          width: col.width,
          flexGrow: col.flexGrow,
          color: 'gray',
          dim: true,
          bold: true,
          overflow: 'truncate',
          paddingX: col.paddingX ?? 1,
        },
        children: col.header,
      })
    ),
  })

  const header = separator
    ? jsxs('box', {
        style: { flexDirection: 'column' },
        children: [
          headerRow,
          (() => {
            const s = { ...DEFAULT_SEP, ...separatorChars }
            return jsxs('box', {
              style: { flexDirection: 'row' },
              children: [
                jsx('text', { style: { color: 'gray', dim: true }, children: s.left }),
                jsx('text', { style: { color: 'gray', dim: true, flexGrow: 1, overflow: 'nowrap' }, children: s.fill.repeat(1000) }),
                jsx('text', { style: { color: 'gray', dim: true }, children: s.right }),
              ],
            })
          })(),
        ],
      })
    : headerRow

  const defaultRenderItem = (row, { selected: isSel }) =>
    jsxs('box', {
      style: { flexDirection: 'row', bg: isSel ? (focused ? accent : 'gray') : null },
      children: columns.map((col, i) =>
        jsx('text', {
          key: i,
          style: {
            width: col.width,
            flexGrow: col.flexGrow,
            overflow: 'truncate',
            paddingX: col.paddingX ?? 1,
            color: isSel && focused ? 'black' : (col.color ?? null),
          },
          children: col.render ? col.render(row, isSel) : String(row[col.key] ?? ''),
        })
      ),
    })

  return jsx(List, {
    items: data,
    selected,
    onSelect,
    focused,
    header,
    headerHeight: separator ? 2 : 1,
    scrollbar,
    stickyHeader,
    renderItem: renderItem || defaultRenderItem,
  })
}
