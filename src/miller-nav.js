import { jsx, jsxs } from '../jsx-runtime.js'
import { createSignal, batch } from './signal.js'
import { useInput, useMouse, useTheme, useLayout } from './hooks.js'
import { List } from './list.js'

function columnWidth(items, maxChars) {
  if (!items.length) return 0
  let longest = items.reduce((max, item) => {
    const name = typeof item === 'string' ? item : (item.name ?? item.label ?? '')
    return Math.max(max, name.length)
  }, 0)
  if (maxChars) longest = Math.min(longest, maxChars)
  return Math.min(longest + 5, 25)
}

function defaultRenderItem(accent, item, { selected, focused, column }) {
  const name = typeof item === 'string' ? item : (item.name ?? item.label ?? String(item))
  const bg = selected ? (focused ? accent : '#333333') : null
  const fg = selected && focused ? 'black' : null
  return jsx('box', {
    style: { bg, flexDirection: 'row' },
    children: jsxs('text', {
      style: { color: fg, overflow: 'truncate', flexGrow: 1 },
      children: [' ', name],
    }),
  })
}

export function MillerNav({
  rootItems,
  getChildren,
  hasChildren: hasChildrenFn,
  renderItem,
  onSelectionChange,
  focused = true,
  interactive = focused,
  scrollbar = false,
  peekColumn = true,
  maxChars = { focused: 20, unfocused: 10 },
  divider = true,
  dividerChar = '\u258f',
  dividerColor = '#333333',
}) {
  const { accent = 'cyan' } = useTheme()
  const layout = useLayout()

  const focusedMax = typeof maxChars === 'number' ? maxChars : maxChars.focused ?? 20
  const unfocusedMax = typeof maxChars === 'number' ? maxChars : maxChars.unfocused ?? 10

  const [stack, setStack] = createSignal([{ parentId: null, items: rootItems, selected: 0 }])
  const [depth, setDepth] = createSignal(0)
  const [focusCol, setFocusCol] = createSignal(0)

  function activeColumnIndex() {
    return depth() + focusCol()
  }

  function activeItem() {
    const s = stack()
    const col = s[activeColumnIndex()]
    if (!col || !col.items.length) return null
    return col.items[col.selected] || null
  }

  function breadcrumb() {
    const s = stack()
    const d = depth()
    const fc = focusCol()
    const parts = []
    for (let i = 0; i <= d + fc; i++) {
      const col = s[i]
      if (col && col.items.length) parts.push(col.items[col.selected])
    }
    return parts
  }

  function emitSelection() {
    if (!onSelectionChange) return
    onSelectionChange({ item: activeItem(), breadcrumb: breadcrumb(), column: focusCol() })
  }

  function syncView() {
    const s = stack().slice()
    const d = depth()
    const left = s[d]

    if (left && left.items.length) {
      const sel = left.items[left.selected]
      const children = getChildren(sel)
      const prevRight = s[d + 1]
      const keepSelected = (prevRight && prevRight.parentId === sel)
        ? Math.min(prevRight.selected, Math.max(0, children.length - 1))
        : 0
      s[d + 1] = { parentId: sel, items: children, selected: keepSelected }
      s.length = d + 2
    } else {
      s.length = d + 1
    }

    setStack(s)

    const right = s[d + 1]
    if (!right || !right.items.length) {
      if (d > 0) {
        setDepth(d - 1)
        setFocusCol(1)
        return syncView()
      }
      setFocusCol(0)
    }

    emitSelection()
  }

  syncView()

  useInput(({ key, raw, ctrl, stopPropagation }) => {
    if (!interactive) return

    const s = stack()
    const d = depth()
    const fc = focusCol()
    const colIdx = d + fc
    const col = s[colIdx]
    if (!col || !col.items.length) return

    function moveSelection(delta) {
      const ns = s.slice()
      const newSel = Math.max(0, Math.min(col.items.length - 1, col.selected + delta))
      ns[colIdx] = { ...col, selected: newSel }
      setStack(ns)
      syncView()
    }

    if (key === 'j' || key === 'down') { moveSelection(1); stopPropagation() }
    else if (key === 'k' || key === 'up') { moveSelection(-1); stopPropagation() }
    else if (raw === 'g') { moveSelection(-col.items.length); stopPropagation() }
    else if (raw === 'G') { moveSelection(col.items.length); stopPropagation() }
    else if (ctrl && key === 'd') { moveSelection(Math.floor((layout.height || 20) / 2)); stopPropagation() }
    else if (ctrl && key === 'u') { moveSelection(-Math.floor((layout.height || 20) / 2)); stopPropagation() }
    else if (key === 'l' || key === 'right') {
      if (fc === 0) {
        const right = s[d + 1]
        if (right && right.items.length) {
          setFocusCol(1)
          emitSelection()
        }
      } else {
        const sel = col.items[col.selected]
        const children = getChildren(sel)
        if (!children.length) { stopPropagation(); return }

        const ns = s.slice(0, colIdx + 1)
        ns.push({ parentId: sel, items: children, selected: 0 })

        batch(() => {
          setStack(ns)
          setDepth(colIdx)
          setFocusCol(1)
        })
        syncView()
      }
      stopPropagation()
    }
    else if (key === 'h' || key === 'left') {
      if (fc === 1 && d > 0) {
        batch(() => {
          setDepth(d - 1)
          setFocusCol(1)
        })
        syncView()
      } else if (fc === 1 && d === 0) {
        setFocusCol(0)
        emitSelection()
      }
      stopPropagation()
    }
  })

  function navigateTo(chain) {
    if (!chain.length) return
    const newStack = []
    let parent = null
    for (let i = 0; i < chain.length; i++) {
      const items = parent === null ? rootItems : getChildren(parent)
      const idx = items.indexOf(chain[i])
      newStack.push({ parentId: parent, items, selected: idx >= 0 ? idx : 0 })
      parent = chain[i]
    }
    const newDepth = Math.max(0, newStack.length - 2)
    const newFocusCol = newStack.length >= 2 ? Math.min(1, newStack.length - 1 - newDepth) : 0
    batch(() => {
      setStack(newStack)
      setDepth(newDepth)
      setFocusCol(newFocusCol)
    })
    syncView()
  }

  const render = renderItem || defaultRenderItem.bind(null, accent)

  function NoteColumn({ items, selected, onSelect, isFocused, maxC, style: extraStyle }) {
    if (!items.length) return null
    return jsx('box', {
      style: { width: columnWidth(items, maxC), ...extraStyle },
      children: jsx(List, {
        items,
        selected,
        onSelect,
        focused: isFocused,
        interactive: false,
        scrollbar,
        renderItem: (item, { selected: isSel }) =>
          render(item, { selected: isSel, focused: isFocused, column: isFocused ? 'active' : 'context' }),
      }),
    })
  }

  const s = stack()
  const d = depth()
  const fc = focusCol()
  const leftCol = s[d]
  const rightCol = s[d + 1]

  const peekItem = peekColumn && fc === 1 && rightCol?.items?.length
    ? rightCol.items[rightCol.selected]
    : null
  const peekItems = peekItem && hasChildrenFn && hasChildrenFn(peekItem)
    ? getChildren(peekItem)
    : peekItem && !hasChildrenFn
      ? getChildren(peekItem)
      : []

  const children = []

  children.push(jsx(NoteColumn, {
    key: 'left',
    items: leftCol?.items || [],
    selected: leftCol?.selected || 0,
    maxC: fc === 0 ? focusedMax : unfocusedMax,
    onSelect: (i) => {
      const ns = s.slice()
      ns[d] = { ...leftCol, selected: i }
      batch(() => {
        setStack(ns)
        setFocusCol(0)
      })
      syncView()
    },
    isFocused: focused && fc === 0,
  }))

  if (rightCol?.items) {
    children.push(jsx(NoteColumn, {
      key: 'right',
      items: rightCol?.items || [],
      selected: rightCol?.selected || 0,
      maxC: fc === 1 ? focusedMax : unfocusedMax,
      style: { marginLeft: 1 },
      onSelect: (i) => {
        const ns = s.slice()
        ns[d + 1] = { ...rightCol, selected: i }
        batch(() => {
          setStack(ns)
          setFocusCol(1)
        })
        syncView()
      },
      isFocused: focused && fc === 1,
    }))
  }

  if (peekItems.length > 0) {
    children.push(jsx(NoteColumn, {
      key: 'peek',
      items: peekItems,
      selected: -1,
      maxC: unfocusedMax,
      style: { marginLeft: 1 },
      onSelect: () => {},
      isFocused: false,
    }))
  }

  if (divider) {
    const rows = layout.height || process.stdout.rows
    const bar = Array.from({ length: rows }, () => dividerChar).join('\n')
    children.push(jsx('box', {
      key: 'divider',
      style: { width: 1, marginLeft: 1 },
      children: jsx('text', { style: { color: dividerColor }, children: bar }),
    }))
  }

  return jsx('box', {
    style: { flexDirection: 'row' },
    children,
  })
}
