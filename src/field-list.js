import { jsx } from '../jsx-runtime.js'
import { useFocus } from './focus.js'
import { useLayout } from './hooks.js'
import { ScrollBox } from './scroll-box.js'

function toArray(children) {
  if (children == null) return []
  if (!Array.isArray(children)) return [children]
  return children.flatMap(toArray)
}

export function FieldList({
  children,
  focused = true,
  initialFocus,
  focusPadding = 1,
  scrollbar = false,
  gap = 0,
  style,
}) {
  const focus = useFocus({ initial: initialFocus, active: focused })
  const fieldContext = { focus, active: focused }
  const fields = toArray(children).map((child) => {
    if (child == null || typeof child !== 'object') return child
    return {
      ...child,
      props: { ...child.props, fieldContext },
    }
  })

  return jsx(ScrollBox, {
    focused,
    followFocus: focus,
    focusPadding,
    scrollbar,
    gap,
    style,
    children: fields,
  })
}

export function Field({ name, disabled = false, children, style, fieldContext }) {
  if (!fieldContext) throw new Error('Field must be a direct child of FieldList')
  if (name == null) throw new Error('Field requires a name')

  const { focus, active } = fieldContext
  const layout = useLayout()

  if (!disabled) focus.item(name, layout)
  const focused = active && !disabled && focus.is(name)

  return jsx('box', {
    style: { flexDirection: 'column', flexShrink: 0, ...style },
    children: typeof children === 'function' ? children({ focused, disabled }) : children,
  })
}
