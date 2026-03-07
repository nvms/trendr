import { jsx, jsxs } from '../jsx-runtime.js'
import { useAsync } from './hooks.js'
import { Spinner } from './spinner.js'
import { useTheme } from './hooks.js'

const DEFAULT_ICONS = {
  success: '\u2714',
  error: '\u2716',
  idle: '\u25CB',
}

export function Task({ run, label, successLabel, errorLabel, icon, color, immediate = true }) {
  const { accent = 'cyan' } = useTheme()
  const { status, data, error } = useAsync(run, { immediate })

  const s = status()

  if (s === 'loading') {
    return jsx(Spinner, { label, color: color ?? accent })
  }

  const icons = { ...DEFAULT_ICONS, ...icon }

  if (s === 'success') {
    return jsxs('box', { style: { flexDirection: 'row' }, children: [
      jsx('text', { style: { color: color ?? 'green' }, children: icons.success }),
      jsx('text', { children: ` ${successLabel ?? label}` }),
    ]})
  }

  if (s === 'error') {
    const msg = errorLabel ?? error()?.message ?? 'failed'
    return jsxs('box', { style: { flexDirection: 'row' }, children: [
      jsx('text', { style: { color: color ?? 'red' }, children: icons.error }),
      jsx('text', { children: ` ${msg}` }),
    ]})
  }

  return jsxs('box', { style: { flexDirection: 'row' }, children: [
    jsx('text', { style: { color: 'gray' }, children: icons.idle }),
    jsx('text', { style: { color: 'gray' }, children: ` ${label}` }),
  ]})
}
