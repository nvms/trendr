import { jsx, jsxs } from '../jsx-runtime.js'
import { useTheme } from './hooks.js'
import { List } from './list.js'

export function Table({ columns, data, selected, onSelect, focused = true }) {
  const { accent = 'cyan' } = useTheme()

  const header = jsxs('box', {
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

  return jsx(List, {
    items: data,
    selected,
    onSelect,
    focused,
    header,
    renderItem: (row, { selected: isSel }) =>
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
      }),
  })
}
