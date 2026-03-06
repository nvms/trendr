import { jsx } from '../jsx-runtime.js'

const DIVIDER_CHARS = {
  single: { h: '\u2500', v: '\u2502' },
  double: { h: '\u2550', v: '\u2551' },
  round:  { h: '\u2500', v: '\u2502' },
  bold:   { h: '\u2501', v: '\u2503' },
}

function parseSize(s) {
  if (typeof s === 'number') return { type: 'fixed', value: s }
  const m = String(s).match(/^(\d*\.?\d+)fr$/)
  return m ? { type: 'fr', value: parseFloat(m[1]) } : { type: 'fixed', value: parseInt(s) || 0 }
}

function sizeToStyle(size, isRow) {
  const parsed = parseSize(size)
  if (parsed.type === 'fixed') return { [isRow ? 'width' : 'height']: parsed.value }
  return { flexGrow: parsed.value }
}

export function SplitPane({ children, direction = 'row', sizes: sizesProp, border = 'single', borderColor, borderEdges, style }) {
  const items = Array.isArray(children) ? children.filter(c => c != null && c !== true && c !== false) : children ? [children] : []
  const n = items.length
  if (n === 0) return null

  const isRow = direction === 'row'
  const chars = DIVIDER_CHARS[border] ?? DIVIDER_CHARS.single
  const sizes = sizesProp ?? items.map(() => '1fr')

  const elements = []
  for (let i = 0; i < n; i++) {
    elements.push(
      jsx('box', {
        key: `p${i}`,
        style: { ...sizeToStyle(sizes[i] ?? '1fr', isRow), flexDirection: 'column' },
        children: items[i],
      })
    )

    if (i < n - 1) {
      elements.push(
        jsx('box', {
          key: `d${i}`,
          style: {
            [isRow ? 'width' : 'height']: 1,
            texture: isRow ? chars.v : chars.h,
            textureColor: borderColor,
            _divider: isRow ? 'vertical' : 'horizontal',
          },
        })
      )
    }
  }

  return jsx('box', {
    style: {
      ...style,
      border: border || undefined,
      borderColor,
      borderEdges,
      flexDirection: isRow ? 'row' : 'column',
    },
    children: elements,
  })
}
