import { jsx } from '../jsx-runtime.js'
import { createSignal } from './signal.js'
import { useInput, useTheme } from './hooks.js'
import { List } from './list.js'

// a windowed single-select menu. shows at most maxVisible rows and scrolls
// with scrolloff as the active item moves. it carries no text input of its
// own, so it pairs with an external composer: render it after that input and,
// while focused, it intercepts up/down/enter before the input sees them
export function Menu({
  items = [],
  selected: selectedProp,
  onSelect,
  onSubmit,
  onCancel,
  focused = true,
  maxVisible = 5,
  scrolloff = 2,
  itemHeight = 1,
  gap = 0,
  renderItem,
  arrow = '›',
}) {
  const { accent = 'cyan' } = useTheme()
  const [internal, setInternal] = createSignal(0)

  const len = items.length
  const raw = selectedProp ?? internal()
  const selected = Math.min(Math.max(0, raw), Math.max(0, len - 1))
  const setSelected = (i) => {
    if (selectedProp === undefined) setInternal(i)
    if (onSelect) onSelect(i)
  }

  if (selected !== raw && len > 0) setSelected(selected)

  useInput((event) => {
    if (!focused || len === 0) return
    const { key, ctrl, shift, meta } = event

    if (key === 'up' || (ctrl && key === 'p')) {
      setSelected(Math.max(0, selected - 1))
      event.stopPropagation()
    } else if (key === 'down' || (ctrl && key === 'n')) {
      setSelected(Math.min(len - 1, selected + 1))
      event.stopPropagation()
    } else if (key === 'return' && !shift && !meta) {
      if (onSubmit) onSubmit(items[selected], selected)
      event.stopPropagation()
    } else if (key === 'escape') {
      if (onCancel) {
        onCancel()
        event.stopPropagation()
      }
    }
  })

  if (len === 0) return jsx('box', { style: { height: 0 } })

  const visible = Math.min(maxVisible, len)
  const height = visible * itemHeight + Math.max(0, visible - 1) * gap

  const defaultRender = (item, { active }) => {
    const label = typeof item === 'string' ? item : (item.label ?? item.name ?? String(item))
    return jsx('box', {
      style: { flexDirection: 'row' },
      children: [
        jsx('text', { style: { color: active ? accent : null }, children: active ? `${arrow} ` : '  ' }),
        jsx('text', { style: { color: active ? accent : 'gray' }, children: label }),
      ],
    })
  }

  const render = renderItem ?? defaultRender

  return jsx('box', {
    style: { height, minHeight: height },
    children: jsx(List, {
      items,
      selected,
      onSelect: setSelected,
      focused: false,
      interactive: false,
      itemHeight,
      gap,
      scrolloff,
      renderItem: (item, ctx) => render(item, { active: ctx.selected, index: ctx.index }),
    }),
  })
}
